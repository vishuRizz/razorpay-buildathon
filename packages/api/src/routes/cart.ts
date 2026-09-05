import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { query, queryOne } from '../db/client';
import { requireAIT } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { policyEngine } from '../services/policy';
import { logAudit } from '../services/audit';
import { generateBlockTrace } from '../services/reasoning';
import { getUpsellSuggestions } from '../services/upsell';
import { negotiateDiscount } from '../services/negotiation';
import { Cart, CartItem, Merchant, Product } from '../types';

const router = Router({ mergeParams: true });

const CreateCartSchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive().max(100),
      })
    )
    .min(1)
    .max(20),
  agent_task: z.string().optional(), // human-readable description of what the agent is doing
});

const UpdateCartSchema = z.object({
  items: z.array(
    z.object({
      sku: z.string().min(1),
      quantity: z.number().int().nonnegative().max(100), // 0 = remove item
    })
  ),
});

const NegotiateSchema = z.object({
  requested_discount_percent: z.number().min(0).max(100),
  agent_reasoning: z.string().optional(),
});

const AcceptUpsellSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive().max(10).default(1),
});

/**
 * POST /v1/stores/:storeId/cart
 * Create a cart. Runs Policy Engine. Requires AIT.
 */
router.post('/', requireAIT, validate(CreateCartSchema), async (req: Request, res: Response) => {
  const start = Date.now();
  const { storeId } = req.params;
  const body = req.body as z.infer<typeof CreateCartSchema>;
  const agent = req.agent!;

  // Resolve merchant
  const merchant = await queryOne<Merchant>('SELECT * FROM merchants WHERE id = $1', [storeId]);
  if (!merchant) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Store not found' });
    return;
  }

  // Resolve products from DB and build cart items
  const cartItems: CartItem[] = [];
  let subtotal = 0;

  for (const reqItem of body.items) {
    const product = await queryOne<Product>(
      'SELECT * FROM products WHERE sku = $1 AND merchant_id = $2',
      [reqItem.sku, storeId]
    );

    if (!product) {
      res.status(404).json({
        error: 'PRODUCT_NOT_FOUND',
        detail: `Product SKU '${reqItem.sku}' not found in store ${storeId}`,
      });
      return;
    }

    const lineTotal = product.data.price_inr * reqItem.quantity;
    subtotal += lineTotal;

    cartItems.push({
      sku: reqItem.sku,
      quantity: reqItem.quantity,
      price_inr: product.data.price_inr,
      name: product.data.name,
      categories: product.data.categories,
    });
  }

  // Run Policy Engine
  const policyResult = await policyEngine.evaluate({
    cartItems,
    cartTotal: subtotal,
    agent,
    merchantId: storeId,
    merchantPolicies: merchant.policies as Merchant['policies'],
    merchantAiBuyersEnabled: merchant.ai_buyers_enabled,
  });

  if (!policyResult.approved) {
    // Generate a reasoning trace for the block
    const blockTrace = await generateBlockTrace(
      body.agent_task ?? 'Unknown task',
      policyResult.block_reason ?? 'Policy violation',
      policyResult.rules_failed[0] ?? 'UNKNOWN_RULE'
    );

    await logAudit({
      agent_id: agent.agent_id,
      merchant_id: storeId,
      action: 'POLICY_BLOCK',
      input: body,
      output: { policy_result: policyResult },
      reasoning: blockTrace,
      policy_result: policyResult,
      duration_ms: Date.now() - start,
    });

    res.status(422).json({
      error: 'POLICY_VIOLATION',
      rule: policyResult.rules_failed[0],
      detail: policyResult.block_reason,
      suggested_action: policyResult.suggested_action,
      policy_result: policyResult,
    });
    return;
  }

  // Create cart in DB
  const cartId = `cart_${nanoid(12)}`;
  await query(
    `INSERT INTO carts (id, agent_id, merchant_id, items, subtotal_inr, status)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
    [cartId, agent.agent_id, storeId, JSON.stringify(cartItems), subtotal]
  );

  const logId = await logAudit({
    agent_id: agent.agent_id,
    merchant_id: storeId,
    action: 'ADD_TO_CART',
    input: body,
    output: { cart_id: cartId, subtotal_inr: subtotal, items: cartItems },
    policy_result: policyResult,
    duration_ms: Date.now() - start,
  });

  const suggestedItems = await getUpsellSuggestions(storeId, cartItems);
  if (suggestedItems.length > 0) {
    await logAudit({
      agent_id: agent.agent_id,
      merchant_id: storeId,
      action: 'UPSELL_SUGGESTED',
      input: { cart_id: cartId, items: cartItems.map((i) => i.sku) },
      output: { suggested_items: suggestedItems },
    });
  }

  res.status(201).json({
    cart_id: cartId,
    store_id: storeId,
    items: cartItems,
    subtotal_inr: subtotal,
    suggested_items: suggestedItems,
    policy_status: policyResult.requires_human_review ? 'REQUIRES_REVIEW' : 'APPROVED',
    requires_human_review: policyResult.requires_human_review,
    policy_warnings: policyResult.warnings,
    audit_log_id: logId,
  });
});

/**
 * PATCH /v1/stores/:storeId/cart/:cartId
 * Modify cart items.
 */
router.patch('/:cartId', requireAIT, validate(UpdateCartSchema), async (req: Request, res: Response) => {
  const { storeId, cartId } = req.params;
  const body = req.body as z.infer<typeof UpdateCartSchema>;
  const agent = req.agent!;

  const cart = await queryOne<Cart>(
    `SELECT * FROM carts WHERE id = $1 AND merchant_id = $2 AND agent_id = $3 AND status = 'ACTIVE'`,
    [cartId, storeId, agent.agent_id]
  );

  if (!cart) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Active cart not found' });
    return;
  }

  let items = cart.items as CartItem[];

  for (const update of body.items) {
    const existing = items.find((i) => i.sku === update.sku);
    if (update.quantity === 0) {
      items = items.filter((i) => i.sku !== update.sku);
    } else if (existing) {
      existing.quantity = update.quantity;
    } else {
      const product = await queryOne<Product>(
        'SELECT * FROM products WHERE sku = $1 AND merchant_id = $2',
        [update.sku, storeId]
      );
      if (product) {
        items.push({
          sku: update.sku,
          quantity: update.quantity,
          price_inr: product.data.price_inr,
          name: product.data.name,
          categories: product.data.categories,
        });
      }
    }
  }

  const newSubtotal = items.reduce((sum, i) => sum + i.price_inr * i.quantity, 0);

  await query(
    `UPDATE carts SET items = $1, subtotal_inr = $2 WHERE id = $3`,
    [JSON.stringify(items), newSubtotal, cartId]
  );

  await logAudit({
    agent_id: agent.agent_id,
    merchant_id: storeId,
    action: 'CART_MODIFY',
    input: body,
    output: { cart_id: cartId, subtotal_inr: newSubtotal },
  });

  res.json({ cart_id: cartId, items, subtotal_inr: newSubtotal });
});

/**
 * POST /v1/stores/:storeId/cart/:cartId/negotiate
 * Agent ↔ merchant negotiation - auto-applies coupon within discount_cap_percent.
 */
router.post(
  '/:cartId/negotiate',
  requireAIT,
  validate(NegotiateSchema),
  async (req: Request, res: Response) => {
    const start = Date.now();
    const { storeId, cartId } = req.params;
    const body = req.body as z.infer<typeof NegotiateSchema>;
    const agent = req.agent!;

    const cart = await queryOne<Cart>(
      `SELECT * FROM carts WHERE id = $1 AND merchant_id = $2 AND agent_id = $3 AND status = 'ACTIVE'`,
      [cartId, storeId, agent.agent_id]
    );

    if (!cart) {
      res.status(404).json({ error: 'NOT_FOUND', detail: 'Active cart not found' });
      return;
    }

    const merchant = await queryOne<Merchant>('SELECT * FROM merchants WHERE id = $1', [storeId]);
    if (!merchant) {
      res.status(404).json({ error: 'NOT_FOUND', detail: 'Store not found' });
      return;
    }

    const policies = merchant.policies as Merchant['policies'];
    const result = negotiateDiscount(
      cart.subtotal_inr,
      body.requested_discount_percent,
      policies
    );

    if (!result.approved) {
      res.status(422).json({
        error: 'NEGOTIATION_REJECTED',
        detail: result.message,
        negotiation: result,
      });
      return;
    }

    await query(
      `UPDATE carts SET
         discount_inr = $1,
         discount_percent = $2,
         final_amount_inr = $3,
         coupon_code = $4
       WHERE id = $5`,
      [
        result.discount_inr,
        result.granted_discount_percent,
        result.final_amount_inr,
        result.coupon_code ?? null,
        cartId,
      ]
    );

    const logId = await logAudit({
      agent_id: agent.agent_id,
      merchant_id: storeId,
      action: 'DISCOUNT_NEGOTIATED',
      input: {
        cart_id: cartId,
        requested_discount_percent: body.requested_discount_percent,
        agent_reasoning: body.agent_reasoning,
      },
      output: result,
      duration_ms: Date.now() - start,
    });

    res.json({
      cart_id: cartId,
      negotiation: result,
      audit_log_id: logId,
    });
  }
);

/**
 * POST /v1/stores/:storeId/cart/:cartId/accept-upsell
 * Add a suggested upsell item to cart and track merchant revenue lift.
 */
router.post(
  '/:cartId/accept-upsell',
  requireAIT,
  validate(AcceptUpsellSchema),
  async (req: Request, res: Response) => {
    const start = Date.now();
    const { storeId, cartId } = req.params;
    const body = req.body as z.infer<typeof AcceptUpsellSchema>;
    const agent = req.agent!;

    const cart = await queryOne<Cart>(
      `SELECT * FROM carts WHERE id = $1 AND merchant_id = $2 AND agent_id = $3 AND status = 'ACTIVE'`,
      [cartId, storeId, agent.agent_id]
    );

    if (!cart) {
      res.status(404).json({ error: 'NOT_FOUND', detail: 'Active cart not found' });
      return;
    }

    const product = await queryOne<Product>(
      'SELECT * FROM products WHERE sku = $1 AND merchant_id = $2 AND in_stock = true',
      [body.sku, storeId]
    );

    if (!product) {
      res.status(404).json({ error: 'NOT_FOUND', detail: `Upsell product ${body.sku} not available` });
      return;
    }

    let items = cart.items as CartItem[];
    const existing = items.find((i) => i.sku === body.sku);
    if (existing) {
      existing.quantity += body.quantity;
    } else {
      items.push({
        sku: body.sku,
        quantity: body.quantity,
        price_inr: product.data.price_inr,
        name: product.data.name,
        categories: product.data.categories,
      });
    }

    const newSubtotal = items.reduce((sum, i) => sum + i.price_inr * i.quantity, 0);
    const liftInr = product.data.price_inr * body.quantity;

    // Recalculate discount if coupon applied
    const discountPercent = Number(cart.discount_percent ?? 0);
    const discountInr = discountPercent > 0 ? Math.floor(newSubtotal * discountPercent / 100) : 0;
    const finalAmount = newSubtotal - discountInr;

    await query(
      `UPDATE carts SET items = $1, subtotal_inr = $2, discount_inr = $3, final_amount_inr = $4 WHERE id = $5`,
      [JSON.stringify(items), newSubtotal, discountInr, finalAmount, cartId]
    );

    await logAudit({
      agent_id: agent.agent_id,
      merchant_id: storeId,
      action: 'UPSELL_ACCEPTED',
      input: { cart_id: cartId, sku: body.sku, quantity: body.quantity },
      output: { estimated_lift_inr: liftInr, new_subtotal_inr: newSubtotal },
      duration_ms: Date.now() - start,
    });

    res.json({
      cart_id: cartId,
      items,
      subtotal_inr: newSubtotal,
      final_amount_inr: finalAmount,
      upsell_accepted: { sku: body.sku, lift_inr: liftInr },
    });
  }
);

/**
 * DELETE /v1/stores/:storeId/cart/:cartId
 * Abandon a cart.
 */
router.delete('/:cartId', requireAIT, async (req: Request, res: Response) => {
  const { storeId, cartId } = req.params;
  const agent = req.agent!;

  const result = await query(
    `UPDATE carts SET status = 'ABANDONED' WHERE id = $1 AND merchant_id = $2 AND agent_id = $3 AND status = 'ACTIVE'
     RETURNING id`,
    [cartId, storeId, agent.agent_id]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Active cart not found' });
    return;
  }

  await logAudit({
    agent_id: agent.agent_id,
    merchant_id: storeId,
    action: 'CART_ABANDON',
    input: { cart_id: cartId },
  });

  res.json({ cart_id: cartId, status: 'ABANDONED' });
});

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { query, queryOne } from '../db/client';
import { requireAIT } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { policyEngine } from '../services/policy';
import { createRazorpayOrder } from '../services/razorpay';
import { logAudit } from '../services/audit';
import { generateTrace } from '../services/reasoning';
import { Cart, CartItem, Merchant, Order, Product } from '../types';

const router = Router({ mergeParams: true });

const CheckoutSchema = z.object({
  payment_method: z
    .enum(['razorpay_upi', 'razorpay_card', 'razorpay_netbanking'])
    .default('razorpay_upi'),
  agent_confirm: z.literal(true),
  agent_reasoning: z.string().optional(),
  agent_task: z.string().optional(),
});

/**
 * POST /v1/stores/:storeId/cart/:cartId/checkout
 * Initiate payment. Runs Policy Engine then calls Razorpay.
 */
router.post(
  '/:cartId/checkout',
  requireAIT,
  validate(CheckoutSchema),
  async (req: Request, res: Response) => {
    const start = Date.now();
    const { storeId, cartId } = req.params;
    const body = req.body as z.infer<typeof CheckoutSchema>;
    const agent = req.agent!;

    // Fetch cart
    const cart = await queryOne<Cart>(
      `SELECT * FROM carts WHERE id = $1 AND merchant_id = $2 AND agent_id = $3 AND status = 'ACTIVE'`,
      [cartId, storeId, agent.agent_id]
    );

    if (!cart) {
      res.status(404).json({
        error: 'NOT_FOUND',
        detail: 'Active cart not found. Cart may already be checked out or abandoned.',
      });
      return;
    }

    const merchant = await queryOne<Merchant>('SELECT * FROM merchants WHERE id = $1', [storeId]);
    if (!merchant) {
      res.status(404).json({ error: 'NOT_FOUND', detail: 'Store not found' });
      return;
    }

    // Re-run Policy Engine at checkout (defense in depth)
    const cartItems = cart.items as CartItem[];
    const policyResult = await policyEngine.evaluate({
      cartItems,
      cartTotal: cart.subtotal_inr,
      agent,
      merchantId: storeId,
      merchantPolicies: merchant.policies as Merchant['policies'],
      merchantAiBuyersEnabled: merchant.ai_buyers_enabled,
    });

    if (!policyResult.approved) {
      await query(
        `UPDATE carts SET status = 'CHECKOUT_FAILED' WHERE id = $1`,
        [cartId]
      );

      await logAudit({
        agent_id: agent.agent_id,
        merchant_id: storeId,
        action: 'CHECKOUT_FAILED',
        input: body,
        policy_result: policyResult,
        error: policyResult.block_reason ?? 'Policy violation',
        duration_ms: Date.now() - start,
      });

      res.status(422).json({
        error: 'POLICY_VIOLATION',
        rule: policyResult.rules_failed[0],
        detail: policyResult.block_reason,
        suggested_action: policyResult.suggested_action,
      });
      return;
    }

    const orderId = `order_${nanoid(12)}`;

    // --- Human Review Required ---
    if (policyResult.requires_human_review) {
      await query(
        `INSERT INTO orders (id, cart_id, merchant_id, agent_id, amount_inr, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING_REVIEW')`,
        [orderId, cartId, storeId, agent.agent_id, cart.subtotal_inr]
      );

      await query(`UPDATE carts SET status = 'CHECKED_OUT' WHERE id = $1`, [cartId]);

      const logId = await logAudit({
        agent_id: agent.agent_id,
        merchant_id: storeId,
        action: 'HUMAN_REVIEW_REQUESTED',
        input: body,
        output: { order_id: orderId, amount_inr: cart.subtotal_inr },
        policy_result: policyResult,
        duration_ms: Date.now() - start,
      });

      res.status(202).json({
        order_id: orderId,
        status: 'PENDING_REVIEW',
        amount_inr: cart.subtotal_inr,
        message: 'Order requires merchant approval. Poll /orders/:id/status for updates.',
        poll_url: `/v1/stores/${storeId}/orders/${orderId}/status`,
        audit_log_id: logId,
      });
      return;
    }

    // --- Create Razorpay Order ---
    let rzpOrder;
    try {
      rzpOrder = await createRazorpayOrder(
        cart.subtotal_inr * 100, // convert to paise
        orderId,
        {
          aisle_order_id: orderId,
          aisle_agent_id: agent.agent_id,
          store_id: storeId,
        }
      );
    } catch (err) {
      // Razorpay failed after retries
      await query(
        `INSERT INTO orders (id, cart_id, merchant_id, agent_id, amount_inr, status)
         VALUES ($1, $2, $3, $4, $5, 'FAILED')`,
        [orderId, cartId, storeId, agent.agent_id, cart.subtotal_inr]
      );
      await query(`UPDATE carts SET status = 'CHECKOUT_FAILED' WHERE id = $1`, [cartId]);

      await logAudit({
        agent_id: agent.agent_id,
        merchant_id: storeId,
        action: 'CHECKOUT_FAILED',
        error: err instanceof Error ? err.message : 'Razorpay gateway error',
        duration_ms: Date.now() - start,
      });

      throw err; // Let errorHandler return 502
    }

    // --- Generate reasoning trace (Claude) ---
    const products = await query<Product>(
      'SELECT * FROM products WHERE merchant_id = $1',
      [storeId]
    );
    const selectedProduct = products.find(
      (p) => p.sku === cartItems[0]?.sku
    );

    const reasoning = await generateTrace(
      body.agent_task ?? 'Purchase item',
      products,
      selectedProduct ?? products[0],
      {
        spending_limit_per_session_inr: agent.spending_limit_per_session_inr,
        spending_limit_per_day_inr: agent.spending_limit_per_day_inr,
        allowed_categories: agent.allowed_categories,
      }
    );

    // Save order to DB
    await query(
      `INSERT INTO orders (id, cart_id, merchant_id, agent_id, razorpay_order_id, amount_inr, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'CREATED')`,
      [orderId, cartId, storeId, agent.agent_id, rzpOrder.id, cart.subtotal_inr]
    );

    await query(`UPDATE carts SET status = 'CHECKED_OUT' WHERE id = $1`, [cartId]);

    // Update agent daily spend
    await query(
      `UPDATE agents SET
         daily_spend_inr = CASE
           WHEN DATE(daily_spend_reset) = CURRENT_DATE THEN daily_spend_inr + $1
           ELSE $1
         END,
         daily_spend_reset = NOW()
       WHERE id = $2`,
      [cart.subtotal_inr, agent.agent_id]
    );

    const logId = await logAudit({
      agent_id: agent.agent_id,
      merchant_id: storeId,
      action: 'CHECKOUT_SUCCESS',
      input: { cart_id: cartId, payment_method: body.payment_method },
      output: {
        order_id: orderId,
        razorpay_order_id: rzpOrder.id,
        amount_inr: cart.subtotal_inr,
      },
      reasoning,
      policy_result: policyResult,
      duration_ms: Date.now() - start,
    });

    res.status(201).json({
      order_id: orderId,
      razorpay_order_id: rzpOrder.id,
      amount_inr: cart.subtotal_inr,
      status: 'CREATED',
      reasoning,
      audit_log_id: logId,
    });
  }
);

/**
 * GET /v1/stores/:storeId/orders/:orderId/status
 * Poll order status.
 */
router.get('/orders/:orderId/status', requireAIT, async (req: Request, res: Response) => {
  const start = Date.now();
  const { storeId, orderId } = req.params;
  const agent = req.agent!;

  const order = await queryOne<Order>(
    'SELECT * FROM orders WHERE id = $1 AND merchant_id = $2',
    [orderId, storeId]
  );

  if (!order) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Order not found' });
    return;
  }

  await logAudit({
    agent_id: agent.agent_id,
    merchant_id: storeId,
    action: 'ORDER_STATUS',
    input: { order_id: orderId },
    output: { status: order.status },
    duration_ms: Date.now() - start,
  });

  res.json({
    order_id: order.id,
    status: order.status,
    amount_inr: order.amount_inr,
    razorpay_order_id: order.razorpay_order_id,
    razorpay_payment_id: order.razorpay_payment_id,
    created_at: order.created_at,
    updated_at: order.updated_at,
    ...(order.status === 'PENDING_REVIEW' && {
      message: 'Awaiting merchant approval. Check back in 30 seconds.',
      poll_interval_seconds: 30,
    }),
    ...(order.status === 'PAID' && { paid_at: order.updated_at, refundable: true }),
  });
});

export default router;

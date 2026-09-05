import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { query, queryOne } from '../db/client';
import { logAudit } from '../services/audit';
import { generateTrace } from '../services/reasoning';
import { createRazorpayOrder } from '../services/razorpay';
import { policyEngine } from '../services/policy';
import { Merchant, Product, CartItem, AgentTokenPayload, ProductData } from '../types';

const router = Router();

type Scenario = 'happy_path' | 'budget_fail' | 'human_review';

// Scenario configs
const SCENARIOS: Record<Scenario, {
  label: string;
  task: string;
  agentName: string;
  budget: number;
  dailyLimit: number;
  category: string;
  maxPrice: number;
}> = {
  happy_path: {
    label: 'Happy Path Purchase',
    task: 'Buy the best travel accessory within budget for a business trip',
    agentName: 'TravelBot-Pro',
    budget: 5000,
    dailyLimit: 10000,
    category: 'travel',
    maxPrice: 3000,
  },
  budget_fail: {
    label: 'Budget Violation Block',
    task: 'Purchase every high-value electronics item available immediately',
    agentName: 'UnrestrictedShopBot',
    budget: 500,          // Tiny session budget
    dailyLimit: 1000,
    category: 'electronics',
    maxPrice: 50000,      // Will try to buy expensive items - policy blocks it
  },
  human_review: {
    label: 'High-Value Human Review',
    task: 'Purchase premium laptop for remote work setup, budget ₹80,000',
    agentName: 'EnterpriseAgent-v2',
    budget: 80000,
    dailyLimit: 200000,
    category: 'electronics',
    maxPrice: 80000,
  },
};

/**
 * POST /v1/simulate
 * Runs a complete end-to-end agent commerce scenario server-side.
 * No terminal needed - triggered from the dashboard.
 */
router.post('/', async (req: Request, res: Response) => {
  const scenario: Scenario = (req.body?.scenario as Scenario) ?? 'happy_path';

  if (!SCENARIOS[scenario]) {
    res.status(400).json({ error: 'INVALID_SCENARIO', detail: 'Use: happy_path | budget_fail | human_review' });
    return;
  }

  const cfg = SCENARIOS[scenario];
  const startTotal = Date.now();
  const steps: Array<{ step: string; status: 'ok' | 'blocked' | 'review' | 'error'; detail: string; ms: number }> = [];

  function addStep(step: string, status: 'ok' | 'blocked' | 'review' | 'error', detail: string, ms: number) {
    steps.push({ step, status, detail, ms });
  }

  try {
    // ── Step 1: Discover stores ──────────────────────────────────
    const t1 = Date.now();
    const stores = await query<Merchant>('SELECT * FROM merchants WHERE ai_buyers_enabled = true LIMIT 5');
    if (!stores.length) {
      res.status(503).json({ error: 'NO_STORES', detail: 'No AI-enabled stores found. Run pnpm seed first.' });
      return;
    }
    // Pick GadgetNest preferentially, else first
    const store = stores.find(s => s.name === 'GadgetNest') ?? stores[0];
    addStep('STORE_DISCOVER', 'ok', `Found ${stores.length} stores → selected ${store.name}`, Date.now() - t1);

    // ── Step 2: Issue Agent Identity Token ───────────────────────
    const t2 = Date.now();
    const agentId = `agt_${nanoid(12)}`;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600; // 1 hour

    const agentPayload: AgentTokenPayload = {
      agent_id: agentId,
      owner_email: `${cfg.agentName.toLowerCase().replace(/[^a-z0-9]/g, '')}@aisle.ai`,
      spending_limit_per_session_inr: cfg.budget,
      spending_limit_per_day_inr: cfg.dailyLimit,
      allowed_store_ids: ['*'],
      allowed_categories: [cfg.category, 'electronics', 'travel', 'accessories'],
      issued_at: now,
      expires_at: expiresAt,
    };

    await query(
      `INSERT INTO agents (id, owner_email, constraints, revoked, daily_spend_inr, daily_spend_reset)
       VALUES ($1, $2, $3, false, 0, NOW())`,
      [agentId, agentPayload.owner_email, JSON.stringify({
        spending_limit_per_session_inr: cfg.budget,
        spending_limit_per_day_inr: cfg.dailyLimit,
        allowed_store_ids: ['*'],
        allowed_categories: agentPayload.allowed_categories,
      })]
    );

    const token = jwt.sign(agentPayload, process.env.JWT_SECRET!, { expiresIn: 3600 });
    addStep('AGENT_TOKEN_ISSUED', 'ok', `${cfg.agentName} · budget ₹${cfg.budget.toLocaleString()}`, Date.now() - t2);

    // Log discovery
    await logAudit({
      agent_id: agentId,
      merchant_id: store.id,
      action: 'DISCOVER',
      input: { scenario, agent_name: cfg.agentName },
      output: { store_id: store.id, store_name: store.name },
      duration_ms: Date.now() - t1,
    });

    // ── Step 3: Browse catalog ───────────────────────────────────
    const t3 = Date.now();
    const productsRaw = await query<Product>(
      `SELECT * FROM products WHERE merchant_id = $1 AND in_stock = true`,
      [store.id]
    );

    const products = productsRaw;
    // Helper to get product data fields
    const pd = (p: Product): ProductData => p.data as unknown as ProductData;

    const eligible = products.filter(p => pd(p).price_inr <= cfg.maxPrice);
    addStep('CATALOG_BROWSE', 'ok', `${products.length} products · ${eligible.length} within ₹${cfg.maxPrice.toLocaleString()} max`, Date.now() - t3);

    await logAudit({
      agent_id: agentId,
      merchant_id: store.id,
      action: 'CATALOG_QUERY',
      input: { max_price: cfg.maxPrice, category: cfg.category },
      output: { total: eligible.length, products: eligible.map(p => p.sku) },
      duration_ms: Date.now() - t3,
    });

    if (!eligible.length) {
      res.status(200).json({
        scenario, steps,
        outcome: 'NO_PRODUCTS',
        summary: 'No eligible products found in catalog.',
        duration_ms: Date.now() - startTotal,
      });
      return;
    }

    // Agent selects product based on scenario
    const selected = scenario === 'budget_fail'
      ? [...eligible].sort((a, b) => pd(b).price_inr - pd(a).price_inr)[0]  // most expensive (will be blocked)
      : [...eligible].sort((a, b) => pd(a).price_inr - pd(b).price_inr)[0]; // cheapest
    const selData = pd(selected);

    // ── Step 4: Add to cart (triggers Policy Engine) ─────────────
    const t4 = Date.now();
    const cartId = `cart_${nanoid(12)}`;
    const cartItems: CartItem[] = [{
      sku: selected.sku,
      name: selData.name,
      quantity: 1,
      price_inr: selData.price_inr,
      categories: selData.categories,
    }];

    // Fetch full merchant for policy
    const merchant = await queryOne<Merchant>('SELECT * FROM merchants WHERE id = $1', [store.id]);
    if (!merchant) throw new Error('Merchant not found');

    const policies = merchant.policies as Record<string, unknown>;

    const policyResult = await policyEngine.evaluate({
      cartItems,
      cartTotal: selData.price_inr,
      agent: agentPayload,
      merchantId: store.id,
      merchantPolicies: {
        max_order_value: (policies.max_order_value as number) ?? 15000,
        human_review_above: (policies.human_review_above as number) ?? 5000,
        daily_ai_gmv_cap: (policies.daily_ai_gmv_cap as number) ?? 500000,
        allowed_agent_types: (policies.allowed_agent_types as string[]) ?? ['shopping', 'travel'],
        discount_cap_percent: (policies.discount_cap_percent as number) ?? 20,
      },
      merchantAiBuyersEnabled: merchant.ai_buyers_enabled,
    });

    // ── POLICY BLOCK path ───────────────────────────────────────
    if (!policyResult.approved && !policyResult.requires_human_review) {
      await query(
        `INSERT INTO carts (id, agent_id, merchant_id, items, subtotal_inr, status) VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
        [cartId, agentId, store.id, JSON.stringify(cartItems), selData.price_inr]
      );
      await logAudit({
        agent_id: agentId,
        merchant_id: store.id,
        action: 'POLICY_BLOCK',
        input: { cart_id: cartId, selected_sku: selected.sku, amount: selData.price_inr },
        output: { reason: policyResult.block_reason },
        policy_result: policyResult,
        duration_ms: Date.now() - t4,
        error: policyResult.block_reason ?? 'Policy violation',
      });
      addStep('POLICY_ENGINE', 'blocked', policyResult.block_reason ?? 'Policy violation', Date.now() - t4);

      res.status(200).json({
        scenario, steps,
        outcome: 'BLOCKED',
        summary: `Agent blocked by Policy Engine: ${policyResult.block_reason}`,
        policy_result: policyResult,
        duration_ms: Date.now() - startTotal,
      });
      return;
    }

    // ── HUMAN REVIEW path ────────────────────────────────────────
    if (policyResult.requires_human_review) {
      await query(
        `INSERT INTO carts (id, agent_id, merchant_id, items, subtotal_inr, status) VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
        [cartId, agentId, store.id, JSON.stringify(cartItems), selData.price_inr]
      );
      await logAudit({
        agent_id: agentId,
        merchant_id: store.id,
        action: 'HUMAN_REVIEW_REQUESTED',
        input: { cart_id: cartId, selected_sku: selected.sku, amount: selData.price_inr },
        output: { reason: 'Order exceeds human review threshold', cart_id: cartId },
        policy_result: policyResult,
        duration_ms: Date.now() - t4,
      });
      addStep('POLICY_ENGINE', 'review', `Human review required - ₹${selData.price_inr.toLocaleString()} exceeds threshold`, Date.now() - t4);

      res.status(200).json({
        scenario, steps,
        outcome: 'PENDING_REVIEW',
        summary: 'Order requires human approval. Merchant notified.',
        cart_id: cartId,
        duration_ms: Date.now() - startTotal,
      });
      return;
    }

    // ── APPROVED - proceed to checkout ───────────────────────────
    addStep('POLICY_ENGINE', 'ok', `APPROVED · ${policyResult.rules_passed?.length ?? 0} rules passed`, Date.now() - t4);

    await query(
      `INSERT INTO carts (id, agent_id, merchant_id, items, subtotal_inr, status) VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
      [cartId, agentId, store.id, JSON.stringify(cartItems), selData.price_inr]
    );

    // ── Step 5: Create Razorpay order ────────────────────────────
    const t5 = Date.now();
    const orderId = `order_${nanoid(12)}`;
    const rzpOrder = await createRazorpayOrder(
      selData.price_inr * 100,
      orderId,
      { aisle_order_id: orderId, agent_id: agentId, scenario }
    );
    addStep('RAZORPAY_ORDER', 'ok', `${rzpOrder.id} · ₹${selData.price_inr.toLocaleString()}`, Date.now() - t5);

    // ── Step 6: Generate reasoning trace ─────────────────────────
    const reasoning = await generateTrace(cfg.task, products, selected, {
      spending_limit_per_session_inr: cfg.budget,
      spending_limit_per_day_inr: cfg.dailyLimit,
      allowed_categories: agentPayload.allowed_categories,
    }).catch(() => `Selected ${selData.name} (₹${selData.price_inr}) as it best matches the agent task within budget constraints.`);

    // ── Step 7: Save order + audit ────────────────────────────────
    await query(
      `INSERT INTO orders (id, cart_id, merchant_id, agent_id, razorpay_order_id, amount_inr, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'CREATED')`,
      [orderId, cartId, store.id, agentId, rzpOrder.id, selData.price_inr]
    );
    await query(`UPDATE carts SET status = 'CHECKED_OUT' WHERE id = $1`, [cartId]);

    const logId = await logAudit({
      agent_id: agentId,
      merchant_id: store.id,
      action: 'CHECKOUT_SUCCESS',
      input: { cart_id: cartId, scenario },
      output: {
        order_id: orderId,
        razorpay_order_id: rzpOrder.id,
        amount_inr: selData.price_inr,
        product: selData.name,
      },
      reasoning,
      policy_result: policyResult,
      duration_ms: Date.now() - t5,
    });

    addStep('CHECKOUT_SUCCESS', 'ok', `Order ${orderId} · Razorpay ${rzpOrder.id}`, Date.now() - t5);

    res.status(201).json({
      scenario,
      steps,
      outcome: 'SUCCESS',
      summary: `${cfg.agentName} purchased "${selData.name}" for ₹${selData.price_inr.toLocaleString()}`,
      order_id: orderId,
      razorpay_order_id: rzpOrder.id,
      amount_inr: selData.price_inr,
      product: selData.name,
      reasoning,
      audit_log_id: logId,
      duration_ms: Date.now() - startTotal,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SIMULATE] Error:', err);
    res.status(500).json({
      error: 'SIMULATE_FAILED',
      detail: msg,
      steps,
      duration_ms: Date.now() - startTotal,
    });
  }
});

/**
 * GET /v1/simulate/scenarios
 * Returns available scenarios for the dashboard to display.
 */
router.get('/scenarios', (_req: Request, res: Response) => {
  res.json({
    scenarios: Object.entries(SCENARIOS).map(([id, cfg]) => ({
      id,
      label: cfg.label,
      task: cfg.task,
      agentName: cfg.agentName,
      budget: cfg.budget,
    })),
  });
});

export default router;

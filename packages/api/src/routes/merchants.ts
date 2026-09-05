import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { query, queryOne } from '../db/client';
import { validate } from '../middleware/validate';
import { getMerchantLogs, getMerchantAnalytics, auditStream } from '../services/audit';
import { Merchant, MerchantPolicies, Order } from '../types';

const router = Router();

const ProductDataSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  price_inr: z.number().positive(),
  inventory: z.number().int().nonnegative(),
  categories: z.array(z.string()).min(1),
  attributes: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const CustomRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  rule_type: z.enum(['spend_cap', 'category_block', 'velocity', 'geo_restrict', 'custom']),
  threshold: z.string().max(120).optional(),
  action: z.enum(['block', 'review', 'warn']),
  enabled: z.boolean().optional().default(true),
  created_at: z.string().optional(),
});

const PoliciesShape = z.object({
  max_order_value: z.number().positive().optional(),
  human_review_above: z.number().positive().optional(),
  allowed_agent_types: z.array(z.string()).optional(),
  discount_cap_percent: z.number().min(0).max(100).optional(),
  daily_ai_gmv_cap: z.number().positive().optional(),
  emergency_stop: z.boolean().optional(),
  custom_rules: z.array(CustomRuleSchema).optional(),
});

const RegisterMerchantSchema = z.object({
  razorpay_key_id: z.string().startsWith('rzp_'),
  razorpay_key_secret: z.string().min(10),
  store_name: z.string().min(1).max(100),
  description: z.string().optional(),
  catalog: z.array(
    z.object({
      sku: z.string().min(1),
      data: ProductDataSchema,
      in_stock: z.boolean().default(true),
    })
  ).min(1),
  policies: PoliciesShape.default({}),
});

const UpdatePoliciesSchema = z.object({
  ai_buyers_enabled: z.boolean().optional(),
  policies: PoliciesShape.optional(),
});

/**
 * POST /v1/merchants/register
 * Register a merchant and bulk-insert their catalog.
 */
router.post('/register', validate(RegisterMerchantSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof RegisterMerchantSchema>;
  const merchantId = `store_${nanoid(12)}`;

  await query(
    `INSERT INTO merchants (id, razorpay_key_id, razorpay_key_secret, name, description, policies, ai_buyers_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [
      merchantId,
      body.razorpay_key_id,
      body.razorpay_key_secret,
      body.store_name,
      body.description ?? null,
      JSON.stringify(body.policies),
    ]
  );

  // Bulk insert products
  for (const product of body.catalog) {
    await query(
      `INSERT INTO products (sku, merchant_id, data, in_stock)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sku, merchant_id) DO UPDATE SET data = EXCLUDED.data, in_stock = EXCLUDED.in_stock, updated_at = NOW()`,
      [product.sku, merchantId, JSON.stringify(product.data), product.in_stock]
    );
  }

  res.status(201).json({
    merchant_id: merchantId,
    store_name: body.store_name,
    products_registered: body.catalog.length,
    manifest_url: `/v1/stores/${merchantId}/manifest`,
    catalog_url: `/v1/stores/${merchantId}/catalog`,
  });
});

/**
 * GET /v1/merchants/:merchantId
 * Get merchant info.
 */
router.get('/:merchantId', async (req: Request, res: Response) => {
  const merchant = await queryOne<Merchant>(
    'SELECT id, name, description, policies, ai_buyers_enabled, created_at FROM merchants WHERE id = $1',
    [req.params.merchantId]
  );

  if (!merchant) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Merchant not found' });
    return;
  }

  res.json(merchant);
});

/**
 * PATCH /v1/merchants/:merchantId/policies
 * Update merchant policies (used by dashboard Policy Editor).
 */
router.patch('/:merchantId/policies', validate(UpdatePoliciesSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof UpdatePoliciesSchema>;

  const merchant = await queryOne<Merchant>(
    'SELECT * FROM merchants WHERE id = $1',
    [req.params.merchantId]
  );

  if (!merchant) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Merchant not found' });
    return;
  }

  // Merge policies
  const updatedPolicies: MerchantPolicies = {
    ...(merchant.policies as MerchantPolicies),
    ...(body.policies ?? {}),
  };

  const aiEnabled =
    body.ai_buyers_enabled !== undefined
      ? body.ai_buyers_enabled
      : merchant.ai_buyers_enabled;

  await query(
    'UPDATE merchants SET policies = $1, ai_buyers_enabled = $2 WHERE id = $3',
    [JSON.stringify(updatedPolicies), aiEnabled, req.params.merchantId]
  );

  res.json({
    merchant_id: req.params.merchantId,
    ai_buyers_enabled: aiEnabled,
    policies: updatedPolicies,
    updated: true,
  });
});

/**
 * GET /v1/merchants/:merchantId/logs
 * Audit log feed for the merchant dashboard (paginated, filterable).
 */
router.get('/:merchantId/logs', async (req: Request, res: Response) => {
  const {
    limit = '50',
    offset = '0',
    agent_id,
    action,
    from,
    to,
    policy_failed,
  } = req.query as Record<string, string>;

  const { logs, total } = await getMerchantLogs(req.params.merchantId, {
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    agentId: agent_id,
    action,
    from,
    to,
    policyFailed: policy_failed === 'true',
  });

  res.json({ logs, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
});

/**
 * GET /v1/merchants/:merchantId/stream
 * Server-Sent Events (SSE) stream for real-time audit logs.
 */
router.get('/:merchantId/stream', (req: Request, res: Response) => {
  const merchantId = req.params.merchantId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send an initial heartbeat
  res.write('data: {"type": "ping"}\n\n');

  const listener = (data: any) => {
    if (data.merchant_id === merchantId) {
      res.write(`data: ${JSON.stringify({ type: 'log', data: data.log })}\n\n`);
    }
  };

  auditStream.on('new_log', listener);

  req.on('close', () => {
    auditStream.removeListener('new_log', listener);
    res.end();
  });
});

/**
 * GET /v1/merchants/:merchantId/analytics
 * Analytics aggregates for the dashboard.
 */
router.get('/:merchantId/analytics', async (req: Request, res: Response) => {
  const analytics = await getMerchantAnalytics(req.params.merchantId);
  res.json(analytics);
});

/**
 * POST /v1/merchants/:merchantId/orders/:orderId/approve
 * Human review approval - creates Razorpay order.
 */
router.post('/:merchantId/orders/:orderId/approve', async (req: Request, res: Response) => {
  const { merchantId, orderId } = req.params;

  const order = await queryOne<Order>(
    'SELECT * FROM orders WHERE id = $1 AND merchant_id = $2 AND status = $3',
    [orderId, merchantId, 'PENDING_REVIEW']
  );

  if (!order) {
    res.status(404).json({
      error: 'NOT_FOUND',
      detail: 'Order not found or not in PENDING_REVIEW status',
    });
    return;
  }

  const merchant = await queryOne<Merchant>(
    'SELECT razorpay_key_id, razorpay_key_secret FROM merchants WHERE id = $1',
    [merchantId]
  );

  if (!merchant) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Merchant not found' });
    return;
  }

  // Create Razorpay order now
  const { createRazorpayOrder } = await import('../services/razorpay');
  const rzpOrder = await createRazorpayOrder(
    order.amount_inr * 100,
    orderId,
    { aisle_order_id: orderId, approved_by: 'merchant_dashboard' }
  );

  await query(
    `UPDATE orders SET status = 'CREATED', razorpay_order_id = $1, updated_at = NOW() WHERE id = $2`,
    [rzpOrder.id, orderId]
  );

  const { logAudit } = await import('../services/audit');
  await logAudit({
    agent_id: order.agent_id,
    merchant_id: merchantId,
    action: 'HUMAN_REVIEW_APPROVED',
    input: { order_id: orderId },
    output: { razorpay_order_id: rzpOrder.id },
  });

  res.json({
    order_id: orderId,
    razorpay_order_id: rzpOrder.id,
    status: 'CREATED',
    message: 'Order approved and Razorpay order created',
  });
});

/**
 * POST /v1/merchants/:merchantId/orders/:orderId/reject
 * Human review rejection - cancels the order.
 */
router.post('/:merchantId/orders/:orderId/reject', async (req: Request, res: Response) => {
  const { merchantId, orderId } = req.params;

  const result = await query(
    `UPDATE orders SET status = 'CANCELLED', updated_at = NOW()
     WHERE id = $1 AND merchant_id = $2 AND status = 'PENDING_REVIEW'
     RETURNING id`,
    [orderId, merchantId]
  );

  if (result.length === 0) {
    res.status(404).json({
      error: 'NOT_FOUND',
      detail: 'Order not found or not in PENDING_REVIEW status',
    });
    return;
  }

  const order = await queryOne<Order>('SELECT * FROM orders WHERE id = $1', [orderId]);
  const { logAudit } = await import('../services/audit');
  await logAudit({
    agent_id: order?.agent_id,
    merchant_id: merchantId,
    action: 'HUMAN_REVIEW_REJECTED',
    input: { order_id: orderId },
  });

  res.json({ order_id: orderId, status: 'CANCELLED', message: 'Order rejected by merchant' });
});

export default router;

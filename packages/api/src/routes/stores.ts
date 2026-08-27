import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { Merchant, StoreManifest } from '../types';
import { logAudit } from '../services/audit';

const router = Router();

/**
 * GET /v1/stores
 * List all registered stores with optional filters.
 */
router.get('/', async (req: Request, res: Response) => {
  const { category, ai_buyers_enabled, q } = req.query as Record<string, string>;

  const start = Date.now();
  let sql = `SELECT id, name, description, policies, ai_buyers_enabled, created_at FROM merchants WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (ai_buyers_enabled === 'true') {
    sql += ` AND ai_buyers_enabled = true`;
  } else if (ai_buyers_enabled === 'false') {
    sql += ` AND ai_buyers_enabled = false`;
  }

  if (q) {
    sql += ` AND (name ILIKE $${idx} OR description ILIKE $${idx})`;
    params.push(`%${q}%`);
    idx++;
  }

  sql += ` ORDER BY created_at DESC`;

  const merchants = await query<Merchant>(sql, params);

  // If filtering by category, filter by stores that have products in that category
  let filtered = merchants;
  if (category) {
    const storeIds = await query<{ merchant_id: string }>(
      `SELECT DISTINCT merchant_id FROM products WHERE data->'categories' ? $1`,
      [category]
    );
    const ids = new Set(storeIds.map((r) => r.merchant_id));
    filtered = merchants.filter((m) => ids.has(m.id));
  }

  const agentId = req.agent?.agent_id;
  if (agentId) {
    await logAudit({
      agent_id: agentId,
      action: 'DISCOVER',
      input: { filters: { category, ai_buyers_enabled, q } },
      output: { store_count: filtered.length },
      duration_ms: Date.now() - start,
    });
  }

  res.json({
    stores: filtered.map((m) => ({
      store_id: m.id,
      name: m.name,
      description: m.description,
      ai_buyers_enabled: m.ai_buyers_enabled,
      policies: m.policies,
    })),
    total: filtered.length,
  });
});

/**
 * GET /v1/stores/:storeId/manifest
 * Get full store manifest — what the store sells, its policies, endpoints.
 */
router.get('/:storeId/manifest', async (req: Request, res: Response) => {
  const start = Date.now();
  const merchant = await queryOne<Merchant>(
    'SELECT * FROM merchants WHERE id = $1',
    [req.params.storeId]
  );

  if (!merchant) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Store not found' });
    return;
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const manifest: StoreManifest = {
    store_id: merchant.id,
    name: merchant.name,
    description: merchant.description,
    currency: 'INR',
    policies: merchant.policies,
    catalog_endpoint: `${baseUrl}/v1/stores/${merchant.id}/catalog`,
    checkout_endpoint: `${baseUrl}/v1/stores/${merchant.id}/cart/{cartId}/checkout`,
    payment_methods: ['razorpay_upi', 'razorpay_card', 'razorpay_netbanking'],
    ai_buyers_enabled: merchant.ai_buyers_enabled,
    last_updated: merchant.created_at,
  };

  if (req.agent?.agent_id) {
    await logAudit({
      agent_id: req.agent.agent_id,
      merchant_id: merchant.id,
      action: 'MANIFEST_READ',
      output: { store_id: merchant.id, ai_buyers_enabled: merchant.ai_buyers_enabled },
      duration_ms: Date.now() - start,
    });
  }

  res.json(manifest);
});

export default router;

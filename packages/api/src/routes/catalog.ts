import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { Product } from '../types';
import { logAudit } from '../services/audit';

const router = Router({ mergeParams: true });

/**
 * GET /v1/stores/:storeId/catalog
 * List products with optional filters: category, in_stock, max_price, q (name search)
 */
router.get('/', async (req: Request, res: Response) => {
  const start = Date.now();
  const { storeId } = req.params;
  const { category, in_stock, max_price, q } = req.query as Record<string, string>;

  let sql = `SELECT sku, merchant_id, data, in_stock, updated_at FROM products WHERE merchant_id = $1`;
  const params: unknown[] = [storeId];
  let idx = 2;

  if (in_stock === 'true') {
    sql += ` AND in_stock = true`;
  } else if (in_stock === 'false') {
    sql += ` AND in_stock = false`;
  }

  if (category) {
    sql += ` AND data->'categories' ? $${idx}`;
    params.push(category);
    idx++;
  }

  if (max_price) {
    sql += ` AND (data->>'price_inr')::int <= $${idx}`;
    params.push(parseInt(max_price, 10));
    idx++;
  }

  if (q) {
    sql += ` AND (data->>'name' ILIKE $${idx} OR data->>'description' ILIKE $${idx} OR data->'tags' ? $${idx + 1})`;
    params.push(`%${q}%`);
    params.push(q.toLowerCase());
    idx += 2;
  }

  sql += ` ORDER BY (data->>'price_inr')::int ASC`;

  const products = await query<Product>(sql, params);

  if (req.agent?.agent_id) {
    await logAudit({
      agent_id: req.agent.agent_id,
      merchant_id: storeId,
      action: 'CATALOG_QUERY',
      input: { filters: { category, in_stock, max_price, q } },
      output: { product_count: products.length },
      duration_ms: Date.now() - start,
    });
  }

  res.json({
    store_id: storeId,
    products: products.map((p) => ({
      sku: p.sku,
      ...p.data,
      in_stock: p.in_stock,
    })),
    total: products.length,
  });
});

/**
 * GET /v1/stores/:storeId/catalog/:sku
 * Get a single product by SKU.
 */
router.get('/:sku', async (req: Request, res: Response) => {
  const { storeId, sku } = req.params;

  const product = await queryOne<Product>(
    'SELECT * FROM products WHERE sku = $1 AND merchant_id = $2',
    [sku, storeId]
  );

  if (!product) {
    res.status(404).json({ error: 'NOT_FOUND', detail: `Product ${sku} not found in store ${storeId}` });
    return;
  }

  res.json({
    sku: product.sku,
    store_id: storeId,
    ...product.data,
    in_stock: product.in_stock,
    updated_at: product.updated_at,
  });
});

export default router;

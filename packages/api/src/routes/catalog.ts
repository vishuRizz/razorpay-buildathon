import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { Product } from '../types';
import { logAudit } from '../services/audit';
import {
  rankProducts,
  buildSemanticPrefilterTokens,
  formatProductForResponse,
  SearchMode,
} from '../services/semanticSearch';
import { getUpsellBySkus } from '../services/upsell';

const router = Router({ mergeParams: true });

/**
 * GET /v1/stores/:storeId/catalog/upsell
 * Merchant growth agent — suggest complementary products for cart SKUs.
 */
router.get('/upsell', async (req: Request, res: Response) => {
  const start = Date.now();
  const { storeId } = req.params;
  const cartSkus = (req.query.cart_skus as string)?.split(',').filter(Boolean) ?? [];

  const suggestions = await getUpsellBySkus(storeId, cartSkus);

  if (req.agent?.agent_id) {
    await logAudit({
      agent_id: req.agent.agent_id,
      merchant_id: storeId,
      action: 'UPSELL_SUGGESTED',
      input: { cart_skus: cartSkus },
      output: { suggestions_count: suggestions.length, suggestions },
      duration_ms: Date.now() - start,
    });
  }

  res.json({
    store_id: storeId,
    cart_skus: cartSkus,
    suggested_items: suggestions,
    total: suggestions.length,
  });
});

/**
 * GET /v1/stores/:storeId/catalog
 * List products with optional filters: category, in_stock, max_price, q (semantic search)
 * Query params:
 *   q — natural language search ("lightweight 4G hotspot for beach trip")
 *   search_mode — keyword | semantic | hybrid (default: hybrid when q present)
 */
router.get('/', async (req: Request, res: Response) => {
  const start = Date.now();
  const { storeId } = req.params;
  const { category, in_stock, max_price, q, search_mode } = req.query as Record<string, string>;

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

  const mode: SearchMode =
    search_mode === 'keyword' || search_mode === 'semantic' || search_mode === 'hybrid'
      ? search_mode
      : q
        ? 'hybrid'
        : 'keyword';

  // For semantic/hybrid: broad pre-filter with expanded tokens, then re-rank
  if (q && mode !== 'keyword') {
    const tokens = buildSemanticPrefilterTokens(q);
    if (tokens.length > 0) {
      const orClauses: string[] = [];
      for (const token of tokens) {
        orClauses.push(
          `(data->>'name' ILIKE $${idx} OR data->>'description' ILIKE $${idx} OR data->'tags' ? $${idx + 1})`
        );
        params.push(`%${token}%`);
        params.push(token);
        idx += 2;
      }
      sql += ` AND (${orClauses.join(' OR ')})`;
    }
  } else if (q) {
    sql += ` AND (data->>'name' ILIKE $${idx} OR data->>'description' ILIKE $${idx} OR data->'tags' ? $${idx + 1})`;
    params.push(`%${q}%`);
    params.push(q.toLowerCase());
    idx += 2;
  }

  sql += ` ORDER BY (data->>'price_inr')::int ASC`;

  let products = await query<Product>(sql, params);

  // Semantic re-ranking when q is present
  let searchMeta: { search_mode: SearchMode; query: string } | undefined;
  if (q) {
    const ranked = rankProducts(q, products, mode);
    products = ranked.map((r) => r.product);
    searchMeta = { search_mode: mode, query: q };

    if (req.agent?.agent_id) {
      await logAudit({
        agent_id: req.agent.agent_id,
        merchant_id: storeId,
        action: 'CATALOG_QUERY',
        input: { filters: { category, in_stock, max_price, q, search_mode: mode } },
        output: {
          product_count: ranked.length,
          top_matches: ranked.slice(0, 3).map((r) => ({
            sku: r.product.sku,
            relevance_score: r.relevance_score,
            match_type: r.match_type,
          })),
        },
        duration_ms: Date.now() - start,
      });

      res.json({
        store_id: storeId,
        products: ranked.map((r) =>
          formatProductForResponse(r.product, r.relevance_score, r.match_type)
        ),
        total: ranked.length,
        search: searchMeta,
      });
      return;
    }

    res.json({
      store_id: storeId,
      products: ranked.map((r) =>
        formatProductForResponse(r.product, r.relevance_score, r.match_type)
      ),
      total: ranked.length,
      search: searchMeta,
    });
    return;
  }

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
    products: products.map((p) => formatProductForResponse(p)),
    total: products.length,
  });
});

/**
 * GET /v1/stores/:storeId/catalog/:sku
 * Get a single product by SKU.
 */
router.get('/:sku', async (req: Request, res: Response) => {
  const { storeId, sku } = req.params;

  // Avoid matching /upsell as a SKU
  if (sku === 'upsell') {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Use GET /catalog/upsell?cart_skus=...' });
    return;
  }

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

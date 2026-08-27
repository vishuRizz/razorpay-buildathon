import { query as dbQuery } from '../db/client';
import { AuditLogEntry, AuditAction, PolicyResult } from '../types';
import { nanoid } from 'nanoid';

// ================================================================
// Audit Log Service — append-only, never throws
// ================================================================

interface LogInput {
  agent_id?: string;
  merchant_id?: string;
  action: AuditAction;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
  policy_result?: PolicyResult;
  duration_ms?: number;
  error?: string;
}

/**
 * Appends an entry to the audit log.
 * Never throws — wraps in try/catch so logging never breaks the main flow.
 * Returns the log entry ID.
 */
export async function logAudit(entry: LogInput): Promise<string> {
  const id = `log_${nanoid(16)}`;

  try {
    await dbQuery(
      `INSERT INTO audit_log
         (id, agent_id, merchant_id, action, input, output, reasoning, policy_result, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        entry.agent_id ?? null,
        entry.merchant_id ?? null,
        entry.action,
        entry.input ? JSON.stringify(entry.input) : null,
        entry.output ? JSON.stringify(entry.output) : null,
        entry.reasoning ?? null,
        entry.policy_result ? JSON.stringify(entry.policy_result) : null,
        entry.duration_ms ?? null,
        entry.error ?? null,
      ]
    );
  } catch (err) {
    // Log to console but never propagate — audit failure must not break commerce
    console.error('[AUDIT] Failed to write audit log entry:', err);
  }

  return id;
}

/**
 * Fetch audit log entries for a merchant (paginated, filterable).
 */
export async function getMerchantLogs(
  merchantId: string,
  options: {
    limit?: number;
    offset?: number;
    agentId?: string;
    action?: string;
    from?: string;
    to?: string;
    policyFailed?: boolean;
  } = {}
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const {
    limit = 50,
    offset = 0,
    agentId,
    action,
    from,
    to,
    policyFailed,
  } = options;

  const conditions: string[] = ['merchant_id = $1'];
  const params: unknown[] = [merchantId];
  let paramIdx = 2;

  if (agentId) {
    conditions.push(`agent_id = $${paramIdx++}`);
    params.push(agentId);
  }
  if (action) {
    conditions.push(`action = $${paramIdx++}`);
    params.push(action);
  }
  if (from) {
    conditions.push(`timestamp >= $${paramIdx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`timestamp <= $${paramIdx++}`);
    params.push(to);
  }
  if (policyFailed) {
    conditions.push(`policy_result->>'approved' = 'false'`);
  }

  const where = conditions.join(' AND ');

  const [logs, countResult] = await Promise.all([
    dbQuery<AuditLogEntry>(
      `SELECT * FROM audit_log WHERE ${where} ORDER BY timestamp DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    ),
    dbQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_log WHERE ${where}`,
      params
    ),
  ]);

  return {
    logs,
    total: parseInt(countResult[0]?.count ?? '0', 10),
  };
}

/**
 * Get analytics aggregates for a merchant's dashboard.
 */
export async function getMerchantAnalytics(merchantId: string) {
  const [gmv7d, gmv30d, ordersByAction, topProducts, policyStats] = await Promise.all([
    // GMV last 7 days
    dbQuery<{ date: string; gmv: string }>(
      `SELECT DATE(created_at) as date, SUM(amount_inr) as gmv
       FROM orders
       WHERE merchant_id = $1 AND status = 'PAID' AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at) ORDER BY date`,
      [merchantId]
    ),
    // GMV last 30 days total
    dbQuery<{ total: string }>(
      `SELECT COALESCE(SUM(amount_inr), 0) as total FROM orders WHERE merchant_id = $1 AND status = 'PAID' AND created_at >= NOW() - INTERVAL '30 days'`,
      [merchantId]
    ),
    // Order count by action
    dbQuery<{ action: string; count: string }>(
      `SELECT action, COUNT(*) as count FROM audit_log WHERE merchant_id = $1 GROUP BY action ORDER BY count DESC`,
      [merchantId]
    ),
    // Top products from cart data
    dbQuery<{ sku: string; name: string; count: string; revenue: string }>(
      `SELECT
         item->>'sku' as sku,
         item->>'name' as name,
         COUNT(*) as count,
         SUM((item->>'price_inr')::int) as revenue
       FROM orders o, jsonb_array_elements(
         (SELECT c.items FROM carts c WHERE c.id = o.cart_id)
       ) AS item
       WHERE o.merchant_id = $1 AND o.status = 'PAID'
       GROUP BY item->>'sku', item->>'name'
       ORDER BY count DESC LIMIT 10`,
      [merchantId]
    ),
    // Policy outcome distribution
    dbQuery<{ approved: string; count: string }>(
      `SELECT policy_result->>'approved' as approved, COUNT(*) as count
       FROM audit_log
       WHERE merchant_id = $1 AND policy_result IS NOT NULL
       GROUP BY policy_result->>'approved'`,
      [merchantId]
    ),
  ]);

  return {
    gmv_7d: gmv7d,
    gmv_30d_total: parseInt(gmv30d[0]?.total ?? '0', 10),
    activity_by_action: ordersByAction,
    top_products: topProducts,
    policy_outcome_distribution: policyStats,
  };
}

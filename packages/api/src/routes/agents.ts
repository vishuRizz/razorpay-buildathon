import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { query, queryOne } from '../db/client';
import { validate } from '../middleware/validate';
import { AgentTokenPayload, Agent } from '../types';

const router = Router();

const IssueTokenSchema = z.object({
  agent_name: z.string().min(1).max(100),
  owner_email: z.string().email(),
  spending_limit_per_session_inr: z.number().positive().max(100000),
  spending_limit_per_day_inr: z.number().positive().max(500000),
  allowed_store_ids: z.array(z.string()).default(['*']),
  allowed_categories: z.array(z.string()).min(1),
  requires_human_confirm_above_inr: z.number().positive().optional(),
  ttl_hours: z.number().positive().max(720).default(24),
});

/**
 * POST /v1/agents/token
 * Issue an Agent Identity Token (AIT) for an AI agent.
 */
router.post('/token', validate(IssueTokenSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof IssueTokenSchema>;
  const agentId = `agt_${nanoid(12)}`;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + body.ttl_hours * 3600;

  const constraints = {
    spending_limit_per_session_inr: body.spending_limit_per_session_inr,
    spending_limit_per_day_inr: body.spending_limit_per_day_inr,
    allowed_store_ids: body.allowed_store_ids,
    allowed_categories: body.allowed_categories,
    requires_human_confirm_above: body.requires_human_confirm_above_inr,
  };

  const payload: AgentTokenPayload = {
    agent_id: agentId,
    owner_email: body.owner_email,
    spending_limit_per_session_inr: body.spending_limit_per_session_inr,
    spending_limit_per_day_inr: body.spending_limit_per_day_inr,
    allowed_store_ids: body.allowed_store_ids,
    allowed_categories: body.allowed_categories,
    requires_human_confirm_above: body.requires_human_confirm_above_inr,
    issued_at: now,
    expires_at: expiresAt,
  };

  // Insert agent into DB
  await query(
    `INSERT INTO agents (id, owner_email, constraints, revoked, daily_spend_inr, daily_spend_reset)
     VALUES ($1, $2, $3, false, 0, NOW())`,
    [agentId, body.owner_email, JSON.stringify(constraints)]
  );

  const token = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: body.ttl_hours * 3600,
  });

  res.status(201).json({
    agent_id: agentId,
    agent_name: body.agent_name,
    token,
    expires_at: new Date(expiresAt * 1000).toISOString(),
    constraints,
  });
});

/**
 * GET /v1/agents/:agentId
 * Get agent info (for debugging/admin).
 */
router.get('/:agentId', async (req: Request, res: Response) => {
  const agent = await queryOne<Agent>(
    'SELECT id, owner_email, constraints, revoked, daily_spend_inr, created_at FROM agents WHERE id = $1',
    [req.params.agentId]
  );

  if (!agent) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Agent not found' });
    return;
  }

  res.json(agent);
});

/**
 * POST /v1/agents/:agentId/revoke
 * Revoke an agent token.
 */
router.post('/:agentId/revoke', async (req: Request, res: Response) => {
  const result = await query(
    'UPDATE agents SET revoked = true WHERE id = $1 RETURNING id',
    [req.params.agentId]
  );

  if (result.length === 0) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Agent not found' });
    return;
  }

  res.json({ message: `Agent ${req.params.agentId} revoked successfully` });
});

export default router;

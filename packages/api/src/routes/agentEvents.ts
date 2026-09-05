import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import {
  appendAgentEvent,
  getAgentSession,
  getLatestAgentSession,
  startSession,
  touchSession,
} from '../services/agentEvents';

const router = Router();

const PostEventSchema = z.object({
  session_id: z.string().min(1),
  type: z.string().min(1),
  agent_id: z.string().optional(),
  task: z.string().optional(),
  model: z.string().optional(),
  step: z.number().int().optional(),
  label: z.string().optional(),
  detail: z.preprocess(
    (v) => (typeof v === 'string' ? v : v == null ? undefined : JSON.stringify(v)),
    z.string().optional()
  ),
  status: z.enum(['pending', 'active', 'ok', 'error']).optional(),
  session_status: z.enum(['running', 'complete', 'error', 'stopped']).optional(),
  meta: z.record(z.unknown()).optional(),
});

/**
 * POST /v1/agent-events
 * Append a live agent step (used by LLM demo → Agent Brain dashboard).
 */
router.post('/', validate(PostEventSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof PostEventSchema>;

  // Heartbeat: refresh updated_at only (keeps stale-expiry from killing live Groq waits)
  if (body.type === 'heartbeat') {
    await touchSession(body.session_id);
    res.json({ ok: true, heartbeat: true });
    return;
  }

  if (body.type === 'session_start') {
    await startSession({
      session_id: body.session_id,
      agent_id: body.agent_id,
      task: body.task,
    });
  }

  const session = await appendAgentEvent(body.session_id, body);
  if (!session) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Session not found' });
    return;
  }

  res.status(201).json({ ok: true, session_id: session.session_id, event_count: session.events.length });
});

/**
 * GET /v1/agent-events/latest
 * Poll the most recent agent session (for Agent Brain dashboard).
 */
router.get('/latest', async (_req: Request, res: Response) => {
  const session = await getLatestAgentSession();
  if (!session) {
    res.json({ session: null });
    return;
  }
  res.json({ session });
});

/**
 * GET /v1/agent-events/:sessionId
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  const session = await getAgentSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'Session not found' });
    return;
  }
  res.json({ session });
});

export default router;

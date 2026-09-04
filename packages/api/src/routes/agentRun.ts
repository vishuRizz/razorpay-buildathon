import { Router, Request, Response } from 'express';
import path from 'path';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { validate } from '../middleware/validate';
import {
  appendAgentEvent,
  getRunningSession,
  isAnySessionRunning,
  startSession,
} from '../services/agentEvents';
import {
  clearAgentCancel,
  isAgentCancelRequested,
  requestAgentCancel,
} from '../services/agentRunControl';

const router = Router();

const DEFAULT_TASK =
  'Surprise me — buy something useful under ₹2,000 from any store on AISLE. Explore all catalogs, compare different product types, and pick the best match for a general shopper.';

const RunAgentSchema = z.object({
  task: z.string().min(10).max(2000).optional(),
});

const StopAgentSchema = z.object({
  session_id: z.string().optional(),
});

function loadDemoModule<T = unknown>(file: string): T {
  const modPath = path.resolve(__dirname, '../../../../demo/lib', file);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modPath) as T;
}

async function issueAgentToken(): Promise<{
  token: string;
  agent_id: string;
  constraints: Record<string, unknown>;
}> {
  const { aisleRequest } = loadDemoModule<{ aisleRequest: Function }>('aisle_client.js');
  const port = process.env.PORT ?? 3001;
  process.env.PORT = String(port);

  const constraints = {
    spending_limit_per_session_inr: 8000,
    spending_limit_per_day_inr: 15000,
    allowed_categories: ['*'],
    requires_human_confirm_above_inr: 6000,
  };

  const { data } = await aisleRequest('POST', '/agents/token', {
    body: {
      agent_name: 'dashboard_agent_llm',
      owner_email: 'demo@aisle.dev',
      ...constraints,
      ttl_hours: 1,
    },
  });

  return { token: data.token, agent_id: data.agent_id, constraints };
}

async function runAgentJob(sessionId: string, task: string): Promise<void> {
  const { runAgentLoop } = loadDemoModule<{ runAgentLoop: Function }>('agent_loop.js');
  const { emitAgentEvent } = loadDemoModule<{ emitAgentEvent: Function }>('agent_events.js');

  try {
    const { token, agent_id, constraints } = await issueAgentToken();

    await runAgentLoop({
      task,
      token,
      constraints,
      sessionId,
      agentId: agent_id,
      onEvent: () => {},
      shouldCancel: () => isAgentCancelRequested(sessionId),
    });
  } catch (err: unknown) {
    const cancelled =
      err instanceof Error &&
      (err.name === 'AgentCancelledError' || err.message === 'AGENT_CANCELLED');

    if (cancelled) {
      await emitAgentEvent(sessionId, {
        type: 'stopped',
        label: 'Agent stopped',
        detail: 'Run cancelled from dashboard. No further tool calls will execute.',
        status: 'error',
        session_status: 'stopped',
      });
      appendAgentEvent(sessionId, {
        type: 'stopped',
        label: 'Agent stopped',
        detail: 'Cancelled by user',
        status: 'error',
        session_status: 'stopped',
      });
    } else {
      await emitAgentEvent(sessionId, {
        type: 'error',
        label: 'Agent failed',
        detail: err instanceof Error ? err.message : String(err),
        status: 'error',
        session_status: 'error',
      });
    }
  } finally {
    clearAgentCancel(sessionId);
  }
}

router.post('/run', validate(RunAgentSchema), async (req: Request, res: Response) => {
  if (!process.env.GROQ_API_KEY) {
    res.status(503).json({
      error: 'GROQ_NOT_CONFIGURED',
      detail: 'Set GROQ_API_KEY in .env to run the LLM agent from the dashboard',
    });
    return;
  }

  if (isAnySessionRunning()) {
    res.status(409).json({
      error: 'AGENT_BUSY',
      detail: 'An agent is already running. Stop it first or wait for completion.',
    });
    return;
  }

  const task = (req.body as z.infer<typeof RunAgentSchema>).task ?? DEFAULT_TASK;
  const sessionId = `sess_${nanoid(12)}`;

  startSession({ session_id: sessionId, task });

  res.status(202).json({
    session_id: sessionId,
    status: 'running',
    task,
  });

  setImmediate(() => {
    runAgentJob(sessionId, task).catch((err) => {
      console.error('[AGENT RUN] Background job failed:', err);
    });
  });
});

router.post('/stop', validate(StopAgentSchema), (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof StopAgentSchema>;
  const running = getRunningSession();

  if (!running) {
    res.status(404).json({ error: 'NOT_RUNNING', detail: 'No agent is currently running' });
    return;
  }

  if (body.session_id && body.session_id !== running.session_id) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'That session is not the active run' });
    return;
  }

  requestAgentCancel(running.session_id);

  appendAgentEvent(running.session_id, {
    type: 'stop_requested',
    label: 'Stop requested',
    detail: 'Halting agent after current step…',
    status: 'active',
  });

  res.json({
    ok: true,
    session_id: running.session_id,
    message: 'Stop signal sent. Agent will halt at the next checkpoint.',
  });
});

router.get('/run/status', (_req: Request, res: Response) => {
  const running = getRunningSession();
  res.json({
    running: isAnySessionRunning(),
    groq_configured: Boolean(process.env.GROQ_API_KEY),
    session_id: running?.session_id ?? null,
  });
});

export default router;

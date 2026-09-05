import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { validate } from '../middleware/validate';
import {
  appendAgentEvent,
  forceStopSession,
  getAgentSession,
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
  'Buy something useful under ₹2,000 from any AISLE store. Pick one product quickly and checkout.';

const RunAgentSchema = z.object({
  task: z.string().min(10).max(2000).optional(),
});

const StopAgentSchema = z.object({
  session_id: z.string().optional(),
});

function resolveDemoModule(file: string): string {
  const candidates = [
    path.join(process.cwd(), 'demo-lib', file),
    path.join(process.cwd(), 'packages/api/demo-lib', file),
    path.resolve(__dirname, '../../demo-lib', file),
    path.resolve(__dirname, '../../../../demo/lib', file),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Demo module not found: ${file}. Tried: ${candidates.join(' | ')}`);
}

function loadDemoModule<T = unknown>(file: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(resolveDemoModule(file)) as T;
}

function formatFailureDetail(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as Error & { response?: unknown };
    if (anyErr.response != null) {
      try {
        return `${anyErr.message} · ${JSON.stringify(anyErr.response)}`;
      } catch {
        return anyErr.message || 'Unknown error';
      }
    }
    return anyErr.message || 'Unknown error';
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function scheduleBackground(job: Promise<void>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { waitUntil } = require('@vercel/functions') as {
      waitUntil: (p: Promise<unknown>) => void;
    };
    waitUntil(job);
    return;
  } catch {
    // Local / package missing - still run the job in-process
  }
  void job.catch((err) => console.error('[AGENT RUN] Background job failed:', err));
}

async function issueAgentToken(): Promise<{
  token: string;
  agent_id: string;
  constraints: Record<string, unknown>;
}> {
  const { aisleRequest } = loadDemoModule<{ aisleRequest: Function }>('aisle_client.js');

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
      shouldCancel: async () => {
        if (isAgentCancelRequested(sessionId)) return true;
        const session = await getAgentSession(sessionId);
        return !session || session.status === 'stopped' || session.status === 'error';
      },
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
      await appendAgentEvent(sessionId, {
        type: 'stopped',
        label: 'Agent stopped',
        detail: 'Cancelled by user',
        status: 'error',
        session_status: 'stopped',
      });
    } else {
      const detail = formatFailureDetail(err);
      console.error('[AGENT RUN] Failed:', detail);
      await emitAgentEvent(sessionId, {
        type: 'error',
        label: 'Agent failed',
        detail,
        status: 'error',
        session_status: 'error',
      });
      await appendAgentEvent(sessionId, {
        type: 'error',
        label: 'Agent failed',
        detail,
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

  if (await isAnySessionRunning()) {
    res.status(409).json({
      error: 'AGENT_BUSY',
      detail: 'An agent is already running. Stop it first or wait for completion.',
    });
    return;
  }

  const task = (req.body as z.infer<typeof RunAgentSchema>).task ?? DEFAULT_TASK;
  const sessionId = `sess_${nanoid(12)}`;

  await startSession({ session_id: sessionId, task });

  res.status(202).json({
    session_id: sessionId,
    status: 'running',
    task,
  });

  // Return 202 immediately; keep work alive via waitUntil on Vercel
  scheduleBackground(runAgentJob(sessionId, task));
});

router.post('/stop', validate(StopAgentSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof StopAgentSchema>;
  const running = await getRunningSession();

  if (!running) {
    // Also allow forcing stop by session_id if status is already weird
    if (body.session_id) {
      await forceStopSession(body.session_id, 'Force-stopped from dashboard');
      requestAgentCancel(body.session_id);
      res.json({ ok: true, session_id: body.session_id, message: 'Session marked stopped.' });
      return;
    }
    res.status(404).json({ error: 'NOT_RUNNING', detail: 'No agent is currently running' });
    return;
  }

  if (body.session_id && body.session_id !== running.session_id) {
    res.status(404).json({ error: 'NOT_FOUND', detail: 'That session is not the active run' });
    return;
  }

  requestAgentCancel(running.session_id);

  // Immediately mark stopped in DB so Launch unblocks (cancel flag is in-memory per instance)
  await forceStopSession(
    running.session_id,
    'Stopped from dashboard. You can launch a new agent now.'
  );

  res.json({
    ok: true,
    session_id: running.session_id,
    message: 'Agent stopped. Launch is available again.',
  });
});

router.get('/run/status', async (_req: Request, res: Response) => {
  const running = await getRunningSession();
  res.json({
    running: await isAnySessionRunning(),
    groq_configured: Boolean(process.env.GROQ_API_KEY),
    session_id: running?.session_id ?? null,
  });
});

export default router;

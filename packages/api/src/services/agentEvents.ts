import { nanoid } from 'nanoid';
import { query, queryOne } from '../db/client';

export interface AgentEvent {
  id: string;
  timestamp: string;
  type: string;
  step?: number;
  label?: string;
  detail?: string;
  status?: 'pending' | 'active' | 'ok' | 'error';
  meta?: Record<string, unknown>;
}

export interface AgentSession {
  session_id: string;
  agent_id?: string;
  task?: string;
  model?: string;
  status: 'running' | 'complete' | 'error' | 'stopped';
  started_at: string;
  updated_at: string;
  events: AgentEvent[];
}

interface AgentSessionRow {
  session_id: string;
  agent_id: string | null;
  task: string | null;
  model: string | null;
  status: AgentSession['status'];
  started_at: Date | string;
  updated_at: Date | string;
  events: AgentEvent[] | string;
}

const MAX_EVENTS = 300;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToSession(row: AgentSessionRow): AgentSession {
  const events =
    typeof row.events === 'string' ? (JSON.parse(row.events) as AgentEvent[]) : row.events ?? [];
  return {
    session_id: row.session_id,
    agent_id: row.agent_id ?? undefined,
    task: row.task ?? undefined,
    model: row.model ?? undefined,
    status: row.status,
    started_at: toIso(row.started_at),
    updated_at: toIso(row.updated_at),
    events,
  };
}

export async function startSession(input: {
  session_id: string;
  agent_id?: string;
  task?: string;
}): Promise<AgentSession> {
  const now = new Date().toISOString();
  const row = await queryOne<AgentSessionRow>(
    `INSERT INTO agent_sessions (session_id, agent_id, task, status, started_at, updated_at, events)
     VALUES ($1, $2, $3, 'running', $4::timestamptz, $4::timestamptz, '[]'::jsonb)
     ON CONFLICT (session_id) DO UPDATE SET
       agent_id = COALESCE(EXCLUDED.agent_id, agent_sessions.agent_id),
       task = COALESCE(EXCLUDED.task, agent_sessions.task),
       status = 'running',
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [input.session_id, input.agent_id ?? null, input.task ?? null, now]
  );
  if (!row) {
    throw new Error('Failed to start agent session');
  }
  return rowToSession(row);
}

export async function appendAgentEvent(
  sessionId: string,
  event: Omit<AgentEvent, 'id' | 'timestamp'> & {
    agent_id?: string;
    task?: string;
    model?: string;
    session_status?: AgentSession['status'];
  }
): Promise<AgentSession | null> {
  let session = await getAgentSession(sessionId);
  if (!session) {
    session = await startSession({
      session_id: sessionId,
      agent_id: event.agent_id,
      task: event.task,
    });
  }

  const entry: AgentEvent = {
    id: `evt_${nanoid(10)}`,
    timestamp: new Date().toISOString(),
    type: event.type,
    step: event.step,
    label: event.label,
    detail: event.detail,
    status: event.status,
    meta: event.meta,
  };

  const events = [...session.events, entry].slice(-MAX_EVENTS);
  const status = event.session_status ?? session.status;
  const agentId = event.agent_id ?? session.agent_id ?? null;
  const task = event.task ?? session.task ?? null;
  const model = event.model ?? session.model ?? null;

  const row = await queryOne<AgentSessionRow>(
    `UPDATE agent_sessions
     SET agent_id = $2,
         task = $3,
         model = $4,
         status = $5,
         events = $6::jsonb,
         updated_at = $7::timestamptz
     WHERE session_id = $1
     RETURNING *`,
    [sessionId, agentId, task, model, status, JSON.stringify(events), entry.timestamp]
  );

  return row ? rowToSession(row) : null;
}

export async function getAgentSession(sessionId: string): Promise<AgentSession | null> {
  const row = await queryOne<AgentSessionRow>(
    `SELECT * FROM agent_sessions WHERE session_id = $1`,
    [sessionId]
  );
  return row ? rowToSession(row) : null;
}

export async function getLatestAgentSession(): Promise<AgentSession | null> {
  const row = await queryOne<AgentSessionRow>(
    `SELECT * FROM agent_sessions ORDER BY updated_at DESC LIMIT 1`
  );
  return row ? rowToSession(row) : null;
}

export async function isAnySessionRunning(): Promise<boolean> {
  await expireStaleRunningSessions();
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM agent_sessions WHERE status = 'running') AS exists`
  );
  return Boolean(row?.exists);
}

export async function getRunningSession(): Promise<AgentSession | null> {
  await expireStaleRunningSessions();
  const row = await queryOne<AgentSessionRow>(
    `SELECT * FROM agent_sessions WHERE status = 'running' ORDER BY updated_at DESC LIMIT 1`
  );
  return row ? rowToSession(row) : null;
}

/** Mark a session stopped immediately (so Launch is unblocked on serverless). */
export async function forceStopSession(
  sessionId: string,
  detail = 'Stopped from dashboard'
): Promise<AgentSession | null> {
  return appendAgentEvent(sessionId, {
    type: 'stopped',
    label: 'Agent stopped',
    detail,
    status: 'error',
    session_status: 'stopped',
  });
}

/**
 * Vercel timeouts / crashed jobs leave status=running forever.
 * Auto-close anything idle past maxAgeSeconds so Launch works again.
 * Must be > worst-case Groq round-trip (often 30–60s) or polls will kill live runs.
 */
export async function expireStaleRunningSessions(maxAgeSeconds = 240): Promise<void> {
  try {
    await query(
      `UPDATE agent_sessions
       SET status = 'stopped',
           updated_at = NOW(),
           events = COALESCE(events, '[]'::jsonb) || $1::jsonb
       WHERE status = 'running'
         AND updated_at < NOW() - ($2::text || ' seconds')::interval`,
      [
        JSON.stringify([
          {
            id: `evt_stale_${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'stopped',
            label: 'Agent stopped',
            detail: `Auto-stopped: no activity for ${maxAgeSeconds}s (serverless timeout or crash)`,
            status: 'error',
          },
        ]),
        String(maxAgeSeconds),
      ]
    );
  } catch (err) {
    // Don't take down /run/status if the table is mid-migrate
    console.warn('[agent_sessions] expireStaleRunningSessions failed:', err);
  }
}

/** Keep stale-expiry from killing a live Groq wait. */
export async function touchSession(sessionId: string): Promise<void> {
  await query(
    `UPDATE agent_sessions SET updated_at = NOW() WHERE session_id = $1 AND status = 'running'`,
    [sessionId]
  );
}

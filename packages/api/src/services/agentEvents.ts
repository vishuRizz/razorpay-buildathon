import { nanoid } from 'nanoid';

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

const sessions = new Map<string, AgentSession>();
let latestSessionId: string | null = null;
const MAX_SESSIONS = 20;
const MAX_EVENTS = 300;

function trimSessions() {
  if (sessions.size <= MAX_SESSIONS) return;
  const sorted = [...sessions.values()].sort(
    (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
  );
  for (const s of sorted.slice(0, sessions.size - MAX_SESSIONS)) {
    sessions.delete(s.session_id);
    if (latestSessionId === s.session_id) {
      latestSessionId = sorted[sorted.length - 1]?.session_id ?? null;
    }
  }
}

export function startSession(input: {
  session_id: string;
  agent_id?: string;
  task?: string;
}): AgentSession {
  const now = new Date().toISOString();
  const session: AgentSession = {
    session_id: input.session_id,
    agent_id: input.agent_id,
    task: input.task,
    status: 'running',
    started_at: now,
    updated_at: now,
    events: [],
  };
  sessions.set(input.session_id, session);
  latestSessionId = input.session_id;
  trimSessions();
  return session;
}

export function appendAgentEvent(
  sessionId: string,
  event: Omit<AgentEvent, 'id' | 'timestamp'> & {
    agent_id?: string;
    task?: string;
    model?: string;
    session_status?: AgentSession['status'];
  }
): AgentSession | null {
  let session = sessions.get(sessionId);
  if (!session) {
    session = startSession({ session_id: sessionId, agent_id: event.agent_id, task: event.task });
  }

  if (event.agent_id) session.agent_id = event.agent_id;
  if (event.task) session.task = event.task;
  if (event.model) session.model = event.model;
  if (event.session_status) session.status = event.session_status;

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

  session.events.push(entry);
  if (session.events.length > MAX_EVENTS) {
    session.events = session.events.slice(-MAX_EVENTS);
  }
  session.updated_at = entry.timestamp;
  latestSessionId = sessionId;

  return session;
}

export function getAgentSession(sessionId: string): AgentSession | null {
  return sessions.get(sessionId) ?? null;
}

export function getLatestAgentSession(): AgentSession | null {
  if (!latestSessionId) return null;
  return sessions.get(latestSessionId) ?? null;
}

export function isAnySessionRunning(): boolean {
  return [...sessions.values()].some((s) => s.status === 'running');
}

export function getRunningSession(): AgentSession | null {
  return [...sessions.values()].find((s) => s.status === 'running') ?? null;
}

/**
 * Fire-and-forget emitter for Agent Brain dashboard (POST /v1/agent-events).
 */

const { BASE_URL } = require('./aisle_client');

function summarizeToolResult(name, result) {
  if (!result?.ok) {
    return result?.error ?? 'Tool failed';
  }

  switch (name) {
    case 'discover_stores':
      return `${result.total ?? result.stores?.length ?? 0} store(s) found`;
    case 'read_store_manifest':
      return result.manifest?.name ?? 'Manifest loaded';
    case 'search_catalog':
      return `${result.total ?? result.products?.length ?? 0} product(s) at ${result.store_id ?? 'store'}`;
    case 'create_cart':
      return `Policy: ${result.policy_status ?? 'UNKNOWN'} · ₹${result.subtotal_inr ?? '?'}`;
    case 'checkout':
      return `Order ${result.order_id ?? 'created'} · ₹${result.amount_inr ?? '?'}`;
    case 'check_order_status':
      return `Status: ${result.status ?? 'unknown'}`;
    default:
      return 'OK';
  }
}

function toolLabel(name) {
  const labels = {
    discover_stores: 'Stores discovered',
    read_store_manifest: 'Store manifest read',
    search_catalog: 'Catalog searched',
    create_cart: 'Cart created · policy check',
    checkout: 'Checkout initiated',
    check_order_status: 'Order status checked',
  };
  return labels[name] ?? name;
}

async function emitAgentEvent(sessionId, payload) {
  if (!sessionId) return;
  try {
    const body = { session_id: sessionId, ...payload };
    if (body.detail != null && typeof body.detail !== 'string') {
      body.detail = JSON.stringify(body.detail);
    }
    await fetch(`${BASE_URL}/agent-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Dashboard streaming is best-effort - never block the agent
  }
}

function createDashboardEmitter({ sessionId, agentId, task }) {
  return async function forwardDashboardEvent(event) {
    switch (event.type) {
      case 'session_start':
        await emitAgentEvent(sessionId, {
          type: 'session_start',
          agent_id: agentId,
          task,
          label: 'Task received',
          detail: task,
          status: 'active',
          session_status: 'running',
        });
        break;

      case 'thinking':
        await emitAgentEvent(sessionId, {
          type: 'thinking',
          step: event.step,
          model: event.model,
          label: `Planning (step ${event.step})`,
          detail: event.model,
          status: 'active',
        });
        break;

      case 'tool_call':
        await emitAgentEvent(sessionId, {
          type: 'tool_call',
          step: event.step,
          label: toolLabel(event.name),
          detail: JSON.stringify(event.args),
          status: 'pending',
          meta: { tool: event.name, args: event.args },
        });
        break;

      case 'tool_result':
        await emitAgentEvent(sessionId, {
          type: 'tool_result',
          step: event.step,
          label: toolLabel(event.name),
          detail:
            summarizeToolResult(event.name, event.result) ||
            event.preview?.slice(0, 240) ||
            (event.ok ? 'OK' : 'Failed'),
          status: event.ok ? 'ok' : 'error',
          meta: {
            tool: event.name,
            ok: event.ok,
            duration_ms: event.duration_ms,
            result: event.result,
          },
        });
        break;

      case 'done':
        await emitAgentEvent(sessionId, {
          type: 'done',
          step: event.step,
          label: event.early_exit ? 'Mission complete' : 'Agent finished',
          detail: event.content,
          status: 'ok',
          session_status: 'complete',
        });
        break;

      case 'model_fallback':
        await emitAgentEvent(sessionId, {
          type: 'model_fallback',
          label: 'Model fallback',
          detail: `${event.from} → ${event.to}`,
          status: 'active',
        });
        break;

      case 'stopped':
        await emitAgentEvent(sessionId, {
          type: 'stopped',
          label: 'Agent stopped',
          detail: event.detail ?? 'Run cancelled',
          status: 'error',
          session_status: 'stopped',
        });
        break;

      case 'error':
        await emitAgentEvent(sessionId, {
          type: 'error',
          label: event.label ?? 'Agent error',
          detail: event.detail,
          status: 'error',
          session_status: 'error',
        });
        break;

      default:
        break;
    }
  };
}

module.exports = { emitAgentEvent, createDashboardEmitter, summarizeToolResult, toolLabel };

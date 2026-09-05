/**
 * Generic LLM tool-calling loop for Aisle shopping agents.
 * Uses Groq (OpenAI-compatible API) with function calling.
 */

const OpenAI = require('openai');
const { TOOL_DEFINITIONS, executeTool } = require('./tools');

// Groq retired llama-3.1-8b-instant (Aug 2026). Current production IDs:
// https://console.groq.com/docs/models
const MODEL_CANDIDATES = [
  process.env.GROQ_AGENT_MODEL,
  'openai/gpt-oss-20b',
  'qwen/qwen3.6-27b',
].filter(Boolean);

// Vercel serverless has a ~60s ceiling - keep the loop short
const MAX_ITERATIONS = Number(
  process.env.AGENT_MAX_ITERATIONS ?? (process.env.VERCEL ? 6 : 20)
);

function isModelNotFoundError(err) {
  const msg = String(err?.message ?? err);
  return err?.status === 404 || /does not exist|do not have access/i.test(msg);
}

function createCompletion(client, { model, messages }) {
  return client.chat.completions.create({
    model,
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: 'auto',
    temperature: 0.2,
  });
}

async function completeWithFallback(client, messages, onEvent) {
  const tried = new Set();

  for (const model of MODEL_CANDIDATES) {
    if (tried.has(model)) continue;
    tried.add(model);

    try {
      return { response: await createCompletion(client, { model, messages }), model };
    } catch (err) {
      if (!isModelNotFoundError(err)) throw err;
      const next = MODEL_CANDIDATES.find((m) => !tried.has(m));
      if (next) {
        onEvent?.({ type: 'model_fallback', from: model, to: next });
      }
    }
  }

  throw new Error(
    `No usable Groq model found. Tried: ${MODEL_CANDIDATES.join(', ')}. ` +
      'Set GROQ_AGENT_MODEL in .env - see console.groq.com/docs/models'
  );
}

function buildSystemPrompt(constraints) {
  const categories =
    constraints.allowed_categories?.includes('*')
      ? 'all categories (unrestricted)'
      : constraints.allowed_categories.join(', ');

  return `You are a fast autonomous shopping agent on the AISLE commerce protocol.

Goal: finish ONE purchase quickly. Do not browse forever.

Workflow:
1. discover_stores - ai_buyers_enabled:"true" (once)
2. search_catalog - use the EXACT store_id field from discover_stores (e.g. store_8oDSNvd0akcV). NEVER invent IDs like store_GadgetNest from the name.
   Prefer: max_price=<budget>, in_stock:"true", and either omit q OR use a short noun ("granola","earbuds","book").
3. As soon as products[] is non-empty → create_cart with one SKU → checkout → check_order_status → short text summary.

Hard constraints:
- Session spending limit: ₹${constraints.spending_limit_per_session_inr}
- Daily spending limit: ₹${constraints.spending_limit_per_day_inr}
- Allowed categories: ${categories}
- Human confirm threshold: ₹${constraints.requires_human_confirm_above_inr ?? 'none'}

Rules:
- Max 2 search_catalog calls. After the first non-empty catalog, buy immediately.
- If results include a note about fallback browse items, pick one of those SKUs and create_cart - do not search again.
- Never invent SKUs or store IDs
- Checkout exactly once`;
}

/** Stop once checkout succeeded and that order was status-checked. */
function getCompletedPurchase(trace) {
  for (let i = trace.length - 1; i >= 0; i--) {
    const entry = trace[i];
    if (entry.tool !== 'check_order_status' || !entry.result?.ok) continue;

    const orderId = entry.result.order_id;
    const checkout = trace.find(
      (t) => t.tool === 'checkout' && t.result?.ok && t.result.order_id === orderId
    );
    if (checkout) {
      return { checkout, status: entry };
    }
  }
  return null;
}

function buildCompletionSummary({ checkout, status }) {
  const r = checkout.result;
  return (
    `Purchase complete.\n` +
    `- Order: ${r.order_id}\n` +
    `- Razorpay: ${r.razorpay_order_id ?? 'n/a'}\n` +
    `- Amount: ₹${r.amount_inr ?? status.result.amount_inr}\n` +
    `- Status: ${status.result.status}\n` +
    `- Reasoning: ${r.reasoning ?? checkout.args?.agent_reasoning ?? 'n/a'}`
  );
}

class AgentCancelledError extends Error {
  constructor() {
    super('AGENT_CANCELLED');
    this.name = 'AgentCancelledError';
  }
}

function assertNotCancelled(shouldCancel) {
  const result = shouldCancel?.();
  // Support both sync and async cancel checks (DB-backed stop on serverless)
  if (result && typeof result.then === 'function') {
    return result.then((cancelled) => {
      if (cancelled) throw new AgentCancelledError();
    });
  }
  if (result) {
    throw new AgentCancelledError();
  }
  return undefined;
}

function truncate(value, max = 1200) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function withHeartbeat(sessionId, work) {
  if (!sessionId) return work();
  const { emitAgentEvent } = require('./agent_events');
  const iv = setInterval(() => {
    emitAgentEvent(sessionId, { type: 'heartbeat' }).catch(() => {});
  }, 15000);
  try {
    return await work();
  } finally {
    clearInterval(iv);
  }
}

async function runAgentLoop({ task, token, constraints, onEvent, sessionId, agentId, shouldCancel }) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is required. Add it to aisle/.env');
  }

  let dashboardEmit = null;
  if (sessionId) {
    const { createDashboardEmitter } = require('./agent_events');
    dashboardEmit = createDashboardEmitter({ sessionId, agentId, task });
    await dashboardEmit({ type: 'session_start' });
  }

  async function fireEvent(event) {
    onEvent?.(event);
    if (dashboardEmit) await dashboardEmit(event);
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const messages = [
    { role: 'system', content: buildSystemPrompt(constraints) },
    { role: 'user', content: task },
  ];

  const ctx = { token };
  const trace = [];
  let activeModel = null;

  async function getCompletion(messagesForStep) {
    if (activeModel) {
      return createCompletion(client, { model: activeModel, messages: messagesForStep });
    }
    const { response, model } = await completeWithFallback(client, messagesForStep, fireEvent);
    activeModel = model;
    return response;
  }

  for (let step = 1; step <= MAX_ITERATIONS; step++) {
    await assertNotCancelled(shouldCancel);

    await fireEvent({ type: 'thinking', step, model: activeModel ?? MODEL_CANDIDATES[0] });

    await assertNotCancelled(shouldCancel);
    const response = await withHeartbeat(sessionId, () => getCompletion(messages));

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error('Empty response from LLM');
    }

    messages.push(message);

    if (!message.tool_calls?.length) {
      const finalText = message.content?.trim() ?? 'Agent finished without a summary.';
      await fireEvent({ type: 'done', step, content: finalText });
      return { finalText, trace, messages, steps: step, sessionId };
    }

    for (const toolCall of message.tool_calls) {
      await assertNotCancelled(shouldCancel);

      const fn = toolCall.function;
      let args;

      try {
        args = JSON.parse(fn.arguments);
      } catch {
        args = {};
      }

      await fireEvent({
        type: 'tool_call',
        step,
        name: fn.name,
        args,
      });

      let result;
      try {
        result = await executeTool(fn.name, args, ctx);
        await fireEvent({
          type: 'tool_result',
          step,
          name: fn.name,
          ok: true,
          duration_ms: result.duration_ms,
          preview: truncate(result),
          result,
        });
      } catch (err) {
        result = {
          ok: false,
          error: err.message,
          status: err.status,
          response: err.response,
          duration_ms: err.duration_ms,
        };
        await fireEvent({
          type: 'tool_result',
          step,
          name: fn.name,
          ok: false,
          preview: truncate(result),
        });
      }

      trace.push({ step, tool: fn.name, args, result });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });

      await assertNotCancelled(shouldCancel);
    }

    const completed = getCompletedPurchase(trace);
    if (completed) {
      const finalText = buildCompletionSummary(completed);
      await fireEvent({ type: 'done', step, content: finalText, early_exit: true });
      return { finalText, trace, messages, steps: step, sessionId };
    }
  }

  await fireEvent({
    type: 'error',
    label: 'Agent failed',
    detail: `Exceeded max iterations (${MAX_ITERATIONS})`,
    status: 'error',
    session_status: 'error',
  });
  throw new Error(`Agent exceeded max iterations (${MAX_ITERATIONS})`);
}

module.exports = { runAgentLoop, MODEL_CANDIDATES, AgentCancelledError };

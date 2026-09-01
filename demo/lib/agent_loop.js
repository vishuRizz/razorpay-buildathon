/**
 * Generic LLM tool-calling loop for Aisle shopping agents.
 * Uses Groq (OpenAI-compatible API) with function calling.
 */

const OpenAI = require('openai');
const { TOOL_DEFINITIONS, executeTool } = require('./tools');

// Small production models only (fast + cheap on Groq developer plan)
const MODEL_CANDIDATES = [
  process.env.GROQ_AGENT_MODEL,
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
].filter(Boolean);

const MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS ?? 20);

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
      'Set GROQ_AGENT_MODEL in .env — see console.groq.com/docs/models'
  );
}

function buildSystemPrompt(constraints) {
  return `You are an autonomous shopping agent using the Aisle commerce protocol.

Your job: complete the user's shopping task end-to-end by calling tools. You must:
1. discover_stores — find AI-enabled stores (set ai_buyers_enabled: "true")
2. read_store_manifest — check policies before buying from each candidate store
3. search_catalog — search ALL stores that sell WiFi/connectivity (GadgetNest, ConnectHub, etc.); compare price, battery_hours, and max_devices before deciding
4. create_cart — add the best matching in-stock product within budget. Explain tradeoffs in agent_reasoning (e.g. "ConnectHub is ₹600 cheaper but only 3hr battery vs JioFi 6hr")
5. checkout — pay via Razorpay (set agent_confirm implicitly via tool)
6. check_order_status — confirm the order after checkout

Hard constraints (never violate):
- Session spending limit: ₹${constraints.spending_limit_per_session_inr}
- Daily spending limit: ₹${constraints.spending_limit_per_day_inr}
- Allowed categories: ${constraints.allowed_categories.join(', ')}
- Human confirm threshold: ₹${constraints.requires_human_confirm_above_inr ?? 'none'}

Rules:
- Prefer the best value for the task, not just the cheapest price
- If a store has no matching products, try another store
- If policy blocks you, explain why and stop — do not retry blindly
- Call checkout exactly ONCE per purchase — never checkout the same cart twice
- After check_order_status returns CREATED or PAID, respond with a text summary ONLY — do not call any more tools
- When done, reply with a short summary: product, store, price, order_id, status
- Never invent SKUs or store IDs — only use values returned by tools`;
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
  if (shouldCancel?.()) {
    throw new AgentCancelledError();
  }
}

function truncate(value, max = 1200) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
    assertNotCancelled(shouldCancel);

    await fireEvent({ type: 'thinking', step, model: activeModel ?? MODEL_CANDIDATES[0] });

    assertNotCancelled(shouldCancel);
    const response = await getCompletion(messages);

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
      assertNotCancelled(shouldCancel);

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

      assertNotCancelled(shouldCancel);
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

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
  const categories =
    constraints.allowed_categories?.includes('*')
      ? 'all categories (unrestricted)'
      : constraints.allowed_categories.join(', ');

  return `You are a general-purpose autonomous shopping agent on the AISLE commerce protocol.

Your job: interpret the user's request literally and complete their shopping task end-to-end using tools.

Workflow:
1. discover_stores — list ALL AI-enabled stores (ai_buyers_enabled: "true"). Do NOT pre-filter to travel/wifi unless the user asked for that.
2. read_store_manifest — check policies (spending limits, discount_cap_percent) for stores you might buy from.
3. search_catalog — derive search queries FROM THE USER'S TASK. Use natural-language q for semantic search.
   - User wants skincare → search BeautyBar + q="vitamin c serum moisturizer"
   - User wants books/snacks → BookNook, GreenSpoon
   - User wants pet supplies → PetPals
   - User wants kids gift → KidZone
   - User wants car gear → AutoCare
   - User wants pro tech → TechVault
   - Vague "buy anything" → discover ALL stores, search diverse verticals (not just WiFi/travel)
   Search MULTIPLE stores before deciding. Compare at least 2–3 candidates when possible.
4. create_cart — buy what best matches the user's actual request and budget. Include agent_task describing why this product fits THEIR ask.
5. accept_upsell — only if an upsell genuinely fits the user's task (skip irrelevant bundles)
6. negotiate_discount — try for orders over ₹1500 when store allows discount_cap_percent > 0
7. checkout — pay once via Razorpay
8. check_order_status — confirm order, then reply with text summary only

Hard constraints (never violate):
- Session spending limit: ₹${constraints.spending_limit_per_session_inr}
- Daily spending limit: ₹${constraints.spending_limit_per_day_inr}
- Allowed categories: ${categories}
- Human confirm threshold: ₹${constraints.requires_human_confirm_above_inr ?? 'none'}

Critical rules:
- The user's message defines what to buy. Never default to WiFi unless they asked for WiFi, hotspot, or connectivity.
- Vague requests ("buy me anything", "surprise me") → discover ALL stores, browse diverse catalogs (electronics, home, fashion, fitness, travel), pick something useful — NOT always a hotspot.
- Match product category to user intent. Explain your choice in agent_reasoning referencing their words.
- If policy blocks you, explain why and stop — do not retry blindly
- Call checkout exactly ONCE per purchase
- After check_order_status returns CREATED or PAID, respond with a text summary ONLY — no more tools
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

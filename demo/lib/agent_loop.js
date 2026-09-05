/**
 * Generic LLM tool-calling loop for Aisle shopping agents.
 * Providers: Anthropic (preferred) or Groq - see llm_provider.js
 *
 * Serverless note: after Policy APPROVED on create_cart we finish checkout
 * without another LLM round-trip (Vercel maxDuration often kills mid-wait).
 */

const { TOOL_DEFINITIONS, executeTool } = require('./tools');
const { createAgentLlm, isLlmConfigured, resolveProvider } = require('./llm_provider');

const ON_VERCEL = Boolean(process.env.VERCEL);
const MAX_ITERATIONS = Number(
  process.env.AGENT_MAX_ITERATIONS ?? (ON_VERCEL ? 6 : 20)
);
const LLM_TIMEOUT_MS = Number(
  process.env.AGENT_LLM_TIMEOUT_MS ?? (ON_VERCEL ? 28000 : 90000)
);
/** Skip extra LLM hops after an approved cart (default on). Set AGENT_FAST_FINISH=false to disable. */
const FAST_FINISH =
  process.env.AGENT_FAST_FINISH !== 'false';

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

function findApprovedCart(trace) {
  for (let i = trace.length - 1; i >= 0; i--) {
    const entry = trace[i];
    if (entry.tool !== 'create_cart' || !entry.result?.ok || !entry.result.cart_id) continue;
    if (entry.result.requires_human_review) continue;
    if (entry.result.policy_status && entry.result.policy_status !== 'APPROVED') continue;
    return {
      store_id: entry.result.store_id || entry.args?.store_id,
      cart_id: entry.result.cart_id,
      subtotal_inr: entry.result.subtotal_inr,
    };
  }
  return null;
}

function alreadyCheckedOut(trace) {
  return trace.some((t) => t.tool === 'checkout' && t.result?.ok);
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

/** Keep LLM context small on serverless (39 stores blows token/latency budget). */
function slimToolResultForLlm(name, result) {
  if (!result || typeof result !== 'object') return result;
  if (name === 'discover_stores' && Array.isArray(result.stores)) {
    return {
      ...result,
      stores: result.stores.slice(0, 8).map((s) => ({
        store_id: s.store_id || s.id,
        name: s.name,
        ai_buyers_enabled: s.ai_buyers_enabled,
      })),
      note: result.stores.length > 8 ? `Showing 8 of ${result.stores.length} stores` : undefined,
    };
  }
  if (name === 'search_catalog' && Array.isArray(result.products)) {
    return {
      ...result,
      products: result.products.slice(0, 6).map((p) => ({
        sku: p.sku,
        name: p.name || p.data?.name,
        price_inr: p.price_inr ?? p.data?.price_inr,
        categories: p.categories || p.data?.categories,
      })),
    };
  }
  return result;
}

async function withHeartbeat(sessionId, work) {
  if (!sessionId) return work();
  const { emitAgentEvent } = require('./agent_events');
  const iv = setInterval(() => {
    emitAgentEvent(sessionId, { type: 'heartbeat' }).catch(() => {});
  }, ON_VERCEL ? 8000 : 15000);
  try {
    return await work();
  } finally {
    clearInterval(iv);
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runToolStep({ name, args, ctx, step, fireEvent, trace, shouldCancel }) {
  await assertNotCancelled(shouldCancel);

  await fireEvent({
    type: 'tool_call',
    step,
    name,
    args,
  });

  let result;
  try {
    result = await executeTool(name, args, ctx);
    await fireEvent({
      type: 'tool_result',
      step,
      name,
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
      name,
      ok: false,
      preview: truncate(result),
    });
  }

  trace.push({ step, tool: name, args, result });
  return result;
}

/**
 * After Policy APPROVED, finish checkout without another LLM round-trip.
 * Critical on Vercel where the next model wait often exceeds maxDuration.
 */
async function fastFinishCheckout({
  cart,
  task,
  ctx,
  step,
  fireEvent,
  trace,
  shouldCancel,
  sessionId,
  provider,
  model,
}) {
  await fireEvent({
    type: 'thinking',
    step,
    model: model || 'fast-finish',
    meta: { provider, fast_finish: true },
    label: 'Completing checkout',
  });
  await fireEvent({
    type: 'provider',
    label: 'Fast-finish checkout',
    detail: ON_VERCEL
      ? 'Skipping extra LLM hop (Vercel time budget) - policy already APPROVED'
      : 'Skipping extra LLM hop - policy already APPROVED',
    meta: { fast_finish: true },
  });

  const checkoutArgs = {
    store_id: cart.store_id,
    cart_id: cart.cart_id,
    payment_method: 'razorpay_upi',
    agent_confirm: true,
    agent_reasoning: `Policy APPROVED for cart ${cart.cart_id} (₹${cart.subtotal_inr ?? '?'}). Completing Razorpay checkout.`,
    agent_task: task,
  };

  const checkoutResult = await runToolStep({
    name: 'checkout',
    args: checkoutArgs,
    ctx,
    step,
    fireEvent,
    trace,
    shouldCancel,
  });

  if (!checkoutResult?.ok || !checkoutResult.order_id) {
    await fireEvent({
      type: 'error',
      label: 'Checkout failed',
      detail: checkoutResult?.error || 'Checkout did not return order_id',
      status: 'error',
      session_status: 'error',
    });
    throw new Error(checkoutResult?.error || 'Fast-finish checkout failed');
  }

  await runToolStep({
    name: 'check_order_status',
    args: {
      store_id: cart.store_id,
      order_id: checkoutResult.order_id,
    },
    ctx,
    step,
    fireEvent,
    trace,
    shouldCancel,
  });

  const completed = getCompletedPurchase(trace);
  if (completed) {
    const finalText = buildCompletionSummary(completed);
    await fireEvent({
      type: 'done',
      step,
      content: finalText,
      early_exit: true,
      meta: { provider, model: model || 'fast-finish', fast_finish: true },
    });
    return { finalText, trace, steps: step, sessionId, provider, model: model || 'fast-finish', fast_finish: true };
  }

  throw new Error('Fast-finish completed checkout but order status check failed');
}

async function runAgentLoop({ task, token, constraints, onEvent, sessionId, agentId, shouldCancel }) {
  if (!isLlmConfigured()) {
    throw new Error(
      'Set ANTHROPIC_API_KEY (recommended for Buildathon) or GROQ_API_KEY in aisle/.env'
    );
  }

  const llm = createAgentLlm(TOOL_DEFINITIONS, { timeoutMs: LLM_TIMEOUT_MS });
  const provider = llm.provider;

  let dashboardEmit = null;
  if (sessionId) {
    const { createDashboardEmitter } = require('./agent_events');
    dashboardEmit = createDashboardEmitter({ sessionId, agentId, task });
    await dashboardEmit({ type: 'session_start', meta: { provider } });
  }

  async function fireEvent(event) {
    onEvent?.(event);
    if (dashboardEmit) await dashboardEmit(event);
  }

  await fireEvent({
    type: 'provider',
    label: `LLM: ${provider}`,
    detail: provider === 'anthropic' ? 'Anthropic Claude' : 'Groq',
    meta: { provider, models: llm.models, llm_timeout_ms: LLM_TIMEOUT_MS, fast_finish: FAST_FINISH },
  });

  const system = buildSystemPrompt(constraints);
  const messages = [{ role: 'user', content: task }];

  const ctx = { token };
  const trace = [];
  let activeModel = null;

  for (let step = 1; step <= MAX_ITERATIONS; step++) {
    await assertNotCancelled(shouldCancel);

    // Finish without another model call once policy has approved a cart
    if (FAST_FINISH) {
      const cart = findApprovedCart(trace);
      if (cart && cart.store_id && !alreadyCheckedOut(trace)) {
        return fastFinishCheckout({
          cart,
          task,
          ctx,
          step,
          fireEvent,
          trace,
          shouldCancel,
          sessionId,
          provider,
          model: activeModel,
        });
      }
    }

    await fireEvent({
      type: 'thinking',
      step,
      model: activeModel ?? llm.models[0],
      meta: { provider },
    });

    await assertNotCancelled(shouldCancel);

    let turn;
    try {
      turn = await withHeartbeat(sessionId, () =>
        withTimeout(
          llm.complete({
            system,
            messages,
            onFallback: (ev) => fireEvent(ev),
          }),
          LLM_TIMEOUT_MS,
          `LLM (${provider})`
        )
      );
    } catch (err) {
      // If model hangs after an approved cart, still complete the purchase
      const cart = findApprovedCart(trace);
      if (FAST_FINISH && cart?.store_id && !alreadyCheckedOut(trace)) {
        await fireEvent({
          type: 'model_fallback',
          from: activeModel ?? llm.models[0],
          to: 'fast-finish',
          detail: String(err.message || err),
        });
        return fastFinishCheckout({
          cart,
          task,
          ctx,
          step,
          fireEvent,
          trace,
          shouldCancel,
          sessionId,
          provider,
          model: 'fast-finish',
        });
      }
      throw err;
    }

    activeModel = turn.model;
    turn.appendAssistant(messages);

    if (!turn.toolCalls?.length) {
      // Model returned text only - try to finish if cart exists
      const cart = findApprovedCart(trace);
      if (FAST_FINISH && cart?.store_id && !alreadyCheckedOut(trace)) {
        return fastFinishCheckout({
          cart,
          task,
          ctx,
          step,
          fireEvent,
          trace,
          shouldCancel,
          sessionId,
          provider,
          model: activeModel,
        });
      }

      const finalText = turn.text || 'Agent finished without a summary.';
      await fireEvent({ type: 'done', step, content: finalText, meta: { provider, model: activeModel } });
      return { finalText, trace, messages, steps: step, sessionId, provider, model: activeModel };
    }

    for (const toolCall of turn.toolCalls) {
      const args = toolCall.args ?? {};
      const result = await runToolStep({
        name: toolCall.name,
        args,
        ctx,
        step,
        fireEvent,
        trace,
        shouldCancel,
      });

      const slim = slimToolResultForLlm(toolCall.name, result);
      turn.appendToolResult(messages, toolCall, slim);

      await assertNotCancelled(shouldCancel);
    }

    const completed = getCompletedPurchase(trace);
    if (completed) {
      const finalText = buildCompletionSummary(completed);
      await fireEvent({
        type: 'done',
        step,
        content: finalText,
        early_exit: true,
        meta: { provider, model: activeModel },
      });
      return { finalText, trace, messages, steps: step, sessionId, provider, model: activeModel };
    }
  }

  // Last chance: approved cart but out of iterations
  if (FAST_FINISH) {
    const cart = findApprovedCart(trace);
    if (cart?.store_id && !alreadyCheckedOut(trace)) {
      return fastFinishCheckout({
        cart,
        task,
        ctx,
        step: MAX_ITERATIONS,
        fireEvent,
        trace,
        shouldCancel,
        sessionId,
        provider,
        model: activeModel || 'fast-finish',
      });
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

module.exports = {
  runAgentLoop,
  AgentCancelledError,
  isLlmConfigured,
  resolveProvider,
};

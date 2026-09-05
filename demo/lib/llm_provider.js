/**
 * LLM provider for AISLE Agent Brain.
 * Supports Anthropic (preferred for Buildathon) and Groq (OpenAI-compatible).
 *
 * Env:
 *   LLM_PROVIDER=auto|anthropic|groq   (default: auto)
 *   ANTHROPIC_API_KEY + optional ANTHROPIC_AGENT_MODEL
 *   GROQ_API_KEY + optional GROQ_AGENT_MODEL
 *
 * auto: use Anthropic if ANTHROPIC_API_KEY is set, else Groq.
 */

const OpenAI = require('openai');

function hasAnthropic() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function hasGroq() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function isLlmConfigured() {
  return hasAnthropic() || hasGroq();
}

/**
 * @returns {'anthropic' | 'groq'}
 */
function resolveProvider() {
  const forced = (process.env.LLM_PROVIDER || 'auto').toLowerCase().trim();

  if (forced === 'anthropic') {
    if (!hasAnthropic()) {
      throw new Error('LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing in aisle/.env');
    }
    return 'anthropic';
  }

  if (forced === 'groq') {
    if (!hasGroq()) {
      throw new Error('LLM_PROVIDER=groq but GROQ_API_KEY is missing in aisle/.env');
    }
    return 'groq';
  }

  // auto - prefer Anthropic (Razorpay Buildathon recommendation)
  if (hasAnthropic()) return 'anthropic';
  if (hasGroq()) return 'groq';

  throw new Error(
    'No LLM key found. Set ANTHROPIC_API_KEY (recommended) or GROQ_API_KEY in aisle/.env'
  );
}

function getLlmStatus() {
  let provider = null;
  try {
    provider = isLlmConfigured() ? resolveProvider() : null;
  } catch {
    provider = null;
  }
  return {
    configured: isLlmConfigured(),
    provider,
    anthropic_configured: hasAnthropic(),
    groq_configured: hasGroq(),
  };
}

function anthropicModels() {
  return [
    process.env.ANTHROPIC_AGENT_MODEL,
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
  ].filter(Boolean);
}

function groqModels() {
  return [
    process.env.GROQ_AGENT_MODEL,
    'openai/gpt-oss-20b',
    'qwen/qwen3.6-27b',
  ].filter(Boolean);
}

function toAnthropicTools(openaiTools) {
  return openaiTools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters ?? { type: 'object', properties: {} },
  }));
}

function isModelNotFoundError(err) {
  const msg = String(err?.message ?? err);
  const status = err?.status ?? err?.statusCode;
  return status === 404 || /does not exist|not_found|deprecated|do not have access/i.test(msg);
}

/**
 * Create a provider-bound client used by the agent loop.
 * @param {object} openaiTools - OpenAI-format TOOL_DEFINITIONS
 * @param {{ timeoutMs?: number }} [opts]
 */
function createAgentLlm(openaiTools, opts = {}) {
  const provider = resolveProvider();
  const timeoutMs = opts.timeoutMs ?? Number(process.env.AGENT_LLM_TIMEOUT_MS ?? 60000);

  if (provider === 'groq') {
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: timeoutMs,
      maxRetries: 1,
    });
    // Prefer faster models first on Vercel unless overridden
    const models =
      process.env.VERCEL && !process.env.GROQ_AGENT_MODEL
        ? ['openai/gpt-oss-20b', 'qwen/qwen3.6-27b', ...groqModels()].filter(
            (m, i, arr) => arr.indexOf(m) === i
          )
        : groqModels();

    return {
      provider: 'groq',
      models,
      /**
       * @param {{ system: string, messages: any[], onFallback?: Function }} opts
       */
      async complete({ system, messages, onFallback }) {
        const full = [{ role: 'system', content: system }, ...messages];
        const tried = new Set();
        let lastErr;

        for (const model of models) {
          if (tried.has(model)) continue;
          tried.add(model);
          try {
            const response = await client.chat.completions.create(
              {
                model,
                messages: full,
                tools: openaiTools,
                tool_choice: 'auto',
                temperature: 0.2,
                max_tokens: process.env.VERCEL ? 1024 : 2048,
              },
              { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) }
            );
            const message = response.choices[0]?.message;
            if (!message) throw new Error('Empty response from Groq');

            const toolCalls = (message.tool_calls ?? []).map((tc) => ({
              id: tc.id,
              name: tc.function.name,
              argsText: tc.function.arguments,
              args: safeJson(tc.function.arguments),
            }));

            return {
              model,
              text: message.content?.trim() || '',
              toolCalls,
              appendAssistant(transcript) {
                transcript.push(message);
              },
              appendToolResult(transcript, toolCall, result) {
                transcript.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(result),
                });
              },
            };
          } catch (err) {
            lastErr = err;
            if (!isModelNotFoundError(err)) throw err;
            const next = models.find((m) => !tried.has(m));
            if (next) onFallback?.({ type: 'model_fallback', from: model, to: next, provider: 'groq' });
          }
        }

        throw lastErr || new Error(`No usable Groq model. Tried: ${models.join(', ')}`);
      },
    };
  }

  // Anthropic
  // eslint-disable-next-line global-require
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: timeoutMs,
    maxRetries: 1,
  });
  const models = anthropicModels();
  const tools = toAnthropicTools(openaiTools);

  return {
    provider: 'anthropic',
    models,
    async complete({ system, messages, onFallback }) {
      const tried = new Set();
      let lastErr;

      for (const model of models) {
        if (tried.has(model)) continue;
        tried.add(model);
        try {
          const response = await client.messages.create(
            {
              model,
              max_tokens: process.env.VERCEL ? 1024 : 4096,
              system,
              tools,
              messages,
              temperature: 0.2,
            },
            { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) }
          );

          const toolUses = (response.content || []).filter((b) => b.type === 'tool_use');
          const textBlocks = (response.content || []).filter((b) => b.type === 'text');
          const text = textBlocks.map((b) => b.text).join('\n').trim();

          const toolCalls = toolUses.map((b) => ({
            id: b.id,
            name: b.name,
            argsText: JSON.stringify(b.input ?? {}),
            args: b.input ?? {},
          }));

          return {
            model,
            text,
            toolCalls,
            appendAssistant(transcript) {
              transcript.push({ role: 'assistant', content: response.content });
            },
            appendToolResult(transcript, toolCall, result) {
              const block = {
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: JSON.stringify(result),
              };
              const last = transcript[transcript.length - 1];
              if (
                last &&
                last.role === 'user' &&
                Array.isArray(last.content) &&
                last.content.every?.((c) => c.type === 'tool_result')
              ) {
                last.content.push(block);
              } else {
                transcript.push({ role: 'user', content: [block] });
              }
            },
          };
        } catch (err) {
          lastErr = err;
          if (!isModelNotFoundError(err)) throw err;
          const next = models.find((m) => !tried.has(m));
          if (next) onFallback?.({ type: 'model_fallback', from: model, to: next, provider: 'anthropic' });
        }
      }

      throw (
        lastErr ||
        new Error(
          `No usable Anthropic model. Tried: ${models.join(', ')}. Set ANTHROPIC_AGENT_MODEL in .env`
        )
      );
    },
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

/**
 * Simple text completion for audit reasoning traces.
 */
async function completeText({ prompt, maxTokens = 200 }) {
  if (!isLlmConfigured()) return null;

  const provider = resolveProvider();

  if (provider === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_AGENT_MODEL || 'claude-sonnet-4-20250514';
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || null;
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const model = process.env.GROQ_REASONING_MODEL || 'openai/gpt-oss-20b';
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0]?.message?.content?.trim() || null;
}

module.exports = {
  isLlmConfigured,
  resolveProvider,
  getLlmStatus,
  createAgentLlm,
  completeText,
  hasAnthropic,
  hasGroq,
};

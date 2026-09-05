# LLM providers (Anthropic + Groq)

Agent Brain and audit reasoning traces support **both** Anthropic and Groq.

## Recommendation (Razorpay Buildathon)

Use **Anthropic** - judges were asked to use it:

```env
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=auto
# optional:
# ANTHROPIC_AGENT_MODEL=claude-sonnet-4-20250514
```

## Groq (also supported)

```env
GROQ_API_KEY=gsk_...
LLM_PROVIDER=auto
# or force: LLM_PROVIDER=groq
# GROQ_AGENT_MODEL=openai/gpt-oss-20b
```

## Selection rules

| `LLM_PROVIDER` | Behavior |
|---|---|
| `auto` (default) | Prefer Anthropic when `ANTHROPIC_API_KEY` is set; otherwise Groq |
| `anthropic` | Always Anthropic (errors if key missing) |
| `groq` | Always Groq (errors if key missing) |

If **both** keys are set and `LLM_PROVIDER=auto`, Anthropic wins.

The dashboard Agent Brain page shows which provider is active (`LLM: Anthropic Claude` or `LLM: Groq`).

## Models

| Provider | Default | Override |
|---|---|---|
| Anthropic | `claude-sonnet-4-20250514` (fallback `claude-3-5-sonnet-20241022`) | `ANTHROPIC_AGENT_MODEL` |
| Groq | `openai/gpt-oss-20b` (fallback `qwen/qwen3.6-27b`) | `GROQ_AGENT_MODEL` |

## Vercel / serverless

Agent Brain runs inside a Vercel function (`waitUntil` + `maxDuration`).

After `create_cart` returns **Policy APPROVED**, AISLE finishes **checkout + order status** without waiting on another LLM round-trip. That avoids the common stall at "Planning (step N) / Waiting on model…" when the function is about to hit its time limit.

Optional env:

```env
AGENT_FAST_FINISH=true          # default; set false to always ask the LLM for checkout
AGENT_LLM_TIMEOUT_MS=28000      # per-model call budget on Vercel
AGENT_MAX_ITERATIONS=6
```

`packages/api/vercel.json` sets `maxDuration: 300` (requires Vercel Pro; Hobby still caps at 60s - fast-finish is what makes Hobby work).

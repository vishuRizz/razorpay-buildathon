# Architecture

## System overview

```
┌──────────────────────────────────────────────────────────────────┐
│                            AISLE                                 │
│                                                                  │
│   AI Buyer (Agent Brain / CLI / MCP)                             │
│            │                                                     │
│            ▼                                                     │
│   ┌────────────────────┐      ┌─────────────────┐                │
│   │  Agent Commerce    │─────▶│ Razorpay Orders │                │
│   │  API (Express/TS)  │      │ (test mode)     │                │
│   └─────────┬──────────┘      └─────────────────┘                │
│             │                                                    │
│             ▼                                                    │
│   ┌────────────────────┐                                         │
│   │  Policy Engine     │  12 deterministic rules before money    │
│   └─────────┬──────────┘                                         │
│             │                                                    │
│             ▼                                                    │
│   ┌────────────────────┐      ┌─────────────────────────────┐    │
│   │  Neon Postgres     │◀─────│ Merchant Dashboard (React)  │    │
│   └────────────────────┘      └─────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Core ideas

1. **Agent Identity Token (AIT)** - JWT with session/daily spend limits, allowed categories, and human-confirm thresholds.
2. **Store manifest** - machine-readable catalog + policies at `/v1/stores/:id/manifest`.
3. **Policy Engine** - every cart/checkout evaluates the same rule set; failures never call Razorpay.
4. **Audit log** - append-only trail of agent actions for merchants.
5. **Razorpay-native** - payments use the merchant's Razorpay test keys via Orders API.

## Packages

| Package | Role |
|---|---|
| `@aisle/api` | HTTP API, Policy Engine, agent run jobs, webhooks |
| `@aisle/dashboard` | Live Feed, Agent Brain, Policy Editor, Analytics |
| `@aisle/mcp-server` | MCP tool surface for IDE agents |
| `@aisle/merchant-sdk` | Helpers for merchant backends |
| `packages/landing` | Static marketing page |

## Agent Brain flow

1. Dashboard `POST /v1/brain/run` with a natural-language task
2. API issues/uses an AIT and starts an Anthropic or Groq tool-calling loop
3. Tools call AISLE endpoints: discover → search → cart → checkout
4. Events stream to the UI; session state persists in `agent_sessions`

Provider selection (`LLM_PROVIDER`):

| Value | Behavior |
|---|---|
| `auto` (default) | Anthropic if `ANTHROPIC_API_KEY` is set, else Groq |
| `anthropic` | Require Anthropic |
| `groq` | Require Groq |

Recommended for Razorpay Buildathon judges: set `ANTHROPIC_API_KEY`.

## Data stores (Neon)

| Table | Purpose |
|---|---|
| `merchants` | Store + policies JSON |
| `products` | Catalog rows |
| `agents` | Registered agents / reputation |
| `carts` | Active carts |
| `orders` | Checkout + Razorpay ids |
| `audit_log` | Append-only events |
| `agent_sessions` | Dashboard Agent Brain state |

## Safety model

- Limits live on the **token** (buyer) and **merchant policies** (seller).
- Custom rules from the Policy Editor are stored in `merchants.policies.custom_rules` and evaluated as Rule 12.
- `emergency_stop` and `ai_buyers_enabled` are hard gates.

## Local vs production notes

- Local: root `.env`, Vite proxies `/v1`, demo auto-settle on by default in non-production.
- Serverless (e.g. Vercel): set `AISLE_API_URL`, `DATABASE_URL`, Groq + Razorpay secrets; Agent Brain uses `waitUntil` for background work.

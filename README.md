# AISLE

**AI-to-AI commerce protocol for Razorpay** - the merchant-side layer that lets autonomous agents discover stores, pass a deterministic Policy Engine, and checkout via Razorpay Orders (test mode), with every rupee bounded by Agent Identity Tokens (AIT).

Built for **Razorpay AI Buildathon 2026 · Track 01 (AI Growth & Agentic Commerce)**.

### Live demo (deployed)

Prefer not to run locally? Use the hosted dashboard:

| | |
|---|---|
| **App** | [https://razorpay-buildathon.vishu.codes/](https://razorpay-buildathon.vishu.codes/) |
| **Agent Brain** | [https://razorpay-buildathon.vishu.codes/brain](https://razorpay-buildathon.vishu.codes/brain) |
| **Policy Engine** | [https://razorpay-buildathon.vishu.codes/policy](https://razorpay-buildathon.vishu.codes/policy) |

Open **Agent Brain** → pick a preset → **Launch**. Use **Policy Engine** to tune limits / custom rules.

### Local URLs

| | |
|---|---|
| **API** | http://localhost:3001 |
| **Dashboard** | http://localhost:5173 |
| **Agent Brain** | http://localhost:5173/brain |
| **Policy Engine** | http://localhost:5173/policy |
| **Health** | http://localhost:3001/health |

---

## Prerequisites

- **Node.js 20+** and **pnpm** (`npm i -g pnpm`)
- Free **[Neon](https://console.neon.tech)** Postgres database
- **[Razorpay](https://dashboard.razorpay.com/app/keys)** test keys (`rzp_test_…`)
- An LLM key: **[Anthropic](https://console.anthropic.com/)** (recommended for Buildathon) **or** **[Groq](https://console.groq.com/keys)**

---

## Run in 5 minutes

```bash
# 1. Install
pnpm install

# 2. Env
cp .env.example .env
# Edit .env: DATABASE_URL, RAZORPAY_*, JWT_SECRET, and ANTHROPIC_API_KEY (or GROQ_API_KEY)

# 3. Database schema (needs DATABASE_URL only)
pnpm db:migrate

# 4. Start API + Dashboard
pnpm dev

# 5. New terminal - register 13 demo stores / 128 products (API must be up)
pnpm seed
```

Open **http://localhost:5173** → **Agent Brain** → pick a preset → **Launch**.

Copy a `store_…` id from the seed output into the sidebar Merchant ID field to use Live Feed, Policy Editor, and Analytics.

Full walkthrough: **[docs/QUICKSTART.md](docs/QUICKSTART.md)** · Judge demo: **[docs/DEMO.md](docs/DEMO.md)** · LLM keys: **[docs/LLM.md](docs/LLM.md)**

---

## What judges should try

**Fast path (no install):** [Agent Brain](https://razorpay-buildathon.vishu.codes/brain) → Launch a preset · [Policy Engine](https://razorpay-buildathon.vishu.codes/policy) → tweak a rule.

1. **Agent Brain** - LLM tool-calling agent: discover → search → policy → Razorpay order
2. **Policy Engine** - change limits / add a custom rule → re-run a cart that should block or review
3. **Live Feed + Audit** - paste Merchant ID from seed; watch agent events
4. **Budget fail** (optional): `node demo/agent_budget_fail.js` with API running

---

## Demo scripts (API must be running)

```bash
node demo/agent_travel_llm.js "Buy noise-cancelling earbuds under ₹2000"
node demo/agent_travel.js          # scripted happy path
node demo/agent_budget_fail.js     # session limit blocks checkout
node demo/agent_human_review.js    # human review queue
```

Agent Brain uses **Anthropic Claude** when `ANTHROPIC_API_KEY` is set (recommended), otherwise **Groq**. Force with `LLM_PROVIDER=anthropic|groq`. Models: `ANTHROPIC_AGENT_MODEL` (default `claude-sonnet-4-20250514`) or `GROQ_AGENT_MODEL`.

---

## Architecture (short)

```
AI Agent  →  AISLE API (Express/TS)  →  Policy Engine (12 rules)  →  Razorpay Orders
                      ↓
                 Neon Postgres
                      ↓
            Merchant Dashboard (React)
```

Details: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · Endpoints: **[docs/API.md](docs/API.md)**

### Policy Engine (runs before any Razorpay call)

| # | Rule |
|---|---|
| 0 | Emergency stop |
| 1-2 | AIT validity + reputation |
| 3-4 | Session + daily spend limits |
| 5 | Velocity |
| 6 | Category allow-list |
| 7 | Merchant AI buyers enabled |
| 8 | Human review threshold |
| 9 | Inventory |
| 10 | Daily AI GMV cap |
| 11 | Max order value |
| 12 | Discount cap + custom merchant rules |

---

## Project layout

```
aisle/
├── packages/
│   ├── api/           # Agent Commerce API + Policy Engine
│   ├── dashboard/     # Merchant control panel (Vite)
│   ├── mcp-server/    # MCP tools for Cursor / Claude Desktop
│   ├── merchant-sdk/  # Helper package for merchant backends
│   └── landing/       # Static landing page
├── demo/              # Seed + agent demos
└── docs/              # Quickstart, demo script, API, architecture
```

---

## Key API routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/agents/token` | Issue Agent Identity Token |
| `GET` | `/v1/stores` | Discover AI-enabled stores |
| `GET` | `/v1/stores/:id/catalog?q=` | Hybrid semantic + keyword search |
| `POST` | `/v1/stores/:id/cart` | Create cart (Policy Engine) |
| `POST` | `/v1/stores/:id/cart/:id/checkout` | Razorpay Orders create |
| `POST` | `/v1/brain/run` | Dashboard Agent Brain job |
| `PATCH` | `/v1/merchants/:id/policies` | Update AI buyer rules |

---

## MCP (optional)

```bash
# After issuing an AIT via POST /v1/agents/token:
# AISLE_AIT_TOKEN=ait_...  AISLE_API_URL=http://localhost:3001/v1
pnpm mcp
```

Tools: discover, manifest, search, upsell, cart, negotiate, checkout, order status.

---

## Docker (optional)

Requires a filled `.env` (same vars as local). Neon still hosts Postgres.

```bash
docker compose up --build
```

Dashboard: http://localhost:5173 · API: http://localhost:3001  
Then seed against the running API: `pnpm seed`

---

## Tech stack

| Layer | Choice |
|---|---|
| API | Node 20, Express, TypeScript, Zod |
| DB | Neon serverless Postgres |
| Auth | JWT Agent Identity Tokens |
| Payments | Razorpay Node SDK (test mode) |
| Agent Brain / LLM | Anthropic Claude (recommended) or Groq |
| Dashboard | React, Vite, Tailwind |
| Agent I/O | MCP server |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pnpm seed` waits / fails | Start `pnpm dev` first; check http://localhost:3001/health |
| Agent Brain stalls on "Waiting on model…" (Vercel) | Redeploy API with latest agent loop (fast-finish after Policy APPROVED). See [docs/LLM.md](docs/LLM.md#vercel--serverless) |
| Dashboard API errors | Confirm API on :3001; local Vite proxies `/v1` |
| Empty Live Feed | Paste a `store_…` Merchant ID from seed into the sidebar |
| Razorpay errors | Use **test** keys only (`rzp_test_…`) |

More help: [docs/QUICKSTART.md](docs/QUICKSTART.md#troubleshooting)

---

*AISLE · Razorpay AI Buildathon 2026 · Track 01*

# AISLE — AI-to-AI Commerce Protocol Layer

> **AISLE is Razorpay's agent-commerce layer — the merchant-side complement to NPCI UAP / global ACP, with bounded spending via Agent Identity Tokens.**

Makes any Razorpay-enabled store natively discoverable and transactable by autonomous AI buyers.

Built for the Razorpay AI Buildathon 2026 — Track 01 (AI Growth & Agentic Commerce).

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A [Neon](https://console.neon.tech) account (free tier) for Postgres
- Razorpay test-mode keys (`rzp_test_...`)
- Anthropic API key (for reasoning traces)

### Setup

```bash
# 1. Clone and enter directory
cd aisle

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your keys:
#   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
#   ANTHROPIC_API_KEY
#   DATABASE_URL (from console.neon.tech)
#   JWT_SECRET (any long random string)

# 4. Run database migrations on Neon
pnpm db:migrate

# 5. Seed demo merchants + products
pnpm seed

# 6. Start everything
pnpm dev
```

**API:** http://localhost:3001  
**Dashboard:** http://localhost:5173  
**Health:** http://localhost:3001/health

---

## 🎬 Demo Scripts

```bash
# LLM agent — launch from Dashboard → Agent Brain (no terminal)
# Or: node demo/agent_travel_llm.js
node demo/agent_travel_llm.js "Buy noise-cancelling earbuds under ₹2000"

# Scripted happy path (legacy baseline)
node demo/agent_travel.js

# Failure: agent with ₹500 limit tries to buy ₹2,499 item
node demo/agent_budget_fail.js

# Human review: order exceeds threshold, merchant approves
node demo/agent_human_review.js
```

The LLM demo requires `GROQ_API_KEY` in `.env`. Uses small models: `openai/gpt-oss-20b` → `llama-3.1-8b-instant`. Override with `GROQ_AGENT_MODEL`.

---

## 🧠 Tier 2 — Agent Commerce Differentiators

### Semantic Catalog Search
Natural-language product search on `GET /v1/stores/:id/catalog?q=...`:
```bash
# "lightweight 4G hotspot for beach trip" — hybrid semantic + keyword ranking
curl "http://localhost:3001/v1/stores/gadgetnest/catalog?q=lightweight+4G+hotspot+for+beach+trip&search_mode=hybrid"
```

### MCP Server (Model Context Protocol)
Any Cursor / Claude Desktop / Codex agent can shop via MCP tools:
```bash
# Issue an AIT first, then add to .env:
#   AISLE_AIT_TOKEN=ait_...
#   AISLE_API_URL=http://localhost:3001/v1

pnpm mcp   # starts @aisle/mcp-server on stdio
```

**MCP tools:** `aisle_discover_stores`, `aisle_read_manifest`, `aisle_search_catalog`, `aisle_suggest_upsell`, `aisle_create_cart`, `aisle_negotiate_discount`, `aisle_checkout`, `aisle_check_order_status`

**Claude Desktop config** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "aisle": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "AISLE_API_URL": "http://localhost:3001/v1",
        "AISLE_AIT_TOKEN": "your_ait_token_here"
      }
    }
  }
}
```

### Merchant Growth / Upsell Agent
When an agent adds WiFi to cart, AISLE suggests complementary products (travel adapter, SIM). Dashboard shows **AI Upsell Recovered (7D)** on the Analytics page.

### Agent ↔ Merchant Negotiation
Agents can negotiate discounts within merchant `discount_cap_percent`:
```bash
POST /v1/stores/:id/cart/:cartId/negotiate
{ "requested_discount_percent": 5, "agent_reasoning": "Bulk travel kit purchase" }
```
Policy Engine Rule 11 (`DISCOUNT_CAP`) enforces the merchant ceiling at checkout.

---

## 🐳 Docker

```bash
# Spins up API + Dashboard (Neon handles DB)
docker-compose up
```

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AISLE SYSTEM                             │
│                                                                 │
│  ┌──────────────┐     ┌──────────────────┐    ┌─────────────┐  │
│  │  AI Agent    │────▶│  Aisle Agent API │───▶│  Razorpay   │  │
│  │  (Buyer)     │     │  (Express / TS)  │    │  Test Mode  │  │
│  └──────────────┘     └────────┬─────────┘    └─────────────┘  │
│                                │                                │
│                       ┌────────▼─────────┐                      │
│                       │  Policy Engine   │                      │
│                       │  (8-rule safety) │                      │
│                       └────────┬─────────┘                      │
│                                │                                │
│                       ┌────────▼─────────┐                      │
│                       │  NeonDB          │                      │
│                       │  (Serverless PG) │                      │
│                       └──────────────────┘                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Control Dashboard (React + Vite)            │   │
│  │  Live feed │ Audit logs │ Policy editor │ Analytics      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ The Policy Engine

Every cart creation and checkout runs through 11 deterministic safety rules **before** any money moves:

| Rule | Check |
|---|---|
| 1. AIT_VALIDITY | Token not revoked |
| 2. SPENDING_LIMIT_SESSION | Cart ≤ agent session limit |
| 3. SPENDING_LIMIT_DAILY | Cart + daily spend ≤ daily limit |
| 4. VELOCITY_LIMITS | Max 3 checkouts per 5 minutes |
| 5. CATEGORY_POLICY | All items in allowed categories |
| 6. MERCHANT_AI_POLICY | Merchant has AI buyers enabled |
| 7. HUMAN_REVIEW_THRESHOLD | Flags high-value orders for approval |
| 8. INVENTORY_CHECK | All items in stock (race condition guard) |
| 9. MERCHANT_GMV_CAP | Daily AI GMV cap not exceeded |
| 10. MAX_ORDER_VALUE | Cart ≤ merchant max order value |
| 11. DISCOUNT_CAP | Negotiated coupon ≤ discount_cap_percent |

---

## 📁 Project Structure

```
aisle/
├── packages/
│   ├── api/          # Agent Commerce API (Express + TypeScript)
│   ├── dashboard/    # Control Panel (React + Vite + Tailwind)
│   ├── mcp-server/   # MCP tools for Cursor / Claude / Codex agents
│   └── merchant-sdk/ # NPM package for merchant backends
├── demo/             # Runnable demo scripts
└── docs/             # Architecture, API reference, policy docs
```

---

## 🔑 Key API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/agents/token` | Issue Agent Identity Token |
| `POST` | `/v1/merchants/register` | Register a store + catalog |
| `GET` | `/v1/stores` | Discover AI-enabled stores |
| `GET` | `/v1/stores/:id/manifest` | Full store manifest |
| `GET` | `/v1/stores/:id/catalog?q=` | Semantic product search |
| `GET` | `/v1/stores/:id/catalog/upsell` | Upsell suggestions for cart SKUs |
| `POST` | `/v1/stores/:id/cart` | Create cart (runs Policy Engine) |
| `POST` | `/v1/stores/:id/cart/:id/negotiate` | Agent ↔ merchant discount negotiation |
| `POST` | `/v1/stores/:id/cart/:id/accept-upsell` | Accept upsell bundle item |
| `POST` | `/v1/stores/:id/cart/:id/checkout` | Checkout via Razorpay |
| `GET` | `/v1/stores/:id/orders/:id/status` | Poll order status |
| `GET` | `/v1/merchants/:id/logs` | Audit log feed |
| `PATCH` | `/v1/merchants/:id/policies` | Update AI buyer rules |

---

## 🤖 Tech Stack

| Layer | Technology |
|---|---|
| Agent API | Node.js + Express + TypeScript |
| Database | NeonDB (Serverless Postgres) |
| Auth | JWT (Agent Identity Tokens) |
| Validation | Zod |
| Payment | Razorpay Node SDK (test mode) |
| Dashboard | React + Vite + Tailwind + Recharts |
| AI Traces | Claude claude-sonnet-4-6 (Anthropic SDK) |
| Deployment | Docker Compose (no local Postgres needed) |

---

*AISLE · Razorpay AI Buildathon 2026 · Track 01*

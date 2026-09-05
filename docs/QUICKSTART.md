# Quickstart

Get AISLE running locally for development or judging.

## 1. Prerequisites

| Tool | Notes |
|---|---|
| Node.js **20+** | `node -v` |
| pnpm **8+** | `npm install -g pnpm` |
| Neon account | Free tier: https://console.neon.tech |
| Razorpay test keys | https://dashboard.razorpay.com/app/keys |
| Groq API key | https://console.groq.com/keys (optional if using Anthropic) |
| Anthropic API key | https://console.anthropic.com/ (**recommended** for Buildathon) |

## 2. Install

```bash
cd aisle
pnpm install
```

## 3. Configure `.env`

```bash
cp .env.example .env
```

Fill these **required** values:

```env
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
JWT_SECRET=   # openssl rand -hex 32
ANTHROPIC_API_KEY=sk-ant-...   # recommended (Razorpay Buildathon)
# or: GROQ_API_KEY=gsk_...
LLM_PROVIDER=auto              # anthropic | groq | auto
```

Leave `PORT=3001` and `DASHBOARD_URL=http://localhost:5173` as-is for local demo.

The API loads env from the **repo root** `.env` (`aisle/.env`).

> **LLM tip:** If both keys are present, `LLM_PROVIDER=auto` prefers **Anthropic**. Set `LLM_PROVIDER=groq` to force Groq.

## 4. Migrate database

Applies `packages/api/src/db/schema.sql` to Neon. Does **not** need the API process.

```bash
pnpm db:migrate
```

Expected: tables `merchants`, `products`, `agents`, `carts`, `orders`, `audit_log`, `agent_sessions`.

## 5. Start the stack

```bash
pnpm dev
```

This runs:

- API on **http://localhost:3001**
- Dashboard on **http://localhost:5173** (Vite proxies `/v1` → API)

Confirm: open http://localhost:3001/health → should return OK/JSON.

## 6. Seed the marketplace

**Keep `pnpm dev` running.** In a **second** terminal:

```bash
pnpm seed
```

Registers ~13 stores and ~128 products via `POST /v1/merchants/register`.

Copy one printed `store_…` id. Paste it into the dashboard **sidebar Merchant ID** for Live Feed, Policy, Audit, and Analytics.

> Agent Brain does **not** require a Merchant ID - it discovers stores itself.

## 7. Run the hero demo

1. Open http://localhost:5173
2. Go to **Agent Brain**
3. Use preset **Book + snack** or **Surprise me**
4. Click **Launch** and watch discover → search → policy → checkout
5. Note the Razorpay `order_…` id in the timeline

Optional CLI (same stack):

```bash
node demo/agent_travel_llm.js "Buy a paperback under ₹500"
```

## Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | API + dashboard |
| `pnpm dev:api` | API only |
| `pnpm dev:dashboard` | Dashboard only |
| `pnpm db:migrate` | Apply schema |
| `pnpm seed` | Register demo merchants (needs API) |
| `pnpm mcp` | Start MCP server (stdio) |
| `pnpm build` | Production build all packages |

## Troubleshooting

### Seed: "API not reachable"

Start `pnpm dev` (or `pnpm dev:api`) before `pnpm seed`. Seed waits ~20s for `/health`.

### `Cannot connect to database`

- Check `DATABASE_URL` in `aisle/.env`
- Neon project must be active; use the **pooled** connection string with `sslmode=require`
- Re-run `pnpm db:migrate`

### Agent Brain: LLM key missing

Add **`ANTHROPIC_API_KEY`** (recommended) or **`GROQ_API_KEY`** to `.env` and restart `pnpm dev`.

Optional:
```env
LLM_PROVIDER=anthropic
ANTHROPIC_AGENT_MODEL=claude-sonnet-4-20250514
```

### Dashboard shows network / 500 errors

- API must listen on 3001
- Locally leave `packages/dashboard/.env.development` `VITE_API_URL` empty (proxy mode)
- Hard-refresh the browser after restarting API

### Razorpay `authentication failed`

Use **test** mode keys only. Live keys will fail the demo path.

### Policy / Live Feed empty

Paste a real `merchant_id` from seed output into the sidebar, then Save.

### Port already in use

Change `PORT` in `.env` and update the Vite proxy target in `packages/dashboard/vite.config.ts` if you leave the default dashboard port.

## Next

- Judge path: [DEMO.md](./DEMO.md)
- System design: [ARCHITECTURE.md](./ARCHITECTURE.md)
- HTTP reference: [API.md](./API.md)

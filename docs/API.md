# API reference

Base URL (local): `http://localhost:3001`

Most agent commerce routes sit under `/v1`. Auth for cart/checkout uses header:

```http
Authorization: Bearer <AIT_JWT>
```

Agent Brain aliases also exist under `/v1/brain/*` (same handlers; avoids some ad-blockers that block `/agent/` paths).

---

## Health

```http
GET /health
```

---

## Agents

```http
POST /v1/agents/token
Content-Type: application/json

{
  "agent_name": "demo-buyer",
  "spending_limit_per_session_inr": 3000,
  "spending_limit_per_day_inr": 10000,
  "allowed_categories": ["electronics", "books", "connectivity"],
  "requires_human_confirm_above": 5000
}
```

Returns an AIT JWT used on subsequent cart/checkout calls.

---

## Merchants

```http
POST /v1/merchants/register
```

Register store + catalog (used by `pnpm seed`).

```http
GET  /v1/merchants/:merchantId
PATCH /v1/merchants/:merchantId/policies
GET  /v1/merchants/:merchantId/logs
GET  /v1/merchants/:merchantId/stream          # SSE live feed
GET  /v1/merchants/:merchantId/analytics
POST /v1/merchants/:merchantId/orders/:orderId/approve
POST /v1/merchants/:merchantId/orders/:orderId/reject
```

`PATCH .../policies` body example:

```json
{
  "ai_buyers_enabled": true,
  "policies": {
    "max_order_value": 10000,
    "human_review_above": 2000,
    "daily_ai_gmv_cap": 50000,
    "discount_cap_percent": 10,
    "allowed_agent_types": ["shopping", "travel"],
    "emergency_stop": false,
    "custom_rules": []
  }
}
```

---

## Stores & catalog

```http
GET /v1/stores
GET /v1/stores/:storeId/manifest
GET /v1/stores/:storeId/catalog?q=...&search_mode=hybrid
GET /v1/stores/:storeId/catalog/upsell?skus=SKU1,SKU2
```

`search_mode`: `keyword` | `semantic` | `hybrid` (default hybrid when `q` is present).

Use the exact `store_…` id from discover/seed - not the display name.

---

## Cart & checkout

```http
POST /v1/stores/:storeId/cart
POST /v1/stores/:storeId/cart/:cartId/negotiate
POST /v1/stores/:storeId/cart/:cartId/accept-upsell
POST /v1/stores/:storeId/cart/:cartId/checkout
GET  /v1/stores/:storeId/orders/:orderId/status
```

Cart create and checkout both run the Policy Engine.

Negotiate:

```json
{
  "requested_discount_percent": 5,
  "agent_reasoning": "Bundle travel kit"
}
```

---

## Agent Brain

```http
POST /v1/brain/run
POST /v1/brain/stop
GET  /v1/brain/sessions/:sessionId
GET  /v1/brain/status
```

Requires `ANTHROPIC_API_KEY` or `GROQ_API_KEY` (`LLM_PROVIDER=auto|anthropic|groq`). Used by the dashboard Agent Brain page.

---

## Demo settle & webhooks

```http
POST /v1/demo/razorpay/settle
POST /v1/webhooks/razorpay
```

Local/non-production checkout may auto-run the settle path (`AISLE_DEMO_AUTO_SETTLE`). Production should rely on real Razorpay webhooks + `RAZORPAY_WEBHOOK_SECRET`.

---

## Simulate (dashboard scenarios)

```http
POST /v1/simulate/...
```

Used by the Simulate panel for scripted policy demos without the LLM loop.

---

## Errors

Failed policy checks return HTTP 4xx with:

```json
{
  "approved": false,
  "block_reason": "...",
  "rules_failed": ["SPENDING_LIMIT_SESSION"],
  "suggested_action": "..."
}
```

No Razorpay order is created when policy blocks.

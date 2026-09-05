# Demo path (for judges)

Aim: show **bounded autonomous checkout** in under 5 minutes.

Prerequisites: [QUICKSTART.md](./QUICKSTART.md) completed (`pnpm dev` + `pnpm seed`).

---

## 1. Agent Brain (hero shot) - ~90s

1. Open http://localhost:5173 → **Agent Brain**
2. Preset: **Book + snack** or type:
   > Buy a paperback under ₹500 from BookNook.
3. Click **Launch**
4. Narrate the timeline:
   - `discover_stores` - AI-enabled merchants
   - `search_catalog` - hybrid search
   - `create_cart` - Policy Engine runs
   - `checkout` - Razorpay **Orders API** creates `order_…`
5. Point at the Razorpay order card (test mode - no real UPI/card charge required for the demo settle path)

**Talking point:** ChatGPT can recommend; AISLE makes the buy **safe and merchant-controlled**.

---

## 2. Policy gate - ~60s

1. From seed output, paste a Merchant ID into the sidebar
2. Open **Policy Engine**
3. Lower **Max order value** (e.g. ₹500) **or** Add policy → Spend cap `500` → Block → Create
4. Click **Save changes** if you only moved sliders
5. Back to Agent Brain - ask for something that would exceed the cap

**Talking point:** Deterministic rules run **before** Razorpay. Zero chargebacks from overspend.

---

## 3. Merchant visibility - ~45s

1. **Live Feed** - recent agent actions for that merchant
2. **Audit Log** - reasoning + policy verdicts
3. **Analytics** - AI GMV / activity (if data present)

---

## 4. Optional CLI proofs

With API still running:

```bash
# Happy path LLM agent
node demo/agent_travel_llm.js "Buy noise-cancelling earbuds under ₹2000"

# Hard block on session budget
node demo/agent_budget_fail.js

# Human review threshold
node demo/agent_human_review.js
```

---

## Suggested one-liner

> Stripe for AI buyers: one store manifest, Agent Identity Tokens, a 12-rule Policy Engine, Razorpay-native checkout.

---

## What is real vs demo

| Piece | Behavior |
|---|---|
| Store discovery / catalog / cart | Real API + Neon |
| Policy Engine | Real, deterministic |
| Razorpay | Real **Orders.create** in **test** mode |
| Payment capture | Demo auto-settle in non-production (same webhook path as `payment.captured`) unless you wire live webhooks |
| Agent Brain | Real Groq tool-calling loop |

Honesty note for judges: we create a real test-mode Razorpay order; we do not collect UPI/card in the UI. Settlement for the pitch uses the documented demo settle path so Live Feed shows `PAYMENT_SETTLED`.

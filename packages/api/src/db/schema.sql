-- ============================================================
-- AISLE — Database Schema (Neon / PostgreSQL)
-- ============================================================
-- Run this once via: pnpm db:migrate

-- ----------------------------------------------------------------
-- Merchants (store owners registered on AISLE)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
  id                 TEXT        PRIMARY KEY,
  razorpay_key_id    TEXT        NOT NULL,
  razorpay_key_secret TEXT       NOT NULL,
  name               TEXT        NOT NULL,
  description        TEXT,
  policies           JSONB       NOT NULL DEFAULT '{}',
  ai_buyers_enabled  BOOLEAN     NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Products (catalog items per merchant)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  sku         TEXT        NOT NULL,
  merchant_id TEXT        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL,
  in_stock    BOOLEAN     NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sku, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_products_in_stock  ON products(merchant_id, in_stock);

-- ----------------------------------------------------------------
-- Agents (registered AI buyer identities)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT        PRIMARY KEY,
  owner_email         TEXT        NOT NULL,
  constraints         JSONB       NOT NULL,
  revoked             BOOLEAN     NOT NULL DEFAULT false,
  reputation_score    INTEGER     NOT NULL DEFAULT 80,
  daily_spend_inr     INTEGER     NOT NULL DEFAULT 0,
  daily_spend_reset   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- Carts
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
  id               TEXT        PRIMARY KEY,
  agent_id         TEXT        REFERENCES agents(id),
  merchant_id      TEXT        REFERENCES merchants(id),
  items            JSONB       NOT NULL DEFAULT '[]',
  subtotal_inr     INTEGER     NOT NULL DEFAULT 0,
  discount_inr     INTEGER     NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  final_amount_inr INTEGER,
  coupon_code      TEXT,
  status           TEXT        NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | CHECKED_OUT | ABANDONED | CHECKOUT_FAILED
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tier 2 migrations (safe to re-run)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS reputation_score INTEGER NOT NULL DEFAULT 80;
ALTER TABLE carts ADD COLUMN IF NOT EXISTS discount_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE carts ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE carts ADD COLUMN IF NOT EXISTS final_amount_inr INTEGER;
ALTER TABLE carts ADD COLUMN IF NOT EXISTS coupon_code TEXT;

CREATE INDEX IF NOT EXISTS idx_carts_agent    ON carts(agent_id);
CREATE INDEX IF NOT EXISTS idx_carts_merchant ON carts(merchant_id);

-- ----------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                   TEXT        PRIMARY KEY,
  cart_id              TEXT        REFERENCES carts(id),
  merchant_id          TEXT        REFERENCES merchants(id),
  agent_id             TEXT        REFERENCES agents(id),
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  amount_inr           INTEGER     NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'CREATED',
  -- CREATED | PENDING_REVIEW | PAID | FAILED | CANCELLED
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_merchant    ON orders(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_agent       ON orders(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay    ON orders(razorpay_order_id);

-- ----------------------------------------------------------------
-- Audit Log (APPEND-ONLY — never UPDATE or DELETE)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT        PRIMARY KEY,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_id      TEXT,
  merchant_id   TEXT,
  action        TEXT        NOT NULL,
  -- DISCOVER | MANIFEST_READ | CATALOG_QUERY | ADD_TO_CART |
  -- CART_MODIFY | CART_ABANDON | CHECKOUT_INITIATED |
  -- CHECKOUT_SUCCESS | CHECKOUT_FAILED | POLICY_BLOCK |
  -- ORDER_STATUS | AGENT_ERROR | HUMAN_REVIEW_REQUESTED |
  -- HUMAN_REVIEW_APPROVED | HUMAN_REVIEW_REJECTED
  input         JSONB,
  output        JSONB,
  reasoning     TEXT,        -- Claude-generated trace
  policy_result JSONB,
  duration_ms   INTEGER,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_merchant  ON audit_log(merchant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_agent     ON audit_log(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);

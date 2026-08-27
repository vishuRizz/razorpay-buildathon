// ============================================================
// AISLE — Shared TypeScript Types
// ============================================================

export interface Merchant {
  id: string;
  razorpay_key_id: string;
  razorpay_key_secret: string;
  name: string;
  description?: string;
  policies: MerchantPolicies;
  ai_buyers_enabled: boolean;
  created_at: string;
}

export interface MerchantPolicies {
  max_order_value?: number;
  human_review_above?: number;
  allowed_agent_types?: string[];
  discount_cap_percent?: number;
  blocked_categories?: string[];
  daily_ai_gmv_cap?: number;
  emergency_stop?: boolean;
}

export interface Product {
  sku: string;
  merchant_id: string;
  data: ProductData;
  in_stock: boolean;
  updated_at: string;
}

export interface ProductData {
  name: string;
  description: string;
  price_inr: number;
  inventory: number;
  categories: string[];
  attributes?: Record<string, unknown>;
  tags?: string[];
}

export interface Agent {
  id: string;
  owner_email: string;
  constraints: AgentConstraints;
  revoked: boolean;
  reputation_score: number;
  daily_spend_inr: number;
  daily_spend_reset: string;
  created_at: string;
}

export interface AgentConstraints {
  spending_limit_per_session_inr: number;
  spending_limit_per_day_inr: number;
  allowed_store_ids: string[];
  allowed_categories: string[];
  requires_human_confirm_above?: number;
  ttl_hours?: number;
}

export interface AgentTokenPayload {
  agent_id: string;
  owner_email: string;
  spending_limit_per_session_inr: number;
  spending_limit_per_day_inr: number;
  allowed_store_ids: string[];
  allowed_categories: string[];
  requires_human_confirm_above?: number;
  reputation_score?: number;
  issued_at: number;
  expires_at: number;
}

export interface Cart {
  id: string;
  agent_id: string;
  merchant_id: string;
  items: CartItem[];
  subtotal_inr: number;
  status: CartStatus;
  created_at: string;
}

export interface CartItem {
  sku: string;
  quantity: number;
  price_inr: number;
  name: string;
  categories: string[];
}

export type CartStatus = 'ACTIVE' | 'CHECKED_OUT' | 'ABANDONED' | 'CHECKOUT_FAILED';

export interface Order {
  id: string;
  cart_id: string;
  merchant_id: string;
  agent_id: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  amount_inr: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'CREATED' | 'PENDING_REVIEW' | 'PAID' | 'FAILED' | 'CANCELLED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  agent_id?: string;
  merchant_id?: string;
  action: AuditAction;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
  policy_result?: PolicyResult;
  duration_ms?: number;
  error?: string;
}

export type AuditAction =
  | 'DISCOVER'
  | 'MANIFEST_READ'
  | 'CATALOG_QUERY'
  | 'ADD_TO_CART'
  | 'CART_MODIFY'
  | 'CART_ABANDON'
  | 'CHECKOUT_INITIATED'
  | 'CHECKOUT_SUCCESS'
  | 'CHECKOUT_FAILED'
  | 'POLICY_BLOCK'
  | 'ORDER_STATUS'
  | 'AGENT_ERROR'
  | 'HUMAN_REVIEW_REQUESTED'
  | 'HUMAN_REVIEW_APPROVED'
  | 'HUMAN_REVIEW_REJECTED';

export interface PolicyResult {
  approved: boolean;
  requires_human_review: boolean;
  rules_evaluated: number;
  rules_passed: string[];
  rules_failed: string[];
  block_reason: string | null;
  suggested_action?: string;
  warnings: string[];
}

export interface StoreManifest {
  store_id: string;
  name: string;
  description?: string;
  currency: string;
  policies: MerchantPolicies;
  catalog_endpoint: string;
  checkout_endpoint: string;
  payment_methods: string[];
  ai_buyers_enabled: boolean;
  last_updated: string;
}

// Extend Express Request to include agent payload
declare global {
  namespace Express {
    interface Request {
      agent?: AgentTokenPayload;
    }
  }
}

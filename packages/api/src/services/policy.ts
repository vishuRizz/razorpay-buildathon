import { query, queryOne } from '../db/client';
import { AgentTokenPayload, CartItem, MerchantPolicies, PolicyResult, Agent, CustomPolicyRule } from '../types';

// ================================================================
// AISLE Policy Engine - 9-Rule Safety Enforcer
// Every checkout runs through this BEFORE any Razorpay call.
// ================================================================

interface PolicyEngineInput {
  cartItems: CartItem[];
  cartTotal: number;
  agent: AgentTokenPayload;
  merchantId: string;
  merchantPolicies: MerchantPolicies;
  merchantAiBuyersEnabled: boolean;
  discountPercent?: number;
}

export class PolicyEngine {
  private rules_passed: string[] = [];
  private rules_failed: string[] = [];
  private warnings: string[] = [];
  private requires_human_review = false;
  private block_reason: string | null = null;
  private suggested_action: string | undefined;

  async evaluate(input: PolicyEngineInput): Promise<PolicyResult> {
    const {
      cartItems,
      cartTotal,
      agent,
      merchantId,
      merchantPolicies,
      merchantAiBuyersEnabled,
      discountPercent = 0,
    } = input;

    // Reset state for fresh evaluation
    this.rules_passed = [];
    this.rules_failed = [];
    this.warnings = [];
    this.requires_human_review = false;
    this.block_reason = null;

    // --- Rule 0: Global Emergency Kill Switch ---
    if (merchantPolicies.emergency_stop) {
      this.fail('EMERGENCY_STOP', 'Global kill switch activated by merchant. All AI traffic is blocked.', 'Disable emergency stop to resume commerce');
      return this.buildResult(8);
    }

    // --- Rule 1: AIT Validity & Reputation ---
    await this.checkAITValidityAndReputation(agent.agent_id);
    if (this.block_reason) return this.buildResult(8);

    // --- Rule 2: Spending Limit (Session) ---
    this.checkSessionLimit(cartTotal, agent.spending_limit_per_session_inr);
    if (this.block_reason) return this.buildResult(8);

    // --- Rule 3: Spending Limit (Daily) ---
    await this.checkDailyLimit(agent.agent_id, cartTotal, agent.spending_limit_per_day_inr);
    if (this.block_reason) return this.buildResult(8);

    // --- Rule 4: Velocity Limits ---
    await this.checkVelocityLimits(agent.agent_id);
    if (this.block_reason) return this.buildResult(9);

    // --- Rule 5: Category Policy ---
    this.checkCategoryPolicy(cartItems, agent.allowed_categories);
    if (this.block_reason) return this.buildResult(9);

    // --- Rule 6: Merchant AI Policy ---
    this.checkMerchantAIPolicy(merchantAiBuyersEnabled);
    if (this.block_reason) return this.buildResult(9);

    // --- Rule 7: Human Review Threshold (soft - doesn't block) ---
    this.checkHumanReviewThreshold(
      cartTotal,
      merchantPolicies.human_review_above,
      agent.requires_human_confirm_above
    );

    // --- Rule 8: Inventory Check ---
    await this.checkInventory(cartItems, merchantId);
    if (this.block_reason) return this.buildResult(9);

    // --- Rule 9: Merchant Daily GMV Cap ---
    await this.checkMerchantGMVCap(merchantId, cartTotal, merchantPolicies.daily_ai_gmv_cap);
    if (this.block_reason) return this.buildResult(11);

    // --- Rule 10: Max Order Value ---
    this.checkMaxOrderValue(cartTotal, merchantPolicies.max_order_value);
    if (this.block_reason) return this.buildResult(11);

    // --- Rule 11: Discount Cap (negotiated coupons) ---
    this.checkDiscountCap(discountPercent, merchantPolicies.discount_cap_percent);

    // --- Rule 12: Merchant custom policies (dashboard "Add policy") ---
    this.checkCustomRules(cartItems, cartTotal, merchantPolicies.custom_rules);
    if (this.block_reason) return this.buildResult(12);

    return this.buildResult(12);
  }

  // ----------------------------------------------------------------
  // Rule 1: AIT Validity & Reputation
  // ----------------------------------------------------------------
  private async checkAITValidityAndReputation(agentId: string): Promise<void> {
    const agent = await queryOne<Agent>(
      'SELECT revoked, reputation_score FROM agents WHERE id = $1',
      [agentId]
    );
    if (!agent || agent.revoked) {
      this.fail('AIT_VALIDITY', 'Agent token is revoked or agent not found', 'Re-issue a valid AIT');
      return;
    } 
    this.pass('AIT_VALIDITY');

    if (agent.reputation_score < 30) {
      this.fail('AGENT_REPUTATION', `Agent reputation score too low (${agent.reputation_score}/100)`, 'Improve agent behavior score');
      return;
    }
    this.pass('AGENT_REPUTATION');
  }

  // ----------------------------------------------------------------
  // Rule 2: Session Spending Limit
  // ----------------------------------------------------------------
  private checkSessionLimit(cartTotal: number, limitInr: number): void {
    if (cartTotal > limitInr) {
      this.fail(
        'SPENDING_LIMIT_SESSION',
        `Cart value ₹${cartTotal} exceeds agent session limit of ₹${limitInr}`,
        `Reduce cart or request higher limit from token issuer`
      );
    } else {
      this.pass('SPENDING_LIMIT_SESSION');
    }
  }

  // ----------------------------------------------------------------
  // Rule 3: Daily Spending Limit
  // ----------------------------------------------------------------
  private async checkDailyLimit(
    agentId: string,
    cartTotal: number,
    dailyLimitInr: number
  ): Promise<void> {
    const agent = await queryOne<Agent>(
      'SELECT daily_spend_inr, daily_spend_reset FROM agents WHERE id = $1',
      [agentId]
    );

    if (!agent) {
      this.fail('SPENDING_LIMIT_DAILY', 'Agent not found');
      return;
    }

    // Reset daily spend if it's a new day
    const resetDate = new Date(agent.daily_spend_reset);
    const now = new Date();
    let currentDailySpend = agent.daily_spend_inr;

    if (resetDate.toDateString() !== now.toDateString()) {
      currentDailySpend = 0; // New day - effectively reset
    }

    if (currentDailySpend + cartTotal > dailyLimitInr) {
      const remaining = Math.max(0, dailyLimitInr - currentDailySpend);
      this.fail(
        'SPENDING_LIMIT_DAILY',
        `Cart value ₹${cartTotal} would exceed daily limit. Already spent: ₹${currentDailySpend}, Limit: ₹${dailyLimitInr}, Remaining: ₹${remaining}`,
        'Wait until tomorrow or request a higher daily limit'
      );
    } else {
      this.pass('SPENDING_LIMIT_DAILY');
    }
  }

  // ----------------------------------------------------------------
  // Rule 4: Velocity Limits (Max 3 orders per 5 mins)
  // ----------------------------------------------------------------
  private async checkVelocityLimits(agentId: string): Promise<void> {
    const result = await query(
      `SELECT count(*) FROM audit_log 
       WHERE agent_id = $1 
         AND action IN ('CHECKOUT_SUCCESS', 'HUMAN_REVIEW_REQUESTED', 'PENDING') 
         AND timestamp > NOW() - INTERVAL '5 minutes'`,
      [agentId]
    );

    const txCount = parseInt(String(result[0].count), 10);
    if (txCount >= 3) {
      this.fail(
        'VELOCITY_LIMIT_EXCEEDED',
        `Agent has attempted ${txCount} transactions in the last 5 minutes.`,
        'Wait 5 minutes before trying again or request rate limit increase.'
      );
    } else {
      this.pass('VELOCITY_LIMITS');
    }
  }

  // ----------------------------------------------------------------
  // Rule 5: Category Policy
  // ----------------------------------------------------------------
  private checkCategoryPolicy(cartItems: CartItem[], allowedCategories: string[]): void {
    if (!allowedCategories || allowedCategories.includes('*')) {
      this.pass('CATEGORY_POLICY');
      return;
    }

    const violations: string[] = [];
    for (const item of cartItems) {
      const hasAllowed = item.categories.some((cat) =>
        allowedCategories.includes(cat)
      );
      if (!hasAllowed) {
        violations.push(`${item.sku} (categories: ${item.categories.join(', ')})`);
      }
    }

    if (violations.length > 0) {
      this.fail(
        'CATEGORY_POLICY',
        `Items not in allowed categories [${allowedCategories.join(', ')}]: ${violations.join('; ')}`,
        'Request an AIT with broader category permissions'
      );
    } else {
      this.pass('CATEGORY_POLICY');
    }
  }

  // ----------------------------------------------------------------
  // Rule 5: Merchant AI Policy
  // ----------------------------------------------------------------
  private checkMerchantAIPolicy(aiEnabled: boolean): void {
    if (!aiEnabled) {
      this.fail(
        'MERCHANT_AI_POLICY',
        'This store has disabled AI buyers',
        'Choose a different store or contact the merchant'
      );
    } else {
      this.pass('MERCHANT_AI_POLICY');
    }
  }

  // ----------------------------------------------------------------
  // Rule 6: Human Review Threshold (soft - not a hard block)
  // ----------------------------------------------------------------
  private checkHumanReviewThreshold(
    cartTotal: number,
    merchantThreshold?: number,
    agentThreshold?: number
  ): void {
    const exceeded =
      (merchantThreshold !== undefined && cartTotal > merchantThreshold) ||
      (agentThreshold !== undefined && cartTotal > agentThreshold);

    if (exceeded) {
      this.requires_human_review = true;
      this.warnings.push(
        `Order ₹${cartTotal} exceeds review threshold. Merchant approval required before payment.`
      );
    }
    this.pass('HUMAN_REVIEW_THRESHOLD');
  }

  // ----------------------------------------------------------------
  // Rule 7: Inventory Check (re-check at checkout time)
  // ----------------------------------------------------------------
  private async checkInventory(cartItems: CartItem[], merchantId: string): Promise<void> {
    const outOfStock: string[] = [];

    for (const item of cartItems) {
      const product = await queryOne<{ in_stock: boolean }>(
        'SELECT in_stock FROM products WHERE sku = $1 AND merchant_id = $2',
        [item.sku, merchantId]
      );
      if (!product || !product.in_stock) {
        outOfStock.push(item.sku);
      }
    }

    if (outOfStock.length > 0) {
      this.fail(
        'INVENTORY_CHECK',
        `Items out of stock: ${outOfStock.join(', ')}`,
        'Remove out-of-stock items from cart and retry'
      );
    } else {
      this.pass('INVENTORY_CHECK');
    }
  }

  // ----------------------------------------------------------------
  // Rule 8: Merchant Daily AI GMV Cap
  // ----------------------------------------------------------------
  private async checkMerchantGMVCap(
    merchantId: string,
    cartTotal: number,
    gmvCapInr?: number
  ): Promise<void> {
    if (!gmvCapInr) {
      this.pass('MERCHANT_GMV_CAP');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const result = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount_inr), 0) as total
       FROM orders
       WHERE merchant_id = $1
         AND status IN ('PAID', 'CREATED', 'PENDING_REVIEW')
         AND DATE(created_at) = $2`,
      [merchantId, today]
    );

    const todayGMV = parseInt(result?.total ?? '0', 10);

    if (todayGMV + cartTotal > gmvCapInr) {
      this.fail(
        'MERCHANT_GMV_CAP',
        `Merchant's daily AI GMV cap of ₹${gmvCapInr} would be exceeded (current: ₹${todayGMV})`,
        'Try again tomorrow or contact the merchant to raise the cap'
      );
    } else {
      this.pass('MERCHANT_GMV_CAP');
    }
  }

  // ----------------------------------------------------------------
  // Rule 10: Max Order Value
  // ----------------------------------------------------------------
  private checkMaxOrderValue(cartTotal: number, maxOrderValue?: number): void {
    if (!maxOrderValue) {
      this.pass('MAX_ORDER_VALUE');
      return;
    }
    if (cartTotal > maxOrderValue) {
      this.fail(
        'MAX_ORDER_VALUE',
        `Cart value ₹${cartTotal} exceeds merchant max order value of ₹${maxOrderValue}`,
        'Remove items or split into multiple orders'
      );
    } else {
      this.pass('MAX_ORDER_VALUE');
    }
  }

  // ----------------------------------------------------------------
  // Rule 11: Discount Cap - enforces negotiated coupon bounds
  // ----------------------------------------------------------------
  private checkDiscountCap(requestedPercent: number, capPercent?: number): void {
    const cap = capPercent ?? 0;
    if (requestedPercent <= 0) {
      this.pass('DISCOUNT_CAP');
      return;
    }
    if (cap <= 0) {
      this.fail(
        'DISCOUNT_CAP',
        `Cart has ${requestedPercent}% discount but merchant allows no AI-negotiated discounts`,
        'Remove coupon or choose a different store'
      );
      return;
    }
    if (requestedPercent > cap) {
      this.fail(
        'DISCOUNT_CAP',
        `Discount ${requestedPercent}% exceeds merchant cap of ${cap}%`,
        `Request discount up to ${cap}% via negotiate_discount`
      );
    } else {
      this.pass('DISCOUNT_CAP');
    }
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  private pass(rule: string): void {
    this.rules_passed.push(rule);
  }

  private fail(rule: string, detail: string, suggested_action?: string): void {
    this.rules_failed.push(rule);
    this.block_reason = detail;
    this.suggested_action = suggested_action;
  }

  // ----------------------------------------------------------------
  // Rule 12: Custom merchant policies
  // ----------------------------------------------------------------
  private checkCustomRules(
    cartItems: CartItem[],
    cartTotal: number,
    rules?: CustomPolicyRule[]
  ): void {
    if (!rules?.length) {
      this.pass('CUSTOM_POLICY');
      return;
    }

    for (const rule of rules) {
      if (rule.enabled === false) continue;

      const ruleId = `CUSTOM_${rule.rule_type.toUpperCase()}`;
      let triggered = false;
      let detail = '';

      switch (rule.rule_type) {
        case 'spend_cap': {
          const cap = Number(rule.threshold);
          if (Number.isFinite(cap) && cartTotal > cap) {
            triggered = true;
            detail = `Custom policy "${rule.name}": cart ₹${cartTotal} exceeds spend cap ₹${cap}`;
          }
          break;
        }
        case 'category_block': {
          const needle = (rule.threshold ?? '').trim().toLowerCase();
          if (needle) {
            const hit = cartItems.some((item) =>
              (item.categories ?? []).some((c) => String(c).toLowerCase().includes(needle))
            );
            if (hit) {
              triggered = true;
              detail = `Custom policy "${rule.name}": blocked category "${rule.threshold}"`;
            }
          }
          break;
        }
        case 'velocity': {
          // Soft signal - full velocity is Rule 4; custom velocity forces review/warn/block on any cart
          triggered = true;
          detail = `Custom policy "${rule.name}": velocity control active${rule.threshold ? ` (limit ${rule.threshold})` : ''}`;
          break;
        }
        case 'geo_restrict': {
          triggered = true;
          detail = `Custom policy "${rule.name}": geo restriction active${rule.threshold ? ` (${rule.threshold})` : ''}`;
          break;
        }
        case 'custom':
        default: {
          // Always apply named custom rule when present - merchant opted in
          triggered = true;
          detail =
            rule.description?.trim() ||
            `Custom policy "${rule.name}" enforced`;
          break;
        }
      }

      if (!triggered) continue;

      if (rule.action === 'block') {
        this.fail(ruleId, detail, 'Adjust cart or disable this custom policy');
        return;
      }
      if (rule.action === 'review') {
        this.requires_human_review = true;
        this.warnings.push(detail);
        this.pass(ruleId);
        continue;
      }
      // warn
      this.warnings.push(detail);
      this.pass(ruleId);
    }

    this.pass('CUSTOM_POLICY');
  }

  private buildResult(totalRules: number): PolicyResult {
    const approved = this.rules_failed.length === 0;
    return {
      approved,
      requires_human_review: approved ? this.requires_human_review : false,
      rules_evaluated: totalRules,
      rules_passed: this.rules_passed,
      rules_failed: this.rules_failed,
      block_reason: this.block_reason,
      suggested_action: this.suggested_action,
      warnings: this.warnings,
    };
  }
}

export const policyEngine = new PolicyEngine();

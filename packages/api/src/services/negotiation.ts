import { MerchantPolicies } from '../types';

// ================================================================
// Agent ↔ Merchant Negotiation
// Auto-applies discount coupon when within discount_cap_percent
// ================================================================

export interface NegotiationResult {
  approved: boolean;
  requested_discount_percent: number;
  granted_discount_percent: number;
  discount_inr: number;
  subtotal_inr: number;
  final_amount_inr: number;
  message: string;
  coupon_code?: string;
}

/**
 * Negotiate a discount on a cart subtotal.
 * Merchant policy discount_cap_percent is the hard ceiling.
 */
export function negotiateDiscount(
  subtotalInr: number,
  requestedPercent: number,
  merchantPolicies: MerchantPolicies
): NegotiationResult {
  const cap = merchantPolicies.discount_cap_percent ?? 0;

  if (cap <= 0) {
    return {
      approved: false,
      requested_discount_percent: requestedPercent,
      granted_discount_percent: 0,
      discount_inr: 0,
      subtotal_inr: subtotalInr,
      final_amount_inr: subtotalInr,
      message: 'This merchant does not allow AI-negotiated discounts.',
    };
  }

  if (requestedPercent <= 0) {
    return {
      approved: false,
      requested_discount_percent: requestedPercent,
      granted_discount_percent: 0,
      discount_inr: 0,
      subtotal_inr: subtotalInr,
      final_amount_inr: subtotalInr,
      message: 'Discount must be greater than 0%.',
    };
  }

  const granted = Math.min(requestedPercent, cap);
  const discountInr = Math.floor(subtotalInr * granted / 100);
  const finalAmount = subtotalInr - discountInr;
  const counterOffer = requestedPercent > cap;

  const couponCode = `AISLE-${granted}PCT-${Date.now().toString(36).toUpperCase()}`;

  return {
    approved: true,
    requested_discount_percent: requestedPercent,
    granted_discount_percent: granted,
    discount_inr: discountInr,
    subtotal_inr: subtotalInr,
    final_amount_inr: finalAmount,
    coupon_code: couponCode,
    message: counterOffer
      ? `Requested ${requestedPercent}% exceeds merchant cap of ${cap}%. Auto-applied maximum allowed ${granted}% discount (₹${discountInr} off).`
      : `Discount approved: ${granted}% off (₹${discountInr}). Coupon ${couponCode} applied.`,
  };
}

/** Validate an existing cart discount is still within policy */
export function validateCartDiscount(
  discountPercent: number,
  merchantPolicies: MerchantPolicies
): { valid: boolean; reason?: string } {
  const cap = merchantPolicies.discount_cap_percent ?? 0;
  if (discountPercent <= 0) return { valid: true };
  if (discountPercent > cap) {
    return {
      valid: false,
      reason: `Cart discount ${discountPercent}% exceeds merchant cap of ${cap}%`,
    };
  }
  return { valid: true };
}

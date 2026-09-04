import { query } from '../db/client';
import { Product, CartItem } from '../types';

// ================================================================
// Merchant Growth Agent — contextual upsell suggestions
// When an agent adds WiFi to cart → suggest travel adapter bundle
// ================================================================

export interface UpsellSuggestion {
  sku: string;
  name: string;
  price_inr: number;
  reason: string;
  bundle_discount_percent?: number;
  estimated_lift_inr: number;
}

interface UpsellRule {
  /** Match if cart contains any of these SKUs */
  trigger_skus?: string[];
  /** Match if cart item has any of these categories */
  trigger_categories?: string[];
  /** SKUs to suggest (must exist in same store) */
  suggest_skus: string[];
  reason: string;
  bundle_discount_percent?: number;
}

const UPSELL_RULES: UpsellRule[] = [
  {
    trigger_categories: ['wifi', 'connectivity', 'hotspot'],
    suggest_skus: ['ADAPTER-UNIVERSAL'],
    reason: 'Pair your hotspot with a universal travel adapter — works in 150+ countries',
    bundle_discount_percent: 5,
  },
  {
    trigger_skus: ['WIFI-JIOFI-4G', 'WIFI-MI-5G', 'WIFI-BUDGET-4G'],
    suggest_skus: ['ADAPTER-UNIVERSAL'],
    reason: 'Most travelers bundle a universal adapter with their portable WiFi',
    bundle_discount_percent: 5,
  },
  {
    trigger_categories: ['audio'],
    suggest_skus: ['CABLE-USBC-2M'],
    reason: 'Add a braided USB-C cable for charging your earbuds on the go',
  },
  {
    trigger_skus: ['PILLOW-NECK-MEMORY', 'MASK-SLEEP-3D'],
    suggest_skus: ['BOTTLE-COLLAPSIBLE-750'],
    reason: 'Complete your travel comfort kit with a collapsible water bottle',
  },
  {
    trigger_categories: ['travel', 'essentials'],
    suggest_skus: ['SIM-TRAVEL-PREPAID'],
    reason: 'Add a prepaid travel SIM for backup connectivity when WiFi is unavailable',
  },
  {
    trigger_skus: ['ADAPTER-UNIVERSAL'],
    suggest_skus: ['CABLE-USBC-2M'],
    reason: 'Complete your travel kit with a durable USB-C charging cable',
  },
];

function cartMatchesRule(cartItems: CartItem[], rule: UpsellRule): boolean {
  if (rule.trigger_skus?.some((sku) => cartItems.some((i) => i.sku === sku))) {
    return true;
  }
  if (
    rule.trigger_categories?.some((cat) =>
      cartItems.some((i) => i.categories.some((c) => c.toLowerCase().includes(cat)))
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Generate upsell suggestions for items already in cart.
 */
export async function getUpsellSuggestions(
  merchantId: string,
  cartItems: CartItem[]
): Promise<UpsellSuggestion[]> {
  if (cartItems.length === 0) return [];

  const cartSkus = new Set(cartItems.map((i) => i.sku));
  const suggestions: UpsellSuggestion[] = [];
  const seenSkus = new Set<string>();

  for (const rule of UPSELL_RULES) {
    if (!cartMatchesRule(cartItems, rule)) continue;

    for (const suggestSku of rule.suggest_skus) {
      if (cartSkus.has(suggestSku) || seenSkus.has(suggestSku)) continue;

      const product = await query<Product>(
        'SELECT * FROM products WHERE sku = $1 AND merchant_id = $2 AND in_stock = true',
        [suggestSku, merchantId]
      );

      if (product.length === 0) continue;

      const p = product[0];
      seenSkus.add(suggestSku);

      suggestions.push({
        sku: p.sku,
        name: p.data.name,
        price_inr: p.data.price_inr,
        reason: rule.reason,
        bundle_discount_percent: rule.bundle_discount_percent,
        estimated_lift_inr: p.data.price_inr,
      });
    }
  }

  return suggestions.slice(0, 3);
}

/**
 * Get upsell suggestions by cart SKU list (for catalog endpoint).
 */
export async function getUpsellBySkus(
  merchantId: string,
  skus: string[]
): Promise<UpsellSuggestion[]> {
  if (skus.length === 0) return [];

  const products = await query<Product>(
    `SELECT * FROM products WHERE merchant_id = $1 AND sku = ANY($2)`,
    [merchantId, skus]
  );

  const cartItems: CartItem[] = products.map((p) => ({
    sku: p.sku,
    quantity: 1,
    price_inr: p.data.price_inr,
    name: p.data.name,
    categories: p.data.categories,
  }));

  return getUpsellSuggestions(merchantId, cartItems);
}

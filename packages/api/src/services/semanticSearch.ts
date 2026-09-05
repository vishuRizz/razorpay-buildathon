import { Product, ProductData } from '../types';

// ================================================================
// Semantic Catalog Search - hybrid keyword + concept scoring
// Enables queries like "lightweight 4G hotspot for beach trip"
// without requiring a vector DB or external embedding API.
// ================================================================

/** Concept clusters for commerce search */
const CONCEPT_SYNONYMS: Record<string, string[]> = {
  wifi: ['wifi', 'wi-fi', 'hotspot', 'router', 'jiofi', 'mifi', 'wireless', 'internet', 'connectivity', '4g', '5g', 'lte'],
  travel: ['travel', 'trip', 'journey', 'vacation', 'holiday', 'portable', 'mobile', 'on-the-go', 'beach', 'flight'],
  audio: ['earbuds', 'earphones', 'headphones', 'tws', 'wireless', 'audio', 'music', 'speaker', 'sound', 'noise'],
  comfort: ['pillow', 'neck', 'sleep', 'mask', 'comfort', 'rest', 'flight', 'cozy'],
  power: ['adapter', 'charger', 'plug', 'power', 'universal', 'voltage', 'usb', 'charging', 'powerbank', 'battery'],
  budget: ['cheap', 'affordable', 'budget', 'economical', 'low-cost', 'value', 'inexpensive', 'surprise', 'anything'],
  premium: ['premium', 'fast', 'high-speed', '5g', 'pro', 'best', 'top', 'flagship'],
  sim: ['sim', 'esim', 'prepaid', 'data', 'roaming', 'cellular'],
  fitness: ['fitness', 'tracker', 'watch', 'health', 'steps', 'heart', 'wearable', 'yoga', 'mat', 'gym', 'workout', 'dumbbell', 'resistance', 'cardio'],
  organisation: ['packing', 'cubes', 'organise', 'organize', 'luggage', 'bag', 'storage', 'desk', 'office'],
  security: ['lock', 'tsa', 'security', 'luggage', 'safe', 'rfid', 'wallet'],
  home: ['home', 'kitchen', 'desk', 'lamp', 'mug', 'kettle', 'office', 'decor', 'plant', 'cushion', 'organizer'],
  fashion: ['bag', 'tote', 'wallet', 'sunglasses', 'scarf', 'belt', 'fashion', 'accessories', 'style'],
  beauty: ['skincare', 'serum', 'moisturizer', 'sunscreen', 'cleanser', 'grooming', 'trimmer', 'perfume', 'hair'],
  books: ['book', 'paperback', 'fiction', 'reading', 'journal', 'notebook', 'stationery', 'pen'],
  food: ['snacks', 'organic', 'granola', 'tea', 'coffee', 'honey', 'nuts', 'food', 'healthy'],
  pets: ['dog', 'cat', 'pet', 'food', 'toy', 'leash', 'litter', 'bed', 'grooming'],
  kids: ['kids', 'toy', 'puzzle', 'school', 'children', 'learning', 'stem', 'plush'],
  automotive: ['car', 'auto', 'dashboard', 'vacuum', 'dash cam', 'charger', 'vehicle'],
  computing: ['monitor', 'ssd', 'ram', 'laptop', 'keyboard', 'mechanical', 'webcam', 'dock'],
  lightweight: ['light', 'lightweight', 'compact', 'small', 'portable', 'pocket', 'collapsible'],
  battery: ['battery', 'hours', 'long-lasting', 'endurance', 'runtime', 'mah'],
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'and', 'or', 'with', 'in', 'on', 'at', 'to', 'of', 'my', 'i', 'need',
  'want', 'buy', 'get', 'find', 'looking', 'something', 'that', 'is', 'are', 'be', 'can',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Expand query tokens with related concepts */
function expandTokens(tokens: string[]): Set<string> {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const [, synonyms] of Object.entries(CONCEPT_SYNONYMS)) {
      if (synonyms.some((s) => s === token || token.includes(s) || s.includes(token))) {
        synonyms.forEach((s) => expanded.add(s));
      }
    }
  }
  return expanded;
}

function productText(product: Product): string {
  const d = product.data;
  const attrs = d.attributes
    ? Object.entries(d.attributes)
        .map(([k, v]) => `${k} ${v}`)
        .join(' ')
    : '';
  return [
    d.name,
    d.description,
    ...(d.categories ?? []),
    ...(d.tags ?? []),
    attrs,
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Score a product against a natural-language query (0–1).
 * Uses token overlap, concept expansion, and field weighting.
 */
export function scoreProduct(query: string, product: Product): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const expanded = expandTokens(queryTokens);
  const text = productText(product);
  const nameLower = product.data.name.toLowerCase();
  const descLower = product.data.description.toLowerCase();
  const tags = (product.data.tags ?? []).map((t) => t.toLowerCase());
  const categories = (product.data.categories ?? []).map((c) => c.toLowerCase());

  let score = 0;
  let maxPossible = queryTokens.length * 3;

  for (const token of queryTokens) {
    // Exact name match (highest weight)
    if (nameLower.includes(token)) score += 3;
    else if (descLower.includes(token)) score += 2;
    else if (tags.includes(token) || categories.includes(token)) score += 2.5;
    else if (text.includes(token)) score += 1;

    // Concept synonym match
    for (const syn of expanded) {
      if (syn === token) continue;
      if (nameLower.includes(syn)) score += 1.5;
      else if (text.includes(syn)) score += 0.75;
    }
  }

  // Boost in-stock items slightly
  if (product.in_stock) score *= 1.05;

  return Math.min(1, score / maxPossible);
}

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export interface RankedProduct {
  product: Product;
  relevance_score: number;
  match_type: 'semantic' | 'keyword' | 'both';
}

/** Rank products by relevance to query */
export function rankProducts(
  query: string,
  products: Product[],
  mode: SearchMode = 'hybrid',
  minScore = 0.08
): RankedProduct[] {
  const qLower = query.toLowerCase();

  const ranked = products.map((product) => {
    const semanticScore = scoreProduct(query, product);
    const text = productText(product);
    const keywordHit =
      text.includes(qLower) ||
      product.data.name.toLowerCase().includes(qLower) ||
      (product.data.tags ?? []).some((t) => t.toLowerCase().includes(qLower));

    let relevance = 0;
    let match_type: RankedProduct['match_type'] = 'semantic';

    if (mode === 'keyword') {
      relevance = keywordHit ? 1 : 0;
      match_type = 'keyword';
    } else if (mode === 'semantic') {
      relevance = semanticScore;
      match_type = 'semantic';
    } else {
      // hybrid: combine both signals
      relevance = keywordHit ? Math.max(semanticScore, 0.85) : semanticScore;
      match_type = keywordHit && semanticScore > 0.1 ? 'both' : keywordHit ? 'keyword' : 'semantic';
    }

    return { product, relevance_score: Math.round(relevance * 1000) / 1000, match_type };
  });

  return ranked
    .filter((r) => r.relevance_score >= minScore)
    .sort((a, b) => b.relevance_score - a.relevance_score);
}

/** Build broad SQL OR conditions for hybrid pre-filter */
export function buildSemanticPrefilterTokens(query: string): string[] {
  return [...expandTokens(tokenize(query))].slice(0, 12);
}

export function formatProductForResponse(p: Product, relevance?: number, matchType?: string) {
  return {
    sku: p.sku,
    ...p.data,
    in_stock: p.in_stock,
    ...(relevance !== undefined && { relevance_score: relevance }),
    ...(matchType && { match_type: matchType }),
  };
}

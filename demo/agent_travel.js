#!/usr/bin/env node
/**
 * AISLE Demo: Travel Agent - Happy Path
 *
 * Task: "Buy a portable WiFi device for my trip to Goa, budget ₹3,000"
 *
 * Flow:
 *   1. GET /stores           → discover registered stores
 *   2. GET /stores/:id/manifest → read policies
 *   3. GET /stores/:id/catalog?category=travel → browse products
 *   4. Compare options → select cheapest in-stock item
 *   5. POST /stores/:id/cart → add to cart (runs Policy Engine)
 *   6. POST /stores/:id/cart/:id/checkout → create Razorpay order
 *   7. GET /stores/:id/orders/:id/status → confirm CREATED
 *
 * Usage: node demo/agent_travel.js <STORE_ID>
 * Or:    node demo/agent_travel.js (will auto-discover first store)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE_URL = `http://localhost:${process.env.PORT ?? 3001}/v1`;
const AGENT_TASK = 'Buy a portable WiFi device for my trip to Goa, budget ₹3,000';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(icon, label, msg, color = colors.reset) {
  console.log(`${color}${icon} ${colors.bold}[${label}]${colors.reset}${color} ${msg}${colors.reset}`);
}

function divider() {
  console.log(colors.dim + '─'.repeat(60) + colors.reset);
}

async function api(method, path, body, token) {
  const start = Date.now();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  const ms = Date.now() - start;

  if (!res.ok) {
    throw Object.assign(new Error(data.detail ?? data.error), { response: data, status: res.status });
  }

  return { data, ms };
}

async function run() {
  console.log('\n' + colors.cyan + colors.bold + '╔══════════════════════════════════════════════════════════╗');
  console.log('║           AISLE - AI Travel Agent Demo                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝' + colors.reset);
  console.log(`\n🤖 ${colors.bold}Agent Task:${colors.reset} "${AGENT_TASK}"\n`);

  // ── Step 0: Issue AIT ────────────────────────────────────────
  divider();
  log('🔑', 'STEP 0', 'Issuing Agent Identity Token (₹3,000 session limit)');
  const { data: aitData, ms: aitMs } = await api('POST', '/agents/token', {
    agent_name: 'travel_assistant_v1',
    owner_email: 'demo@aisle.dev',
    spending_limit_per_session_inr: 3000,
    spending_limit_per_day_inr: 5000,
    allowed_categories: ['electronics', 'travel', 'connectivity', 'accessories'],
    requires_human_confirm_above_inr: 4000,
    ttl_hours: 1,
  });
  const TOKEN = aitData.token;
  log('✅', 'AIT Issued', `Agent ID: ${aitData.agent_id} | Expires: ${aitData.expires_at} (${aitMs}ms)`, colors.green);

  // ── Step 1: Discover Stores ──────────────────────────────────
  divider();
  log('🔍', 'STEP 1', 'Discovering stores (category=travel, ai_buyers_enabled=true)', colors.cyan);
  const { data: storesData, ms: storesMs } = await api('GET', '/stores?category=travel&ai_buyers_enabled=true', null, TOKEN);
  log('📦', 'Stores Found', `${storesData.total} stores available (${storesMs}ms)`, colors.green);
  storesData.stores.forEach((s, i) => {
    console.log(`   ${i + 1}. ${colors.bold}${s.name}${colors.reset} [${s.store_id}] - ${s.ai_buyers_enabled ? '✅ AI enabled' : '❌ AI disabled'}`);
  });

  if (storesData.stores.length === 0) {
    log('❌', 'ERROR', 'No stores found. Run: node demo/seed_merchant.js first', colors.red);
    process.exit(1);
  }

  const store = storesData.stores.find(s => s.name === 'GadgetNest') ?? storesData.stores[0];
  const STORE_ID = store.store_id;

  // ── Step 2: Read Manifest ────────────────────────────────────
  divider();
  log('📄', 'STEP 2', `Reading manifest for ${store.name} [${STORE_ID}]`, colors.cyan);
  const { data: manifest, ms: manifestMs } = await api('GET', `/stores/${STORE_ID}/manifest`, null, TOKEN);
  log('✅', 'Manifest', `Human review threshold: ₹${manifest.policies?.human_review_above ?? 'N/A'} | Max order: ₹${manifest.policies?.max_order_value ?? 'N/A'} (${manifestMs}ms)`, colors.green);

  // ── Step 3: Browse Catalog ───────────────────────────────────
  divider();
  log('🛍️ ', 'STEP 3', 'Browsing catalog (category=travel, in_stock=true, max_price=3000)', colors.cyan);
  const { data: catalog, ms: catalogMs } = await api('GET', `/stores/${STORE_ID}/catalog?category=travel&in_stock=true&max_price=3000`, null, TOKEN);
  log('✅', 'Catalog', `Found ${catalog.total} eligible products within budget (${catalogMs}ms)`, colors.green);

  catalog.products.forEach((p, i) => {
    console.log(`   ${i + 1}. ${colors.bold}${p.name}${colors.reset} - ₹${p.price_inr} | ${p.in_stock ? '✅ In stock' : '❌ Out of stock'}`);
    console.log(`      SKU: ${p.sku} | Categories: ${p.categories?.join(', ')}`);
  });

  // ── Step 4: Compare & Select ─────────────────────────────────
  divider();
  log('🧠', 'STEP 4', 'Agent evaluating options...', colors.yellow);
  const eligible = catalog.products.filter(p => p.in_stock && p.price_inr <= 3000);
  const selected = eligible.sort((a, b) => a.price_inr - b.price_inr)[0];

  if (!selected) {
    log('❌', 'ERROR', 'No eligible products found within budget', colors.red);
    process.exit(1);
  }
  log('✅', 'Selected', `${selected.name} (₹${selected.price_inr}) - cheapest in-stock match`, colors.green);

  // ── Step 5: Add to Cart ──────────────────────────────────────
  divider();
  log('🛒', 'STEP 5', `Adding to cart: ${selected.sku} × 1`, colors.cyan);
  const { data: cart, ms: cartMs } = await api('POST', `/stores/${STORE_ID}/cart`, {
    items: [{ sku: selected.sku, quantity: 1 }],
    agent_task: AGENT_TASK,
  }, TOKEN);

  log('✅', 'Cart Created', `Cart ID: ${cart.cart_id} | Subtotal: ₹${cart.subtotal_inr} | Policy: ${cart.policy_status} (${cartMs}ms)`, colors.green);
  if (cart.policy_warnings?.length > 0) {
    cart.policy_warnings.forEach(w => log('⚠️ ', 'Warning', w, colors.yellow));
  }

  // ── Step 6: Checkout ─────────────────────────────────────────
  divider();
  log('💳', 'STEP 6', 'Initiating checkout via Razorpay...', colors.cyan);
  const { data: order, ms: checkoutMs } = await api('POST', `/stores/${STORE_ID}/cart/${cart.cart_id}/checkout`, {
    payment_method: 'razorpay_upi',
    agent_confirm: true,
    agent_reasoning: `Selected ${selected.name} as it is the cheapest in-stock product matching travel/connectivity categories within ₹3,000 session budget.`,
    agent_task: AGENT_TASK,
  }, TOKEN);

  log('✅', 'Order Created', `Order: ${order.order_id} | Razorpay: ${order.razorpay_order_id} | Amount: ₹${order.amount_inr} (${checkoutMs}ms)`, colors.green);
  console.log(`\n   ${colors.dim}💭 Reasoning: ${order.reasoning}${colors.reset}\n`);

  // ── Step 7: Poll Status ──────────────────────────────────────
  divider();
  log('📡', 'STEP 7', 'Polling order status...', colors.cyan);
  const { data: status, ms: statusMs } = await api('GET', `/stores/${STORE_ID}/orders/${order.order_id}/status`, null, TOKEN);
  log('✅', 'Status', `${status.status} (${statusMs}ms)`, colors.green);

  // ── Final Summary ─────────────────────────────────────────────
  divider();
  console.log('\n' + colors.green + colors.bold + '╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ PURCHASE COMPLETE                                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝' + colors.reset);
  console.log(`\n  Product:   ${selected.name}`);
  console.log(`  Amount:    ₹${order.amount_inr}`);
  console.log(`  Order ID:  ${order.order_id}`);
  console.log(`  Razorpay:  ${order.razorpay_order_id}`);
  console.log(`  Audit Log: ${order.audit_log_id}`);
  console.log(`\n  🎯 Check the dashboard for the full agent trace!\n`);
}

run().catch((err) => {
  console.error('\n' + colors.red + '❌ DEMO FAILED:', err.message + colors.reset);
  if (err.response) {
    console.error('   Response:', JSON.stringify(err.response, null, 2));
  }
  process.exit(1);
});

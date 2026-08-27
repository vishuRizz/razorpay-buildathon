#!/usr/bin/env node
/**
 * AISLE Demo: Human Review Flow
 *
 * Sets human_review_above=₹1,000 on the store.
 * Agent tries to buy ₹2,499 item → order goes to PENDING_REVIEW.
 * Script polls status, then simulates merchant approval.
 * Razorpay order is created only AFTER merchant approves.
 *
 * Usage: node demo/agent_human_review.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE_URL = `http://localhost:${process.env.PORT ?? 3001}/v1`;

const colors = {
  reset: '\x1b[0m', yellow: '\x1b[33m', green: '\x1b[32m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.detail ?? data.error), { response: data });
  return data;
}

async function run() {
  console.log('\n' + colors.yellow + colors.bold +
    '╔══════════════════════════════════════════════════════════╗\n' +
    '║  AISLE — Human Review Flow Demo                         ║\n' +
    '╚══════════════════════════════════════════════════════════╝' + colors.reset);
  console.log(`\n${colors.bold}Scenario:${colors.reset} Agent buys above review threshold → Merchant must approve.\n`);

  // Discover store
  const stores = await api('GET', '/stores?ai_buyers_enabled=true');
  if (!stores.stores?.length) {
    console.error('❌ No stores found. Run: node demo/seed_merchant.js');
    process.exit(1);
  }
  const store = stores.stores[0];
  const STORE_ID = store.store_id;
  console.log(`🏪 Store: ${store.name} [${STORE_ID}]\n`);

  // Step 1: Set review threshold to ₹1,000 (below the ₹2,499 item price)
  console.log('⚙️  Setting human_review_above = ₹1,000 on store...');
  await api('PATCH', `/merchants/${STORE_ID}/policies`, {
    policies: { human_review_above: 1000 },
  });
  console.log('   ✅ Policy updated. Any order > ₹1,000 requires merchant approval.\n');

  // Step 2: Issue AIT
  console.log('🔑 Issuing AIT (₹5,000 limit)...');
  const ait = await api('POST', '/agents/token', {
    agent_name: 'human_review_demo_agent',
    owner_email: 'demo@aisle.dev',
    spending_limit_per_session_inr: 5000,
    spending_limit_per_day_inr: 10000,
    allowed_categories: ['electronics', 'travel', 'connectivity'],
    ttl_hours: 1,
  });
  console.log(`   Agent: ${ait.agent_id}\n`);

  // Step 3: Add to cart
  console.log('🛒 Adding JioFi 4G (₹2,499) to cart...');
  const cart = await api('POST', `/stores/${STORE_ID}/cart`, {
    items: [{ sku: 'WIFI-JIOFI-4G', quantity: 1 }],
    agent_task: 'Buy WiFi for Goa trip',
  }, ait.token);
  console.log(`   Cart: ${cart.cart_id} | Subtotal: ₹${cart.subtotal_inr}`);
  console.log(`   Policy: ${cart.policy_status}\n`);

  // Step 4: Checkout → expect PENDING_REVIEW
  console.log('💳 Initiating checkout...');
  const order = await api('POST', `/stores/${STORE_ID}/cart/${cart.cart_id}/checkout`, {
    payment_method: 'razorpay_upi',
    agent_confirm: true,
    agent_task: 'Buy WiFi for Goa trip',
  }, ait.token);

  console.log(`\n${colors.yellow}⏳ Order status: ${order.status}${colors.reset}`);
  console.log(`   Order ID: ${order.order_id}`);
  console.log(`   ${order.message}`);

  // Step 5: Poll status (3 times, 2s apart)
  console.log('\n📡 Polling order status (as the agent would)...');
  for (let i = 0; i < 3; i++) {
    await sleep(2000);
    const status = await api('GET', `/stores/${STORE_ID}/orders/${order.order_id}/status`, null, ait.token);
    console.log(`   Poll ${i + 1}: ${colors.yellow}${status.status}${colors.reset} — ${status.message ?? ''}`);
    if (status.status !== 'PENDING_REVIEW') break;
  }

  // Step 6: Merchant approves from dashboard
  console.log(`\n${colors.cyan}🧑‍💼 Merchant approves order from dashboard...${colors.reset}`);
  const approval = await api('POST', `/merchants/${STORE_ID}/orders/${order.order_id}/approve`, {});
  console.log(`   ✅ ${approval.message}`);
  console.log(`   Razorpay Order: ${approval.razorpay_order_id}`);

  // Step 7: Final status check
  const finalStatus = await api('GET', `/stores/${STORE_ID}/orders/${order.order_id}/status`, null, ait.token);
  console.log(`\n${colors.green}${colors.bold}✅ Final status: ${finalStatus.status}${colors.reset}`);

  console.log('\n' + '─'.repeat(60));
  console.log('✅ Human review flow complete.');
  console.log('   → Check the dashboard Audit Log for the full trace including:');
  console.log('     HUMAN_REVIEW_REQUESTED → HUMAN_REVIEW_APPROVED\n');

  // Reset policy
  await api('PATCH', `/merchants/${STORE_ID}/policies`, {
    policies: { human_review_above: 5000 },
  });
  console.log('♻️  Policy reset to ₹5,000 threshold.\n');
}

run().catch(err => {
  console.error(colors.reset + '❌ DEMO ERROR:', err.message);
  if (err.response) console.error('   Response:', JSON.stringify(err.response, null, 2));
  process.exit(1);
});

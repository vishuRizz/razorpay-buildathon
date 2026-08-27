#!/usr/bin/env node
/**
 * AISLE Demo: Budget Cap Failure
 *
 * An agent with ₹500 session limit tries to buy a ₹2,499 item.
 * Policy Engine blocks at Rule 2 (SPENDING_LIMIT_SESSION).
 * No Razorpay order is created. Audit log records the blocked attempt.
 *
 * Usage: node demo/agent_budget_fail.js <STORE_ID>
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE_URL = `http://localhost:${process.env.PORT ?? 3001}/v1`;

const colors = {
  reset: '\x1b[0m', red: '\x1b[31m', yellow: '\x1b[33m',
  green: '\x1b[32m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m',
};

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { data, status: res.status, ok: res.ok };
}

async function run() {
  console.log('\n' + colors.red + colors.bold +
    '╔══════════════════════════════════════════════════════════╗\n' +
    '║  AISLE — Budget Cap Failure Demo                         ║\n' +
    '╚══════════════════════════════════════════════════════════╝' + colors.reset);
  console.log(`\n${colors.bold}Scenario:${colors.reset} Agent has ₹500 session limit. Tries to buy ₹2,499 item.\n`);

  // Issue AIT with tiny budget
  console.log('🔑 Issuing AIT with ₹500 session limit...');
  const { data: ait } = await api('POST', '/agents/token', {
    agent_name: 'broke_agent_v1',
    owner_email: 'demo@aisle.dev',
    spending_limit_per_session_inr: 500,  // ← tiny limit
    spending_limit_per_day_inr: 1000,
    allowed_categories: ['electronics', 'travel', 'connectivity'],
    ttl_hours: 1,
  });
  console.log(`   Agent: ${ait.agent_id} | Session Limit: ₹${ait.constraints.spending_limit_per_session_inr}\n`);

  // Discover a store
  const { data: stores } = await api('GET', '/stores?ai_buyers_enabled=true', null, ait.token);
  if (!stores.stores?.length) {
    console.error('❌ No stores found. Run: node demo/seed_merchant.js');
    process.exit(1);
  }
  const store = stores.stores[0];
  console.log(`🏪 Using store: ${store.name} [${store.store_id}]\n`);

  // Try to add expensive item to cart
  console.log('🛒 Attempting to add JioFi 4G (₹2,499) to cart...');
  console.log(`   ${colors.dim}Policy Engine will evaluate BEFORE any Razorpay call.${colors.reset}\n`);

  const { data: cartRes, status } = await api('POST', `/stores/${store.store_id}/cart`, {
    items: [{ sku: 'WIFI-JIOFI-4G', quantity: 1 }],
    agent_task: 'Buy WiFi device for Goa trip',
  }, ait.token);

  console.log('─'.repeat(60));

  if (status === 422 && cartRes.error === 'POLICY_VIOLATION') {
    console.log(colors.red + colors.bold + '\n🚫 POLICY VIOLATION — Cart blocked!\n' + colors.reset);
    console.log(`  ${colors.bold}Error:${colors.reset}          ${cartRes.error}`);
    console.log(`  ${colors.bold}Rule Failed:${colors.reset}    ${cartRes.rule}`);
    console.log(`  ${colors.bold}Detail:${colors.reset}         ${cartRes.detail}`);
    console.log(`  ${colors.bold}Suggestion:${colors.reset}     ${cartRes.suggested_action}`);
    console.log(`\n  ${colors.green}✅ No Razorpay order was created.${colors.reset}`);
    console.log(`  ${colors.green}✅ Blocked attempt logged in audit trail.${colors.reset}`);
    console.log(`\n  ${colors.dim}→ Check the dashboard Audit Log to see the POLICY_BLOCK entry.${colors.reset}\n`);
  } else {
    console.log('❌ Unexpected response:', cartRes);
  }
}

run().catch(err => {
  console.error(colors.red + '❌ DEMO ERROR:', err.message + colors.reset);
  process.exit(1);
});

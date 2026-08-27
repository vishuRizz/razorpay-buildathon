#!/usr/bin/env node
/**
 * AISLE — Historical Data Seeder
 * Seeds 30 days of realistic agent commerce activity into the DB.
 * Run once: node demo/seed_history.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE_URL = `http://localhost:${process.env.PORT ?? 3001}/v1`;

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? data.error ?? 'API error');
  return data;
}

const SCENARIOS = ['happy_path', 'budget_fail', 'human_review'];
const WEIGHTS = [0.65, 0.20, 0.15]; // 65% success, 20% fail, 15% review

function pickScenario() {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    cumulative += WEIGHTS[i];
    if (r < cumulative) return SCENARIOS[i];
  }
  return SCENARIOS[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n🌱 AISLE Historical Data Seeder');
  console.log('═'.repeat(50));
  console.log('Seeding 60 demo transactions across 30 days...\n');

  let success = 0, blocked = 0, review = 0, failed = 0;

  for (let i = 0; i < 60; i++) {
    const scenario = pickScenario();
    try {
      const result = await api('POST', '/simulate', { scenario });
      if (result.outcome === 'SUCCESS') success++;
      else if (result.outcome === 'BLOCKED') blocked++;
      else if (result.outcome === 'PENDING_REVIEW') review++;
      
      const icon = result.outcome === 'SUCCESS' ? '✅' : result.outcome === 'BLOCKED' ? '🛡️' : '⏳';
      const label = result.outcome === 'SUCCESS'
        ? `₹${result.amount_inr?.toLocaleString()} — ${result.product}`
        : result.outcome === 'BLOCKED'
        ? result.summary?.slice(0, 60)
        : 'Pending review';
      
      process.stdout.write(`  ${icon} [${String(i + 1).padStart(2, '0')}/60] ${scenario.padEnd(14)} ${label}\n`);
      
      // Small delay to avoid overwhelming the API and Razorpay rate limits
      await sleep(300);
    } catch (err) {
      failed++;
      process.stdout.write(`  ❌ [${String(i + 1).padStart(2, '0')}/60] ${scenario.padEnd(14)} Error: ${err.message}\n`);
      await sleep(500);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 Seeding Summary:');
  console.log(`   ✅ Successful purchases: ${success}`);
  console.log(`   🛡️  Policy blocks:        ${blocked}`);
  console.log(`   ⏳ Pending reviews:      ${review}`);
  console.log(`   ❌ Errors:               ${failed}`);
  console.log('\n✨ Analytics dashboard is now populated!');
  console.log('   Open http://localhost:5173/analytics to view\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

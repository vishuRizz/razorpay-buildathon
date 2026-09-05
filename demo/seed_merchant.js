#!/usr/bin/env node
/**
 * AISLE Demo Seed Script
 * Seeds the full AISLE marketplace (13 stores, 128 products).
 *
 * Usage: node demo/seed_merchant.js
 *        pnpm seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { ALL_MERCHANTS, getCatalogStats } = require('./lib/marketplace_catalog');

const PORT = process.env.PORT ?? 3001;
const BASE_URL = `http://localhost:${PORT}/v1`;
const HEALTH_URL = `http://localhost:${PORT}/health`;

async function waitForApi(retries = 40, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return;
    } catch {
      // API not up yet
    }
    if (i === 0) {
      console.log(`Waiting for API at ${HEALTH_URL} (start with: pnpm dev)...`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `API not reachable at ${HEALTH_URL}. In another terminal run: pnpm dev\n` +
      `Then retry: pnpm seed`
  );
}

async function seed() {
  const stats = getCatalogStats();

  console.log('\n🌱 AISLE Marketplace Seed\n');
  console.log(`Registering ${stats.store_count} stores · ${stats.product_count} products · ${stats.category_count} categories`);
  console.log('Target API:', BASE_URL);
  console.log('');

  await waitForApi();

  let totalProducts = 0;
  let successStores = 0;
  /** @type {string[]} */
  const merchantIds = [];

  for (const merchant of ALL_MERCHANTS) {
    try {
      const res = await fetch(`${BASE_URL}/merchants/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merchant),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(JSON.stringify(data));
      }

      successStores += 1;
      totalProducts += data.products_registered ?? merchant.catalog.length;
      merchantIds.push(data.merchant_id);

      console.log(`✅ ${merchant.store_name.padEnd(16)} ${String(data.products_registered).padStart(3)} products  →  ${data.merchant_id}`);
    } catch (err) {
      console.error(`❌ ${merchant.store_name}:`, err.message ?? err);
    }
  }

  console.log('');
  console.log(`✅ Done - ${successStores}/${ALL_MERCHANTS.length} stores · ${totalProducts} products live`);
  console.log('');
  if (merchantIds[0]) {
    console.log('Paste a Merchant ID into the dashboard sidebar (Live Feed / Policy / Analytics):');
    console.log(`  ${merchantIds[0]}`);
    console.log('');
  }
  console.log('Next:');
  console.log('  1. Open http://localhost:5173');
  console.log('  2. Agent Brain → run a preset (no Merchant ID needed for Brain)');
  console.log('  3. Or: node demo/agent_travel_llm.js "Find organic snacks and a book"\n');
}

seed();

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

const BASE_URL = `http://localhost:${process.env.PORT ?? 3001}/v1`;

async function seed() {
  const stats = getCatalogStats();

  console.log('\n🌱 AISLE Marketplace Seed\n');
  console.log(`Registering ${stats.store_count} stores · ${stats.product_count} products · ${stats.category_count} categories`);
  console.log('Target API:', BASE_URL);
  console.log('');

  let totalProducts = 0;
  let successStores = 0;

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

      console.log(`✅ ${merchant.store_name.padEnd(16)} ${String(data.products_registered).padStart(3)} products  →  ${data.merchant_id}`);
    } catch (err) {
      console.error(`❌ ${merchant.store_name}:`, err.message ?? err);
    }
  }

  console.log('');
  console.log(`✅ Done — ${successStores}/${ALL_MERCHANTS.length} stores · ${totalProducts} products live`);
  console.log('');
  console.log('AISLE has no store/product cap. Merchants join via POST /v1/merchants/register');
  console.log('');
  console.log('Try the agent:');
  console.log('  Dashboard → Agent Brain → "Buy me anything under ₹2000"');
  console.log('  node demo/agent_travel_llm.js "Find organic snacks and a book"\n');
}

seed();

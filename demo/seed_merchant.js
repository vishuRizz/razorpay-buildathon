#!/usr/bin/env node
/**
 * AISLE Demo Seed Script
 * Seeds 2 demo merchants + catalogs into the DB.
 *
 * Usage: node demo/seed_merchant.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE_URL = `http://localhost:${process.env.PORT ?? 3001}/v1`;

const GADGETNEST = {
  razorpay_key_id: process.env.RAZORPAY_KEY_ID,
  razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET,
  store_name: 'GadgetNest',
  description: 'Electronics and travel accessories for the modern traveller',
  policies: {
    max_order_value: 15000,
    human_review_above: 5000,
    allowed_agent_types: ['shopping', 'travel'],
    discount_cap_percent: 10,
    daily_ai_gmv_cap: 50000,
  },
  catalog: [
    {
      sku: 'WIFI-JIOFI-4G',
      data: {
        name: 'JioFi 4G Portable WiFi',
        description: '150Mbps, 10 device support, 6hr battery. Perfect for travel.',
        price_inr: 2499,
        inventory: 14,
        categories: ['electronics', 'travel', 'connectivity'],
        attributes: { weight_g: 95, battery_hours: 6, max_devices: 10, connectivity: '4G LTE' },
        tags: ['portable', 'travel', 'wifi', 'jio', '4g'],
      },
      in_stock: true,
    },
    {
      sku: 'WIFI-MI-5G',
      data: {
        name: 'Mi 5G WiFi Router Pro',
        description: '5G capable, 32 device support, 8hr battery. Premium option.',
        price_inr: 4999,
        inventory: 6,
        categories: ['electronics', 'travel', 'connectivity'],
        attributes: { weight_g: 140, battery_hours: 8, max_devices: 32, connectivity: '5G' },
        tags: ['portable', 'travel', 'wifi', 'mi', '5g', 'premium'],
      },
      in_stock: true,
    },
    {
      sku: 'POWERBANK-ANKER-20K',
      data: {
        name: 'Anker PowerCore 20000mAh',
        description: '20000mAh, dual USB-A + USB-C, fast charge. Essential for travel.',
        price_inr: 2199,
        inventory: 22,
        categories: ['electronics', 'travel', 'accessories'],
        attributes: { capacity_mah: 20000, ports: ['USB-A', 'USB-A', 'USB-C'], weight_g: 356 },
        tags: ['powerbank', 'charger', 'anker', 'travel'],
      },
      in_stock: true,
    },
    {
      sku: 'ADAPTER-UNIVERSAL',
      data: {
        name: 'Universal Travel Adapter',
        description: 'Works in 150+ countries. 4 USB ports + 1 USB-C. Safety certified.',
        price_inr: 999,
        inventory: 35,
        categories: ['travel', 'accessories', 'electronics'],
        attributes: { countries: 150, usb_ports: 4, usb_c_ports: 1 },
        tags: ['adapter', 'travel', 'universal', 'charger'],
      },
      in_stock: true,
    },
    {
      sku: 'EARBUDS-BOAT-AIRDOPES',
      data: {
        name: 'boAt Airdopes 441 TWS',
        description: 'True wireless earbuds, 6hr playback, IPX5 water resistant.',
        price_inr: 1799,
        inventory: 9,
        categories: ['electronics', 'audio'],
        attributes: { playback_hours: 6, water_resistant: 'IPX5', connectivity: 'Bluetooth 5.0' },
        tags: ['earbuds', 'wireless', 'boat', 'audio', 'tws'],
      },
      in_stock: true,
    },
  ],
};

const TRAVELESSENTIALS = {
  razorpay_key_id: process.env.RAZORPAY_KEY_ID,
  razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET,
  store_name: 'TravelEssentials',
  description: 'Curated travel gear for every kind of trip',
  policies: {
    max_order_value: 10000,
    human_review_above: 3000,
    allowed_agent_types: ['travel', 'shopping'],
    daily_ai_gmv_cap: 30000,
  },
  catalog: [
    {
      sku: 'PILLOW-NECK-MEMORY',
      data: {
        name: 'Memory Foam Neck Pillow',
        description: 'Ergonomic memory foam, 360° support, washable cover.',
        price_inr: 699,
        inventory: 50,
        categories: ['travel', 'comfort', 'accessories'],
        attributes: { material: 'Memory foam', washable: true, foldable: true },
        tags: ['neck pillow', 'travel', 'comfort', 'flight'],
      },
      in_stock: true,
    },
    {
      sku: 'LOCK-TSA-APPROVED',
      data: {
        name: 'TSA-Approved Luggage Lock',
        description: 'Combination lock, TSA approved, works on all luggage.',
        price_inr: 349,
        inventory: 100,
        categories: ['travel', 'security', 'accessories'],
        attributes: { tsa_approved: true, type: 'combination', digits: 3 },
        tags: ['lock', 'luggage', 'security', 'tsa'],
      },
      in_stock: true,
    },
    {
      sku: 'BAG-PACKING-CUBES-6PC',
      data: {
        name: '6-Piece Packing Cube Set',
        description: 'Lightweight packing cubes in 3 sizes. Keeps luggage organised.',
        price_inr: 1299,
        inventory: 28,
        categories: ['travel', 'accessories', 'organisation'],
        attributes: { pieces: 6, sizes: ['S', 'S', 'M', 'M', 'L', 'XL'], material: 'Nylon' },
        tags: ['packing cubes', 'organisation', 'luggage', 'travel'],
      },
      in_stock: true,
    },
  ],
};

async function seed() {
  console.log('\n🌱 AISLE Demo Seed Script\n');
  console.log('Seeding merchants into:', BASE_URL);
  console.log('');

  for (const merchant of [GADGETNEST, TRAVELESSENTIALS]) {
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

      console.log(`✅ ${merchant.store_name} registered`);
      console.log(`   Merchant ID: ${data.merchant_id}`);
      console.log(`   Products:    ${data.products_registered}`);
      console.log(`   Manifest:    ${BASE_URL.replace('/v1', '')}${data.manifest_url}`);
      console.log('');

      // Save merchant IDs for demo scripts
      if (!process.env.GADGETNEST_ID && merchant.store_name === 'GadgetNest') {
        process.env.GADGETNEST_ID = data.merchant_id;
      }
    } catch (err) {
      console.error(`❌ Failed to register ${merchant.store_name}:`, err);
    }
  }

  console.log('✅ Seeding complete!');
  console.log('\nNext steps:');
  console.log('  node demo/agent_travel.js       — Full happy-path demo');
  console.log('  node demo/agent_budget_fail.js  — Budget cap failure demo');
  console.log('  node demo/agent_human_review.js — Human review flow demo\n');
}

seed();

import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(__dirname, '../../../../.env') });
import { nanoid } from 'nanoid';
import { query } from '../db/client';

const SCENARIOS = ['happy_path', 'budget_fail', 'human_review'];
const WEIGHTS = [0.65, 0.20, 0.15]; 

function pickScenario() {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    cumulative += WEIGHTS[i];
    if (r < cumulative) return SCENARIOS[i];
  }
  return SCENARIOS[0];
}

async function main() {
  console.log('\n🌱 AISLE Massive Historical Data Seeder');
  console.log('═'.repeat(50));
  
  const numTransactions = parseInt(process.argv[2] || '500', 10);
  console.log(`Seeding ${numTransactions} transactions...`);

  // We need a store ID. Fetch the first store.
  const storeResult = await query('SELECT id FROM merchants LIMIT 1') as any;
  if (storeResult.length === 0) {
    console.error('No merchant found. Run the basic setup first.');
    return;
  }
  const storeId = storeResult[0].id;

  let success = 0, blocked = 0, review = 0;
  
  // Create 50 distinct agents
  const agents: string[] = [];
  for (let i = 0; i < 50; i++) {
    const aid = `agt_${nanoid(10)}`;
    agents.push(aid);
    await query(
      `INSERT INTO agents (id, owner_email, constraints, daily_spend_inr, reputation_score)
       VALUES ($1, $2, $3, 0, 100) ON CONFLICT DO NOTHING`,
       [aid, `test${i}@example.com`, '{}']
    );
  }

  // Generate logs in batches
  const batchSize = 100;
  let currentBatch = [];

  for (let i = 0; i < numTransactions; i++) {
    const scenario = pickScenario();
    const agentId = agents[Math.floor(Math.random() * agents.length)];
    const id = `log_${nanoid(16)}`;
    const now = new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)); // Spread over 30 days
    
    let action = 'CHECKOUT_SUCCESS';
    let output = { amount_inr: 999, product: 'Universal Travel Adapter' };
    
    if (scenario === 'budget_fail') {
      action = 'POLICY_BLOCK';
      output = { reason: 'Cart value ₹4999 exceeds limit' } as any;
      blocked++;
    } else if (scenario === 'human_review') {
      action = 'HUMAN_REVIEW_REQUESTED';
      review++;
    } else {
      success++;
      // Create a fake order for analytics
      await query(
        `INSERT INTO orders (id, merchant_id, agent_id, razorpay_order_id, amount_inr, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PAID', $6)`,
        [`order_${nanoid(12)}`, storeId, agentId, `rzp_${nanoid(10)}`, 999, now]
      );
    }
    
    currentBatch.push(query(
      `INSERT INTO audit_log (id, agent_id, merchant_id, action, output, duration_ms, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, agentId, storeId, action, JSON.stringify(output), Math.floor(Math.random() * 500) + 100, now]
    ));

    if (currentBatch.length === batchSize) {
      await Promise.all(currentBatch);
      currentBatch = [];
      process.stdout.write(`\rInserted ${i + 1}/${numTransactions} logs...`);
    }
  }

  if (currentBatch.length > 0) {
    await Promise.all(currentBatch);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 Seeding Summary:');
  console.log(`   ✅ Successful purchases: ${success}`);
  console.log(`   🛡️  Policy blocks:        ${blocked}`);
  console.log(`   ⏳ Pending reviews:      ${review}`);
  console.log('\n✨ Analytics dashboard is now populated massively!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

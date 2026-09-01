require('dotenv').config({ path: __dirname + '/../.env' });
const { query } = require('../packages/api/dist/db/client');
const jwt = require('../packages/api/node_modules/jsonwebtoken');

const BASE_URL = `http://127.0.0.1:${process.env.PORT ?? 3001}/v1`;

const colors = {
  reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m',
};

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? data.error);
  return data;
}

async function runChaosMonkey() {
  console.log(colors.cyan + "🐵 Starting Chaos Monkey Engine..." + colors.reset);

  while (true) {
    try {
      // 1. Get random merchant
      const merchants = await query('SELECT id FROM merchants LIMIT 10');
      if (merchants.length === 0) throw new Error("No merchants found");
      const merchantId = merchants[Math.floor(Math.random() * merchants.length)].id;

      // 2. Get random agent
      const agents = await query('SELECT * FROM agents');
      const agentRecord = agents[Math.floor(Math.random() * agents.length)];

      // Generate token
      const token = jwt.sign({
        agent_id: agentRecord.id,
        owner_email: agentRecord.owner_email,
        reputation_score: agentRecord.reputation_score,
        spending_limit_per_session_inr: agentRecord.constraints.spending_limit_per_session_inr,
        spending_limit_per_day_inr: agentRecord.constraints.spending_limit_per_day_inr,
        allowed_categories: agentRecord.constraints.allowed_categories || ['*'],
        requires_human_confirm_above: agentRecord.constraints.requires_human_confirm_above
      }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });

      // 3. Get random product
      const products = await query('SELECT * FROM products WHERE merchant_id = $1', [merchantId]);
      const product = products[Math.floor(Math.random() * products.length)];
      
      const qty = Math.floor(Math.random() * 3) + 1; // 1 to 3 items
      const amount = parseInt(product.data.price_inr, 10) * qty;

      console.log(`\n${colors.dim}[MONKEY]${colors.reset} Agent ${agentRecord.id} attempting to buy ${qty}x ${product.data.name} (₹${amount})`);

      // 4. Create Cart
      let cart;
      try {
        cart = await api('POST', `/stores/${merchantId}/cart`, {
          items: [{ sku: product.sku, quantity: qty }]
        }, token);
        console.log(`  ${colors.green}✓ Cart Created${colors.reset} (Policy engine passed checks)`);
      } catch (err) {
        console.log(`  ${colors.red}✗ Blocked by Policy Engine:${colors.reset} ${err.message}`);
        await sleep(Math.floor(Math.random() * 3000) + 1000);
        continue; // Try next agent
      }

      // 5. Checkout
      try {
        const order = await api('POST', `/stores/${merchantId}/cart/${cart.cart_id}/checkout`, {
          agent_confirm: true,
          agent_task: 'Chaos Monkey Test'
        }, token);
        if (order.status === 'PENDING_REVIEW') {
           console.log(`  ${colors.yellow}⚠ Human Review Requested!${colors.reset}`);
        } else {
           console.log(`  ${colors.green}✓ Checkout Success! Order: ${order.order_id}${colors.reset}`);
        }
      } catch (err) {
        console.log(`  ${colors.red}✗ Checkout Failed:${colors.reset} ${err.message}`);
      }

    } catch (err) {
      console.error(colors.red + "Monkey crashed: " + err.message + colors.reset);
    }
    
    // Random delay between 1.5s and 5s
    const delay = Math.floor(Math.random() * 3500) + 1500;
    await sleep(delay);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runChaosMonkey();

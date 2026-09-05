#!/usr/bin/env node
/**
 * AISLE Demo: LLM Tool-Calling Travel Agent
 *
 * Replaces the scripted agent_travel.js with a real autonomous agent
 * that uses Groq function calling to discover stores, compare products,
 * and checkout via the Aisle API.
 *
 * Prerequisites:
 *   pnpm dev          (API running on :3001)
 *   pnpm seed         (merchants registered)
 *   ANTHROPIC_API_KEY or GROQ_API_KEY in .env (Anthropic recommended)
 *
 * Usage:
 *   node demo/agent_travel_llm.js
 *   node demo/agent_travel_llm.js "Buy noise-cancelling earbuds under ₹2000"
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');

const { aisleRequest } = require('./lib/aisle_client');
const { runAgentLoop } = require('./lib/agent_loop');

const DEFAULT_TASK =
  'Surprise me - buy something useful under ₹2,000 from any store on AISLE. Explore all catalogs, compare different product types, and pick the best match for a general shopper.';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
};

function divider() {
  console.log(colors.dim + '─'.repeat(64) + colors.reset);
}

function onEvent(event) {
  switch (event.type) {
    case 'thinking':
      divider();
      console.log(
        `${colors.magenta}🧠 STEP ${event.step}${colors.reset} ${colors.dim}- LLM planning (${event.model})…${colors.reset}`
      );
      break;
    case 'model_fallback':
      console.log(
        `${colors.yellow}⚠️  MODEL${colors.reset} ${event.from} unavailable → trying ${colors.bold}${event.to}${colors.reset}`
      );
      break;
    case 'tool_call':
      console.log(
        `${colors.cyan}🔧 TOOL${colors.reset} ${colors.bold}${event.name}${colors.reset}`
      );
      console.log(`${colors.dim}   args: ${JSON.stringify(event.args)}${colors.reset}`);
      break;
    case 'tool_result': {
      const icon = event.ok ? `${colors.green}✅` : `${colors.red}❌`;
      const ms = event.duration_ms != null ? ` (${event.duration_ms}ms)` : '';
      console.log(`${icon} RESULT${colors.reset}${ms}`);
      console.log(`${colors.dim}   ${event.preview}${colors.reset}`);
      break;
    }
    case 'done':
      divider();
      if (event.early_exit) {
        console.log(`${colors.green}${colors.bold}✅ Mission complete${colors.reset} ${colors.dim}(checkout + status confirmed)${colors.reset}\n`);
      } else {
        console.log(`${colors.green}${colors.bold}🎯 Agent summary${colors.reset}\n`);
      }
      console.log(event.content);
      console.log('');
      break;
    default:
      break;
  }
}

async function issueToken() {
  const constraints = {
    spending_limit_per_session_inr: 8000,
    spending_limit_per_day_inr: 15000,
    allowed_categories: ['*'],
    requires_human_confirm_above_inr: 6000,
  };

  const { data } = await aisleRequest('POST', '/agents/token', {
    body: {
      agent_name: 'travel_agent_llm',
      owner_email: 'demo@aisle.dev',
      ...constraints,
      ttl_hours: 1,
    },
  });

  return { token: data.token, agent_id: data.agent_id, constraints };
}

async function run() {
  const task = process.argv.slice(2).join(' ').trim() || DEFAULT_TASK;

  console.log('\n' + colors.cyan + colors.bold + '╔══════════════════════════════════════════════════════════════╗');
  console.log('║       AISLE - LLM Tool-Calling Travel Agent                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝' + colors.reset);
  console.log(`\n${colors.bold}Task:${colors.reset} "${task}"\n`);

  divider();
  console.log(`${colors.yellow}🔑 Issuing Agent Identity Token…${colors.reset}`);
  const { token, agent_id, constraints } = await issueToken();
  console.log(`${colors.green}✅ Agent:${colors.reset} ${agent_id}`);
  console.log(
    `${colors.dim}   Limits: ₹${constraints.spending_limit_per_session_inr}/session, ₹${constraints.spending_limit_per_day_inr}/day${colors.reset}\n`
  );

  const sessionId = `sess_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  console.log(`${colors.dim}   Session: ${sessionId} → open Dashboard → Agent Brain${colors.reset}\n`);

  const { finalText, trace, steps } = await runAgentLoop({
    task,
    token,
    constraints,
    onEvent,
    sessionId,
    agentId: agent_id,
  });

  const checkout = trace.find((t) => t.tool === 'checkout' && t.result?.ok);
  const order = trace.find((t) => t.tool === 'check_order_status' && t.result?.ok);

  divider();
  console.log(`${colors.green}${colors.bold}Purchase trace${colors.reset}`);
  console.log(`  Steps:     ${steps}`);
  console.log(`  Tool calls: ${trace.length}`);
  if (checkout?.result?.order_id) {
    console.log(`  Order ID:  ${checkout.result.order_id}`);
    console.log(`  Razorpay:  ${checkout.result.razorpay_order_id ?? 'n/a'}`);
    console.log(`  Amount:    ₹${checkout.result.amount_inr ?? 'n/a'}`);
  }
  if (order?.result?.status) {
    console.log(`  Status:    ${order.result.status}`);
  }
  console.log(`\n${colors.dim}Check the merchant dashboard for the full audit trail.${colors.reset}\n`);

  return finalText;
}

run().catch(async (err) => {
  console.error(`\n${colors.red}${colors.bold}❌ Agent failed:${colors.reset} ${err.message}`);
  if (err.response) {
    console.error(colors.dim, JSON.stringify(err.response, null, 2), colors.reset);
  }
  process.exit(1);
});

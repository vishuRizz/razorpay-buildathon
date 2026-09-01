const { execSync } = require('child_process');

console.log("🚀 Starting AISLE Live Traffic Generator...");
console.log("This will spawn random agent transactions every 3-8 seconds.");
console.log("Press Ctrl+C to stop.\n");

const scripts = [
  'demo/agent_travel.js',
  'demo/agent_budget_fail.js',
  'demo/agent_human_review.js'
];

function runRandomAgent() {
  const script = scripts[Math.floor(Math.random() * scripts.length)];
  console.log(`[${new Date().toLocaleTimeString()}] Spawning agent: ${script}`);
  
  try {
    // Run synchronously, ignoring stdout so it doesn't clutter
    execSync(`node ${script}`, { stdio: 'ignore' });
    console.log(`✅ Finished ${script}`);
  } catch (err) {
    console.error(`❌ Agent failed: ${script}`);
  }

  const nextDelayMs = Math.floor(Math.random() * 5000) + 3000;
  console.log(`Waiting ${nextDelayMs/1000}s for next agent...\n`);
  setTimeout(runRandomAgent, nextDelayMs);
}

runRandomAgent();

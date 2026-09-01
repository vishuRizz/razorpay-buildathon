import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(__dirname, '../../../.env') });
import express, { Application } from 'express';
import cors from 'cors';
import { testConnection } from './db/client';
import { errorHandler } from './middleware/errorHandler';

// Routes
import agentsRouter from './routes/agents';
import merchantsRouter from './routes/merchants';
import storesRouter from './routes/stores';
import catalogRouter from './routes/catalog';
import cartRouter from './routes/cart';
import checkoutRouter from './routes/checkout';
import simulateRouter from './routes/simulate';
import webhooksRouter from './routes/webhooks';
import agentEventsRouter from './routes/agentEvents';
import agentRunRouter from './routes/agentRun';

const app: Application = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.DASHBOARD_URL ?? 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ 
  limit: '2mb',
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbOk = await testConnection();
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'error',
    version: '1.0.0',
    service: 'AISLE Agent Commerce API',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/v1/agents', agentsRouter);
app.use('/v1/merchants', merchantsRouter);
app.use('/v1/stores', storesRouter);

// Catalog routes (nested under stores)
app.use('/v1/stores/:storeId/catalog', catalogRouter);

// Cart + Checkout routes (nested under stores)
app.use('/v1/stores/:storeId/cart', cartRouter);
app.use('/v1/stores/:storeId', checkoutRouter);

// Simulate endpoint (dashboard demo trigger)
app.use('/v1/simulate', simulateRouter);

// Live agent brain events (LLM demo streaming)
app.use('/v1/agent-events', agentEventsRouter);
app.use('/v1/agent', agentRunRouter);

// Webhooks
app.use('/v1/webhooks', webhooksRouter);

// Root → React dashboard landing (avoids duplicate static landing + auto-redirect confusion)
const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:5173';
app.get('/', (_req, res) => {
  res.redirect(302, dashboardUrl);
});

// ─── 404 Handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', detail: 'Route not found' });
});

// ─── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────
async function start() {
  console.log('\n🚀 AISLE Agent Commerce API\n');

  // Test DB connection before starting
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('❌ Cannot connect to database. Check DATABASE_URL in .env');
    console.error('   Get your Neon connection string from: https://console.neon.tech');
    process.exit(1);
  }
  console.log('✅ Neon database connected\n');

  app.listen(PORT, () => {
    console.log(`✅ API running at http://localhost:${PORT}`);
    console.log(`   Dashboard: ${dashboardUrl}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Stores: http://localhost:${PORT}/v1/stores`);
    console.log('\n📖 Run demo scripts:');
    console.log('   node demo/agent_travel.js');
    console.log('   node demo/agent_budget_fail.js');
    console.log('   node demo/agent_human_review.js\n');
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export default app;

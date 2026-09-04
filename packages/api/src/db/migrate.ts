import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env vars from root .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { getPool } from './client';

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('🗄️  Running AISLE database migrations on Neon...\n');

  try {
    await getPool().query(sql);
    console.log('✅ Schema applied successfully!\n');
    console.log('Tables created:');
    console.log('  • merchants');
    console.log('  • products');
    console.log('  • agents');
    console.log('  • carts');
    console.log('  • orders');
    console.log('  • audit_log');
    console.log('  • agent_sessions');
    console.log('\n🚀 Ready to seed: pnpm seed\n');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await getPool().end();
  }
}

migrate();

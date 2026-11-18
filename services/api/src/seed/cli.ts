// `npm run seed [-- --force]`: load data/seed into MongoDB.
import { loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { runSeed } from './seeder.js';

const config = loadConfig();
await connectDb(config.mongoUrl);
try {
  const r = await runSeed({ seedDir: config.seedDir, force: process.argv.includes('--force') });
  console.log(r.seeded ? `Seeded version ${r.version}` : `Seed version ${r.version} already loaded (use --force to reload)`);
} finally {
  await disconnectDb();
}

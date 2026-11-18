import type { Server } from 'node:http';
import { pino } from 'pino';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { runSeed } from './seed/seeder.js';

/**
 * Connect to MongoDB, load the seed if its version changed, then listen.
 * Seeding first means "ready" always implies the graph collections exist,
 * which the graph service needs at its own startup.
 */
export async function startServer(config: Config): Promise<{ server: Server; stop: () => Promise<void> }> {
  const log = pino({ level: config.logLevel });
  await connectDb(config.mongoUrl);
  const seed = await runSeed({ seedDir: config.seedDir });
  log.info(seed, seed.seeded ? 'seed loaded' : 'seed already loaded');
  const app = createApp({ config });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(config.port, () => resolve(s));
  });
  log.info({ port: config.port }, 'procurement-api listening');
  const stop = () =>
    new Promise<void>((resolve) => {
      server.close(() => void disconnectDb().then(resolve));
    });
  return { server, stop };
}

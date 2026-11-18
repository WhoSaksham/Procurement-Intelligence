import { loadConfig } from './config.js';
import { startServer } from './start.js';

const { stop } = await startServer(loadConfig());

const shutdown = () => void stop().then(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

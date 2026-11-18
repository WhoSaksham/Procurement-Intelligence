import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URL: z.string().min(1).default('mongodb://localhost:27017/procurement'),
  API_KEY: z.string().min(1).default('dev-key'),
  GRAPH_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  GRAPH_API_KEY: z.string().min(1).default('dev-key'),
  EXPOSE_DOCS: bool,
  E2E_GRAPH_DOWN: bool,
  E2E: bool,
  SEED_DIR: z.string().min(1).default(path.join(REPO_ROOT, 'data', 'seed')),
  LOG_LEVEL: z.string().default('info'),
});

export interface Config {
  port: number;
  mongoUrl: string;
  apiKey: string;
  graphServiceUrl: string;
  graphApiKey: string;
  exposeDocs: boolean;
  /** Answer every graph request from the snapshot (end-to-end tests only). */
  graphDown: boolean;
  /** Honour the x-graph-simulate-down request header (end-to-end tests only). */
  allowSimulateDown: boolean;
  seedDir: string;
  logLevel: string;
}

/** Keys that must be set explicitly in production: their development default (`dev-key`) is public. */
const REQUIRED_IN_PRODUCTION = ['API_KEY', 'GRAPH_API_KEY'] as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  if (env.NODE_ENV === 'production') {
    for (const k of REQUIRED_IN_PRODUCTION) {
      if (!env[k]) throw new Error(`${k} must be set in production (use a long random value)`);
    }
  }
  const e = Env.parse(env);
  return {
    port: e.PORT,
    mongoUrl: e.MONGO_URL,
    apiKey: e.API_KEY,
    graphServiceUrl: e.GRAPH_SERVICE_URL.replace(/\/$/, ''),
    graphApiKey: e.GRAPH_API_KEY,
    exposeDocs: e.EXPOSE_DOCS,
    graphDown: e.E2E_GRAPH_DOWN,
    allowSimulateDown: e.E2E,
    seedDir: e.SEED_DIR,
    logLevel: e.LOG_LEVEL,
  };
}

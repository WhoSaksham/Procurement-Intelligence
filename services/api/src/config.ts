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
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  ASK_RPM: z.coerce.number().int().positive().default(5),
  ASK_DAILY_LIMIT: z.coerce.number().int().positive().default(100),
  LANGSMITH_TRACING: bool,
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().min(1).default('procurement-ask'),
  LANGSMITH_ENDPOINT: z.string().url().optional(),
  LANGSMITH_AGENT_ID: z.string().optional(),
  LANGSMITH_AGENT_ENVIRONMENT: z.string().optional(),
});

/** LangSmith's rules for an agent address (the destination that replaces a project). */
const AGENT_ID = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
const AGENT_ENVIRONMENTS = ['local', 'development', 'staging', 'production'];

export interface LangSmithConfig {
  apiKey: string;
  endpoint?: string;
  /** Traces go to a project, or (when LANGSMITH_AGENT_* are set) to an agent; never both. */
  project?: string;
  agent?: { id: string; environment: string };
}

function agentFrom(id: string | undefined, environment: string | undefined): LangSmithConfig['agent'] {
  if (!id && !environment) return undefined;
  if (!id) throw new Error('LANGSMITH_AGENT_ID must be set together with LANGSMITH_AGENT_ENVIRONMENT');
  if (!environment) throw new Error('LANGSMITH_AGENT_ENVIRONMENT must be set together with LANGSMITH_AGENT_ID');
  if (!AGENT_ID.test(id)) throw new Error(`LANGSMITH_AGENT_ID must be lower-case letters, digits and hyphens, starting with a letter (got ${JSON.stringify(id)})`);
  environment = environment.toLowerCase();
  if (!AGENT_ENVIRONMENTS.includes(environment)) throw new Error(`LANGSMITH_AGENT_ENVIRONMENT must be one of ${AGENT_ENVIRONMENTS.join(', ')} (got ${JSON.stringify(environment)})`);
  return { id, environment };
}

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
  /** Unset: Ask answers from prepared answers only. */
  geminiApiKey: string | undefined;
  geminiModel: string;
  /** Questions per minute sent to the model, across all users (all traffic arrives via the web proxy). */
  askRpm: number;
  /** Questions per UTC day sent to the model. */
  askDailyLimit: number;
  /** Set only when LANGSMITH_TRACING is on and a key is given. */
  langsmith: LangSmithConfig | null;
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
  const tracing = e.LANGSMITH_TRACING && e.LANGSMITH_API_KEY;
  const agent = tracing ? agentFrom(e.LANGSMITH_AGENT_ID || undefined, e.LANGSMITH_AGENT_ENVIRONMENT || undefined) : undefined;
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
    geminiApiKey: e.GEMINI_API_KEY || undefined,
    geminiModel: e.GEMINI_MODEL,
    askRpm: e.ASK_RPM,
    askDailyLimit: e.ASK_DAILY_LIMIT,
    langsmith: tracing
      ? {
          apiKey: e.LANGSMITH_API_KEY!,
          ...(e.LANGSMITH_ENDPOINT ? { endpoint: e.LANGSMITH_ENDPOINT } : {}),
          ...(agent ? { agent } : { project: e.LANGSMITH_PROJECT }),
        }
      : null,
  };
}

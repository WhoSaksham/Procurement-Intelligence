import express, { Router } from 'express';
import helmet from 'helmet';
import { pino, type DestinationStream } from 'pino';
import { pinoHttp } from 'pino-http';
import { loadConfig, type Config } from './config.js';
import { dbReady as mongoReady } from './db.js';
import { requireApiKey } from './http/api-key.js';
import { errorHandler, HttpProblem } from './http/problem.js';
import { requestId } from './http/request-id.js';
import { askRouter } from './modules/ask/routes.js';
import { contentRouter } from './modules/content/routes.js';
import { contractsRouter } from './modules/contracts/routes.js';
import { graphRouter } from './modules/graph/routes.js';
import { learnRouter } from './modules/learn/routes.js';
import { packagesRouter } from './modules/packages/routes.js';
import { referenceRouter } from './modules/reference/routes.js';
import { sourcesRouter } from './modules/sources/routes.js';
import { openApiDocument } from './openapi/registry.js';

export interface AppDeps {
  config: Config;
  fetchImpl?: typeof fetch;
  dbReady?: () => boolean;
  /** Extra /v1 routers (module routers are added here as they are built; tests add their own). */
  routers?: Router[];
  /** Where logs go (stdout by default; tests capture them). */
  logStream?: DestinationStream;
}

const DOCS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Procurement API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="ui"></div><script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui' });</script></body></html>`;

/** Every module's /v1 router. Building them also registers their routes in the OpenAPI document. */
export function moduleRouters(config: Config = loadConfig({}), fetchImpl: typeof fetch = fetch): Router[] {
  return [
    referenceRouter(),
    sourcesRouter(),
    contractsRouter(),
    contentRouter(),
    askRouter(),
    learnRouter(),
    packagesRouter(),
    graphRouter(config, fetchImpl),
  ];
}

export function createApp(deps: AppDeps): express.Express {
  const { config } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const dbReady = deps.dbReady ?? mongoReady;
  // Never log the shared secrets or cookies that arrive in headers.
  const log = pino(
    { level: config.logLevel, redact: { paths: ['req.headers["x-api-key"]', 'req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' } },
    deps.logStream,
  );

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(requestId);
  app.use(pinoHttp({ logger: log, genReqId: (req) => (req as express.Request).requestId }));
  app.use(helmet({ contentSecurityPolicy: config.exposeDocs ? false : undefined }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Build the routers before /openapi.json can be requested, so the document is complete.
  const routers = [...moduleRouters(config, fetchImpl), ...(deps.routers ?? [])];

  app.get('/ready', async (_req, res) => {
    const mongo = dbReady() ? 'up' : 'down';
    let graph: 'up' | 'down' = 'down';
    try {
      const r = await fetchImpl(`${config.graphServiceUrl}/health`, { signal: AbortSignal.timeout(1_000) });
      graph = r.ok ? 'up' : 'down';
    } catch {
      graph = 'down';
    }
    res.status(mongo === 'up' ? 200 : 503).json({ mongo, graph });
  });

  if (config.exposeDocs) {
    app.get('/openapi.json', (_req, res) => {
      res.json(openApiDocument());
    });
    app.get('/docs', (_req, res) => {
      res.type('html').send(DOCS_HTML);
    });
  }

  const v1 = Router();
  v1.use(requireApiKey(config.apiKey));
  for (const r of routers) v1.use(r);
  v1.use((req, _res, next) => next(new HttpProblem(404, 'not-found', `No route for ${req.method} ${req.originalUrl.split('?')[0]}`)));
  // Mount at the root so routers declare full /v1 paths, which keeps them greppable.
  app.use((req, res, next) => (req.path.startsWith('/v1/') || req.path === '/v1' ? v1(req, res, next) : next()));

  app.use((req, _res, next) => next(new HttpProblem(404, 'not-found', `No route for ${req.method} ${req.path}`)));
  app.use(errorHandler(log));
  return app;
}

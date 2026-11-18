import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import { registry } from './registry.js';

const Problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string(),
    instance: z.string(),
    requestId: z.string(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .passthrough()
  .openapi('Problem');

const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: Problem } } });

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteSpec {
  method: Method;
  /** Express path, e.g. /v1/packages/:id */
  path: string;
  summary: string;
  tags: string[];
  request?: RouteConfig['request'];
  /** Success responses; problem responses (400/401/404/409/500) are added for every route. */
  responses: Record<number, { description: string; schema?: z.ZodType; contentType?: string }>;
  /** Extra problem statuses this route can return, e.g. 409. */
  problems?: number[];
}

const toOpenApiPath = (p: string) => p.replace(/:(\w+)\*?/g, '{$1}');

// Routers are built once per app; tests build many apps. Register each path once.
const registered = new Set<string>();

/** Register a route in the OpenAPI document and mount its handler. */
export function route(router: Router, spec: RouteSpec, handler: (req: Request, res: Response) => unknown | Promise<unknown>): void {
  const responses: RouteConfig['responses'] = {};
  for (const [status, r] of Object.entries(spec.responses)) {
    responses[Number(status)] = r.schema
      ? { description: r.description, content: { [r.contentType ?? 'application/json']: { schema: r.schema } } }
      : { description: r.description };
  }
  responses[400] = problem('Invalid request');
  responses[401] = problem('Missing or invalid API key');
  responses[404] = problem('Not found');
  for (const s of spec.problems ?? []) responses[s] = problem(s === 409 ? 'Conflict' : 'Error');
  responses[500] = problem('Internal error');
  const key = `${spec.method} ${spec.path}`;
  if (!registered.has(key)) {
    registered.add(key);
    registry.registerPath({
    method: spec.method,
    path: toOpenApiPath(spec.path),
    summary: spec.summary,
    tags: spec.tags,
    request: spec.request,
    responses,
    });
  }
  const h: RequestHandler = async (req, res) => {
    await handler(req, res);
  };
  router[spec.method](spec.path, h);
}

import type { ErrorRequestHandler, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';

export type ProblemSlug =
  | 'validation'
  | 'not-found'
  | 'version-conflict'
  | 'example-read-only'
  | 'unauthorized'
  | 'internal';

export const PROBLEM_BASE = 'https://procurement.dev/problems/';

const TITLES: Record<ProblemSlug, string> = {
  validation: 'Invalid request',
  'not-found': 'Not found',
  'version-conflict': 'Conflict',
  'example-read-only': 'The example package is read-only',
  unauthorized: 'Missing or invalid API key',
  internal: 'Internal error',
};

/** An error that maps to an RFC 9457 problem response. */
export class HttpProblem extends Error {
  constructor(
    public status: number,
    public slug: ProblemSlug,
    public detail: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(detail);
  }
}

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId: string;
  errors?: { path: string; message: string }[];
  [k: string]: unknown;
}

export function sendProblem(req: Request, res: Response, p: HttpProblem): void {
  const body: ProblemBody = {
    type: PROBLEM_BASE + p.slug,
    title: TITLES[p.slug],
    status: p.status,
    detail: p.detail,
    instance: req.originalUrl.split('?')[0],
    requestId: req.requestId,
    ...p.extra,
  };
  res.status(p.status).type('application/problem+json').send(JSON.stringify(body));
}

export const fromZod = (e: ZodError): HttpProblem =>
  new HttpProblem(400, 'validation', 'The request did not pass validation', {
    errors: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });

/** Last middleware: every error becomes a problem response. */
export const errorHandler =
  (log: Logger): ErrorRequestHandler =>
  (err, req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof HttpProblem) return sendProblem(req, res, err);
    if (err instanceof ZodError) return sendProblem(req, res, fromZod(err));
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.parse.failed') return sendProblem(req, res, new HttpProblem(400, 'validation', 'Body is not valid JSON'));
    if (e?.type === 'entity.too.large') return sendProblem(req, res, new HttpProblem(413, 'validation', 'Body is too large'));
    log.error({ err, requestId: req.requestId }, 'unhandled error');
    sendProblem(req, res, new HttpProblem(500, 'internal', 'Something went wrong. Quote the request id if you report it.'));
  };

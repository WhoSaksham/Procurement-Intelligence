import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

const VALID = /^[\w.-]{1,100}$/;

/** Accept a well-formed incoming x-request-id or make one; echo it on the response. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && VALID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};

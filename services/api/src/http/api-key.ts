import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpProblem } from './problem.js';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Require X-API-Key to equal the configured key (constant-time compare). */
export const requireApiKey = (key: string): RequestHandler => {
  const expected = digest(key);
  return (req, _res, next) => {
    const got = req.get('x-api-key');
    if (got && timingSafeEqual(digest(got), expected)) return next();
    next(new HttpProblem(401, 'unauthorized', 'Send the shared key in the X-API-Key header'));
  };
};

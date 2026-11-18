import { Router } from 'express';
import { z } from 'zod';
import { route } from '../../openapi/route.js';
import { LearnEvent } from '../analysis/schemas.js';
import { applyNext, learnState, resetEvents } from './service.js';

const State = z.object({ events: z.array(LearnEvent), remaining: z.number() }).openapi('LearnState');

export function learnRouter(): Router {
  const r = Router();
  const res200 = { 200: { description: 'Applied events, newest first, and how many remain queued', schema: State } };
  route(r, { method: 'get', path: '/v1/learn/events', summary: 'Feedback events applied so far', tags: ['learn'], responses: res200 }, async (_q, res) => {
    res.json(await learnState());
  });
  route(
    r,
    { method: 'post', path: '/v1/learn/events/next', summary: 'Receive the next sample event', tags: ['learn'], responses: res200, problems: [409] },
    async (_q, res) => {
      res.json(await applyNext());
    },
  );
  route(r, { method: 'post', path: '/v1/learn/events/reset', summary: 'Put every sample event back in the queue', tags: ['learn'], responses: res200 }, async (_q, res) => {
    res.json(await resetEvents());
  });
  return r;
}

import { Router } from 'express';
import { z } from 'zod';
import { body } from '../../http/validate.js';
import { route } from '../../openapi/route.js';
import { Step } from '../analysis/schemas.js';
import { ask, questions } from './service.js';

const AskBody = z.object({ q: z.string().trim().min(1).max(500) }).openapi('AskRequest');
const KeptClaim = z
  .object({ text: z.string(), cite: z.array(z.string()), support: z.number(), kept: z.boolean().describe('support ≥ supportMin; removed claims are shown struck out') })
  .openapi('KeptClaim');
const AskAnswer = z.object({ q: z.string(), keys: z.array(z.string()), claims: z.array(KeptClaim) }).openapi('AskAnswer');
const AskResponse = z
  .union([
    z.object({ blocked: z.literal(true) }),
    z.object({
      blocked: z.literal(false),
      answer: AskAnswer.nullable(),
      steps: z.array(Step),
      supportMin: z.number(),
    }),
  ])
  .openapi('AskResponse');

export function askRouter(): Router {
  const r = Router();
  route(
    r,
    {
      method: 'get',
      path: '/v1/ask/questions',
      summary: 'Suggested questions and the grounding threshold',
      tags: ['ask'],
      responses: { 200: { description: 'Questions', schema: z.object({ questions: z.array(z.string()), supportMin: z.number() }) } },
    },
    async (_req, res) => {
      res.json(await questions());
    },
  );
  route(
    r,
    {
      method: 'post',
      path: '/v1/ask',
      summary: 'Answer a question from prepared, grounded answers (instruction-like text is refused)',
      tags: ['ask'],
      request: { body: { content: { 'application/json': { schema: AskBody } } } },
      responses: { 200: { description: 'Answer, refusal, or no match', schema: AskResponse } },
    },
    async (req, res) => {
      res.json(await ask(body(req, AskBody).q));
    },
  );
  return r;
}

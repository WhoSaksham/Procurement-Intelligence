import { Router } from 'express';
import { z } from 'zod';
import type { Config } from '../../config.js';
import { body, params } from '../../http/validate.js';
import { route } from '../../openapi/route.js';
import { Step } from '../analysis/schemas.js';
import { fakeModel } from './fake-model.js';
import { geminiModel } from './gemini.js';
import { AskLimits } from './limits.js';
import { askTracer } from './tracing.js';
import type { AskModel } from './model-port.js';
import { ask, getThread, questions } from './service.js';

const Id = z.string().min(1).max(40);
const AskBody = z
  .object({
    q: z.string().trim().min(1).max(500),
    threadId: Id.optional().describe('Continue this conversation; omit to start a new one.'),
    packageId: Id.optional().describe('The open package, given to the model as a citable passage (id `pkg`).'),
  })
  .openapi('AskRequest');
const KeptClaim = z
  .object({
    text: z.string(),
    cite: z.array(z.string()),
    support: z.number(),
    kept: z.boolean().describe('support ≥ supportMin; removed claims are shown struck out'),
    reason: z.enum(['no valid citation', 'number not in passage', 'below threshold']).optional(),
  })
  .openapi('KeptClaim');
const AskTurn = z
  .object({
    q: z.string(),
    standalone: z.string().describe('The question as searched: rewritten to stand alone when it was a follow-up.'),
    mode: z.enum(['llm', 'prepared']).describe('`prepared` when the live model was not configured or not available.'),
    model: z.string().optional(),
    notice: z.string().optional(),
    outOfScope: z.boolean().optional(),
    claims: z.array(KeptClaim),
    steps: z.array(Step),
    pkg: z.object({ name: z.string(), text: z.string() }).optional().describe('The package passage exactly as the claims were checked against it.'),
    at: z.string().describe('ISO time'),
  })
  .openapi('AskTurn');
const AskThread = z.object({ id: z.string(), turns: z.array(AskTurn) }).openapi('AskThread');
const AskResponse = z
  .union([
    z.object({ blocked: z.literal(true), threadId: z.string().optional() }),
    z.object({ blocked: z.literal(false), threadId: z.string(), turn: AskTurn.extend({ index: z.number().int() }), supportMin: z.number() }),
  ])
  .openapi('AskResponse');

export function askRouter(config: Config, model?: AskModel | null): Router {
  const r = Router();
  const live = model !== undefined ? model : config.geminiApiKey ? geminiModel({ apiKey: config.geminiApiKey, model: config.geminiModel }) : null;
  const limits = new AskLimits({ rpm: config.askRpm, daily: config.askDailyLimit });
  const tracer = config.langsmith ? askTracer(config.langsmith) : null;
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
      summary: 'Answer a question from the evidence: retrieve, draft cited claims, verify each one (instruction-like text is refused)',
      tags: ['ask'],
      request: { body: { content: { 'application/json': { schema: AskBody } } } },
      responses: { 200: { description: 'Answer turn, or refusal', schema: AskResponse } },
      problems: [404],
    },
    async (req, res) => {
      // End-to-end tests can ask for a deterministic stand-in model; never outside E2E mode.
      const useFake = config.allowSimulateDown && req.get('x-ask-model') === 'fake';
      res.json(await ask(body(req, AskBody), { model: useFake ? fakeModel() : live, limits: useFake ? null : limits, tracer, log: req.log, requestId: req.requestId }));
    },
  );
  route(
    r,
    {
      method: 'get',
      path: '/v1/ask/threads/:id',
      summary: 'A conversation, with every turn as it was answered',
      tags: ['ask'],
      request: { params: z.object({ id: Id }) },
      responses: { 200: { description: 'Conversation', schema: AskThread } },
      problems: [404],
    },
    async (req, res) => {
      res.json(await getThread(params(req, z.object({ id: Id })).id));
    },
  );
  return r;
}

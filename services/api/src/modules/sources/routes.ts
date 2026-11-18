import { Router } from 'express';
import { z } from 'zod';
import { HttpProblem } from '../../http/problem.js';
import { params } from '../../http/validate.js';
import { route } from '../../openapi/route.js';
import { LayerId, Source } from '../analysis/schemas.js';
import { SourceModel, toSource } from './model.js';

const Id = z.object({ id: z.string().min(1).max(40) });
const SourceIndex = z
  .object({ items: z.array(z.object({ id: z.string(), layer: LayerId, kind: z.string(), title: z.string() })) })
  .openapi('SourceIndex');

export function sourcesRouter(): Router {
  const r = Router();
  route(
    r,
    {
      method: 'get',
      path: '/v1/sources',
      summary: 'The evidence catalogue: what each citation chip shows, in citation-number order',
      tags: ['evidence'],
      responses: { 200: { description: 'Source index', schema: SourceIndex } },
    },
    async (_req, res) => {
      const docs = await SourceModel.find({}, { _id: 1, layer: 1, kind: 1, title: 1 }).sort({ seq: 1 }).lean();
      res.json({ items: docs.map((d) => ({ id: d._id, layer: d.layer, kind: d.kind, title: d.title })) });
    },
  );
  route(
    r,
    {
      method: 'get',
      path: '/v1/sources/:id',
      summary: 'One evidence passage',
      tags: ['evidence'],
      request: { params: Id },
      responses: { 200: { description: 'The passage', schema: Source } },
    },
    async (req, res) => {
      const { id } = params(req, Id);
      const doc = await SourceModel.findById(id).lean();
      if (!doc) throw new HttpProblem(404, 'not-found', `No source ${id}`);
      res.json(toSource(doc));
    },
  );
  return r;
}

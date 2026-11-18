import { Router } from 'express';
import { z } from 'zod';
import { HttpProblem } from '../../http/problem.js';
import { params } from '../../http/validate.js';
import { route } from '../../openapi/route.js';
import { Road } from '../analysis/schemas.js';
import { RoadModel } from './model.js';

const Id = z.object({ id: z.string().min(1).max(40) });

export function contractsRouter(): Router {
  const r = Router();
  route(
    r,
    {
      method: 'get',
      path: '/v1/contracts/:id/road',
      summary: 'Road alignment and chainage segments for a mapped contract',
      tags: ['contracts'],
      request: { params: Id },
      responses: { 200: { description: 'Road', schema: Road } },
    },
    async (req, res) => {
      const { id } = params(req, Id);
      const doc = await RoadModel.findById(id).lean();
      if (!doc) throw new HttpProblem(404, 'not-found', `No road for contract ${id}`);
      res.json({ ends: doc.ends, cite: doc.cite, lengthKm: doc.lengthKm, segments: doc.segments });
    },
  );
  return r;
}

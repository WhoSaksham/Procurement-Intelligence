import { Router } from 'express';
import { z } from 'zod';
import { HttpProblem } from '../../http/problem.js';
import { route } from '../../openapi/route.js';
import { CONTENT_VIEWS, ContentModel } from './model.js';

const View = z.object({ view: z.enum(CONTENT_VIEWS) });

export function contentRouter(): Router {
  const r = Router();
  route(
    r,
    {
      method: 'get',
      path: '/v1/content/:view',
      summary: 'Illustrative content for a view (package, pipeline, learn)',
      tags: ['content'],
      request: { params: View },
      responses: { 200: { description: 'View content', schema: z.record(z.string(), z.unknown()) } },
    },
    async (req, res) => {
      const parsed = View.safeParse(req.params);
      if (!parsed.success) throw new HttpProblem(404, 'not-found', `No content for ${String(req.params.view)}`);
      const doc = await ContentModel.findById(parsed.data.view).lean();
      if (!doc) throw new HttpProblem(404, 'not-found', `No content for ${parsed.data.view}`);
      res.json(doc.data);
    },
  );
  return r;
}

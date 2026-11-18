import { Router } from 'express';
import { route } from '../../openapi/route.js';
import { Reference } from '../analysis/schemas.js';
import { loadReference } from './service.js';

export function referenceRouter(): Router {
  const r = Router();
  route(
    r,
    {
      method: 'get',
      path: '/v1/reference',
      summary: 'Countries, sectors, methods, layers and defaults for the package editor',
      tags: ['reference'],
      responses: { 200: { description: 'Reference data', schema: Reference } },
    },
    async (_req, res) => {
      res.json(await loadReference());
    },
  );
  return r;
}

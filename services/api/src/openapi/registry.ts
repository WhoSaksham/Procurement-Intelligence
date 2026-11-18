import { extendZodWithOpenApi, OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/** Every route registers its contract here; `npm run openapi` writes the document. */
export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'ApiKey', { type: 'apiKey', in: 'header', name: 'X-API-Key' });

export function openApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Procurement Intelligence API',
      version: '1.0.0',
      description: 'System of record and business logic for Procurement Intelligence. Every /v1 route requires X-API-Key.',
    },
    servers: [{ url: '/' }],
    security: [{ ApiKey: [] }],
  });
}

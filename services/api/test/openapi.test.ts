import { describe, expect, it } from 'vitest';
import { moduleRouters } from '../src/app.js';
import { openApiDocument } from '../src/openapi/registry.js';
import { staleOpenApi } from '../src/openapi/export.js';

type Layer = { route?: { path: string; methods: Record<string, boolean> } };

describe('OpenAPI contract', () => {
  it('every mounted /v1 route is in the document', () => {
    const routers = moduleRouters();
    const doc = openApiDocument();
    const missing: string[] = [];
    for (const router of routers) {
      for (const layer of (router as unknown as { stack: Layer[] }).stack) {
        // The catch-all graph route serves the documented graph paths.
        if (!layer.route || layer.route.path.includes('*')) continue;
        const path = layer.route.path.replace(/\*(\w+)/, '{$1}').replace(/:(\w+)/g, '{$1}');
        for (const m of Object.keys(layer.route.methods)) {
          if (!(doc.paths?.[path] as Record<string, unknown> | undefined)?.[m]) missing.push(`${m.toUpperCase()} ${path}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('openapi document is up to date', () => {
    expect(staleOpenApi()).toBe(false);
  });
});

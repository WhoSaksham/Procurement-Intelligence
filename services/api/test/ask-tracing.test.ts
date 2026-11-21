import { describe, expect, it } from 'vitest';
import { askTracer } from '../src/modules/ask/tracing.js';

describe('askTracer', () => {
  it('sends runs to the agent when one is configured', () => {
    const t = askTracer({ apiKey: 'k', endpoint: 'https://apac.api.smith.langchain.com', agent: { id: 'procurement-intelligence', environment: 'local' } })();
    // LangSmith normalises the environment to upper case.
    expect(t.address).toMatchObject({ kind: 'AGENT', id: 'procurement-intelligence', environment: 'LOCAL' });
    expect(t.projectName).toBeUndefined();
  });

  it('sends runs to the project otherwise', () => {
    const t = askTracer({ apiKey: 'k', project: 'procurement-ask' })();
    expect(t.projectName).toBe('procurement-ask');
    expect(t.address).toBeUndefined();
  });

  it('reuses one LangSmith client', () => {
    const make = askTracer({ apiKey: 'k', project: 'p' });
    expect(make().client).toBe(make().client);
  });
});

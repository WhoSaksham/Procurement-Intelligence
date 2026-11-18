import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('uses dev keys outside production', () => {
    const c = loadConfig({});
    expect(c.apiKey).toBe('dev-key');
    expect(c.graphApiKey).toBe('dev-key');
  });

  it('refuses to start in production without API_KEY or GRAPH_API_KEY', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', GRAPH_API_KEY: 'g' })).toThrow(/API_KEY/);
    expect(() => loadConfig({ NODE_ENV: 'production', API_KEY: 'a' })).toThrow(/GRAPH_API_KEY/);
    expect(() => loadConfig({ NODE_ENV: 'production', API_KEY: '', GRAPH_API_KEY: 'g' })).toThrow(/API_KEY/);
    expect(loadConfig({ NODE_ENV: 'production', API_KEY: 'a', GRAPH_API_KEY: 'g' }).apiKey).toBe('a');
  });
});

import { describe, expect, it } from 'vitest';
import { apiKeyFrom } from '@/lib/api/proxy';

describe('API key for the pass-through route', () => {
  it('uses the configured key', () => {
    expect(apiKeyFrom({ API_KEY: 'k', NODE_ENV: 'production' })).toBe('k');
  });
  it('falls back to dev-key only outside production', () => {
    expect(apiKeyFrom({ NODE_ENV: 'development' })).toBe('dev-key');
    expect(apiKeyFrom({ NODE_ENV: 'production' })).toBeUndefined();
    expect(apiKeyFrom({ NODE_ENV: 'production', API_KEY: '' })).toBeUndefined();
  });
});

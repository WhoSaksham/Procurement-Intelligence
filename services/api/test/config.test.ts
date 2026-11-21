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

  it('ask defaults', () => {
    const c = loadConfig({});
    expect(c.geminiApiKey).toBeUndefined();
    expect(c.geminiModel).toBe('gemini-3.5-flash-lite');
    expect(c.askRpm).toBe(5);
    expect(c.askDailyLimit).toBe(100);
    expect(c.langsmith).toBeNull();
    expect(loadConfig({ GEMINI_API_KEY: '' }).geminiApiKey).toBeUndefined();
    expect(loadConfig({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'm', ASK_RPM: '2', ASK_DAILY_LIMIT: '9' })).toMatchObject({
      geminiApiKey: 'g',
      geminiModel: 'm',
      askRpm: 2,
      askDailyLimit: 9,
    });
  });

  it('langsmith needs tracing and a key', () => {
    expect(loadConfig({ LANGSMITH_TRACING: 'true' }).langsmith).toBeNull();
    expect(loadConfig({ LANGSMITH_API_KEY: 'k' }).langsmith).toBeNull();
    expect(loadConfig({ LANGSMITH_TRACING: 'true', LANGSMITH_API_KEY: 'k' }).langsmith).toEqual({ apiKey: 'k', project: 'procurement-ask' });
    expect(loadConfig({ LANGSMITH_TRACING: 'true', LANGSMITH_API_KEY: 'k', LANGSMITH_PROJECT: 'p', LANGSMITH_ENDPOINT: 'https://eu.example' }).langsmith).toEqual({
      apiKey: 'k',
      project: 'p',
      endpoint: 'https://eu.example',
    });
  });

  it('langsmith traces to an agent when LANGSMITH_AGENT_ID and LANGSMITH_AGENT_ENVIRONMENT are set', () => {
    const on = { LANGSMITH_TRACING: 'true', LANGSMITH_API_KEY: 'k', LANGSMITH_ENDPOINT: 'https://apac.api.smith.langchain.com' };
    expect(loadConfig({ ...on, LANGSMITH_AGENT_ID: 'procurement-intelligence', LANGSMITH_AGENT_ENVIRONMENT: 'local' }).langsmith).toEqual({
      apiKey: 'k',
      endpoint: 'https://apac.api.smith.langchain.com',
      agent: { id: 'procurement-intelligence', environment: 'local' },
    });
    // An agent and a project are different destinations; the agent wins (LangSmith refuses both).
    expect(loadConfig({ ...on, LANGSMITH_PROJECT: 'p', LANGSMITH_AGENT_ID: 'a', LANGSMITH_AGENT_ENVIRONMENT: 'production' }).langsmith).not.toHaveProperty('project');
  });

  it('a half or malformed agent address is a startup error', () => {
    const on = { LANGSMITH_TRACING: 'true', LANGSMITH_API_KEY: 'k' };
    expect(() => loadConfig({ ...on, LANGSMITH_AGENT_ID: 'a' })).toThrow(/LANGSMITH_AGENT_ENVIRONMENT/);
    expect(() => loadConfig({ ...on, LANGSMITH_AGENT_ENVIRONMENT: 'local' })).toThrow(/LANGSMITH_AGENT_ID/);
    expect(() => loadConfig({ ...on, LANGSMITH_AGENT_ID: 'Bad_Id', LANGSMITH_AGENT_ENVIRONMENT: 'local' })).toThrow(/LANGSMITH_AGENT_ID/);
    expect(() => loadConfig({ ...on, LANGSMITH_AGENT_ID: 'a', LANGSMITH_AGENT_ENVIRONMENT: 'qa' })).toThrow(/LANGSMITH_AGENT_ENVIRONMENT/);
  });

  it('production does not require a Gemini key', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', API_KEY: 'a', GRAPH_API_KEY: 'b' })).not.toThrow();
  });
});

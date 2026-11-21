import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { AgentAddress, Client } from 'langsmith';
import type { LangSmithConfig } from '../../config.js';

/**
 * A factory for LangSmith tracers. Runs go to the configured agent (LANGSMITH_AGENT_ID and
 * LANGSMITH_AGENT_ENVIRONMENT) or else to the project. One client is shared by every run;
 * a tracer is made per run because it holds that run's state.
 */
export function askTracer(cfg: LangSmithConfig, opts: { projectSuffix?: string } = {}): () => LangChainTracer {
  const client = new Client({ apiKey: cfg.apiKey, ...(cfg.endpoint ? { apiUrl: cfg.endpoint } : {}) });
  const destination = cfg.agent
    ? { address: new AgentAddress(cfg.agent.id, cfg.agent.environment as ConstructorParameters<typeof AgentAddress>[1]) }
    : { projectName: `${cfg.project ?? 'procurement-ask'}${opts.projectSuffix ?? ''}` };
  return () => new LangChainTracer({ client, ...destination });
}

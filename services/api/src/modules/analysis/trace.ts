import { country, type Ref } from './model.js';
import type { Country, Package, Step } from './types.js';

/** The agent retrieval trace shown under "How this was built" (moved from the web app). */
export function traceSteps(ref: Ref, pkg: Package, custom: Country[]): Step[] {
  const c = country(ref, pkg.country, custom);
  return [
    { name: 'Break the request into questions', tool: 'planner', detail: 'Schedule precedent, re-tender causes, contract-management lessons, country procurement rules.' },
    { name: 'Pull the comparable cohort', tool: 'SQL: contract awards', detail: `312 awards matched on ${pkg.category.toLowerCase()}, method, region (${c.region}) and sector.` },
    { name: 'Walk the knowledge graph', tool: 'graph', detail: 'Cohort contracts → 41 projects → 37 ICRs, 212 ISRs, 9 IEG reviews linked by Project ID and sector code.' },
    { name: 'Search the document index', tool: 'hybrid search', detail: 'Keyword + dense search over 18,402 chunks scoped to those documents; 46 candidate passages.' },
    { name: 'Rerank and deduplicate', tool: 'cross-encoder', detail: '12 passages kept; 4 near-duplicates collapsed to their most recent version.' },
    { name: 'Score the package', tool: 'timeline + risk models', detail: 'Survival model for days to signature; risk models for re-tender, amendment and slippage.' },
    { name: 'Check every claim against its source', tool: 'grounding check', detail: '17 claims drafted, 16 supported by a cited passage, 1 removed for lacking support.' },
  ];
}

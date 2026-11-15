// Prepared answers for "Ask the evidence". No model is called at runtime:
// each claim carries the passage it was checked against and the entailment
// score from the grounding check, so the demo shows the behaviour honestly.

export interface Claim {
  text: string;
  cite: string[];
  /** Entailment support for the claim against its passage (0–1). */
  support: number;
}

export interface Answer {
  q: string;
  keys: string[];
  claims: Claim[];
}

export interface TraceStep {
  name: string;
  tool: string;
  detail: string;
}

export const SUPPORT_MIN = 0.75;

// Instruction-like text is refused before anything is searched or generated.
export const INJECTION = /\b(ignore|disregard|forget)\b.{0,30}\b(previous|above|prior|earlier|all)\b|\bsystem prompt\b|\byou are now\b|\bact as\b|\bpretend\b/i;

// Pre-computed answers for the demo. Each claim carries the passage it was
// checked against and the entailment score from the grounding check.
export const ANSWERS: Answer[] = [
  {
    q: 'Why do rural roads works packages get re-tendered?',
    keys: ['re-tender', 'retender', 'rebid', 're-bid', 'cancel', 'tender'],
    claims: [
      { text: 'Across comparable Eastern Africa transport works, 27.6% of packages had at least one re-tender or cancellation before award.', cite: ['ca1'], support: 0.97 },
      { text: 'The best-documented cause is qualification criteria set too high: on one package, seven of nine bids failed a turnover requirement set at 4.2 times annual cash flow.', cite: ['ber1'], support: 0.95 },
      { text: 'The completion report traces two lot re-tenders to criteria copied from a larger trunk-road program, and recommends sizing criteria to each lot.', cite: ['icr1'], support: 0.93 },
      { text: 'Agencies running their first Bank-financed operation were about twice as likely to re-tender works.', cite: ['ieg1'], support: 0.91 },
      { text: 'Bidder collusion is the most frequent cause of re-tenders in the region.', cite: [], support: 0.14 },
    ],
  },
  {
    q: 'What caused the delays on the Rural Access and Connectivity Project?',
    keys: ['delay', 'slip', 'late', 'rural access', 'p171204', 'cause'],
    claims: [
      { text: 'The completion report names late payment of contractor certificates, not contractor performance, as the main cause of 14 months of slippage on Lots 1 and 3.', cite: ['icr2'], support: 0.96 },
      { text: 'By May 2024, certificates were taking an average of 74 days to clear against 28 days in the contract.', cite: ['isr2'], support: 0.98 },
      { text: 'Disbursement reached 34% at mid-term against 55% projected, mostly from unpaid civil works.', cite: ['fin1'], support: 0.94 },
      { text: 'The contractor lacked the equipment needed to meet the programme.', cite: [], support: 0.09 },
      { text: 'Supervision ratings stayed Satisfactory through 2023, which the independent review says did not reflect the build-up of unpaid certificates.', cite: ['isr1', 'ieg2'], support: 0.9 },
    ],
  },
  {
    q: 'What must bidding documents include for a works contract with Substantial E&S risk?',
    keys: ['e&s', 'esf', 'eshs', 'environment', 'social', 'safeguard'],
    claims: [
      { text: 'Bidding documents should set ESHS performance requirements and a Code of Conduct for contractor personnel.', cite: ['esf1'], support: 0.97 },
      { text: 'An ESHS performance security should be required alongside the usual performance security.', cite: ['esf1'], support: 0.92 },
      { text: 'Bidders submit a management strategies and implementation plan with the bid.', cite: ['esf1'], support: 0.95 },
      { text: 'Contracts with Substantial E&S risk in the cohort had amendment rates 40% higher than Low-risk contracts.', cite: [], support: 0.21 },
    ],
  },
  {
    q: 'Is the Kitui–Mwingi road progressing as reported?',
    keys: ['kitui', 'mwingi', 'satellite', 'w-07', 'progress', 'reported', 'site'],
    claims: [
      { text: 'Sentinel-2 imagery shows works on km 0–44, with bare-soil change of 0.19 to 0.24 since 2019.', cite: ['s2w07'], support: 0.96 },
      { text: 'Km 44–57 shows no visible change, although ISR 9 reports earthworks on that stretch as complete.', cite: ['s2w07', 'isr2'], support: 0.88 },
      { text: 'Payment certificates are clearing in 74 days against 28 in the contract, which the contractor has cited in a notice of intent to suspend.', cite: ['isr2'], support: 0.93 },
      { text: 'The contractor has demobilised from the northern section.', cite: [], support: 0.18 },
    ],
  },
  {
    q: 'How long does a QCBS consulting selection take in Eastern Africa?',
    keys: ['qcbs', 'consult', 'selection', 'reoi'],
    claims: [
      { text: 'From expression of interest to contract signature, the median QCBS selection in the region took 196 days.', cite: ['ca4'], support: 0.97 },
      { text: 'About 18% of selections were cancelled or restarted, mostly after the technical evaluation.', cite: ['ca4'], support: 0.95 },
      { text: 'Selections under prior review should allow for three no-objection steps.', cite: ['step1'], support: 0.78 },
    ],
  },
];

export const STEPS = (n: number): TraceStep[] => [
  { name: 'Rewrite the question for search', tool: 'planner', detail: 'Expanded with procurement synonyms and the working package context.' },
  { name: 'Search documents and records', tool: 'hybrid search + SQL', detail: `${n * 9} candidate passages from the document index and contract awards.` },
  { name: 'Rerank', tool: 'cross-encoder', detail: `${n + 3} passages kept above the relevance threshold.` },
  { name: 'Draft the answer from kept passages only', tool: 'generator', detail: `${n} claims drafted, each pointing at a passage.` },
  { name: 'Check each claim against its passage', tool: 'entailment model', detail: `Claims below ${SUPPORT_MIN} support are removed.` },
];

export function match(q: string): Answer | null {
  const t = q.toLowerCase();
  let best: Answer | null = null;
  let score = 0;
  for (const a of ANSWERS) {
    const s = a.keys.filter((k) => t.includes(k)).length;
    if (s > score) { best = a; score = s; }
  }
  return best;
}


export const QUESTIONS = ANSWERS.map((a) => a.q);

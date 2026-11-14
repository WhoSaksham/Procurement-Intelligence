import { useEffect, useState } from 'react';
import AgentTrace from '../components/AgentTrace.jsx';
import { Cite } from '../components/Evidence.jsx';
import { Collapse, PageHead } from '../components/ui.jsx';

const SUPPORT_MIN = 0.75;

// Pre-computed answers for the demo. Each claim carries the passage it was
// checked against and the entailment score from the grounding check.
const ANSWERS = [
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

export const QUESTIONS = ANSWERS.map((a) => a.q);

const STEPS = (n) => [
  { name: 'Rewrite the question for search', tool: 'planner', detail: 'Expanded with procurement synonyms and the working package context.' },
  { name: 'Search documents and records', tool: 'hybrid search + SQL', detail: `${n * 9} candidate passages from the document index and contract awards.` },
  { name: 'Rerank', tool: 'cross-encoder', detail: `${n + 3} passages kept above the relevance threshold.` },
  { name: 'Draft the answer from kept passages only', tool: 'generator', detail: `${n} claims drafted, each pointing at a passage.` },
  { name: 'Check each claim against its passage', tool: 'entailment model', detail: `Claims below ${SUPPORT_MIN} support are removed.` },
];

function match(q) {
  const t = q.toLowerCase();
  let best = null, score = 0;
  for (const a of ANSWERS) {
    const s = a.keys.filter((k) => t.includes(k)).length;
    if (s > score) { best = a; score = s; }
  }
  return best;
}

export default function Ask({ question }) {
  const [input, setInput] = useState('');
  const [asked, setAsked] = useState(null);
  const [running, setRunning] = useState(false);

  const ask = (q) => {
    if (!q.trim()) return;
    setInput(q);
    setAsked({ q, answer: match(q), at: Date.now() });
    setRunning(true);
  };

  // Questions can arrive from the command menu.
  useEffect(() => {
    if (question?.q) ask(question.q);
  }, [question]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = asked?.answer;
  const kept = a?.claims.filter((c) => c.support >= SUPPORT_MIN) ?? [];
  const dropped = a?.claims.filter((c) => c.support < SUPPORT_MIN) ?? [];

  return (
    <div className="ask">
      <PageHead title="Ask the evidence" lede="Answers come only from indexed records and documents, and every sentence is checked against its source." />

      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <span className="ask-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a project, method or risk"
            aria-label="Your question"
          />
          <button type="submit" className="btn-primary" disabled={running || !input.trim()}>Ask</button>
        </span>
        {!asked && (
          <div className="suggestions">
            {ANSWERS.map((x) => (
              <button key={x.q} type="button" className="chip" onClick={() => ask(x.q)}>{x.q}</button>
            ))}
          </div>
        )}
      </form>

      {asked && (
        <section className="panel answer-panel">
          {running ? (
            <AgentTrace key={asked.q + asked.at} steps={STEPS(a?.claims.length ?? 0)} running stepMs={200} onDone={() => setRunning(false)} />
          ) : a ? (
            <>
              <div className="answer">
                {kept.map((c) => (
                  <p key={c.text}>{c.text}<Cite ids={c.cite} /></p>
                ))}
              </div>
              <Collapse summary={`${kept.length} of ${a.claims.length} sentences verified${dropped.length ? `, ${dropped.length} removed` : ''}`}>
                <ul className="grounding">
                  {a.claims.map((c) => {
                    const ok = c.support >= SUPPORT_MIN;
                    return (
                      <li key={c.text} className={ok ? 'kept' : 'dropped'}>
                        <span className="ground-score">
                          <span className="ground-bar"><span style={{ width: `${c.support * 100}%` }} /></span>
                          {c.support.toFixed(2)}
                        </span>
                        <span className="ground-status">{ok ? 'Kept' : 'Removed'}</span>
                        <span className="ground-text">
                          {c.text}
                          {ok ? <Cite ids={c.cite} /> : <span className="muted small"> No passage supports this.</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="fine">
                  Support is the probability that the cited passage states the claim; threshold {SUPPORT_MIN}. Numbers
                  must also match the passage exactly. Removed sentences are logged for review.
                </p>
              </Collapse>
            </>
          ) : (
            <div className="empty">
              <p><strong>No grounded answer.</strong> Nothing in the index supports an answer above the relevance threshold, so none is given.</p>
              <p className="muted">Name a project, method or risk, or try one of these:</p>
              <div className="suggestions">
                {ANSWERS.map((x) => (
                  <button key={x.q} type="button" className="chip" onClick={() => ask(x.q)}>{x.q}</button>
                ))}
              </div>
            </div>
          )}
          {!running && (
            <button type="button" className="link new-q" onClick={() => { setAsked(null); setInput(''); }}>Ask something else</button>
          )}
        </section>
      )}
    </div>
  );
}

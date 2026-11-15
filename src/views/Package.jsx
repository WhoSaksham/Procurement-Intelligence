import { useEffect, useMemo, useState } from 'react';
import AgentTrace from '../components/AgentTrace.jsx';
import {
  BenchmarkBullets, ComparablesStrip, DisbursementPeers, DriverBars, DurationCurve, HBars, MethodRange,
  MilestoneChart, ProgressCurve, RatingChart,
} from '../components/charts.jsx';
import { Cite, useEvidence } from '../components/Evidence.jsx';
import { Collapse, PageHead, Tabs } from '../components/ui.jsx';
import { DEFAULT_CRITERIA, ISR_HISTORY } from '../data/reference.js';
import { benchmarkDays, cohortSample, comparables, compareMethods, country, pct, predict, riskLevel } from '../lib/model.js';
import { recommendations } from '../lib/recommend.js';

const RISKS = [
  { key: 'rebid', name: 'Re-tender', cite: ['ca1', 'ieg1'] },
  { key: 'amend', name: 'Amendment >10%', cite: ['ca2', 'icr3'] },
  { key: 'slip', name: 'Slippage >6 months', cite: ['icr2', 'fin1'] },
];

const PRECEDENTS = [
  { name: 'Rural Access and Connectivity Project, Lot 2 works', id: 'P171204', match: 0.91, why: 'Same agency, sector and method; US$14.2M', outcome: 'Re-tendered once (+143 days); amended +19%', cite: ['ber1', 'ca2', 'icr1'] },
  { name: 'Feeder Roads and Market Access Project, Package W3', id: 'P165530', match: 0.84, why: 'Rural roads, open international RFB, US$11.0M', outcome: 'Signed in 171 days; variation orders 17%', cite: ['icr3'] },
  { name: 'Rural transport portfolio, 23 operations', id: 'IEG review', match: 0.78, why: 'Thematic evaluation covering this agency type', outcome: 'First-time agencies 2.1× more likely to re-tender', cite: ['ieg1'] },
];

const PAST_SPECS = [
  { title: 'Rural roads Lot 2 (2020)', sim: 0.88, result: 'Re-tendered; turnover criterion excluded 7 of 9 bidders', cite: ['ber1'] },
  { title: 'Rural roads Lots 4–6 (2021)', sim: 0.86, result: 'Awarded first time; 17 bids; criteria sized per lot', cite: ['icr1', 'ca3'] },
  { title: 'Feeder roads W3 (2019)', sim: 0.79, result: 'Awarded; drainage variations of 17% later', cite: ['icr3'] },
];

// Evidence weighting for the ISR vs ICR disagreement on the parent project.
const CONFLICT = [
  { src: 'isr1', label: 'ISR 7, June 2023', says: 'Satisfactory', authority: 0.6, independence: 0.4, hindsight: 0.5, corroboration: 0.3 },
  { src: 'icr2', label: 'ICR, February 2025', says: 'Moderately Unsatisfactory', authority: 0.8, independence: 0.6, hindsight: 1, corroboration: 0.9 },
  { src: 'ieg2', label: 'IEG review, September 2025', says: 'Moderately Unsatisfactory', authority: 1, independence: 1, hindsight: 1, corroboration: 0.9 },
  { src: 'fin1', label: 'Disbursement feed, 2024', says: '34% disbursed vs 55% planned', authority: 0.9, independence: 1, hindsight: 0.7, corroboration: 0.9 },
];
const weight = (r) => r.authority * r.independence * r.hindsight * r.corroboration;

// Parent project P171204 disbursement against similar rural transport projects.
const S = (m, c, k = 9) => Math.round(100 / (1 + Math.exp(-(m - c) / k)));
const PEERS = Array.from({ length: 13 }, (_, i) => i * 6).map((m) => ({ m, p25: S(m, 33), p50: S(m, 27.5), p75: S(m, 22) }));
const ACTUAL = Array.from({ length: 11 }, (_, i) => i * 3).map((m) => ({ m, v: S(m, 36) }));

// Winners of comparable awards (firm names illustrative).
const WINNERS = [
  { label: 'Meridian Roadworks Ltd', note: 'domestic', v: 9 },
  { label: 'Tana Civil Contractors', note: 'domestic', v: 7 },
  { label: 'Highland Paving Co.', note: 'domestic', v: 6 },
  { label: 'Rift Valley Engineering', note: 'domestic', v: 5 },
  { label: 'Sahel Road Builders JV', note: 'foreign', v: 4, tone: 'alt' },
  { label: 'Coastal Infrastructure Group', note: 'foreign', v: 3, tone: 'alt' },
  { label: '31 other firms', v: 21, tone: 'quiet' },
];

const ICON = { flag: '!', watch: '?' };
const LEVEL = { high: 'High', medium: 'Medium', low: 'Low' };
const warnLevel = (w) => (w >= 0.6 ? 'high' : w >= 0.3 ? 'medium' : 'low');

function traceSteps(pkg) {
  const c = country(pkg.country);
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

function StageHead({ n, title, status, tone }) {
  return (
    <header className="stage-head">
      <span className="stage-num">{n}</span>
      <h2>{title}</h2>
      <span className={`chip-status tone-${tone}`}>{status}</span>
    </header>
  );
}

function Num({ label, k, criteria, set, ...rest }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" value={criteria[k]} onChange={set(k)} {...rest} />
    </label>
  );
}

const EMPTY_CONTRACT = { title: '', supplier: '', value: 5, signed: '2024-07', planned: 50, actual: 40, paymentDays: 30 };

export default function Package(props) {
  const { pkg, setPkg, criteria, setCriteria, check, result, go, contract, setContract, fixCriteria, applyP80, best, portfolio, addContract, removeContract, focus, signoff, setSignoff } = props;
  const [signing, setSigning] = useState(false);
  const [signer, setSigner] = useState('');
  const brief = JSON.stringify({ pkg, criteria });
  const changedSince = signoff && signoff.brief !== brief;
  const cohort = comparables(pkg);
  const bench = benchmarkDays(pkg);
  const { setOpen } = useEvidence();
  const [openRec, setOpenRec] = useState(null);
  const [showAllRecs, setShowAllRecs] = useState(false);
  const [openIssue, setOpenIssue] = useState(null);
  const [draft, setDraft] = useState(EMPTY_CONTRACT);

  const sample = useMemo(() => cohortSample(pkg), [pkg]);
  const options = useMemo(() => compareMethods(pkg, check.stringency), [pkg, check.stringency]);
  const recs = useMemo(() => recommendations(pkg, result), [pkg, result]);
  const atBenchmark = useMemo(() => predict(pkg, 0), [pkg]);
  const onTime = result.cdf(pkg.plannedDays);
  const c = country(pkg.country);

  const issues = check.findings.filter((f) => f.status !== 'ok');
  const flags = issues.filter((f) => f.status === 'flag').length;
  const sel = portfolio.find((p) => p.id === contract) ?? portfolio[0];
  const highRisk = portfolio.filter((p) => p.warning >= 0.6).length;

  useEffect(() => {
    if (!focus) return;
    document.getElementById(`stage-${focus.section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  const setCrit = (k) => (e) => {
    const t = e.target;
    setCriteria((cr) => ({ ...cr, [k]: t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value }));
  };
  const setDraftField = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  const minDays = pkg.method === 'RFB, open international' ? 42 : 21;
  const bullets = [
    { label: 'Turnover, × annual cash flow', value: criteria.turnover / check.annualCash, lo: 1.5, hi: 2.5, max: 5, fmt: (v) => `${v.toFixed(1)}×` },
    { label: 'Similar contracts required', value: criteria.similarContracts, lo: 0, hi: 2, max: 5, fmt: (v) => `${Math.round(v)}` },
    { label: 'Each similar contract, % of value', value: criteria.similarValuePct, lo: 0, hi: 80, max: 150, fmt: (v) => `${Math.round(v)}%` },
    { label: 'Bid security, % of value', value: criteria.bidSecurityPct, lo: 1, hi: 2, max: 5, fmt: (v) => `${v}%` },
    { label: 'Submission period, days', value: criteria.submissionDays, lo: minDays, hi: 90, max: 90, fmt: (v) => `${Math.round(v)}` },
  ];

  const total = CONFLICT.reduce((s, r) => s + weight(r), 0);
  const forUnsat = CONFLICT.filter((r) => r.src !== 'isr1').reduce((s, r) => s + weight(r), 0);

  return (
    <div className="package">
      <PageHead title="Package" lede="Plan, tender and execution for this package on one page. Edit any field in the bar above and everything updates.">
        <div className={`signoff${signoff && !changedSince ? ' is-signed' : ''}`}>
          {signing ? (
            <form className="signoff-form" onSubmit={(e) => {
              e.preventDefault();
              if (!signer.trim()) return;
              setSignoff({ name: signer.trim(), at: new Date().toISOString(), brief });
              setSigning(false);
            }}>
              <input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Your name" aria-label="Your name" autoFocus />
              <button type="submit" className="btn-primary">Sign off</button>
              <button type="button" className="btn-secondary" onClick={() => setSigning(false)}>Cancel</button>
            </form>
          ) : (
            <>
              <p className="signoff-state">
                {!signoff && <><strong>Draft.</strong> Not signed off</>}
                {signoff && !changedSince && <><strong>Signed off</strong> by {signoff.name}, {new Date(signoff.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</>}
                {changedSince && <><strong>Changed</strong> since {signoff.name} signed off</>}
              </p>
              {(!signoff || changedSince) && (
                <button type="button" className="btn-secondary" onClick={() => setSigning(true)}>{signoff ? 'Sign off again' : 'Sign off this brief'}</button>
              )}
            </>
          )}
        </div>
      </PageHead>

      <section className="summary" aria-label="Summary">
        <div className="stat">
          <p className="stat-label">Expected signature</p>
          <p className="stat-value">{Math.round(result.p50)} <small>days</small></p>
          <p className="stat-note">80% sure by {Math.round(result.p80)}<Cite ids={['ca1', 'wgi1']} /></p>
        </div>
        <div className={`stat ${onTime < 0.5 ? 'is-bad' : 'is-good'}`}>
          <label className="stat-label" htmlFor="planned">Your plan</label>
          <p className="stat-value">
            <input id="planned" className="stat-input" type="number" min="10" max="600" value={pkg.plannedDays}
              onChange={(e) => setPkg((p) => ({ ...p, plannedDays: Number(e.target.value) }))} />
            <small>days</small>
          </p>
          <p className="stat-note">
            {pct(onTime)} chance on time
            {pkg.plannedDays < result.p80 && <button type="button" className="link" onClick={applyP80}>Use {Math.round(result.p80)}</button>}
          </p>
        </div>
        {RISKS.map(({ key, name, cite }) => {
          const p = result[key].p;
          return (
            <div key={key} className={`stat risk-${riskLevel(p).toLowerCase()}`}>
              <p className="stat-label">{name}</p>
              <p className="stat-value">{pct(p)}</p>
              <span className="meter" aria-hidden="true"><span style={{ width: `${p * 100}%` }} /></span>
              <p className="stat-note"><span className="level">{riskLevel(p)}</span><Cite ids={cite} /></p>
            </div>
          );
        })}
      </section>

      {c.cpiaImputed && (
        <p className="hint">{c.name} has no CPIA score; a CPIA-equivalent from WGI regulatory quality is used and marked as imputed.<Cite ids={['wgi1']} /></p>
      )}
      {c.custom && (
        <p className="hint">{c.name} uses governance scores you entered (CPIA {c.cpia}, regulatory quality {c.rq}th percentile{c.fcv ? ', fragile setting' : ''}). Edit them under More.</p>
      )}

      <div className="stage-grid">
        <section id="stage-plan" className="panel stage">
          <StageHead n={1} title="Plan" tone={onTime < 0.5 ? 'bad' : 'good'}
            status={onTime < 0.5 ? `${Math.round(result.p80) - pkg.plannedDays} days short` : 'Schedule realistic'} />
          <ComparablesStrip sample={sample} planned={pkg.plannedDays} onPlanned={(d) => setPkg((p) => ({ ...p, plannedDays: d }))} />
          <p className="basis">
            {cohort.widened
              ? <>Only {cohort.close} close comparables, so the cohort is widened to {cohort.n} {pkg.category.toLowerCase()} packages in {c.region}.</>
              : <>Based on {cohort.n} comparable packages.</>}
            {' '}Simple benchmark for this method and category: {Math.round(bench)} days.<Cite ids={['ca1']} />
          </p>
          <h3 className="sub-title">Next actions</h3>
          <ul className="rec-list">
            {(showAllRecs ? recs : recs.slice(0, 4)).map((r, i) => (
              <li key={r.title} className={openRec === i ? 'is-open' : ''}>
                <button type="button" className="rec-toggle" aria-expanded={openRec === i} onClick={() => setOpenRec(openRec === i ? null : i)}>
                  <span className="chev" aria-hidden="true" />{r.title}
                </button>
                <Cite ids={r.cite} />
                {openRec === i && <p className="rec-body">{r.body}</p>}
              </li>
            ))}
          </ul>
          {recs.length > 4 && (
            <button type="button" className="link flush" onClick={() => setShowAllRecs(!showAllRecs)}>
              {showAllRecs ? 'Show fewer' : `Show all ${recs.length}`}
            </button>
          )}
        </section>

        <section id="stage-tender" className="panel stage">
          <StageHead n={2} title="Tender design" tone={flags ? 'bad' : 'good'}
            status={flags ? `${flags} to fix` : 'Criteria in range'} />
          <div className="impact-row">
            <div className="impact">
              <span className="impact-n">{pct(result.rebid.p)}</span>
              <span className="impact-label">re-tender risk<br />{pct(atBenchmark.rebid.p)} at benchmark</span>
            </div>
            <button type="button" className="btn-primary" onClick={fixCriteria} disabled={flags === 0}>
              {flags ? `Apply ${flags} fix${flags > 1 ? 'es' : ''}` : 'All in range'}
            </button>
          </div>
          <BenchmarkBullets rows={bullets} />
          <ul className="issue-list">
            {issues.map((f) => (
              <li key={f.id} className={`status-${f.status}`}>
                <button type="button" className="rec-toggle" aria-expanded={openIssue === f.id} onClick={() => setOpenIssue(openIssue === f.id ? null : f.id)}>
                  <span className="finding-icon" aria-hidden="true">{ICON[f.status]}</span>
                  <span><strong>{f.label}</strong> <span className="muted">{f.value}</span></span>
                </button>
                {openIssue === f.id && <p className="rec-body">{f.advice}<Cite ids={f.cite} /></p>}
              </li>
            ))}
          </ul>
          <Collapse summary="Edit draft criteria">
            <div className="field-grid">
              <Num label="Turnover, US$ M" k="turnover" criteria={criteria} set={setCrit} min="0" step="0.5" />
              <Num label="Bid security, %" k="bidSecurityPct" criteria={criteria} set={setCrit} min="0" max="10" step="0.5" />
              <Num label="Similar contracts" k="similarContracts" criteria={criteria} set={setCrit} min="0" max="6" />
              <Num label="Each at least, %" k="similarValuePct" criteria={criteria} set={setCrit} min="0" max="200" step="5" />
              <Num label="Submission, days" k="submissionDays" criteria={criteria} set={setCrit} min="7" max="120" />
              <Num label="Validity, days" k="validityDays" criteria={criteria} set={setCrit} min="30" max="240" />
            </div>
            <label className="check">
              <input type="checkbox" checked={criteria.jvAllowed} onChange={setCrit('jvAllowed')} />
              <span>Joint ventures may bid</span>
            </label>
            <label className="field">
              <span className="field-label">Specification extract</span>
              <textarea rows="4" value={criteria.specText} onChange={setCrit('specText')} />
            </label>
            {JSON.stringify(criteria) !== JSON.stringify(DEFAULT_CRITERIA) && (
              <button type="button" className="link flush" onClick={() => setCriteria(DEFAULT_CRITERIA)}>Reset to the original draft</button>
            )}
          </Collapse>
        </section>

        <section id="stage-execution" className="panel stage">
          <StageHead n={3} title="Execution" tone={highRisk ? 'bad' : 'good'}
            status={highRisk ? `${highRisk} contract${highRisk > 1 ? 's' : ''} at high risk` : 'No high-risk contracts'} />
          <ul className="contract-list" role="listbox" aria-label="Contracts">
            {portfolio.map((p) => (
              <li key={p.id} role="option" aria-selected={p.id === sel.id}>
                <button type="button" onClick={() => setContract(p.id)}>
                  <span className="cl-top">
                    <span className="mono-id">{p.id}</span>
                    <span className={`warn warn-${warnLevel(p.warning)}`}>{Math.round(p.warning * 100)}%</span>
                  </span>
                  <span className="cl-title">{p.title}</span>
                  <span className="progress" aria-label={`${p.actual}% done against ${p.planned}% planned`}>
                    <span className="progress-actual" style={{ width: `${p.actual}%` }} />
                    <span className="progress-plan" style={{ left: `${p.planned}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="sel-contract">
            <p className="sel-head">
              <strong>{sel.id}</strong> <span className="muted">{sel.supplier}, US${sel.value}M</span>
            </p>
            <ul className="signals">
              {sel.signals.map((s) => (
                <li key={s.text} className={`signal level-${s.level}`}>
                  <span className="signal-level">{LEVEL[s.level]}</span>
                  <span>{s.text}{s.own ? <span className="tag tag-quiet own">Your data</span> : <Cite ids={s.cite} />}</span>
                </li>
              ))}
            </ul>
            <div className="btn-row">
              {sel.mapped && <button type="button" className="btn-secondary" onClick={() => go('map', sel.id)}>Show on map</button>}
              {sel.custom && <button type="button" className="link flush" onClick={() => removeContract(sel.id)}>Remove this contract</button>}
            </div>
          </div>
          <Collapse summary="Add your own contract">
            <form
              className="add-contract"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.title.trim()) return;
                addContract(draft);
                setDraft(EMPTY_CONTRACT);
              }}
            >
              <label className="field"><span className="field-label">Contract title</span><input value={draft.title} onChange={setDraftField('title')} placeholder="For example: Bridge works, Lot 4" required /></label>
              <label className="field"><span className="field-label">Supplier</span><input value={draft.supplier} onChange={setDraftField('supplier')} /></label>
              <div className="field-grid">
                <label className="field"><span className="field-label">Value, US$ M</span><input type="number" min="0" step="0.1" value={draft.value} onChange={setDraftField('value')} /></label>
                <label className="field"><span className="field-label">Signed</span><input type="month" value={draft.signed} onChange={setDraftField('signed')} /></label>
                <label className="field"><span className="field-label">Payment days</span><input type="number" min="0" value={draft.paymentDays} onChange={setDraftField('paymentDays')} /></label>
                <label className="field"><span className="field-label">Planned, %</span><input type="number" min="0" max="100" value={draft.planned} onChange={setDraftField('planned')} /></label>
                <label className="field"><span className="field-label">Actual, %</span><input type="number" min="0" max="100" value={draft.actual} onChange={setDraftField('actual')} /></label>
              </div>
              <button type="submit" className="btn-primary">Add contract</button>
            </form>
          </Collapse>
        </section>
      </div>

      <section className="panel">
        <Tabs
          tabs={[
            {
              id: 'approach',
              label: 'Market approach',
              content: (
                <>
                  <MethodRange options={options} best={best} />
                  <div className="btn-row">
                    {options.filter((o) => !o.current && !o.limit).map((o) => (
                      <button key={o.method} type="button" className="btn-secondary" onClick={() => setPkg((p) => ({ ...p, method: o.method }))}>Use {o.method}</button>
                    ))}
                  </div>
                </>
              ),
            },
            {
              id: 'curve',
              label: 'Signature curve',
              content: <DurationCurve result={result} sample={sample} planned={pkg.plannedDays} W={1000} H={280} />,
            },
            {
              id: 'drivers',
              label: 'Risk drivers',
              content: (
                <div className="risk-cols">
                  <div>
                    <h3 className="sub-title">Days to signature</h3>
                    <DriverBars drivers={result.timelineDrivers.map((d) => ({ label: d.label, v: d.pct }))} unit="%" />
                  </div>
                  {RISKS.map(({ key, name }) => (
                    <div key={key}>
                      <h3 className="sub-title">{name}</h3>
                      <DriverBars drivers={result[key].drivers.slice(0, 5).map((d) => ({ label: d.label, v: d.pp }))} unit=" pts" />
                    </div>
                  ))}
                </div>
              ),
            },
            {
              id: 'progress',
              label: `Progress, ${sel.id}`,
              content: <ProgressCurve contract={sel} W={1000} H={280} />,
            },
            {
              id: 'milestones',
              label: `Milestones, ${sel.id}`,
              content: sel.milestones.length ? <MilestoneChart milestones={sel.milestones} W={1000} /> : <p className="muted">No milestones recorded for this contract.</p>,
            },
            {
              id: 'disbursement',
              label: 'Disbursement vs peers',
              content: (
                <>
                  <p className="muted small">Parent project P171204 at its mid-term review, against similar rural transport projects at the same age. A gap this size starts a conversation; lumpy payments can explain some of it.<Cite ids={['fin1']} /></p>
                  <DisbursementPeers actual={ACTUAL} peers={PEERS} months={72} W={1000} H={280} />
                </>
              ),
            },
            {
              id: 'winners',
              label: 'Who wins',
              content: (
                <>
                  <p className="muted small">Winners of the {cohort.n} comparable awards. Domestic firms won most lots under US$5M; foreign firms concentrate on larger single-lot packages.<Cite ids={['ca3']} /></p>
                  <HBars rows={WINNERS} unit=" wins" />
                </>
              ),
            },
            {
              id: 'conflict',
              label: 'Evidence conflict',
              count: 1,
              content: (
                <>
                  <p className="muted small">Supervision rated the parent project Satisfactory through 2023; the completion report rates the same period Moderately Unsatisfactory. Click a point to read the source.</p>
                  <RatingChart history={ISR_HISTORY} onPick={setOpen} />
                  <div className="verdict">
                    <p className="verdict-head">Resolved toward Moderately Unsatisfactory, {Math.round((forUnsat / total) * 100)}% of evidence weight</p>
                    <p>The ISR rating is kept as the record of what supervisors believed at the time. The independent review explains the gap: unpaid certificates built up without being reflected in ratings.<Cite ids={['ieg2', 'isr2']} /></p>
                  </div>
                  <div className="weights" aria-label="Evidence weights">
                    {CONFLICT.map((r) => (
                      <div key={r.src} className="weight-row">
                        <span className="w-label">{r.label}<Cite ids={[r.src]} /></span>
                        <span className="w-says">{r.says}</span>
                        <span className="w-track"><span style={{ width: `${(weight(r) / total) * 100}%` }} className={r.src === 'isr1' ? 'is-minor' : ''} /></span>
                        <span className="w-val">{Math.round((weight(r) / total) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  <p className="fine">Weight is authority × independence × hindsight × corroboration. Ratings are never averaged; a side must pass 65% of weight or the question is reported as contested.</p>
                </>
              ),
            },
            {
              id: 'precedents',
              label: 'Precedents',
              count: PRECEDENTS.length,
              content: (
                <>
                  <ul className="precedents">
                    {PRECEDENTS.map((p) => (
                      <li key={p.name}>
                        <div className="precedent-match" aria-label={`Similarity ${Math.round(p.match * 100)}%`}><span style={{ width: `${p.match * 100}%` }} /></div>
                        <p className="precedent-name">{p.name} <span className="muted">{p.id}</span></p>
                        <p className="small muted">{p.why}</p>
                        <p className="precedent-outcome">{p.outcome}<Cite ids={p.cite} /></p>
                      </li>
                    ))}
                  </ul>
                  <h3 className="sub-title past-title">Similar past bidding documents</h3>
                  <ul className="past">
                    {PAST_SPECS.map((s) => (
                      <li key={s.title}><span className="past-sim">{Math.round(s.sim * 100)}%</span><span><strong>{s.title}</strong> {s.result}<Cite ids={s.cite} /></span></li>
                    ))}
                  </ul>
                </>
              ),
            },
            { id: 'trace', label: 'How this was built', content: <AgentTrace steps={traceSteps(pkg)} running={false} /> },
          ]}
        />
      </section>
    </div>
  );
}

import { useMemo } from 'react';
import { Cite } from '../components/Evidence.jsx';
import { Collapse, PageHead } from '../components/ui.jsx';
import { DEFAULT_CRITERIA } from '../data/reference.js';
import { pct, predict } from '../lib/model.js';

const STATUS = {
  flag: { icon: '!', label: 'Outside benchmark' },
  watch: { icon: '?', label: 'Worth a look' },
  ok: { icon: '✓', label: 'In range' },
};

const PAST_SPECS = [
  { title: 'Rural roads Lot 2 (2020)', sim: 0.88, result: 'Re-tendered; turnover criterion excluded 7 of 9 bidders', cite: ['ber1'] },
  { title: 'Rural roads Lots 4–6 (2021)', sim: 0.86, result: 'Awarded first time; 17 bids; criteria sized per lot', cite: ['icr1', 'ca3'] },
  { title: 'Feeder roads W3 (2019)', sim: 0.79, result: 'Awarded; drainage variations of 17% later', cite: ['icr3'] },
];

function Num({ label, k, criteria, set, ...rest }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" value={criteria[k]} onChange={set(k)} {...rest} />
    </label>
  );
}

export default function Design({ pkg, criteria, setCriteria, check, fixCriteria }) {
  const set = (k) => (e) => {
    const t = e.target;
    setCriteria((c) => ({ ...c, [k]: t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value }));
  };

  const withDraft = useMemo(() => predict(pkg, check.stringency), [pkg, check.stringency]);
  const atBenchmark = useMemo(() => predict(pkg, 0), [pkg]);
  const issues = check.findings.filter((f) => f.status !== 'ok');
  const passed = check.findings.filter((f) => f.status === 'ok');
  const flags = issues.filter((f) => f.status === 'flag').length;
  const changed = JSON.stringify(criteria) !== JSON.stringify(DEFAULT_CRITERIA);

  return (
    <div className="design">
      <PageHead title="Tender design" lede="Draft criteria and specifications, checked against bidding guidance and past outcomes.">
        <div className="impact">
          <span className="impact-n">{pct(withDraft.rebid.p)}</span>
          <span className="impact-label">re-tender risk<br />{pct(atBenchmark.rebid.p)} at benchmark</span>
        </div>
        <button type="button" className="btn-primary" onClick={fixCriteria} disabled={flags === 0}>
          {flags ? `Apply ${flags} fix${flags > 1 ? 'es' : ''}` : 'All in range'}
        </button>
      </PageHead>

      <div className="split split-left">
        <form className="panel" onSubmit={(e) => e.preventDefault()}>
          <h2 className="panel-title">Draft criteria</h2>
          <div className="field-grid">
            <Num label="Annual turnover, US$ M" k="turnover" criteria={criteria} set={set} min="0" step="0.5" />
            <Num label="Bid security, %" k="bidSecurityPct" criteria={criteria} set={set} min="0" max="10" step="0.5" />
            <Num label="Similar contracts" k="similarContracts" criteria={criteria} set={set} min="0" max="6" />
            <Num label="Each at least, % of value" k="similarValuePct" criteria={criteria} set={set} min="0" max="200" step="5" />
            <Num label="Submission period, days" k="submissionDays" criteria={criteria} set={set} min="7" max="120" />
            <Num label="Bid validity, days" k="validityDays" criteria={criteria} set={set} min="30" max="240" />
          </div>
          <label className="check">
            <input type="checkbox" checked={criteria.jvAllowed} onChange={set('jvAllowed')} />
            <span>Joint ventures may bid</span>
          </label>
          <label className="field">
            <span className="field-label">Specification extract</span>
            <textarea rows="5" value={criteria.specText} onChange={set('specText')} />
          </label>
          {changed && (
            <button type="button" className="link" onClick={() => setCriteria(DEFAULT_CRITERIA)}>Reset to the original draft</button>
          )}
        </form>

        <section className="panel">
          <h2 className="panel-title">
            {issues.length ? `${issues.length} item${issues.length > 1 ? 's' : ''} to review` : 'Nothing to review'}
          </h2>
          <ul className="findings">
            {issues.map((f) => (
              <li key={f.id} className={`finding status-${f.status}`}>
                <span className="finding-icon" aria-label={STATUS[f.status].label}>{STATUS[f.status].icon}</span>
                <div>
                  <p className="finding-head"><strong>{f.label}</strong> <span className="muted">{f.value}</span></p>
                  <p className="finding-advice">{f.advice}<Cite ids={f.cite} /></p>
                </div>
              </li>
            ))}
          </ul>
          <Collapse summary={`${passed.length} check${passed.length === 1 ? '' : 's'} in range`}>
            <ul className="passed">
              {passed.map((f) => (
                <li key={f.id}><strong>{f.label}</strong> <span className="muted">{f.value}; benchmark {f.benchmark.toLowerCase()}</span></li>
              ))}
            </ul>
          </Collapse>
          <Collapse summary="Similar past bidding documents">
            <ul className="past">
              {PAST_SPECS.map((s) => (
                <li key={s.title}>
                  <span className="past-sim">{Math.round(s.sim * 100)}%</span>
                  <span><strong>{s.title}</strong> {s.result}<Cite ids={s.cite} /></span>
                </li>
              ))}
            </ul>
          </Collapse>
        </section>
      </div>
    </div>
  );
}

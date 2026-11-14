import { useMemo, useState } from 'react';
import AgentTrace from '../components/AgentTrace.jsx';
import { DriverBars, DurationCurve } from '../components/charts.jsx';
import { Cite } from '../components/Evidence.jsx';
import { Collapse, PageHead, Tabs } from '../components/ui.jsx';
import { cohortSample, compareMethods, country, pct, riskLevel } from '../lib/model.js';
import { recommendations } from '../lib/recommend.js';

const PRECEDENTS = [
  {
    name: 'Rural Access and Connectivity Project, Lot 2 works',
    id: 'P171204',
    match: 0.91,
    why: 'Same agency, sector and method; US$14.2M',
    outcome: 'Re-tendered once (+143 days); amended +19%',
    cite: ['ber1', 'ca2', 'icr1'],
  },
  {
    name: 'Feeder Roads and Market Access Project, Package W3',
    id: 'P165530',
    match: 0.84,
    why: 'Rural roads, open international RFB, US$11.0M',
    outcome: 'Signed in 171 days; variation orders 17%',
    cite: ['icr3'],
  },
  {
    name: 'Rural transport portfolio, 23 operations',
    id: 'IEG review',
    match: 0.78,
    why: 'Thematic evaluation covering this agency type',
    outcome: 'First-time agencies 2.1× more likely to re-tender',
    cite: ['ieg1'],
  },
];

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

const RISKS = [
  { key: 'rebid', name: 'Re-tender', cite: ['ca1', 'ieg1'] },
  { key: 'amend', name: 'Amendment >10%', cite: ['ca2', 'icr3'] },
  { key: 'slip', name: 'Slippage >6 months', cite: ['icr2', 'fin1'] },
];

export default function Plan({ pkg, setPkg, check, result, go, applyP80, best }) {
  const [showAll, setShowAll] = useState(false);
  const sample = useMemo(() => cohortSample(pkg), [pkg]);
  const options = useMemo(() => compareMethods(pkg, check.stringency), [pkg, check.stringency]);
  const recs = useMemo(() => recommendations(pkg, result), [pkg, result]);
  const onTime = result.cdf(pkg.plannedDays);
  const c = country(pkg.country);

  return (
    <div className="plan">
      <PageHead title="Plan" lede="Forecast, risks and next steps for this package, drawn from comparable past awards." />

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
            {pkg.plannedDays < result.p80 && (
              <button type="button" className="link" onClick={applyP80}>Use {Math.round(result.p80)}</button>
            )}
          </p>
        </div>
        {RISKS.map(({ key, name, cite }) => {
          const p = result[key].p;
          return (
            <div key={key} className={`stat risk-${riskLevel(p).toLowerCase()}`}>
              <p className="stat-label">{name}</p>
              <p className="stat-value">{pct(p)}</p>
              <p className="stat-note"><span className="level">{riskLevel(p)}</span><Cite ids={cite} /></p>
            </div>
          );
        })}
      </section>

      {c.cpiaImputed && (
        <p className="hint">
          {c.name} has no CPIA score; a CPIA-equivalent from WGI regulatory quality is used and marked as imputed.
          <Cite ids={['wgi1']} />
        </p>
      )}

      <div className="split">
        <section className="panel">
          <h2 className="panel-title">Time to contract signature</h2>
          <DurationCurve result={result} sample={sample} planned={pkg.plannedDays} />
          <Collapse summary="What moves the estimate">
            <DriverBars drivers={result.timelineDrivers.map((d) => ({ label: d.label, v: d.pct }))} unit="%" />
            <p className="fine">Percent change in median duration. Weibull survival model on 41,268 awards, FY2005–FY2025.</p>
          </Collapse>
        </section>

        <section className="panel">
          <h2 className="panel-title">Next actions</h2>
          <ul className="recs">
            {(showAll ? recs : recs.slice(0, 3)).map((r) => (
              <li key={r.title}>
                <p className="rec-title">{r.title}<Cite ids={r.cite} /></p>
                <p className="rec-body">{r.body}</p>
              </li>
            ))}
          </ul>
          {recs.length > 3 && (
            <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${recs.length}`}
            </button>
          )}
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
                  <div className="table-scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Method</th>
                          <th scope="col" className="num">Median days</th>
                          <th scope="col" className="num">P80 days</th>
                          <th scope="col" className="num">Re-tender</th>
                          <th scope="col"><span className="sr-only">Notes</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {options.map((o) => (
                          <tr key={o.method} className={o.current ? 'is-current' : ''}>
                            <th scope="row">{o.method}</th>
                            <td className="num">{Math.round(o.p50)}</td>
                            <td className="num">{Math.round(o.p80)}</td>
                            <td className="num">{pct(o.rebid)}</td>
                            <td className="tags">
                              {o.method === best && <span className="tag tag-good">Best balance</span>}
                              {o.limit && <span className="tag tag-quiet">{o.limit}</span>}
                              {!o.current && !o.limit && (
                                <button type="button" className="link" onClick={() => setPkg((p) => ({ ...p, method: o.method }))}>Use</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="fine">Same package scored under each method. Limits are typical procurement-plan thresholds.</p>
                </>
              ),
            },
            {
              id: 'drivers',
              label: 'Risk drivers',
              content: (
                <div className="risk-cols">
                  {RISKS.map(({ key, name }) => (
                    <div key={key}>
                      <h3 className="sub-title">{name}</h3>
                      <DriverBars drivers={result[key].drivers.slice(0, 4).map((d) => ({ label: d.label, v: d.pp }))} unit=" pts" />
                    </div>
                  ))}
                  {check.stringency > 0.3 && (
                    <p className="hint wide">
                      Re-tender risk includes draft criteria above benchmark.{' '}
                      <button type="button" className="link" onClick={() => go('design')}>Review criteria</button>
                    </p>
                  )}
                </div>
              ),
            },
            {
              id: 'precedents',
              label: 'Precedents',
              count: PRECEDENTS.length,
              content: (
                <ul className="precedents">
                  {PRECEDENTS.map((p) => (
                    <li key={p.name}>
                      <div className="precedent-match" aria-label={`Similarity ${Math.round(p.match * 100)}%`}>
                        <span style={{ width: `${p.match * 100}%` }} />
                      </div>
                      <p className="precedent-name">{p.name} <span className="muted">{p.id}</span></p>
                      <p className="small muted">{p.why}</p>
                      <p className="precedent-outcome">{p.outcome}<Cite ids={p.cite} /></p>
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              id: 'trace',
              label: 'How this was built',
              content: <AgentTrace steps={traceSteps(pkg)} running={false} />,
            },
          ]}
        />
      </section>
    </div>
  );
}

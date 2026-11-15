import { useState } from 'react';
import { Sparkline, TargetBar } from '../components/charts.jsx';
import { PageHead, Tabs } from '../components/ui.jsx';
import { LAYERS } from '../data/sources.js';

const INITIAL_EVENTS = [
  {
    when: '2025-10-28',
    layer: 'retrospective',
    title: 'ICR published: Coastal Water Security Project (P169822)',
    updates: [
      ['Document index', '+212 chunks from 96 pages, 6 tables kept whole'],
      ['Knowledge graph', '+9 lessons linked to 14 contracts by Project ID'],
      ['Conflict check', '1 disagreement with ISR 11 queued for weighting'],
    ],
  },
  {
    when: '2025-10-21',
    layer: 'ledger',
    title: 'Contract amendment: RRA-W-07 extended 120 days',
    updates: [
      ['Early warning', 'RRA-W-07 score 0.64 → 0.71'],
      ['Amendment model', 'New positive label; 312 since last retrain'],
    ],
  },
  {
    when: '2025-10-14',
    layer: 'procedure',
    title: 'ISR 12 filed: Rural Access and Connectivity Project',
    updates: [
      ['Ratings history', 'Procurement rating MU → MS'],
      ['Document index', '+18 chunks; previous ISR kept, marked superseded'],
    ],
  },
];

const INCOMING = [
  {
    layer: 'ledger',
    title: 'Re-tender recorded: Makueni bridges package',
    updates: [
      ['Re-tender model', 'New positive label; cohort statistics refreshed'],
      ['Knowledge graph', 'Package linked to bid evaluation report by notice number'],
      ['Drift monitor', 'Re-tender base rate in AFE works: 27.6% → 27.9%'],
    ],
  },
  {
    layer: 'retrospective',
    title: 'IEG review published: Feeder Roads and Market Access Project',
    updates: [
      ['Document index', '+64 chunks; ICR lessons cross-referenced'],
      ['Conflict check', 'IEG downgrades outcome rating; ICR passages now show the later view'],
    ],
  },
  {
    layer: 'procedure',
    title: 'User feedback: "Recommendation not applicable, works already lotted"',
    updates: [
      ['Recommendation rules', 'Lot-split rule now checks the lots field before firing'],
      ['Evaluation set', 'Added as a negative example for retrieval relevance'],
    ],
  },
];

const HEALTH = [
  { name: 'Timeline model vs simple benchmark, held-out tenders', value: '61 vs 68 days', limit: 'Typical error; must beat the benchmark to ship', ok: true },
  { name: 'Actual signatures inside the 80% range', value: '77%', limit: 'Target 70–90%', ok: true },
  { name: 'Timeline model concordance', value: '0.71', limit: 'Retrain below 0.68', ok: true },
  { name: 'Re-tender model calibration error', value: '0.034', limit: 'Retrain above 0.05', ok: true },
  { name: 'Feature drift, largest (contract value)', value: 'PSI 0.11', limit: 'Review above 0.20', ok: true },
  { name: 'Grounded claims, last 30 days', value: '97.6%', limit: 'Alert below 95%', ok: true },
  { name: 'New labels since last retrain', value: '412', limit: 'Retrain at 500', ok: false },
];

const PHASES = [
  { name: 'Foundations', months: 'Months 0–3', current: false, items: ['Connect contract awards, projects, documents and governance feeds', 'Parse and index 5 years of transport and water documents', 'Agree the evaluation set with 30 procurement specialists'] },
  { name: 'Pilot', months: 'Months 4–9', current: true, items: ['Two regions, transport and water, about 40 users', 'Planning and tender design modules only', 'Every recommendation rated useful or not by the user'] },
  { name: 'Expand', months: 'Months 10–15', current: false, items: ['All sectors in pilot regions; execution monitor live', 'Monthly retraining with champion–challenger testing', 'Integration with the procurement plan tracking system'] },
  { name: 'Scale', months: 'Months 16–24', current: false, items: ['All regions and implementing agencies', 'Feedback loop runs without manual curation', 'Independent audit of grounding and model fairness across countries'] },
];

const KPIS = [
  { name: 'Procurement planning cycle time', base: '21 days', target: '12 days', now: '15 days', series: [21, 20, 18, 17, 16, 15], tgt: 12, better: 'down' },
  { name: 'Retrieval recall of known risk factors', base: '0.52', target: '0.85', now: '0.83', series: [0.52, 0.66, 0.74, 0.79, 0.81, 0.83], tgt: 0.85, better: 'up' },
  { name: 'Retrieval precision at 10', base: '0.41', target: '0.75', now: '0.72', series: [0.41, 0.55, 0.63, 0.68, 0.7, 0.72], tgt: 0.75, better: 'up' },
  { name: 'Re-tender rate, pilot packages', base: '27%', target: '18%', now: '21%', series: [27, 26, 24, 23, 22, 21], tgt: 18, better: 'down' },
  { name: 'Planned vs actual duration error', base: '58%', target: '25%', now: '31%', series: [58, 49, 42, 37, 33, 31], tgt: 25, better: 'down' },
  { name: 'Weekly active users of 40 invited', base: '—', target: '30', now: '27', series: [6, 12, 18, 22, 25, 27], tgt: 30, better: 'up' },
  { name: 'Recommendations rated useful', base: '—', target: '70%', now: '74%', series: [61, 66, 69, 71, 73, 74], tgt: 70, better: 'up' },
];

export default function Learn() {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [next, setNext] = useState(0);

  const simulate = () => {
    if (next >= INCOMING.length) return;
    setEvents((e) => [{ ...INCOMING[next], when: '2025-11-01', fresh: true }, ...e.map((x) => ({ ...x, fresh: false }))]);
    setNext((n) => n + 1);
  };

  return (
    <div className="learn">
      <PageHead title="Learn" lede="New records flow back into the indexes and models. Each event shows exactly what it changed.">
        <button type="button" className="btn-secondary" onClick={simulate} disabled={next >= INCOMING.length}>
          {next >= INCOMING.length ? 'No more sample events' : 'Receive next event'}
        </button>
      </PageHead>

      <section className="panel">
        <Tabs
          tabs={[
            {
              id: 'events',
              label: 'Events',
              count: events.length,
              content: (
                <ol className="events">
                  {events.map((ev) => (
                    <li key={ev.title} className={`event layer-${ev.layer}${ev.fresh ? ' is-fresh' : ''}`}>
                      <p className="event-meta">
                        <span className={`layer-tag layer-${ev.layer}`}>{LAYERS[ev.layer].name}</span>
                        <time>{ev.when}</time>
                      </p>
                      <p className="event-title">{ev.title}</p>
                      <dl className="event-updates">
                        {ev.updates.map(([k, v]) => (
                          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ol>
              ),
            },
            {
              id: 'kpis',
              label: 'Pilot KPIs',
              content: (
                <>
                  <div className="table-scroll">
                    <table className="table kpis">
                      <thead>
                        <tr>
                          <th scope="col">Measure</th>
                          <th scope="col" className="num">Baseline</th>
                          <th scope="col" className="num">Target</th>
                          <th scope="col" className="num">Month 6</th>
                          <th scope="col">Months 1–6</th>
                          <th scope="col">Baseline to target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {KPIS.map((k) => (
                          <tr key={k.name}>
                            <th scope="row">{k.name}</th>
                            <td className="num">{k.base}</td>
                            <td className="num">{k.target}</td>
                            <td className="num"><strong>{k.now}</strong></td>
                            <td><Sparkline values={k.series} target={k.tgt} better={k.better} /></td>
                            <td><TargetBar base={k.series[0]} now={k.series.at(-1)} target={k.tgt} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="fine">
                    Recall and precision are measured on 220 packages where specialists listed the risk factors that
                    actually materialised. The dashed line is the target.
                  </p>
                </>
              ),
            },
            {
              id: 'health',
              label: 'Model health',
              content: (
                <>
                  <ul className="health">
                    {HEALTH.map((h) => (
                      <li key={h.name}>
                        <span className={`health-mark ${h.ok ? 'ok' : 'due'}`} aria-hidden="true">{h.ok ? '✓' : '•'}</span>
                        <span className="health-name">{h.name}</span>
                        <span className="health-value">{h.value}</span>
                        <span className="health-limit">{h.ok ? h.limit : `${h.limit}: retrain scheduled`}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="fine">
                    Updates are ingested within 24 hours, resolved into the graph, re-indexed (changed chunks only),
                    labelled for the risk models, and re-checked against open conflicts. A challenger model replaces the
                    current one only if it wins on the last 12 months of held-out awards and a procurement lead signs off.
                  </p>
                </>
              ),
            },
            {
              id: 'rollout',
              label: 'Rollout',
              content: (
                <ol className="phases">
                  {PHASES.map((p, i) => (
                    <li key={p.name} className={p.current ? 'is-current' : ''}>
                      <p className="phase-n">Phase {i}, {p.months}{p.current && ', in progress'}</p>
                      <p className="phase-name">{p.name}</p>
                      <ul>
                        {p.items.map((it) => <li key={it}>{it}</li>)}
                      </ul>
                    </li>
                  ))}
                </ol>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}

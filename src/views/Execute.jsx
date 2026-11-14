import { MilestoneChart, RatingChart } from '../components/charts.jsx';
import { Cite, useEvidence } from '../components/Evidence.jsx';
import { Collapse, PageHead, Tabs } from '../components/ui.jsx';
import { ISR_HISTORY, PORTFOLIO } from '../data/reference.js';

const LEVEL = { high: 'High', medium: 'Medium', low: 'Low' };
const warnLevel = (w) => (w >= 0.6 ? 'high' : w >= 0.3 ? 'medium' : 'low');

// Evidence weighting for the ISR vs ICR disagreement. Weights are products of
// four factors; the table shows each so the result can be challenged.
const CONFLICT = [
  { src: 'isr1', label: 'ISR 7, June 2023', says: 'Satisfactory', authority: 0.6, independence: 0.4, hindsight: 0.5, corroboration: 0.3 },
  { src: 'icr2', label: 'ICR, February 2025', says: 'Moderately Unsatisfactory', authority: 0.8, independence: 0.6, hindsight: 1, corroboration: 0.9 },
  { src: 'ieg2', label: 'IEG review, September 2025', says: 'Moderately Unsatisfactory', authority: 1, independence: 1, hindsight: 1, corroboration: 0.9 },
  { src: 'fin1', label: 'Disbursement feed, 2024', says: '34% disbursed vs 55% planned', authority: 0.9, independence: 1, hindsight: 0.7, corroboration: 0.9 },
];
const weight = (r) => r.authority * r.independence * r.hindsight * r.corroboration;

export default function Execute({ contract: sel, setContract, go }) {
  const { setOpen } = useEvidence();
  const contract = PORTFOLIO.find((p) => p.id === sel) ?? PORTFOLIO[0];
  const total = CONFLICT.reduce((s, r) => s + weight(r), 0);
  const forUnsat = CONFLICT.filter((r) => r.src !== 'isr1').reduce((s, r) => s + weight(r), 0);

  return (
    <div className="execute">
      <PageHead title="Execution" lede="Contracts under supervision, ranked by the chance of more than six months' slippage." />

      <section className="panel flush">
        <ul className="contracts" role="listbox" aria-label="Contracts">
          {PORTFOLIO.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === contract.id}>
              <button type="button" className="contract-row" onClick={() => setContract(p.id)}>
                <span className="contract-main">
                  <span className="mono-id">{p.id}</span>
                  <span className="contract-title">{p.title}</span>
                </span>
                <span className="contract-progress">
                  <span className="progress" aria-label={`${p.actual}% done against ${p.planned}% planned`}>
                    <span className="progress-actual" style={{ width: `${p.actual}%` }} />
                    <span className="progress-plan" style={{ left: `${p.planned}%` }} />
                  </span>
                  <span className="small muted">{p.actual}% of {p.planned}% planned</span>
                </span>
                <span className={`warn warn-${warnLevel(p.warning)}`}>{Math.round(p.warning * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">{contract.title}</h2>
            <p className="small muted">{contract.supplier}, US${contract.value}M, signed {contract.signed}</p>
          </div>
          {contract.mapped && (
            <button type="button" className="btn-secondary" onClick={() => go('map', contract.id)}>Show on map</button>
          )}
        </div>
        <Tabs
          key={contract.id}
          tabs={[
            {
              id: 'signals',
              label: 'Warning signals',
              count: contract.signals.length,
              content: (
                <ul className="signals">
                  {contract.signals.map((s) => (
                    <li key={s.text} className={`signal level-${s.level}`}>
                      <span className="signal-level">{LEVEL[s.level]}</span>
                      <span>{s.text}<Cite ids={s.cite} /></span>
                    </li>
                  ))}
                </ul>
              ),
            },
            { id: 'milestones', label: 'Milestones', content: <MilestoneChart milestones={contract.milestones} /> },
          ]}
        />
      </section>

      <section className="notice">
        <Collapse summary={<><strong>Conflicting evidence on the parent project.</strong> Supervision rated 2023 Satisfactory; the completion report rates it Moderately Unsatisfactory.</>}>
          <RatingChart history={ISR_HISTORY} onPick={setOpen} />
          <div className="verdict">
            <p className="verdict-head">Resolved toward Moderately Unsatisfactory, {Math.round((forUnsat / total) * 100)}% of evidence weight</p>
            <p>
              The ISR rating is kept as the record of what supervisors believed at the time. The independent review
              explains the gap: unpaid certificates built up without being reflected in ratings.<Cite ids={['ieg2', 'isr2']} />
            </p>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Evidence</th>
                  <th scope="col">Says</th>
                  <th scope="col" className="num">Authority</th>
                  <th scope="col" className="num">Independence</th>
                  <th scope="col" className="num">Hindsight</th>
                  <th scope="col" className="num">Corroboration</th>
                  <th scope="col" className="num">Weight</th>
                </tr>
              </thead>
              <tbody>
                {CONFLICT.map((r) => (
                  <tr key={r.src}>
                    <th scope="row">{r.label}<Cite ids={[r.src]} /></th>
                    <td>{r.says}</td>
                    <td className="num">{r.authority.toFixed(1)}</td>
                    <td className="num">{r.independence.toFixed(1)}</td>
                    <td className="num">{r.hindsight.toFixed(1)}</td>
                    <td className="num">{r.corroboration.toFixed(1)}</td>
                    <td className="num"><strong>{weight(r).toFixed(2)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">
            Claims are compared only on the same project, rating and period. Ratings are never averaged; a side must
            pass 65% of weight or the question is reported as contested. Independent hindsight outranks
            self-assessment, and ledger data breaks ties. The losing view stays visible with its date.
          </p>
        </Collapse>
      </section>
    </div>
  );
}

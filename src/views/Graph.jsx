import { useState } from 'react';
import { Cite } from '../components/Evidence.jsx';
import { PageHead, Tabs } from '../components/ui.jsx';

// Neighbourhood of the working package's closest precedent. Node colour
// follows the evidence layer; grey nodes are shared context.
const NODES = [
  { id: 'KE', type: 'Country', label: 'Kenya', x: 90, y: 70, layer: 'ledger', attrs: { 'CPIA public sector mgmt': '3.6', 'WGI regulatory quality': '38th pct', FCV: 'No' }, cite: ['wgi1'] },
  { id: 'TR', type: 'Sector', label: 'Transport (TR)', x: 90, y: 300, layer: 'context', attrs: { 'Sector code': 'TR · rural and inter-urban roads' } },
  { id: 'RRA', type: 'Agency', label: 'Rural Roads Authority', x: 90, y: 440, layer: 'context', attrs: { 'Prior operations': '2', 'Prior-review contracts': '11' }, cite: ['proj1'] },
  { id: 'P171204', type: 'Project', label: 'P171204 Rural Access', x: 300, y: 190, layer: 'ledger', attrs: { Commitment: 'US$150M', Approved: '2019-06', Closed: '2024-12', 'E&S risk': 'Substantial' }, cite: ['fin1'] },
  { id: 'P165530', type: 'Project', label: 'P165530 Feeder Roads', x: 300, y: 400, layer: 'ledger', attrs: { Commitment: 'US$95M', Approved: '2017-03', Closed: '2023-06' } },
  { id: 'C1', type: 'Contract', label: 'RW-ICB-03 Lot 2', x: 520, y: 70, layer: 'ledger', attrs: { Value: 'US$14.2M → 16.9M', Method: 'RFB, open international', Review: 'Prior' }, cite: ['ca2'] },
  { id: 'S1', type: 'Supplier', label: 'Meridian Roadworks Ltd', x: 760, y: 70, layer: 'ledger', attrs: { 'Canonical ID': 'SUP-004417', Aliases: '3 merged', Awards: '6 in 4 countries' } },
  { id: 'BER', type: 'Bid evaluation', label: 'Evaluation report, Lot 2', x: 520, y: 170, layer: 'procedure', attrs: { Bids: '9 received, 2 responsive', Outcome: 'Re-tendered' }, cite: ['ber1'] },
  { id: 'ISR7', type: 'ISR', label: 'ISR 7 (2023-06)', x: 520, y: 260, layer: 'procedure', attrs: { 'Implementation progress': 'Satisfactory' }, cite: ['isr1'] },
  { id: 'PAD', type: 'PAD', label: 'Appraisal document', x: 300, y: 60, layer: 'retrospective', attrs: { 'Procurement risk': 'Substantial', Pages: '118' }, cite: ['pad1'] },
  { id: 'ICR', type: 'ICR', label: 'Completion report', x: 520, y: 350, layer: 'retrospective', attrs: { 'Implementation rating': 'Moderately Unsatisfactory', Pages: '112', Chunks: '241' }, cite: ['icr2'] },
  { id: 'L1', type: 'Lesson', label: 'Lesson: size criteria per lot', x: 760, y: 250, layer: 'retrospective', attrs: { Location: 'Section V, para 88, p. 41', Topics: 'qualification criteria, lotting' }, cite: ['icr1'] },
  { id: 'L2', type: 'Lesson', label: 'Finding: payment delays', x: 760, y: 350, layer: 'retrospective', attrs: { Location: 'Section III, para 52, p. 27', Topics: 'contract management, counterpart funds' }, cite: ['icr2'] },
  { id: 'IEG', type: 'IEG review', label: 'IEG assessment', x: 760, y: 450, layer: 'retrospective', attrs: { Rating: 'Validates MU' }, cite: ['ieg2'] },
  { id: 'L3', type: 'Lesson', label: 'Lesson: drainage surveys', x: 420, y: 480, layer: 'retrospective', attrs: { Location: 'Section V, para 74, p. 38' }, cite: ['icr3'] },
];

const EDGES = [
  ['P171204', 'KE', 'located in', 'Project ID → country code', 1],
  ['P165530', 'KE', 'located in', 'Project ID → country code', 1],
  ['P171204', 'TR', 'sector', 'Sector code', 1],
  ['P165530', 'TR', 'sector', 'Sector code', 1],
  ['P171204', 'RRA', 'implemented by', 'Agency name, fuzzy match', 0.96],
  ['P165530', 'RRA', 'implemented by', 'Agency name, fuzzy match', 0.93],
  ['PAD', 'P171204', 'appraises', 'Document metadata Project ID', 1],
  ['C1', 'P171204', 'financed by', 'Project ID on award row', 1],
  ['C1', 'S1', 'awarded to', 'Supplier name resolution', 0.94],
  ['BER', 'C1', 'evaluates', 'Notice number + lot + date within 90 days', 0.91],
  ['ISR7', 'P171204', 'supervises', 'Document metadata Project ID', 1],
  ['ICR', 'P171204', 'evaluates', 'Document metadata Project ID', 1],
  ['L1', 'ICR', 'part of', 'Section hierarchy', 1],
  ['L2', 'ICR', 'part of', 'Section hierarchy', 1],
  ['L1', 'C1', 'explains', 'Lot mention + sector code + award within project window', 0.84],
  ['L2', 'ISR7', 'contradicts', 'Same rating dimension and period', 0.88],
  ['IEG', 'ICR', 'validates', 'Project ID + document type', 1],
  ['L3', 'P165530', 'from ICR of', 'Document metadata Project ID', 1],
  ['L3', 'C1', 'similar risk', 'Embedding similarity of BoQ drainage items', 0.79],
];

const SCHEMA = [
  ['Project', 'Project ID', 'Country, sector codes, commitment, E&S risk, status, dates'],
  ['Contract', 'Notice number + lot', 'Value, method, review type, category, signature date, amendments'],
  ['Supplier', 'Canonical supplier ID', 'Name variants, country of registration, award history'],
  ['Document', 'Document ID', 'Type, date, Project ID, version, superseded by'],
  ['Passage', 'Document ID + section path', 'Page, text, table flag, embedding, topics'],
  ['Indicator', 'Country + year + series', 'CPIA cluster scores, WGI percentiles, imputed flag'],
];

const ALIASES = [
  ['MERIDIAN ROAD WORKS LIMITED', '2021 award row', 0.97],
  ['Meridian Rdwks (K) Ltd', '2019 award row', 0.92],
  ['Meridian Roadworks Ltd / Tana Civil JV', '2022 award row, JV lead', 0.89],
];

export default function Graph() {
  const [sel, setSel] = useState('C1');
  const node = NODES.find((n) => n.id === sel);
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const linked = EDGES.filter((e) => e[0] === sel || e[1] === sel);

  return (
    <div className="graph">
      <PageHead title="Knowledge graph" lede="Records and passages joined by shared keys, or by scored matching where no key exists. Select a node." />

      <div className="graph-grid">
        <section className="panel graph-canvas">
          <svg viewBox="0 0 860 510" role="group" aria-label="Knowledge graph around project P171204">
            {EDGES.map(([a, b, rel, , conf]) => {
              const A = byId[a], B = byId[b];
              const on = a === sel || b === sel;
              return (
                <g key={`${a}-${b}`} className={`edge${on ? ' is-on' : ''}${conf < 1 ? ' inferred' : ''}`}>
                  <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} />
                  {on && (
                    <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 5} textAnchor="middle" className="edge-label">{rel}</text>
                  )}
                </g>
              );
            })}
            {NODES.map((n) => (
              <g
                key={n.id}
                className={`node layer-${n.layer}${n.id === sel ? ' is-sel' : ''}`}
                transform={`translate(${n.x},${n.y})`}
                tabIndex="0"
                role="button"
                aria-label={`${n.type}: ${n.label}`}
                aria-pressed={n.id === sel}
                onClick={() => setSel(n.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(n.id))}
              >
                <circle r={n.id === sel ? 11 : 8} />
                <text y="26" textAnchor="middle" className="node-label">{n.label}</text>
                <text y="-16" textAnchor="middle" className="node-type">{n.type}</text>
              </g>
            ))}
          </svg>
          <div className="graph-legend">
            <span><i className="dot layer-ledger" /> Ledger record</span>
            <span><i className="dot layer-procedure" /> Procedure document</span>
            <span><i className="dot layer-retrospective" /> Evaluation or lesson</span>
            <span><i className="dot layer-context" /> Shared context</span>
            <span><i className="lg-line lg-dash" /> Inferred link</span>
          </div>
        </section>

        <section className="panel">
          <p className="muted small">{node.type}</p>
          <h2 className="panel-title">{node.label}{node.cite && <Cite ids={node.cite} />}</h2>
          <dl className="attrs">
            {Object.entries(node.attrs).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <h3 className="sub-title">Links</h3>
          <ul className="links">
            {linked.map(([a, b, rel, method, conf]) => {
              const other = byId[a === sel ? b : a];
              return (
                <li key={`${a}-${b}`}>
                  <button type="button" className="link" onClick={() => setSel(other.id)}>{other.label}</button>
                  <span className="small">{a === sel ? rel : `${rel} (incoming)`}</span>
                  <span className="small muted">{method}</span>
                  <span className={`conf${conf < 1 ? ' inferred' : ''}`}>{conf < 1 ? `Score ${conf.toFixed(2)}` : 'Exact key'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="panel">
        <Tabs tabs={[
          { id: 'schema', label: 'Entities and keys', content: (<>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th scope="col">Entity</th><th scope="col">Key</th><th scope="col">Main attributes</th></tr>
              </thead>
              <tbody>
                {SCHEMA.map(([e, k, a]) => (
                  <tr key={e}><th scope="row">{e}</th><td>{k}</td><td>{a}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Links without a shared key are scored on Project ID mentions in text, sector codes, temporal proximity
            (award date within the document's reporting window) and embedding similarity. Below 0.75 a link is held
            for review instead of being added.
          </p>
          </>) },
          { id: 'names', label: 'Supplier name resolution', content: (<>
          <ul className="aliases">
            {ALIASES.map(([name, where, s]) => (
              <li key={name}>
                <span className="alias-name">{name}</span>
                <span className="small muted">{where}</span>
                <span className="conf inferred">{s.toFixed(2)}</span>
              </li>
            ))}
            <li className="alias-canonical">
              <span className="alias-name">Meridian Roadworks Ltd</span>
              <span className="small">Canonical SUP-004417</span>
            </li>
          </ul>
          <p className="muted small">
            Names are normalised (case, legal suffixes, abbreviations), blocked by country and first token, then scored
            with Jaro–Winkler plus registration number where present. Joint ventures link to each member with a role.
          </p>
          </>) },
        ]} />
      </section>
    </div>
  );
}

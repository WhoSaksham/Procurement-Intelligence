import { useState } from 'react';
import { HBars } from '../components/charts.jsx';
import { PageHead, Tabs } from '../components/ui.jsx';
import { LAYERS } from '../data/sources.js';

const FEEDS = [
  { name: 'Major Contract Awards', layer: 'ledger', format: 'CSV / JSON API', cadence: 'Weekly', records: '214,806 rows', n: 214806, api: 'datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00005', lag: '2 days' },
  { name: 'Projects & Operations', layer: 'ledger', format: 'JSON API', cadence: 'Daily', records: '22,410 projects', n: 22410, api: 'search.worldbank.org/api/v3/projects', lag: '1 day' },
  { name: 'Finances: disbursements and commitments', layer: 'ledger', format: 'CSV / Socrata API', cadence: 'Monthly', records: '1.9M rows', n: 1900000, api: 'datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00001 (IDA), DS00047 (IBRD)', lag: '9 days' },
  { name: 'CPIA and Worldwide Governance Indicators', layer: 'ledger', format: 'Indicators API', cadence: 'Annual', records: '214 countries', n: 214, api: 'api.worldbank.org/v2/country/all/indicator/IQ.CPA.PUBS.XQ, GOV_WGI_RQ.EST', lag: '—' },
  { name: 'Procurement notices and prior-review archive', layer: 'procedure', format: 'HTML / PDF', cadence: 'Daily', records: '96,330 notices', n: 96330, api: 'search.worldbank.org/api/v2/procnotices', lag: '1 day' },
  { name: 'Implementation Status & Results Reports', layer: 'procedure', format: 'PDF', cadence: 'Daily', records: '61,902 reports', n: 61902, api: 'search.worldbank.org/api/v3/wds (docty: ISR)', lag: '3 days' },
  { name: 'Documents & Reports: PADs, ICRs', layer: 'retrospective', format: 'PDF / Word', cadence: 'Daily', records: '38,117 documents', n: 38117, api: 'search.worldbank.org/api/v3/wds (docty: PAD, ICR)', lag: '3 days' },
  { name: 'IEG evaluations and Open Knowledge Repository', layer: 'retrospective', format: 'PDF', cadence: 'Weekly', records: '4,860 documents', n: 4860, api: 'datacatalogapi.worldbank.org/dexapps/fone/api/apiservice?datasetId=DS00053, openknowledge.worldbank.org', lag: '6 days' },
];

const STAGES = [
  { name: 'Extract', detail: 'API pulls with change detection by last-modified date and checksum; PDFs fetched by document ID.' },
  { name: 'Parse', detail: 'Layout-aware parsing keeps headings, page numbers and tables. Scanned pages go through OCR with a confidence score.' },
  { name: 'Normalise', detail: 'Currencies to US$ at award-date rates, dates to ISO, method and category names mapped across policy eras.' },
  { name: 'Resolve', detail: 'Project IDs, notice numbers, supplier names and sector codes linked into the knowledge graph.' },
  { name: 'Chunk and embed', detail: 'Section-aware chunks with their heading path; tables stored whole and as rows.' },
  { name: 'Index', detail: 'Warehouse tables, graph store, and a hybrid keyword + vector index share the same IDs.' },
  { name: 'Validate', detail: 'Row counts, schema checks, link-score audits and a sample of parsed pages reviewed weekly.' },
];

// Tenders and signed contracts share no ID; links are built in three passes,
// strongest evidence first (illustrative counts).
const LINKING = [
  { label: 'Procurement notices (tenders)', v: 8420 },
  { label: 'Pass 1: same package code in both', v: 1540, tone: 'good' },
  { label: 'Pass 2: through the award notice', v: 610, tone: 'good' },
  { label: 'Pass 3: matching description, same project', note: 'calibrated on pass 1: at least 90% precision', v: 290, tone: 'good' },
  { label: 'Linked and timed exactly', v: 2105 },
  { label: 'Linked, still open under 18 months (censored)', v: 335, tone: 'alt' },
  { label: 'No contract found: counted, never guessed', v: 5980, tone: 'quiet' },
];

// Last weekly refresh: each step runs only if the previous one succeeded.
const RUN = [
  { step: 'Ingest notices and awards', min: 3.1, status: 'ok' },
  { step: 'Ingest documents', min: 4.4, status: 'warn', note: '3 scanned PDFs below OCR threshold' },
  { step: 'Ingest finances and indicators', min: 1.2, status: 'ok' },
  { step: 'Resolve and link', min: 1.6, status: 'ok' },
  { step: 'Chunk and embed changed passages', min: 2.2, status: 'ok' },
  { step: 'Backtest and release gate', min: 1.4, status: 'warn', note: 'Candidate tied the benchmark, not promoted' },
  { step: 'Score packages and warnings', min: 0.6, status: 'ok' },
  { step: 'Health checks', min: 0.4, status: 'ok', note: '42 checks, 0 failing, 5 warnings' },
];

const ICR_TREE = [
  { name: 'Data sheet', pages: '1–6', chunks: 9, how: 'Key-value pairs extracted to fields; ratings table kept whole' },
  { name: 'I. Project context and development objectives', pages: '7–12', chunks: 14, how: 'Paragraph chunks, ~400 tokens, 15% overlap' },
  { name: 'II. Outcome', pages: '13–22', chunks: 27, how: 'Results framework table split by indicator row' },
  { name: 'III. Key factors affecting implementation', pages: '23–31', chunks: 31, how: 'Paragraph chunks; procurement sub-sections tagged' },
  { name: 'IV. Bank performance, compliance, risk', pages: '32–37', chunks: 16, how: 'Paragraph chunks' },
  { name: 'V. Lessons and recommendations', pages: '38–42', chunks: 12, how: 'One chunk per numbered lesson, never split' },
  { name: 'Annex 1. Results framework', pages: '43–71', chunks: 88, how: 'Each table row a record; caption and headers repeated in every chunk' },
  { name: 'Annex 2–4. Costs, financing, borrower comments', pages: '72–112', chunks: 44, how: 'Cost tables as rows; borrower comments tagged as borrower voice' },
];

const SAMPLE_CHUNK = `{
  "chunk_id": "ICR-P171204-2025#V.2",
  "doc_type": "ICR",
  "project_id": "P171204",
  "country": "KE",
  "sector_codes": ["TR"],
  "heading_path": ["V. Lessons and recommendations", "Lesson 2"],
  "page": 41,
  "paragraph": 88,
  "doc_date": "2025-02-11",
  "topics": ["qualification criteria", "lotting", "re-tender"],
  "linked_contracts": ["RW-ICB-03"],
  "supersedes": null,
  "tokens": 182
}`;

const QUALITY = [
  ['Procurement method missing on older award rows', '11.4% of rows before FY2016', 'Inferred from review type and value thresholds; flagged as imputed and down-weighted in training'],
  ['No CPIA score for IBRD borrowers', '62 countries', 'CPIA-equivalent from WGI regulatory quality, flagged as imputed'],
  ['Award row has no Project ID', '3.1% of rows', 'Matched by notice number and agency; held for review if the match scores below 0.75'],
  ['Scanned PDF with poor OCR', '4.6% of pages', 'Pages under 0.85 OCR confidence excluded from citation; still searchable'],
  ['ICR not yet published', 'Projects closed under 18 months', 'Latest ISR used, marked as interim; outcome labels left open (censored) in the survival model'],
  ['Contract still in progress', 'Active contracts', 'Treated as censored observations, not as on-time completions'],
];

export default function Pipeline() {
  const [open, setOpen] = useState('V. Lessons and recommendations');

  return (
    <div className="pipeline">
      <PageHead title="Data pipeline" lede="Three kinds of World Bank sources, turned into one set of linked, citable records." />

      <section className="panel">
        <Tabs
          tabs={[
            {
              id: 'sources',
              label: 'Sources',
              count: FEEDS.length,
              content: (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Feed</th>
                        <th scope="col">Layer</th>
                        <th scope="col">Format</th>
                        <th scope="col">Refresh</th>
                        <th scope="col" className="num">Records</th>
                        <th scope="col"><span className="sr-only">Volume, log scale</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {FEEDS.map((f) => (
                        <tr key={f.name}>
                          <th scope="row">{f.name}<span className="api">{f.api}</span></th>
                          <td><span className={`layer-tag layer-${f.layer}`}>{LAYERS[f.layer].name}</span></td>
                          <td>{f.format}</td>
                          <td>{f.cadence}</td>
                          <td className="num">{f.records}</td>
                          <td className="vol-cell">
                            <span className="vol" title={`${f.records} (log scale)`}>
                              <span className={`layer-${f.layer}`} style={{ width: `${(Math.log10(f.n) / Math.log10(2e6)) * 100}%` }} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
            },
            {
              id: 'stages',
              label: 'Processing',
              content: (
                <ol className="stages">
                  {STAGES.map((s, i) => (
                    <li key={s.name}>
                      <span className="stage-n">{i + 1}</span>
                      <p className="stage-name">{s.name}</p>
                      <p className="small">{s.detail}</p>
                    </li>
                  ))}
                </ol>
              ),
            },
            {
              id: 'chunking',
              label: 'Document chunking',
              content: (
                <div className="split">
                  <div>
                    <p className="muted small">How a 112-page ICR is split. Chunks follow the document's own structure, so citations point to a section, paragraph and page.</p>
                    <ul className="doc-tree">
                      {ICR_TREE.map((s) => (
                        <li key={s.name} className={open === s.name ? 'is-open' : ''}>
                          <button type="button" onClick={() => setOpen(open === s.name ? null : s.name)} aria-expanded={open === s.name}>
                            <span className="tree-name">{s.name}</span>
                            <span className="tree-pages">pp. {s.pages}</span>
                            <span className="tree-chunks" aria-label={`${s.chunks} chunks`}>
                              <span style={{ width: `${(s.chunks / 88) * 100}%` }} />
                            </span>
                            <span className="tree-count">{s.chunks}</span>
                          </button>
                          {open === s.name && <p className="tree-how">{s.how}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="muted small">Metadata stored with every chunk</p>
                    <pre className="code">{SAMPLE_CHUNK}</pre>
                  </div>
                </div>
              ),
            },
            {
              id: 'linking',
              label: 'Linking tenders to contracts',
              content: (
                <>
                  <p className="muted small">Notices and contract awards share no key, so the labels the timeline model learns from are built here. Unlinked tenders are counted but never guessed.</p>
                  <HBars rows={LINKING} />
                </>
              ),
            },
            {
              id: 'run',
              label: 'Weekly run',
              content: (() => {
                const total = RUN.reduce((t, r) => t + r.min, 0);
                let at = 0;
                return (
                  <>
                    <p className="muted small">Sunday 06:00, {total.toFixed(1)} minutes end to end. A failing check stops the job and alerts the owner.</p>
                    <ol className="run">
                      {RUN.map((r) => {
                        const left = (at / total) * 100;
                        at += r.min;
                        return (
                          <li key={r.step} className={`run-${r.status}`}>
                            <span className="run-step">{r.step}{r.note && <span className="muted small"> {r.note}</span>}</span>
                            <span className="run-track"><span style={{ left: `${left}%`, width: `${(r.min / total) * 100}%` }} /></span>
                            <span className="run-min">{r.min.toFixed(1)} min</span>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                );
              })(),
            },
            {
              id: 'gaps',
              label: 'Missing data',
              count: QUALITY.length,
              content: (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr><th scope="col">Gap</th><th scope="col">Extent</th><th scope="col">Handling</th></tr>
                    </thead>
                    <tbody>
                      {QUALITY.map(([g, e, h]) => (
                        <tr key={g}><th scope="row">{g}</th><td>{e}</td><td>{h}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}

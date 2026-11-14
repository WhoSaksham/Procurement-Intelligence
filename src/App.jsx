import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import CommandPalette from './components/CommandPalette.jsx';
import { EvidenceDrawer, EvidenceProvider } from './components/Evidence.jsx';
import PackageBar from './components/PackageBar.jsx';
import { DEFAULT_CRITERIA, DEFAULT_PACKAGE, PORTFOLIO } from './data/reference.js';
import { LAYERS } from './data/sources.js';
import { benchmarkCriteria, bestMethod, checkCriteria, predict } from './lib/model.js';
import Plan from './views/Plan.jsx';
import Design from './views/Design.jsx';
import Execute from './views/Execute.jsx';
import Learn from './views/Learn.jsx';
import Ask, { QUESTIONS } from './views/Ask.jsx';
import Graph from './views/Graph.jsx';
import Pipeline from './views/Pipeline.jsx';

// The map pulls in MapLibre, so load it only when opened.
const SiteMap = lazy(() => import('./views/SiteMap.jsx'));

const VIEWS = [
  { id: 'plan', name: 'Plan', step: 1 },
  { id: 'design', name: 'Tender design', step: 2 },
  { id: 'execute', name: 'Execution', step: 3 },
  { id: 'map', name: 'Site map', sub: true },
  { id: 'learn', name: 'Learn', step: 4 },
  { id: 'ask', name: 'Ask the evidence', platform: true },
  { id: 'graph', name: 'Knowledge graph', platform: true },
  { id: 'pipeline', name: 'Data pipeline', platform: true },
];

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function App() {
  const [view, setView] = useState('plan');
  const [pkg, setPkg] = useState(DEFAULT_PACKAGE);
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [contract, setContract] = useState(PORTFOLIO[0].id);
  const [question, setQuestion] = useState(null);
  const [palette, setPalette] = useState(false);

  const check = useMemo(() => checkCriteria(pkg, criteria), [pkg, criteria]);
  const result = useMemo(() => predict(pkg, check.stringency), [pkg, check.stringency]);

  const go = useCallback((v, payload) => {
    if (v === 'map' || v === 'execute') payload && setContract(payload);
    if (v === 'ask') setQuestion(payload ? { q: payload, at: Date.now() } : null);
    setView(v);
    window.scrollTo(0, 0);
  }, []);

  const fixCriteria = useCallback(() => setCriteria((c) => benchmarkCriteria(pkg, c)), [pkg]);
  const applyP80 = useCallback(() => setPkg((p) => ({ ...p, plannedDays: Math.round(result.p80) })), [result.p80]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (palette || typing(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setPalette(true); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) go(VIEWS[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [palette, go]);

  const best = bestMethod(pkg, check.stringency);
  const flagged = check.findings.filter((f) => f.status === 'flag').length;
  const commands = [
    ...VIEWS.map((v, i) => ({ id: `go-${v.id}`, group: 'Go to', label: v.name, hint: String(i + 1), run: () => go(v.id) })),
    { id: 'p80', group: 'Actions', label: `Set planned duration to the P80 estimate (${Math.round(result.p80)} days)`, run: () => { applyP80(); go('plan'); } },
    ...(flagged ? [{ id: 'fix', group: 'Actions', label: `Apply benchmark values to ${flagged} tender criteria`, run: () => { fixCriteria(); go('design'); } }] : []),
    ...(best && best !== pkg.method ? [{ id: 'method', group: 'Actions', label: `Switch method to ${best}`, run: () => setPkg((p) => ({ ...p, method: best })) }] : []),
    ...PORTFOLIO.filter((c) => c.mapped).map((c) => ({ id: `map-${c.id}`, group: 'Actions', label: `Show ${c.id} on the site map`, run: () => go('map', c.id) })),
    ...PORTFOLIO.map((c) => ({ id: `ct-${c.id}`, group: 'Contracts', label: `${c.id} ${c.title}`, run: () => go('execute', c.id) })),
    ...QUESTIONS.map((q, i) => ({ id: `q-${i}`, group: 'Ask the evidence', label: q, run: () => go('ask', q) })),
    { id: 'reset', group: 'Actions', label: 'Reset package and criteria to the example', run: () => { setPkg(DEFAULT_PACKAGE); setCriteria(DEFAULT_CRITERIA); } },
  ];

  const shared = { pkg, setPkg, criteria, setCriteria, check, result, go, contract, setContract, fixCriteria, applyP80, best };

  const navButton = (v, i) => (
    <li key={v.id} className={v.sub ? 'is-sub' : ''}>
      <button
        type="button"
        className={view === v.id ? 'is-active' : ''}
        aria-current={view === v.id ? 'page' : undefined}
        onClick={() => go(v.id)}
      >
        {v.step && <span className="step-n">{v.step}</span>}
        <span className="nav-name">{v.name}</span>
        <kbd className="nav-key">{i + 1}</kbd>
      </button>
    </li>
  );

  return (
    <EvidenceProvider>
      <div className={`shell view-${view}`}>
        <nav className="rail" aria-label="Main">
          <div className="brand">
            <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
              <rect width="32" height="32" rx="7" fill="#2a3d46" />
              <rect x="7" y="8" width="5" height="16" rx="1.5" fill="var(--ledger)" />
              <rect x="14" y="12" width="5" height="12" rx="1.5" fill="var(--procedure-on-dark)" />
              <rect x="21" y="16" width="5" height="8" rx="1.5" fill="var(--retro-on-dark)" />
            </svg>
            <span>Procurement Intelligence</span>
          </div>
          <ol className="nav lifecycle">{VIEWS.map((v, i) => !v.platform && navButton(v, i))}</ol>
          <ul className="nav platform">{VIEWS.map((v, i) => v.platform && navButton(v, i))}</ul>
          <div className="rail-foot">
            <ul className="rail-key" aria-label="Citation colours">
              {Object.entries(LAYERS).map(([k, l]) => (
                <li key={k}><span className={`swatch layer-${k}`} aria-hidden="true" />{l.question}</li>
              ))}
            </ul>
          </div>
        </nav>

        <main className="main">
          <PackageBar pkg={pkg} setPkg={setPkg} onPalette={() => setPalette(true)} />
          <div className="view" key={view}>
            {view === 'plan' && <Plan {...shared} />}
            {view === 'design' && <Design {...shared} />}
            {view === 'execute' && <Execute {...shared} />}
            {view === 'map' && (
              <Suspense fallback={<p className="loading">Loading map…</p>}>
                <SiteMap {...shared} />
              </Suspense>
            )}
            {view === 'learn' && <Learn {...shared} />}
            {view === 'ask' && <Ask {...shared} question={question} />}
            {view === 'graph' && <Graph {...shared} />}
            {view === 'pipeline' && <Pipeline {...shared} />}
          </div>
        </main>

        <EvidenceDrawer />
        <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} onAsk={(q) => go('ask', q)} />
      </div>
    </EvidenceProvider>
  );
}

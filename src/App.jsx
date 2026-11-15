import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CommandPalette from './components/CommandPalette.jsx';
import { EvidenceDrawer, EvidenceProvider } from './components/Evidence.jsx';
import PackageBar from './components/PackageBar.jsx';
import { DEFAULT_CRITERIA, DEFAULT_PACKAGE, PORTFOLIO } from './data/reference.js';
import { LAYERS } from './data/sources.js';
import { benchmarkCriteria, bestMethod, checkCriteria, predict, setCustomCountries } from './lib/model.js';
import Package from './views/Package.jsx';
import Learn from './views/Learn.jsx';
import Ask, { QUESTIONS } from './views/Ask.jsx';
import Graph from './views/Graph.jsx';
import Pipeline from './views/Pipeline.jsx';

// The map pulls in MapLibre, so load it only when opened.
const SiteMap = lazy(() => import('./views/SiteMap.jsx'));

const VIEWS = [
  { id: 'package', name: 'Package' },
  { id: 'map', name: 'Site map' },
  { id: 'learn', name: 'Learn' },
  { id: 'ask', name: 'Ask the evidence', platform: true },
  { id: 'graph', name: 'Knowledge graph', platform: true },
  { id: 'pipeline', name: 'Data pipeline', platform: true },
];

const SECTIONS = [
  { id: 'plan', name: 'Plan' },
  { id: 'tender', name: 'Tender design' },
  { id: 'execution', name: 'Execution' },
];

// The working scenario survives a reload in this browser, and can be moved
// between machines as a JSON file.
const STORE = 'procurement-scenario-v1';
const loadSaved = () => {
  try { return JSON.parse(localStorage.getItem(STORE)) ?? {}; } catch { return {}; }
};

// Warning score and signals for a contract entered by the user.
function buildContract(d, n) {
  const gap = Math.max(0, d.planned - d.actual);
  const late = Math.max(0, d.paymentDays - 28);
  const warning = 1 / (1 + Math.exp(-(-2.2 + gap / 7 + late / 25)));
  const signals = [
    gap > 0
      ? { text: `Progress ${gap} points behind plan`, level: gap >= 15 ? 'high' : gap >= 5 ? 'medium' : 'low', own: true }
      : { text: 'Progress on or ahead of plan', level: 'low', own: true },
  ];
  if (late) signals.push({ text: `Payment certificates clearing in ${d.paymentDays} days against 28 contractual`, level: d.paymentDays > 56 ? 'high' : 'medium', own: true });
  return {
    id: `USR-${String(n).padStart(2, '0')}`,
    title: d.title.trim(),
    supplier: d.supplier.trim() || 'Supplier not given',
    value: d.value,
    signed: `${d.signed ?? '2024-07'}-01`,
    planned: d.planned,
    actual: d.actual,
    warning: Math.round(warning * 100) / 100,
    custom: true,
    signals,
    milestones: [],
  };
}

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function App() {
  const saved = useRef(loadSaved()).current;
  const [view, setView] = useState('package');
  const [pkg, setPkg] = useState({ ...DEFAULT_PACKAGE, ...saved.pkg });
  const [criteria, setCriteria] = useState({ ...DEFAULT_CRITERIA, ...saved.criteria });
  const [countries, setCountries] = useState(saved.countries ?? []);
  const [contracts, setContracts] = useState(saved.contracts ?? []);
  const [signoff, setSignoff] = useState(saved.signoff ?? null);
  const [contract, setContract] = useState(PORTFOLIO[0].id);
  const [question, setQuestion] = useState(null);
  const [focus, setFocus] = useState(null);
  const [palette, setPalette] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileRef = useRef(null);

  setCustomCountries(countries);
  const check = useMemo(() => checkCriteria(pkg, criteria), [pkg, criteria]);
  const result = useMemo(() => predict(pkg, check.stringency), [pkg, check.stringency, countries]); // eslint-disable-line react-hooks/exhaustive-deps
  const portfolio = useMemo(
    () => [...PORTFOLIO, ...contracts].sort((a, b) => b.warning - a.warning),
    [contracts],
  );

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ pkg, criteria, countries, contracts, signoff })); } catch { /* storage unavailable */ }
  }, [pkg, criteria, countries, contracts, signoff]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const go = useCallback((v, payload) => {
    if (v === 'map' && payload) setContract(payload);
    if (v === 'ask') setQuestion(payload ? { q: payload, at: Date.now() } : null);
    if (v === 'package' && payload) {
      if (payload.contract) setContract(payload.contract);
      setFocus({ section: payload.section, at: Date.now() });
    } else window.scrollTo(0, 0);
    setView(v);
  }, []);

  const fixCriteria = useCallback(() => setCriteria((c) => benchmarkCriteria(pkg, c)), [pkg]);
  const applyP80 = useCallback(() => setPkg((p) => ({ ...p, plannedDays: Math.round(result.p80) })), [result.p80]);

  const addContract = (d) => {
    const n = contracts.length ? Math.max(...contracts.map((c) => Number(c.id.slice(4)))) + 1 : 1;
    const c = buildContract(d, n);
    setContracts((cs) => [...cs, c]);
    setContract(c.id);
  };
  const removeContract = (id) => {
    setContracts((cs) => cs.filter((c) => c.id !== id));
    setContract(PORTFOLIO[0].id);
  };

  const upsertCountry = (c) => setCountries((cs) => [...cs.filter((x) => x.id !== c.id), { ...c, custom: true }]);
  const resetCountry = (id) => setCountries((cs) => cs.filter((x) => x.id !== id));

  const resetAll = () => {
    setPkg(DEFAULT_PACKAGE);
    setCriteria(DEFAULT_CRITERIA);
    setCountries([]);
    setContracts([]);
    setSignoff(null);
    setContract(PORTFOLIO[0].id);
    setNotice('Reset to the example scenario.');
  };

  const exportScenario = () => {
    const blob = new Blob([JSON.stringify({ version: 1, pkg, criteria, countries, contracts, signoff }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${pkg.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'scenario'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importScenario = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.pkg) throw new Error('missing package');
      setPkg({ ...DEFAULT_PACKAGE, ...data.pkg });
      setCriteria({ ...DEFAULT_CRITERIA, ...data.criteria });
      setCountries(Array.isArray(data.countries) ? data.countries : []);
      setContracts(Array.isArray(data.contracts) ? data.contracts : []);
      setSignoff(data.signoff ?? null);
      setNotice(`Loaded ${file.name}.`);
    } catch {
      setNotice(`${file.name} is not a scenario file exported from this app.`);
    }
  };

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
    ...SECTIONS.map((s) => ({ id: `sec-${s.id}`, group: 'Go to', label: `Package: ${s.name}`, run: () => go('package', { section: s.id }) })),
    { id: 'p80', group: 'Actions', label: `Set planned duration to the P80 estimate (${Math.round(result.p80)} days)`, run: () => { applyP80(); go('package', { section: 'plan' }); } },
    ...(flagged ? [{ id: 'fix', group: 'Actions', label: `Apply benchmark values to ${flagged} tender criteria`, run: () => { fixCriteria(); go('package', { section: 'tender' }); } }] : []),
    ...(best && best !== pkg.method ? [{ id: 'method', group: 'Actions', label: `Switch method to ${best}`, run: () => setPkg((p) => ({ ...p, method: best })) }] : []),
    ...portfolio.filter((c) => c.mapped).map((c) => ({ id: `map-${c.id}`, group: 'Actions', label: `Show ${c.id} on the site map`, run: () => go('map', c.id) })),
    { id: 'export', group: 'Your data', label: 'Export this scenario as JSON', run: exportScenario },
    { id: 'import', group: 'Your data', label: 'Import a scenario from JSON', run: () => fileRef.current?.click() },
    { id: 'reset', group: 'Your data', label: 'Reset to the example scenario', run: resetAll },
    ...portfolio.map((c) => ({ id: `ct-${c.id}`, group: 'Contracts', label: `${c.id} ${c.title}`, run: () => go('package', { section: 'execution', contract: c.id }) })),
    ...QUESTIONS.map((q, i) => ({ id: `q-${i}`, group: 'Ask the evidence', label: q, run: () => go('ask', q) })),
  ];

  const shared = {
    pkg, setPkg, criteria, setCriteria, check, result, go, contract, setContract, fixCriteria, applyP80, best,
    portfolio, addContract, removeContract, focus, signoff, setSignoff,
  };

  const navButton = (v, i) => (
    <li key={v.id}>
      <button
        type="button"
        className={view === v.id ? 'is-active' : ''}
        aria-current={view === v.id ? 'page' : undefined}
        onClick={() => go(v.id)}
      >
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
          <ul className="nav">{VIEWS.map((v, i) => !v.platform && navButton(v, i))}</ul>
          <ul className="nav platform">{VIEWS.map((v, i) => v.platform && navButton(v, i))}</ul>
          <div className="rail-foot">
            <div className="rail-data">
              <p>Your data</p>
              <button type="button" onClick={() => fileRef.current?.click()}>Import</button>
              <button type="button" onClick={exportScenario}>Export</button>
              <button type="button" onClick={resetAll}>Reset</button>
            </div>
            <ul className="rail-key" aria-label="Citation colours">
              {Object.entries(LAYERS).map(([k, l]) => (
                <li key={k}><span className={`swatch layer-${k}`} aria-hidden="true" />{l.question}</li>
              ))}
            </ul>
          </div>
        </nav>

        <main className="main">
          <PackageBar
            pkg={pkg}
            setPkg={setPkg}
            onPalette={() => setPalette(true)}
            countries={countries}
            onSaveCountry={upsertCountry}
            onResetCountry={resetCountry}
          />
          <div className="view" key={view}>
            {view === 'package' && <Package {...shared} />}
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

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importScenario(f); e.target.value = ''; }}
        />
        {notice && <p className="toast" role="status">{notice}</p>}
        <EvidenceDrawer />
        <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} onAsk={(q) => go('ask', q)} />
      </div>
    </EvidenceProvider>
  );
}

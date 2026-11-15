import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, COUNTRIES, METHODS, SECTORS } from '../data/reference.js';
import { allCountries, country } from '../lib/model.js';

const NEW = '__new';
const BLANK = { name: '', region: '', cpia: 3.3, rq: 30, fcv: false };

function Fact({ label, children }) {
  return (
    <label className="fact">
      <span className="fact-label">{label}</span>
      {children}
    </label>
  );
}

// Close a popover on outside click or Escape.
function usePopover(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open, setOpen]);
  return ref;
}

function Scores({ value, onChange }) {
  const set = (k, num) => (e) => onChange({ ...value, [k]: e.target.type === 'checkbox' ? e.target.checked : num ? Number(e.target.value) : e.target.value });
  return (
    <>
      <Fact label="CPIA public sector mgmt (1–6)">
        <input type="number" min="1" max="6" step="0.1" value={value.cpia} onChange={set('cpia', true)} />
      </Fact>
      <Fact label="WGI regulatory quality, percentile">
        <input type="number" min="0" max="100" value={value.rq} onChange={set('rq', true)} />
      </Fact>
      <label className="fact fact-check">
        <input type="checkbox" checked={value.fcv} onChange={set('fcv')} />
        <span>Fragile or conflict-affected</span>
      </label>
    </>
  );
}

// Every package field is editable in place, from any view. Less-used fields,
// governance scores and custom countries sit behind "More".
export default function PackageBar({ pkg, setPkg, onPalette, countries, onSaveCountry, onResetCountry }) {
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(BLANK);
  const moreRef = usePopover(more, setMore);
  const addRef = usePopover(adding, setAdding);
  const current = country(pkg.country);
  const builtIn = COUNTRIES.some((c) => c.id === current.id);
  const overridden = countries.some((c) => c.id === current.id);

  const set = (k, num) => (e) => {
    const v = num ? Number(e.target.value) : e.target.value;
    if (k === 'country' && v === NEW) {
      setDraft(BLANK);
      setAdding(true);
      return;
    }
    setPkg((p) => {
      const next = { ...p, [k]: v };
      if (k === 'category' && !METHODS[v].includes(p.method)) next.method = METHODS[v][0];
      return next;
    });
  };

  const saveNew = (e) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    const id = `X-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
    onSaveCountry({ id, name, region: draft.region.trim() || 'Custom region', cpia: draft.cpia, rq: draft.rq, fcv: draft.fcv, cpiaImputed: false });
    setPkg((p) => ({ ...p, country: id }));
    setAdding(false);
  };

  return (
    <header className="package-bar">
      <input className="package-name" value={pkg.name} onChange={set('name')} aria-label="Package name" />
      <div className="facts">
        <div className="more" ref={addRef}>
          <Fact label="Country">
            <select value={pkg.country} onChange={set('country')}>
              {allCountries().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value={NEW}>Add a country…</option>
            </select>
          </Fact>
          {adding && (
            <form className="more-pop" onSubmit={saveNew} aria-label="Add a country">
              <p className="pop-title">Add a country</p>
              <Fact label="Name">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus required />
              </Fact>
              <Fact label="Region">
                <input value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} />
              </Fact>
              <Scores value={draft} onChange={setDraft} />
              <div className="pop-actions">
                <button type="submit" className="btn-primary">Add and use</button>
                <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
        <Fact label="Category">
          <select value={pkg.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Fact>
        <Fact label="Method">
          <select value={pkg.method} onChange={set('method')}>
            {METHODS[pkg.category].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Fact>
        <Fact label="Estimate, US$ M">
          <input type="number" min="0.1" step="0.1" value={pkg.value} onChange={set('value', true)} />
        </Fact>
        <Fact label="Lots">
          <input type="number" min="1" max="8" value={pkg.lots} onChange={set('lots', true)} />
        </Fact>
        <div className="more" ref={moreRef}>
          <button type="button" className="more-btn" aria-expanded={more} onClick={() => setMore(!more)}>
            More
          </button>
          {more && (
            <div className="more-pop">
              <Fact label="Sector">
                <input list="sector-list" value={pkg.sector} onChange={set('sector')} />
                <datalist id="sector-list">{SECTORS.map((s) => <option key={s} value={s} />)}</datalist>
              </Fact>
              <Fact label="Bank review">
                <select value={pkg.review} onChange={set('review')}>
                  <option>Prior</option>
                  <option>Post</option>
                </select>
              </Fact>
              <Fact label="Implementing agency">
                <select value={pkg.agency} onChange={set('agency')}>
                  <option value="first">First Bank-financed project</option>
                  <option value="some">Some prior experience</option>
                  <option value="experienced">Experienced</option>
                </select>
              </Fact>
              <Fact label="E&S risk">
                <select value={pkg.esRisk} onChange={set('esRisk')}>
                  <option>Low</option>
                  <option>Moderate</option>
                  <option>Substantial</option>
                  <option>High</option>
                </select>
              </Fact>
              <Fact label="Contract months">
                <input type="number" min="1" max="72" value={pkg.durationMonths} onChange={set('durationMonths', true)} />
              </Fact>
              <p className="pop-title">Governance scores, {current.name}</p>
              <Scores value={current} onChange={(v) => onSaveCountry({ ...v, cpiaImputed: false })} />
              {overridden && (
                <button type="button" className="link pop-link" onClick={() => {
                  onResetCountry(current.id);
                  if (!builtIn) setPkg((p) => ({ ...p, country: COUNTRIES[0].id }));
                }}>
                  {builtIn ? 'Restore published scores' : `Delete ${current.name}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <button type="button" className="palette-btn" onClick={onPalette}>
        <span>Jump to</span>
        <kbd>⌘K</kbd>
      </button>
    </header>
  );
}

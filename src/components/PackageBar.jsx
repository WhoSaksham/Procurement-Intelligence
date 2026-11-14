import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, COUNTRIES, METHODS, SECTORS } from '../data/reference.js';

function Fact({ label, children }) {
  return (
    <label className="fact">
      <span className="fact-label">{label}</span>
      {children}
    </label>
  );
}

// Every package field is editable in place, from any view: one click to open,
// one to choose. Less-used fields sit behind "More".
export default function PackageBar({ pkg, setPkg, onPalette }) {
  const [more, setMore] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!more) return;
    const close = (e) => !moreRef.current?.contains(e.target) && setMore(false);
    const esc = (e) => e.key === 'Escape' && setMore(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [more]);

  const set = (k, num) => (e) => {
    const v = num ? Number(e.target.value) : e.target.value;
    setPkg((p) => {
      const next = { ...p, [k]: v };
      if (k === 'category' && !METHODS[v].includes(p.method)) next.method = METHODS[v][0];
      return next;
    });
  };

  return (
    <header className="package-bar">
      <input className="package-name" value={pkg.name} onChange={set('name')} aria-label="Package name" />
      <div className="facts">
        <Fact label="Country">
          <select value={pkg.country} onChange={set('country')}>
            {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Fact>
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
                <select value={pkg.sector} onChange={set('sector')}>
                  {SECTORS.map((s) => <option key={s}>{s}</option>)}
                </select>
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

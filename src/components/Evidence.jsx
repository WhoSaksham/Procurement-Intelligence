import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { LAYERS, SOURCES } from '../data/sources.js';

const EvidenceContext = createContext(null);

// Citation numbers are assigned in order of first use so the same source keeps
// the same number everywhere in the session.
const order = [];
const numberFor = (id) => {
  if (!order.includes(id)) order.push(id);
  return order.indexOf(id) + 1;
};

export function EvidenceProvider({ children }) {
  const [open, setOpen] = useState(null);
  return <EvidenceContext.Provider value={{ open, setOpen }}>{children}</EvidenceContext.Provider>;
}

export const useEvidence = () => useContext(EvidenceContext);

export function Cite({ ids }) {
  const { open, setOpen } = useEvidence();
  return (
    <span className="cites">
      {ids.map((id) => {
        const s = SOURCES[id];
        if (!s) return null;
        return (
          <button
            key={id}
            type="button"
            className={`cite layer-${s.layer}${open === id ? ' is-open' : ''}`}
            onClick={() => setOpen(open === id ? null : id)}
            aria-label={`Source ${numberFor(id)}: ${s.kind}, ${s.title}`}
            title={`${s.kind}: ${s.title}`}
          >
            {numberFor(id)}
          </button>
        );
      })}
    </span>
  );
}

export function LayerKey() {
  return (
    <ul className="layer-key" aria-label="Evidence layers">
      {Object.entries(LAYERS).map(([key, l]) => (
        <li key={key}>
          <span className={`swatch layer-${key}`} aria-hidden="true" />
          <span>
            <strong>{l.name}</strong> {l.question.toLowerCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceDrawer() {
  const { open, setOpen } = useEvidence();
  const closeRef = useRef(null);
  const s = open ? SOURCES[open] : null;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <aside className={`drawer${s ? ' is-open' : ''}`} aria-hidden={!s} aria-label="Source passage">
      {s && (
        <div className={`drawer-inner layer-${s.layer}`}>
          <div className="drawer-head">
            <span className={`layer-tag layer-${s.layer}`}>
              {LAYERS[s.layer].name}: {LAYERS[s.layer].question.toLowerCase()}
            </span>
            <button ref={closeRef} type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Close source">
              ✕
            </button>
          </div>
          <p className="drawer-kind">
            Source {numberFor(open)} · {s.kind}
          </p>
          <h2 className="drawer-title">{s.title}</h2>
          <dl className="drawer-meta">
            <div><dt>Record</dt><dd>{s.project}</dd></div>
            <div><dt>Dated</dt><dd>{s.date}</dd></div>
            <div><dt>Location</dt><dd>{s.locator}</dd></div>
          </dl>
          <blockquote className="passage">
            {s.before} <mark>{s.quote}</mark> {s.after}
          </blockquote>
          <p className="drawer-foot">
            The highlighted span is the exact text the claim was checked against. Passages are retrieved from the indexed
            source, never generated.
          </p>
        </div>
      )}
    </aside>
  );
}

import { useId, useState } from 'react';

// Tabs keep secondary detail one click away instead of stacked on the page.
export function Tabs({ tabs, initial }) {
  const [active, setActive] = useState(initial ?? tabs[0].id);
  const base = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === current.id);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length];
    setActive(t.id);
    document.getElementById(`${base}-${t.id}`)?.focus();
  };

  return (
    <div className="tabs">
      <div className="tab-list" role="tablist" onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${base}-${t.id}`}
            type="button"
            role="tab"
            aria-selected={t.id === current.id}
            tabIndex={t.id === current.id ? 0 : -1}
            className="tab"
            onClick={() => setActive(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" aria-labelledby={`${base}-${current.id}`}>
        {current.content}
      </div>
    </div>
  );
}

export function Collapse({ summary, children, open: initial = false }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className={`collapse${open ? ' is-open' : ''}`}>
      <button type="button" className="collapse-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="chev" aria-hidden="true" />
        {summary}
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

export function PageHead({ title, lede, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

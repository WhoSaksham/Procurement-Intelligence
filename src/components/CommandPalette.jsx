import { useEffect, useMemo, useRef, useState } from 'react';

const matches = (label, q) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => label.toLowerCase().includes(w));

export default function CommandPalette({ open, onClose, commands, onAsk }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const list = useMemo(() => {
    const found = commands.filter((c) => matches(`${c.group} ${c.label}`, q));
    if (q.trim().length > 2) found.push({ id: 'ask-free', group: 'Ask the evidence', label: `“${q.trim()}”`, run: () => onAsk(q.trim()) });
    return found;
  }, [commands, q, onAsk]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setSel(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  const run = (c) => {
    onClose();
    c.run();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); run(list[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = null;
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command menu" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Go to a view, run an action or ask a question"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={list[sel] ? `cmd-${list[sel].id}` : undefined}
        />
        <ul id="palette-list" className="palette-list" role="listbox" ref={listRef}>
          {list.length === 0 && <li className="palette-empty">Type to filter views and actions, or ask a question.</li>}
          {list.map((c, i) => {
            const head = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {head && <p className="palette-group">{c.group}</p>}
                <div
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === sel}
                  className="palette-item"
                  onMouseMove={() => setSel(i)}
                  onClick={() => run(c)}
                >
                  <span>{c.label}</span>
                  {c.hint && <kbd>{c.hint}</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

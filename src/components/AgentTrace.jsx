import { useEffect, useState } from 'react';

// Animated trace of the retrieval agent's steps. Each step reports what it
// queried and what it returned, so a reviewer can audit the path to an answer.
export default function AgentTrace({ steps, running, preview, onDone, stepMs = 520 }) {
  const [shown, setShown] = useState(running || preview ? 0 : steps.length);

  useEffect(() => {
    if (!running) return;
    setShown(0);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(steps.length);
      onDone?.();
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= steps.length) {
        clearInterval(t);
        setTimeout(() => onDone?.(), 250);
      }
    }, stepMs);
    return () => clearInterval(t);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ol className="trace" aria-live="polite">
      {steps.map((s, i) => {
        const state = i < shown ? 'done' : i === shown && running ? 'active' : 'pending';
        return (
          <li key={s.name} className={`trace-step ${state}`}>
            <span className="trace-mark" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
            <div>
              <p className="trace-name">
                {s.name}
                <span className="trace-tool">{s.tool}</span>
              </p>
              {state === 'done' && <p className="trace-detail">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

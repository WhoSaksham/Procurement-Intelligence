import { useMemo, useRef, useState } from 'react';
import { RATING_NAMES, RATING_SCALE } from '../data/reference.js';

// Share of comparable packages signed by day t: model curve plus the
// historical cohort's empirical curve, with P50 / P80 / planned markers.
export function DurationCurve({ result, sample, planned }) {
  const W = 640, H = 240, m = { t: 16, r: 16, b: 34, l: 44 };
  const maxT = Math.max(360, Math.ceil(result.p80 * 1.6 / 60) * 60);
  const x = (t) => m.l + (t / maxT) * (W - m.l - m.r);
  const y = (p) => m.t + (1 - p) * (H - m.t - m.b);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const sorted = useMemo(() => [...sample].sort((a, b) => a - b), [sample]);
  const empirical = (t) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= t) lo = mid + 1; else hi = mid; }
    return lo / sorted.length;
  };

  const steps = 120;
  const model = Array.from({ length: steps + 1 }, (_, i) => (i / steps) * maxT);
  const modelPath = model.map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(result.cdf(t)).toFixed(1)}`).join('');
  const empPath = model.map((t, i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(empirical(t)).toFixed(1)}`).join('');
  const area = `${modelPath}L${x(maxT)},${y(0)}L${x(0)},${y(0)}Z`;

  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = Math.max(0, Math.min(maxT, ((px - m.l) / (W - m.l - m.r)) * maxT));
    setHover(Math.round(t));
  };

  const ticks = Array.from({ length: maxT / 60 + 1 }, (_, i) => i * 60);
  const markers = [
    { t: result.p50, label: 'P50' },
    { t: result.p80, label: 'P80' },
  ];

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="lg-line" /> Model estimate</span>
        <span><i className="lg-line lg-dash" /> Comparable packages ({sample.length})</span>
        <span><i className="lg-rule" /> Your plan</span>
      </div>
      <div className="chart-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Share of comparable packages signed by day. Median ${Math.round(result.p50)} days, 80th percentile ${Math.round(result.p80)} days.`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <g key={p}>
              <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className="grid" />
              <text x={m.l - 8} y={y(p) + 4} className="axis-label" textAnchor="end">{p * 100}%</text>
            </g>
          ))}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={H - 12} className="axis-label" textAnchor="middle">{t}</text>
          ))}
          <text x={W - m.r} y={H - 0} className="axis-label" textAnchor="end">days from advertisement to signature</text>
          <path d={area} className="curve-area" />
          <path d={empPath} className="curve-emp" />
          <path d={modelPath} className="curve-model" />
          {markers.map((mk) => (
            <g key={mk.label}>
              <line x1={x(mk.t)} x2={x(mk.t)} y1={y(0)} y2={y(result.cdf(mk.t))} className="marker-line" />
              <circle cx={x(mk.t)} cy={y(result.cdf(mk.t))} r="4.5" className="marker-dot" />
              <text x={x(mk.t) + 7} y={y(result.cdf(mk.t)) + 14} className="marker-label">
                {mk.label} {Math.round(mk.t)}d
              </text>
            </g>
          ))}
          {planned <= maxT && (
            <g>
              <line x1={x(planned)} x2={x(planned)} y1={m.t} y2={y(0)} className="plan-line" />
              <text x={x(planned) - 6} y={m.t + 10} className="plan-label" textAnchor="end">Plan {planned}d</text>
            </g>
          )}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={y(0)} className="crosshair" />
              <circle cx={x(hover)} cy={y(result.cdf(hover))} r="4" className="marker-dot" />
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <strong>Day {hover}</strong>
            <span>Model: {Math.round(result.cdf(hover) * 100)}% signed</span>
            <span>History: {Math.round(empirical(hover) * 100)}% signed</span>
          </div>
        )}
      </div>
    </figure>
  );
}

// Diverging bars: how much each factor moves the estimate, up or down.
export function DriverBars({ drivers, unit, max }) {
  const top = drivers.slice(0, 6);
  const lim = max ?? Math.max(5, ...top.map((d) => Math.abs(d.v)));
  return (
    <ul className="drivers">
      {top.map((d) => {
        const w = (Math.abs(d.v) / lim) * 50;
        const up = d.v > 0;
        return (
          <li key={d.label} title={`${d.label}: ${up ? '+' : '−'}${Math.abs(d.v).toFixed(1)}${unit}`}>
            <span className="driver-label">{d.label}</span>
            <span className="driver-track">
              <span className="driver-zero" />
              <span
                className={`driver-bar ${up ? 'up' : 'down'}`}
                style={up ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
              />
            </span>
            <span className="driver-value">{up ? '+' : '−'}{Math.abs(d.v).toFixed(1)}{unit}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Ordinal step chart of supervision ratings, with the retrospective ICR
// rating drawn as a distinct mark.
export function RatingChart({ history, onPick }) {
  const W = 980, H = 240, m = { t: 14, r: 24, b: 34, l: 40 };
  const x = (i) => m.l + (i / (history.length - 1)) * (W - m.l - m.r);
  const y = (r) => m.t + (1 - RATING_SCALE.indexOf(r) / (RATING_SCALE.length - 1)) * (H - m.t - m.b);
  const half = (y('U') - y('MU')) / 2;
  const [hover, setHover] = useState(null);
  const sup = history.filter((h) => !h.retrospective);
  const path = sup.map((h, i) => `${i ? `L${x(i)},${y(sup[i - 1].rating)}L` : 'M'}${x(i)},${y(h.rating)}`).join('');

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="lg-dot" /> Supervision rating (ISR)</span>
        <span><i className="lg-diamond" /> Completion rating (ICR)</span>
      </div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Implementation progress ratings over time">
          <rect x={m.l} y={y('MU') - half} width={W - m.l - m.r} height={y('HU') - y('MU') + half} className="band-unsat" />
          <text x={W - m.r - 6} y={y('HU') - 6} className="axis-label" textAnchor="end">Unsatisfactory range</text>
          {RATING_SCALE.map((r) => (
            <g key={r}>
              <line x1={m.l} x2={W - m.r} y1={y(r)} y2={y(r)} className="grid" />
              <text x={m.l - 8} y={y(r) + 4} className="axis-label" textAnchor="end">{r}</text>
            </g>
          ))}
          <path d={path} className="curve-model" fill="none" />
          {history.map((h, i) => (
            <g
              key={h.label}
              className={h.cite ? 'pickable' : ''}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => h.cite && onPick?.(h.cite)}
            >
              <rect x={x(i) - 16} y={m.t} width="32" height={H - m.t - m.b} fill="transparent" />
              {h.retrospective ? (
                <rect x={x(i) - 6} y={y(h.rating) - 6} width="12" height="12" transform={`rotate(45 ${x(i)} ${y(h.rating)})`} className="diamond" />
              ) : (
                <circle cx={x(i)} cy={y(h.rating)} r="5" className="marker-dot" />
              )}
              <text x={x(i)} y={H - 12} className="axis-label" textAnchor="middle">{h.label}</text>
            </g>
          ))}
        </svg>
        {hover !== null && (
          <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <strong>{history[hover].label}, {history[hover].date}</strong>
            <span>{RATING_NAMES[history[hover].rating]}</span>
            {history[hover].cite && <span className="muted">Click to open source</span>}
          </div>
        )}
      </div>
    </figure>
  );
}

// Planned vs actual milestone bars, months on the x axis.
export function MilestoneChart({ milestones, today = '2025-07' }) {
  const toN = (s) => { const [yy, mm] = s.split('-').map(Number); return yy * 12 + mm - 1; };
  const all = milestones.flatMap((m) => [...m.planned, ...m.actual]).filter(Boolean).map(toN);
  const t0 = Math.min(...all), t1 = Math.max(...all, toN(today)) + 2;
  const W = 640, row = 34, m = { t: 22, l: 170, r: 16 };
  const H = m.t + milestones.length * row + 10;
  const x = (n) => m.l + ((n - t0) / (t1 - t0)) * (W - m.l - m.r);
  const nowN = toN(today);
  const years = [];
  for (let n = t0; n <= t1; n++) if (n % 12 === 0) years.push(n);

  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="lg-plan" /> Planned</span>
        <span><i className="lg-actual" /> Actual</span>
        <span><i className="lg-rule" /> Today</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Planned and actual milestone dates">
        {years.map((n) => (
          <g key={n}>
            <line x1={x(n)} x2={x(n)} y1={m.t - 6} y2={H} className="grid" />
            <text x={x(n) + 4} y={m.t - 8} className="axis-label">{n / 12}</text>
          </g>
        ))}
        {milestones.map((ms, i) => {
          const yy = m.t + i * row;
          const [ps, pe] = ms.planned.map(toN);
          const as = ms.actual[0] ? toN(ms.actual[0]) : null;
          const ae = ms.actual[1] ? toN(ms.actual[1]) : as !== null ? nowN : null;
          const late = ae !== null && (ms.actual[1] ? ae > pe : nowN > pe);
          return (
            <g key={ms.name}>
              <text x={m.l - 10} y={yy + 18} className="row-label" textAnchor="end">{ms.name}</text>
              <rect x={x(ps)} y={yy + 6} width={Math.max(4, x(pe + 1) - x(ps))} height="9" rx="3" className="bar-plan" />
              {as !== null && (
                <rect
                  x={x(as)} y={yy + 17} width={Math.max(4, x(ae + 1) - x(as))} height="9" rx="3"
                  className={`bar-actual${late ? ' late' : ''}${ms.actual[1] ? '' : ' ongoing'}`}
                >
                  <title>{`${ms.name}: ${ms.actual[0]} to ${ms.actual[1] ?? 'ongoing'} (planned ${ms.planned[0]} to ${ms.planned[1]})`}</title>
                </rect>
              )}
            </g>
          );
        })}
        <line x1={x(nowN)} x2={x(nowN)} y1={m.t - 6} y2={H} className="plan-line" />
      </svg>
    </figure>
  );
}

export function Sparkline({ values, target, better = 'up' }) {
  const W = 120, H = 32;
  const lo = Math.min(...values, target ?? Infinity), hi = Math.max(...values, target ?? -Infinity);
  const x = (i) => 2 + (i / (values.length - 1)) * (W - 6);
  const y = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (H - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="spark" aria-hidden="true" data-better={better}>
      {target !== undefined && <line x1="0" x2={W} y1={y(target)} y2={y(target)} className="spark-target" />}
      <path d={d} className="spark-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" className="spark-dot" />
    </svg>
  );
}

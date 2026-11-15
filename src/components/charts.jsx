import { useMemo, useRef, useState } from 'react';
import { RATING_NAMES, RATING_SCALE } from '../data/reference.js';

// Share of comparable packages signed by day t: model curve plus the
// historical cohort's empirical curve, with P50 / P80 / planned markers.
export function DurationCurve({ result, sample, planned, W = 640, H = 240 }) {
  const m = { t: 16, r: 16, b: 34, l: 44 };
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

  const every = W < 500 ? 120 : 60;
  const ticks = Array.from({ length: maxT / every + 1 }, (_, i) => i * every);
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
export function MilestoneChart({ milestones, today = '2025-07', W = 640 }) {
  const toN = (s) => { const [yy, mm] = s.split('-').map(Number); return yy * 12 + mm - 1; };
  const all = milestones.flatMap((m) => [...m.planned, ...m.actual]).filter(Boolean).map(toN);
  const t0 = Math.min(...all), t1 = Math.max(...all, toN(today)) + 2;
  const row = 34, m = { t: 22, l: 170, r: 16 };
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

// Elevation along the alignment, coloured by construction status. Hover moves
// a marker on the map; click jumps the close view or drive to that kilometre.
export function ElevationProfile({ profile, segments, colors, markKm, onHover, onPick }) {
  const W = 900, H = 150, m = { t: 14, r: 12, b: 22, l: 56 };
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const maxKm = profile.at(-1).km;
  const lo = Math.floor(Math.min(...profile.map((p) => p.elev)) / 50) * 50;
  const hi = Math.ceil(Math.max(...profile.map((p) => p.elev)) / 50) * 50 || lo + 50;
  const x = (km) => m.l + (km / maxKm) * (W - m.l - m.r);
  const y = (e) => m.t + (1 - (e - lo) / (hi - lo)) * (H - m.t - m.b);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.elev).toFixed(1)}`).join('');
  const area = `${path(profile)}L${x(maxKm)},${y(lo)}L${x(0)},${y(lo)}Z`;
  const near = (km) => profile.reduce((b, p) => (Math.abs(p.km - km) < Math.abs(b.km - km) ? p : b), profile[0]);

  const kmFromEvent = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(maxKm, ((px - m.l) / (W - m.l - m.r)) * maxKm));
  };
  const steep = profile.filter((p) => Math.abs(p.grade) >= 8);
  const ticks = [];
  for (let k = 0; k <= maxKm; k += maxKm > 50 ? 10 : 5) ticks.push(k);
  const shown = hover ?? (markKm != null ? near(markKm) : null);

  return (
    <div className="profile-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Elevation profile from ${Math.round(lo)} to ${Math.round(hi)} metres over ${Math.round(maxKm)} km`}
        onMouseMove={(e) => { const p = near(kmFromEvent(e)); setHover(p); onHover?.(p.km); }}
        onMouseLeave={() => { setHover(null); onHover?.(null); }}
        onClick={(e) => onPick?.(kmFromEvent(e))}
      >
        {[lo, (lo + hi) / 2, hi].map((e) => (
          <g key={e}>
            <line x1={m.l} x2={W - m.r} y1={y(e)} y2={y(e)} className="p-grid" />
            <text x={m.l - 6} y={y(e) + 4} className="p-axis" textAnchor="end">{Math.round(e).toLocaleString('en')} m</text>
          </g>
        ))}
        {ticks.map((k) => (
          <text key={k} x={x(k)} y={H - 6} className="p-axis" textAnchor="middle">{k}</text>
        ))}
        <path d={area} className="p-area" />
        {segments.map((s) => (
          <path key={s.from} d={path(profile.filter((p) => p.km >= s.from && p.km <= s.to))} stroke={colors[s.status]} className="p-line" />
        ))}
        {steep.map((p) => (
          <line key={p.km} x1={x(p.km)} x2={x(p.km)} y1={y(lo)} y2={y(lo) - 6} className="p-steep" />
        ))}
        {shown && (
          <g pointerEvents="none">
            <line x1={x(shown.km)} x2={x(shown.km)} y1={m.t} y2={y(lo)} className="p-cross" />
            <circle cx={x(shown.km)} cy={y(shown.elev)} r="4" className="p-dot" />
          </g>
        )}
      </svg>
      {shown && (
        <div className="p-tip" style={{ left: `${(x(shown.km) / W) * 100}%` }}>
          km {shown.km.toFixed(1)}, {Math.round(shown.elev)} m, grade {shown.grade > 0 ? '+' : ''}{shown.grade.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// Days to signature by method: bar spans P20–P80, tick marks the median.
export function MethodRange({ options, best }) {
  const max = Math.ceil(Math.max(...options.map((o) => o.p80)) / 60) * 60;
  const ticks = Array.from({ length: max / 60 + 1 }, (_, i) => i * 60);
  return (
    <figure className="chart method-range" aria-label="Days to contract signature by procurement method">
      <div className="mr-axis" aria-hidden="true">
        {ticks.map((t) => <span key={t} style={{ left: `${(t / max) * 100}%` }}>{t}</span>)}
      </div>
      <ul>
        {options.map((o) => (
          <li key={o.method} className={`${o.current ? 'is-current' : ''}${o.limit ? ' is-limited' : ''}`}>
            <span className="mr-label">
              {o.method}
              {o.method === best && <span className="tag tag-good">Best</span>}
            </span>
            <span className="mr-track" title={`${o.method}: ${Math.round(o.p20)}–${Math.round(o.p80)} days, median ${Math.round(o.p50)}`}>
              {ticks.map((t) => <i key={t} className="mr-grid" style={{ left: `${(t / max) * 100}%` }} />)}
              <span className="mr-bar" style={{ left: `${(o.p20 / max) * 100}%`, width: `${((o.p80 - o.p20) / max) * 100}%` }} />
              <span className="mr-mid" style={{ left: `${(o.p50 / max) * 100}%` }} />
            </span>
            <span className="mr-val">{Math.round(o.p50)}d</span>
            <span className="mr-risk">{Math.round(o.rebid * 100)}%</span>
          </li>
        ))}
      </ul>
      <figcaption className="fine">Bar: 20th to 80th percentile days to signature. Tick: median. Right: re-tender risk. Faded rows are above the method's value limit or need justification.</figcaption>
    </figure>
  );
}

// Draft value against the benchmark band for each tender criterion.
export function BenchmarkBullets({ rows }) {
  return (
    <ul className="bullets" aria-label="Draft criteria against benchmarks">
      {rows.map((r) => {
        const pos = (v) => `${Math.min(100, (v / r.max) * 100)}%`;
        const out = r.value < r.lo || r.value > r.hi;
        return (
          <li key={r.label} className={out ? 'is-out' : ''}>
            <span className="b-label">{r.label}</span>
            <span className="b-track" title={`${r.label}: ${r.fmt(r.value)}; benchmark ${r.fmt(r.lo)}–${r.fmt(r.hi)}`}>
              <span className="b-band" style={{ left: pos(r.lo), width: `calc(${pos(r.hi)} - ${pos(r.lo)})` }} />
              <span className="b-mark" style={{ left: pos(r.value) }} />
            </span>
            <span className="b-val">{r.fmt(r.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Cumulative planned vs actual physical progress for a contract.
export function ProgressCurve({ contract, today = '2025-07', W = 640, H = 220 }) {
  const toN = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + m - 1; };
  const plannedEnds = contract.milestones.map((m) => m.planned[1]).filter(Boolean);
  const start = toN(contract.signed.slice(0, 7));
  const end = plannedEnds.length ? Math.max(...plannedEnds.map(toN)) : start + 24;
  const now = toN(today);
  const span = Math.max(end, now) + 2 - start;
  const m = { t: 14, r: 16, b: 30, l: 40 };
  const x = (n) => m.l + ((n - start) / span) * (W - m.l - m.r);
  const y = (p) => m.t + (1 - p / 100) * (H - m.t - m.b);
  // Logistic S-curve through 0 at signature and 100 at planned completion.
  const s = (n) => { const t = (n - start) / (end - start); return 100 / (1 + Math.exp(-9 * (t - 0.5))); };
  const scale = contract.planned / s(now) || 1;
  const plan = (n) => Math.min(100, s(n) * scale);
  const ratio = contract.planned ? contract.actual / contract.planned : 1;
  const months = Array.from({ length: span + 1 }, (_, i) => start + i);
  const pPath = months.map((n, i) => `${i ? 'L' : 'M'}${x(n)},${y(plan(n))}`).join('');
  const aPath = months.filter((n) => n <= now).map((n, i) => `${i ? 'L' : 'M'}${x(n)},${y(plan(n) * ratio)}`).join('');
  const years = months.filter((n) => n % 12 === 0);
  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="lg-line lg-dash" /> Planned</span>
        <span><i className="lg-line" /> Actual</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Progress ${contract.actual}% against ${contract.planned}% planned`}>
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className="grid" />
            <text x={m.l - 6} y={y(p) + 4} className="axis-label" textAnchor="end">{p}%</text>
          </g>
        ))}
        {years.map((n) => <text key={n} x={x(n)} y={H - 10} className="axis-label" textAnchor="middle">{n / 12}</text>)}
        <path d={pPath} className="curve-emp" />
        <path d={aPath} className="curve-model" />
        <line x1={x(now)} x2={x(now)} y1={y(plan(now))} y2={y(contract.actual)} className="gap-line" />
        <circle cx={x(now)} cy={y(contract.actual)} r="4.5" className="marker-dot" />
        <text x={x(now) + 8} y={(y(plan(now)) + y(contract.actual)) / 2 + 4} className="marker-label">
          {contract.planned - contract.actual > 0 ? `${contract.planned - contract.actual} pts behind` : 'On plan'}
        </text>
      </svg>
    </figure>
  );
}

export function TargetBar({ base, now, target }) {
  const p = Math.max(0, Math.min(1, (now - base) / (target - base || 1)));
  return (
    <span className="target-bar" title={`${Math.round(p * 100)}% of the way from baseline to target`}>
      <span className="tb-track"><span className={`tb-fill${p >= 1 ? ' is-met' : ''}`} style={{ width: `${p * 100}%` }} /></span>
      <em>{Math.round(p * 100)}%</em>
    </span>
  );
}

// One dot per comparable package by days to signature. Drag the plan line to
// read how many comparables were signed by then.
export function ComparablesStrip({ sample, planned, onPlanned }) {
  const W = 440, H = 170, m = { t: 26, r: 12, b: 26, l: 12 };
  const svgRef = useRef(null);
  const sorted = useMemo(() => [...sample].sort((a, b) => a - b), [sample]);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const maxT = Math.max(360, Math.ceil((q(0.97) * 1.05) / 60) * 60);
  const x = (t) => m.l + (Math.min(t, maxT) / maxT) * (W - m.l - m.r);
  const base = H - m.b;
  const step = 4.6;
  const stacks = {};
  const dots = sorted.map((t) => {
    const col = Math.round(x(t) / step);
    stacks[col] = (stacks[col] ?? 0) + 1;
    return { t, cx: col * step, cy: base - 3 - (stacks[col] - 1) * step };
  });
  const within = sorted.filter((t) => t <= planned).length;

  const setFrom = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    onPlanned(Math.max(10, Math.round((((px - m.l) / (W - m.l - m.r)) * maxT) / 5) * 5));
  };
  const drag = (e) => {
    e.preventDefault();
    setFrom(e);
    const move = (ev) => setFrom(ev);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const ticks = Array.from({ length: Math.floor(maxT / 120) + 1 }, (_, i) => i * 120);

  return (
    <figure className="chart strip">
      <p className="strip-read"><strong>{within} of {sorted.length}</strong> comparable packages were signed within <strong>{planned} days</strong>.</p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex="0"
        aria-label="Planned days to signature"
        aria-valuenow={planned}
        aria-valuemin="10"
        aria-valuemax={maxT}
        aria-valuetext={`${planned} days; ${within} of ${sorted.length} comparables signed by then`}
        onPointerDown={drag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onPlanned(Math.max(10, planned - 5));
          if (e.key === 'ArrowRight') onPlanned(Math.min(maxT, planned + 5));
        }}
      >
        <rect x={x(q(0.25))} y={m.t - 8} width={x(q(0.75)) - x(q(0.25))} height={base - m.t + 8} className="strip-band" />
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="1.9" className={d.t <= planned ? 'strip-dot is-in' : 'strip-dot'} />
        ))}
        <line x1={x(q(0.5))} x2={x(q(0.5))} y1={m.t - 8} y2={base} className="marker-line" />
        <line x1={x(q(0.8))} x2={x(q(0.8))} y1={m.t - 8} y2={base} className="marker-line" />
        <text x={x(q(0.5)) + 3} y={m.t + 2} className="strip-tag">median</text>
        <text x={x(q(0.8)) + 3} y={m.t + 2} className="strip-tag">P80</text>
        <line x1={m.l} x2={W - m.r} y1={base} y2={base} className="grid" />
        {ticks.map((t) => <text key={t} x={x(t)} y={H - 4} className="axis-label" textAnchor="middle">{t === 0 ? '' : t}</text>)}
        <g className="strip-plan" transform={`translate(${x(planned)},0)`}>
          <line y1={m.t - 14} y2={base} />
          <rect x="-24" y={m.t - 26} width="48" height="16" rx="8" />
          <text y={m.t - 14.5} textAnchor="middle">{planned}d</text>
        </g>
      </svg>
      <figcaption className="fine">Each dot is a comparable package; the shaded band is the middle half. Drag the plan line or use the arrow keys.</figcaption>
    </figure>
  );
}

// Share of a project's commitment disbursed, against peers at the same age.
export function DisbursementPeers({ actual, peers, months, W = 640, H = 230 }) {
  const m = { t: 14, r: 16, b: 30, l: 40 };
  const x = (n) => m.l + (n / months) * (W - m.l - m.r);
  const y = (p) => m.t + (1 - p / 100) * (H - m.t - m.b);
  const line = (pts, k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.m)},${y(p[k])}`).join('');
  const band = `${line(peers, 'p75')}${[...peers].reverse().map((p) => `L${x(p.m)},${y(p.p25)}`).join('')}Z`;
  const last = actual.at(-1);
  const peer = peers.reduce((b, p) => (Math.abs(p.m - last.m) < Math.abs(b.m - last.m) ? p : b), peers[0]);
  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="lg-band" /> Similar projects, middle half</span>
        <span><i className="lg-line lg-dash" /> Similar projects, median</span>
        <span><i className="lg-line" /> This project</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Disbursed ${last.v}% at month ${last.m}; similar projects median ${peer.p50}%`}>
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className="grid" />
            <text x={m.l - 6} y={y(p) + 4} className="axis-label" textAnchor="end">{p}%</text>
          </g>
        ))}
        {Array.from({ length: Math.floor(months / 12) + 1 }, (_, i) => i * 12).map((n) => (
          <text key={n} x={x(n)} y={H - 10} className="axis-label" textAnchor="middle">{n === 0 ? 'Effective' : `${n / 12}y`}</text>
        ))}
        <path d={band} className="peer-band" />
        <path d={line(peers, 'p50')} className="curve-emp" />
        <path d={actual.map((p, i) => `${i ? 'L' : 'M'}${x(p.m)},${y(p.v)}`).join('')} className="curve-model" />
        <line x1={x(last.m)} x2={x(last.m)} y1={y(peer.p50)} y2={y(last.v)} className="gap-line" />
        <circle cx={x(last.m)} cy={y(last.v)} r="4.5" className="marker-dot" />
        <text x={x(last.m) + 8} y={y(last.v) + 4} className="marker-label">{last.v}% vs {peer.p50}% typical</text>
      </svg>
    </figure>
  );
}

export function HBars({ rows, unit = '', max }) {
  const top = max ?? Math.max(...rows.map((r) => r.v));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hb-label">{r.label}{r.note && <span className="muted"> {r.note}</span>}</span>
          <span className="hb-track"><span className={`hb-bar${r.tone ? ` tone-${r.tone}` : ''}`} style={{ width: `${(r.v / top) * 100}%` }} /></span>
          <span className="hb-val">{r.v.toLocaleString('en')}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

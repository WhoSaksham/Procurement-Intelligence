'use client';

import { useMemo, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ProfilePoint } from '@/lib/elevation';
import { cssPct } from '@/lib/format';
import type { Analysis, Contract, Milestone, RatingPoint, RoadSegment } from '@/lib/types';
import { cn } from '@/lib/utils';

// Charts are built on Recharts through shadcn/ui's ChartContainer, coloured
// only from design tokens (CSS variables) so they follow the light/dark theme.

const toMonth = (s: string) => {
  const [yy, mm] = s.split('-').map(Number);
  return yy * 12 + mm - 1;
};
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const axisTick = { fontSize: 11.5, fill: 'var(--muted-ink)' };

/** Responsive chart frame with a fixed height; the figure carries the accessible summary. */
function Frame({ height, label, children, className, interactive = false }: { height: number; label: string; children: React.ComponentProps<typeof ChartContainer>['children']; className?: string; interactive?: boolean }) {
  return (
    <figure className={cn('chart m-0 w-full min-w-0', className)} {...(interactive ? { 'aria-label': label } : { role: 'img', 'aria-label': label })}>
      {/* Start narrow: a wide first render inside flex layouts can push the layout wider and feed a resize loop. */}
      <ChartContainer config={{}} className="aspect-auto w-full min-w-0" style={{ height }} initialDimension={{ width: 280, height }}>
        {children}
      </ChartContainer>
    </figure>
  );
}

function Legend({ items }: { items: { label: string; swatch: ReactNode }[] }) {
  return (
    <div className="chart-legend" aria-hidden="true">
      {items.map((i) => (
        <span key={i.label}>
          {i.swatch} {i.label}
        </span>
      ))}
    </div>
  );
}

/** Share of comparable packages signed by day t: model curve plus the cohort's empirical curve (points from the API). */
export function DurationCurve({ curve, p50, p80, sampleSize, planned, H = 240 }: { curve: Analysis['curve']; p50: number; p80: number; sampleSize: number; planned: number; H?: number }) {
  const maxT = curve.at(-1)?.t ?? 360;

  return (
    <>
      <Legend
        items={[
          { label: 'Model estimate', swatch: <i className="lg-line" /> },
          { label: `Comparable packages (${sampleSize})`, swatch: <i className="lg-line lg-dash" /> },
          { label: 'Your plan', swatch: <i className="lg-rule" /> },
        ]}
      />
      <Frame height={H} label={`Share of comparable packages signed by day. Median ${Math.round(p50)} days, 80th percentile ${Math.round(p80)} days.`}>
        <ComposedChart data={curve} margin={{ top: 16, right: 16, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey="t" type="number" domain={[0, maxT]} ticks={Array.from({ length: maxT / 60 + 1 }, (_, i) => i * 60)} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => `${v * 100}%`} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, p) => `Day ${p?.[0]?.payload?.t ?? ''}`}
                formatter={(v, name) => (
                  <span>
                    {name === 'model' ? 'Model' : 'History'}: <strong>{Math.round(Number(v) * 100)}% signed</strong>
                  </span>
                )}
              />
            }
          />
          <Area dataKey="model" type="monotone" stroke="var(--ink)" strokeWidth={2} fill="var(--ink)" fillOpacity={0.06} isAnimationActive={false} />
          <Line dataKey="history" type="monotone" stroke="var(--muted-ink)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <ReferenceLine x={Math.round(p50)} stroke="var(--ink)" strokeDasharray="2 3" label={{ value: `P50 ${Math.round(p50)}d`, position: 'insideTopRight', fill: 'var(--ink)', fontSize: 12, fontWeight: 700 }} />
          <ReferenceLine x={Math.round(p80)} stroke="var(--ink)" strokeDasharray="2 3" label={{ value: `P80 ${Math.round(p80)}d`, position: 'insideTopRight', fill: 'var(--ink)', fontSize: 12, fontWeight: 700 }} />
          {planned <= maxT && (
            <ReferenceLine x={planned} stroke="var(--worse)" strokeWidth={1.5} strokeDasharray="5 4" label={{ value: `Plan ${planned}d`, position: 'insideTopLeft', fill: 'var(--worse)', fontSize: 12, fontWeight: 700 }} />
          )}
        </ComposedChart>
      </Frame>
    </>
  );
}

/** Diverging bars: how much each factor moves the estimate, up or down. */
export function DriverBars({ drivers, unit, max }: { drivers: { label: string; v: number }[]; unit: string; max?: number; compact?: boolean }) {
  const top = drivers.slice(0, 6).map((d) => ({ ...d, v: round(d.v) }));
  const lim = max ?? Math.max(5, ...top.map((d) => Math.abs(d.v)));
  const fmt = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}${unit}`;
  if (!top.length) return <p className="text-sm text-muted-ink">No factor moves this by more than a point.</p>;
  return (
    <Frame height={top.length * 30 + 16} label={top.map((d) => `${d.label} ${fmt(d.v)}`).join('; ')}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} accessibilityLayer={false}>
        <XAxis type="number" domain={[-lim, lim]} hide />
        <YAxis type="category" dataKey="label" width={170} tick={{ ...axisTick, fill: 'var(--ink-2)' }} tickLine={false} axisLine={false} interval={0} />
        <ReferenceLine x={0} stroke="var(--rule-strong)" />
        <Bar dataKey="v" barSize={12} radius={3} isAnimationActive={false}>
          {top.map((d) => (
            <Cell key={d.label} fill={d.v > 0 ? 'var(--worse)' : 'var(--better)'} />
          ))}
          <LabelList dataKey="v" position="right" formatter={(v: unknown) => fmt(Number(v))} style={{ fontSize: 12, fontWeight: 600, fill: 'var(--ink)' }} />
        </Bar>
      </BarChart>
    </Frame>
  );
}

function Diamond({ cx, cy }: { cx?: number | null; cy?: number | null }) {
  if (cx == null || cy == null) return <g />;
  return <rect x={cx - 6} y={cy - 6} width={12} height={12} transform={`rotate(45 ${cx} ${cy})`} fill="var(--retro)" stroke="var(--surface)" strokeWidth={2} />;
}

/** Ordinal step chart of supervision ratings, with the retrospective ICR rating as a distinct mark. */
export function RatingChart({ history, scale, names, onPick }: { history: RatingPoint[]; scale: string[]; names: Record<string, string>; onPick?: (cite: string) => void }) {
  const data = history.map((h) => ({
    ...h,
    isr: h.retrospective ? null : scale.indexOf(h.rating),
    icr: h.retrospective ? scale.indexOf(h.rating) : null,
  }));
  return (
    <>
      <Legend
        items={[
          { label: 'Supervision rating (ISR)', swatch: <i className="lg-dot" /> },
          { label: 'Completion rating (ICR)', swatch: <i className="lg-diamond" /> },
        ]}
      />
      <Frame height={240} label="Implementation progress ratings over time. Click a point to open its source." interactive>
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 24, bottom: 4, left: 0 }}
          accessibilityLayer={false}
          onClick={(s) => {
            const h = history[Number(s?.activeTooltipIndex)];
            if (h?.cite) onPick?.(h.cite);
          }}
          className="cursor-pointer"
        >
          <ReferenceArea y1={-0.5} y2={2.5} fill="var(--worse)" fillOpacity={0.06} label={{ value: 'Unsatisfactory range', position: 'insideBottomRight', fill: 'var(--muted-ink)', fontSize: 11 }} />
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
          <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tickFormatter={(v: number) => scale[v]} tick={axisTick} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <div className="chart-tooltip">
                  <strong>
                    {p.label}, {p.date}
                  </strong>
                  <span>{names[p.rating]}</span>
                  {p.cite && <span className="muted">Click to open source</span>}
                </div>
              );
            }}
          />
          <Line dataKey="isr" type="stepAfter" stroke="var(--ink)" strokeWidth={2} dot={{ r: 5, fill: 'var(--ink)', stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          <Scatter dataKey="icr" shape={<Diamond />} isAnimationActive={false} />
        </ComposedChart>
      </Frame>
    </>
  );
}

/** Planned vs actual milestone bars, months on the x axis. */
export function MilestoneChart({ milestones, today = '2025-07' }: { milestones: Milestone[]; today?: string; W?: number }) {
  const now = toMonth(today);
  const data = milestones.map((ms) => {
    const [ps, pe] = ms.planned.map(toMonth);
    const as = ms.actual[0] ? toMonth(ms.actual[0]) : null;
    const ae = ms.actual[1] ? toMonth(ms.actual[1]) : as !== null ? now : null;
    const late = ae !== null && (ms.actual[1] ? ae > pe : now > pe);
    return { name: ms.name, planned: [ps, pe + 1], actual: as !== null && ae !== null ? [as, ae + 1] : null, late, ongoing: !ms.actual[1] };
  });
  const all = data.flatMap((d) => [...d.planned, ...(d.actual ?? [])]);
  const t0 = Math.min(...all);
  const t1 = Math.max(...all, now) + 2;
  const years: number[] = [];
  for (let n = t0; n <= t1; n++) if (n % 12 === 0) years.push(n);
  return (
    <>
      <Legend
        items={[
          { label: 'Planned', swatch: <i className="lg-plan" /> },
          { label: 'Actual', swatch: <i className="lg-actual" /> },
          { label: 'Today', swatch: <i className="lg-rule" /> },
        ]}
      />
      <Frame height={data.length * 38 + 40} label="Planned and actual milestone dates">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 4, left: 4 }} barGap={2} accessibilityLayer={false}>
          <CartesianGrid horizontal={false} stroke="var(--rule)" />
          <XAxis type="number" domain={[t0, t1]} ticks={years} tickFormatter={(n: number) => String(n / 12)} tick={axisTick} tickLine={false} axisLine={false} allowDataOverflow />
          <YAxis type="category" dataKey="name" width={170} tick={{ ...axisTick, fill: 'var(--ink-2)', fontSize: 12.5 }} tickLine={false} axisLine={false} interval={0} />
          <Bar dataKey="planned" barSize={9} radius={3} fill="var(--sunk)" stroke="var(--rule-strong)" isAnimationActive={false} />
          <Bar dataKey="actual" barSize={9} radius={3} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.late ? 'var(--worse)' : 'var(--ink)'} fillOpacity={d.ongoing ? 0.75 : 1} />
            ))}
          </Bar>
          <ReferenceLine x={now} stroke="var(--worse)" strokeWidth={1.5} strokeDasharray="5 4" />
        </BarChart>
      </Frame>
    </>
  );
}

/** Small trend line with a dashed target. */
export function Sparkline({ values, target }: { values: number[]; target?: number; better?: 'up' | 'down' }) {
  const data = values.map((v, i) => ({ i, v }));
  const lo = Math.min(...values, target ?? Infinity);
  const hi = Math.max(...values, target ?? -Infinity);
  return (
    <LineChart width={120} height={32} data={data} margin={{ top: 3, right: 4, bottom: 3, left: 2 }} accessibilityLayer={false} aria-hidden="true">
      <YAxis hide domain={[lo, hi]} />
      {target !== undefined && <ReferenceLine y={target} stroke="var(--good)" strokeWidth={1.5} strokeDasharray="3 3" />}
      <Line dataKey="v" stroke="var(--ink)" strokeWidth={2} isAnimationActive={false} dot={(p: { index?: number; cx?: number; cy?: number }) => (p.index === values.length - 1 ? <circle key="last" cx={p.cx} cy={p.cy} r={2.5} fill="var(--ink)" /> : <g key={p.index} />)} />
    </LineChart>
  );
}

/**
 * Elevation along the alignment, coloured by construction status. Hover moves a
 * marker on the map; click jumps the close view or drive to that kilometre.
 */
export function ElevationProfile({ profile, segments, colors, markKm, onHover, onPick }: { profile: ProfilePoint[]; segments: RoadSegment[]; colors: Record<string, string>; markKm?: number | null; onHover?: (km: number | null) => void; onPick?: (km: number) => void }) {
  const maxKm = profile[profile.length - 1]?.km ?? 1;
  const lo = Math.floor(Math.min(...profile.map((p) => p.elev)) / 50) * 50;
  // Keep at least a 50 m band so flat ground (min = max) still draws.
  const hi = Math.max(Math.ceil(Math.max(...profile.map((p) => p.elev)) / 50) * 50, lo + 50);
  const data = useMemo(
    () =>
      profile.map((p) => {
        const row: Record<string, number | null> = { km: round(p.km, 2), elev: round(p.elev), grade: round(p.grade, 1), steep: Math.abs(p.grade) >= 8 ? lo : null };
        segments.forEach((s, i) => (row[`s${i}`] = p.km >= s.from && p.km <= s.to ? round(p.elev) : null));
        return row;
      }),
    [profile, segments, lo],
  );
  const near = (km: number) => profile.reduce((b, p) => (Math.abs(p.km - km) < Math.abs(b.km - km) ? p : b), profile[0]);
  const mark = markKm != null ? near(markKm) : null;
  const ticks: number[] = [];
  for (let k = 0; k <= maxKm; k += maxKm > 50 ? 10 : 5) ticks.push(k);
  const pointAt = (idx: unknown) => profile[Number(idx)];
  const tick = { fontSize: 10.5, fill: '#9fb0a9' };

  return (
    <div className="profile-chart" role="img" aria-label={`Elevation profile from ${Math.round(lo)} to ${Math.round(hi)} metres over ${Math.round(maxKm)} km`}>
      <ChartContainer config={{}} className="aspect-auto h-[150px] w-full [&_.recharts-cartesian-axis-tick_text]:fill-[#9fb0a9]" initialDimension={{ width: 280, height: 150 }}>
        <ComposedChart
          data={data}
          margin={{ top: 14, right: 12, bottom: 0, left: 0 }}
          accessibilityLayer={false}
          onMouseMove={(s) => {
            const p = pointAt(s?.activeTooltipIndex);
            if (p) onHover?.(p.km);
          }}
          onMouseLeave={() => onHover?.(null)}
          onClick={(s) => {
            const p = pointAt(s?.activeTooltipIndex);
            if (p) onPick?.(p.km);
          }}
          className="cursor-crosshair"
        >
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.12)" />
          <XAxis dataKey="km" type="number" domain={[0, maxKm]} ticks={ticks} tick={tick} tickLine={false} axisLine={false} />
          <YAxis domain={[lo, hi]} ticks={[lo, (lo + hi) / 2, hi]} tickFormatter={(e: number) => `${Math.round(e).toLocaleString('en')} m`} tick={tick} tickLine={false} axisLine={false} width={60} />
          <Tooltip
            cursor={{ stroke: '#fff', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { km: number; elev: number; grade: number } | undefined;
              if (!active || !p) return null;
              return (
                <div className="p-tip">
                  km {p.km.toFixed(1)}, {Math.round(p.elev)} m, grade {p.grade > 0 ? '+' : ''}
                  {p.grade.toFixed(1)}%
                </div>
              );
            }}
          />
          <Area dataKey="elev" type="monotone" stroke="none" fill="#fff" fillOpacity={0.08} isAnimationActive={false} />
          {segments.map((s, i) => (
            <Line key={s.from} dataKey={`s${i}`} type="monotone" stroke={colors[s.status]} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} activeDot={false} />
          ))}
          <Scatter dataKey="steep" fill="#ff4fa3" shape={(p: { cx?: number; cy?: number }) => <rect x={(p.cx ?? 0) - 1} y={(p.cy ?? 0) - 6} width={2} height={6} fill="#ff4fa3" />} isAnimationActive={false} />
          {mark && <ReferenceDot x={round(mark.km, 2)} y={round(mark.elev)} r={4} fill="#2563eb" stroke="#fff" strokeWidth={2} />}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

const Hatch = ({ id }: { id: string }) => (
  <defs>
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="3" height="6" fill="var(--rule-strong)" />
    </pattern>
  </defs>
);

/** Days to signature by method: bar spans P20–P80, tick marks the median. */
export function MethodRange({ options, best }: { options: { method: string; p20: number; p50: number; p80: number; rebid: number; current: boolean; limit: string | null }[]; best: string | null }) {
  const max = Math.ceil(Math.max(...options.map((o) => o.p80)) / 60) * 60;
  const data = options.map((o) => ({ ...o, range: [Math.round(o.p20), Math.round(o.p80)], median: Math.round(o.p50) }));
  const methodTick = ({ x = 0, y = 0, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) => {
    const o = data.find((d) => d.method === payload?.value);
    if (!o) return null;
    return (
      <g transform={`translate(${x},${y})`} data-testid="method-row">
        <text x={-8} y={o.limit ? -2 : 4} textAnchor="end" fontSize={13} fontWeight={o.current ? 700 : 400} fill={o.limit ? 'var(--muted-ink)' : 'var(--ink)'}>
          {o.method}
          {o.method === best ? '  ★ Best' : ''}
        </text>
        {o.limit && (
          <text x={-8} y={13} textAnchor="end" fontSize={11} fill="var(--muted-ink)">
            {o.limit}
          </text>
        )}
      </g>
    );
  };
  return (
    <>
      <Frame height={data.length * 46 + 36} label="Days to contract signature by procurement method">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 8 }} accessibilityLayer={false}>
          <Hatch id="mr-hatch" />
          <CartesianGrid horizontal={false} stroke="var(--rule)" />
          <XAxis type="number" domain={[0, max]} ticks={Array.from({ length: max / 60 + 1 }, (_, i) => i * 60)} tick={axisTick} tickLine={false} axisLine={false} orientation="top" />
          <YAxis type="category" dataKey="method" width={230} tick={methodTick} tickLine={false} axisLine={false} interval={0} />
          <Bar dataKey="range" barSize={12} radius={4} isAnimationActive={false}>
            {data.map((o) => (
              <Cell key={o.method} fill={o.limit ? 'url(#mr-hatch)' : o.current ? 'var(--ink-2)' : 'var(--rule-strong)'} />
            ))}
          </Bar>
          <Scatter
            dataKey="median"
            isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number; index?: number }) => {
              const o = data[p.index ?? 0];
              return (
                <g>
                  <rect x={(p.cx ?? 0) - 1.5} y={(p.cy ?? 0) - 9} width={3} height={18} rx={1} fill="var(--ink)" />
                  <text x="100%" dx={-92} y={(p.cy ?? 0) + 4} fontSize={12.5} fontWeight={600} fill="var(--ink)">
                    {o.median}d
                  </text>
                  <text x="100%" dx={-40} y={(p.cy ?? 0) + 4} fontSize={12.5} fill="var(--muted-ink)">
                    {Math.round(o.rebid * 100)}%
                  </text>
                </g>
              );
            }}
          />
        </BarChart>
      </Frame>
      <p className="fine">Bar: 20th to 80th percentile days to signature. Tick: median. Right: median days and re-tender risk. Hatched rows are above the method’s value limit or need justification.</p>
    </>
  );
}

/** Draft value against the benchmark band for each tender criterion. */
export function BenchmarkBullets({ rows }: { rows: { label: string; value: number; lo: number; hi: number; max: number; fmt: (v: number) => string }[] }) {
  const data = rows.map((r) => {
    const out = r.value < r.lo || r.value > r.hi;
    const scale = (v: number) => round(Math.min(100, (v / r.max) * 100), 2);
    return { label: r.label, band: [scale(r.lo), scale(r.hi)], value: scale(r.value), text: r.fmt(r.value), out };
  });
  const valueTick = ({ x = 0, y = 0, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) => {
    const d = data.find((r) => r.label === payload?.value);
    return d ? (
      <text x={Number(x) + 8} y={Number(y) + 4} fontSize={12.5} fontWeight={700} textAnchor="start" fill={d.out ? 'var(--worse)' : 'var(--ink)'}>
        {d.text}
      </text>
    ) : null;
  };
  return (
    <Frame height={data.length * 26 + 8} label={`Draft criteria against benchmarks: ${data.map((d) => `${d.label} ${d.text}${d.out ? ' (outside benchmark)' : ''}`).join('; ')}`} className="mb-3">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} accessibilityLayer={false}>
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis yAxisId="l" type="category" dataKey="label" width={190} tick={{ ...axisTick, fill: 'var(--ink-2)', fontSize: 12 }} tickLine={false} axisLine={false} interval={0} />
        <YAxis yAxisId="r" type="category" dataKey="label" orientation="right" width={8} tick={valueTick} tickLine={false} axisLine={false} interval={0} />
        <Bar yAxisId="l" dataKey="band" barSize={10} radius={3} fill="var(--good-tint)" stroke="var(--good)" strokeOpacity={0.4} isAnimationActive={false} background={{ fill: 'var(--sunk)', radius: 3 }} />
        <Scatter
          yAxisId="l"
          dataKey="value"
          isAnimationActive={false}
          shape={(p: { cx?: number; cy?: number; index?: number }) => <rect x={(p.cx ?? 0) - 1.5} y={(p.cy ?? 0) - 8} width={3} height={16} rx={1} fill={data[p.index ?? 0].out ? 'var(--worse)' : 'var(--ink)'} />}
        />
      </BarChart>
    </Frame>
  );
}

/** Cumulative planned vs actual physical progress for a contract. */
export function ProgressCurve({ contract, today = '2025-07', H = 220 }: { contract: Contract; today?: string; W?: number; H?: number }) {
  const plannedEnds = contract.milestones.map((m) => m.planned[1]).filter((v): v is string => !!v);
  const start = toMonth(contract.signed.slice(0, 7));
  const end = plannedEnds.length ? Math.max(...plannedEnds.map(toMonth)) : start + 24;
  const now = toMonth(today);
  const span = Math.max(end, now) + 2 - start;
  // Logistic S-curve through 0 at signature and 100 at planned completion.
  const s = (n: number) => 100 / (1 + Math.exp(-9 * ((n - start) / (end - start) - 0.5)));
  const scale = contract.planned / s(now) || 1;
  const plan = (n: number) => Math.min(100, s(n) * scale);
  const ratio = contract.planned ? contract.actual / contract.planned : 1;
  const data = Array.from({ length: span + 1 }, (_, i) => {
    const n = start + i;
    return { n, plan: round(plan(n)), actual: n <= now ? round(plan(n) * ratio) : null };
  });
  const years = data.map((d) => d.n).filter((n) => n % 12 === 0);
  return (
    <>
      <Legend
        items={[
          { label: 'Planned progress', swatch: <i className="lg-line lg-dash" /> },
          { label: 'Reported progress', swatch: <i className="lg-line" /> },
          { label: 'Gap today', swatch: <i className="lg-rule" /> },
        ]}
      />
      <Frame height={H} label={`Progress for ${contract.id}: ${contract.actual}% done against ${contract.planned}% planned.`}>
        <LineChart data={data} margin={{ top: 14, right: 16, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey="n" type="number" domain={[start, start + span]} ticks={years} tickFormatter={(n: number) => String(n / 12)} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(v, name) => <span>{name === 'plan' ? 'Planned' : 'Reported'}: <strong>{Math.round(Number(v))}%</strong></span>} />} />
          <Line dataKey="plan" type="monotone" stroke="var(--muted-ink)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line dataKey="actual" type="monotone" stroke="var(--ink)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <ReferenceLine segment={[{ x: now, y: contract.actual }, { x: now, y: contract.planned }]} stroke="var(--worse)" strokeWidth={2} strokeDasharray="3 3" />
        </LineChart>
      </Frame>
    </>
  );
}

/** Progress from baseline toward a target (not a chart: a single bar). */
export function TargetBar({ base, now, target }: { base: number; now: number; target: number }) {
  const p = Math.max(0, Math.min(1, (now - base) / (target - base || 1)));
  return (
    <span className="target-bar" title={`${Math.round(p * 100)}% of the way from baseline to target`}>
      <span className="tb-track">
        <span className={cn('tb-fill', p >= 1 && 'is-met')} style={{ width: cssPct(p * 100) }} />
      </span>
      <em>{Math.round(p * 100)}%</em>
    </span>
  );
}

/**
 * One dot per comparable package by days to signature. Move the plan line
 * (drag, click or arrow keys on the slider) to read how many were signed by then.
 */
export function ComparablesStrip({ sample, planned, onPlanned, onCommit }: { sample: number[]; planned: number; onPlanned: (days: number) => void; onCommit?: () => void }) {
  const sorted = useMemo(() => [...sample].sort((a, b) => a - b), [sample]);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const maxT = Math.max(360, Math.ceil((q(0.97) * 1.05) / 60) * 60);
  const dots = useMemo(() => {
    const step = maxT / 96; // about one dot width per column
    const stacks: Record<number, number> = {};
    return sorted
      .filter((t) => t <= maxT)
      .map((t) => {
        const col = Math.round(t / step);
        stacks[col] = (stacks[col] ?? 0) + 1;
        return { t: round(col * step), y: stacks[col] };
      });
  }, [sorted, maxT]);
  const top = Math.max(12, ...dots.map((d) => d.y)) + 4;
  const within = sorted.filter((t) => t <= planned).length;
  const margin = { top: 22, right: 12, bottom: 4, left: 12 };

  return (
    <figure className="chart strip m-0">
      <p className="strip-read" data-testid="strip-read">
        <strong>
          {within} of {sorted.length}
        </strong>{' '}
        comparable packages were signed within <strong>{planned} days</strong>.
      </p>
      <div className="relative">
        <ChartContainer config={{}} className="aspect-auto h-[170px] w-full min-w-0" initialDimension={{ width: 280, height: 170 }}>
          <ScatterChart margin={margin} accessibilityLayer={false}>
            <XAxis dataKey="t" type="number" domain={[0, maxT]} ticks={Array.from({ length: Math.floor(maxT / 120) + 1 }, (_, i) => i * 120)} tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis dataKey="y" type="number" domain={[0, top]} hide />
            <ReferenceArea x1={Math.round(q(0.25))} x2={Math.round(q(0.75))} fill="var(--sunk)" fillOpacity={1} />
            <ReferenceLine x={Math.round(q(0.5))} stroke="var(--ink-2)" strokeDasharray="2 3" label={{ value: 'median', position: 'top', fill: 'var(--ink-2)', fontSize: 11, fontWeight: 700 }} />
            <ReferenceLine x={Math.round(q(0.8))} stroke="var(--ink-2)" strokeDasharray="2 3" label={{ value: 'P80', position: 'top', fill: 'var(--ink-2)', fontSize: 11, fontWeight: 700 }} />
            <Scatter data={dots} isAnimationActive={false} shape={(p: { cx?: number; cy?: number; payload?: { t: number } }) => <circle cx={p.cx} cy={p.cy} r={1.9} fill={(p.payload?.t ?? 0) <= planned ? 'var(--ink-2)' : 'var(--rule-strong)'} />} />
            <ReferenceLine x={Math.min(planned, maxT)} stroke="var(--worse)" strokeWidth={2} label={{ value: `${planned}d`, position: 'insideTopRight', fill: 'var(--worse)', fontSize: 11.5, fontWeight: 700 }} />
          </ScatterChart>
        </ChartContainer>
        {/* The control: a native range input laid over the plot, so drag, click and keys all work. */}
        <input
          type="range"
          min={10}
          max={maxT}
          step={5}
          value={Math.min(planned, maxT)}
          onChange={(e) => onPlanned(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          aria-label="Planned days to signature"
          aria-valuenow={planned}
          aria-valuetext={`${planned} days; ${within} of ${sorted.length} comparable packages signed by then`}
          className="strip-range absolute"
          style={{ left: margin.left, right: margin.right, top: margin.top, bottom: 24 }}
        />
      </div>
      <figcaption className="fine mt-1">Each dot is a comparable package; the shaded band is the middle half. Drag the plan line or use the arrow keys.</figcaption>
    </figure>
  );
}

/** Share of a project's commitment disbursed, against peers at the same age. */
export function DisbursementPeers({ actual, peers, months, H = 230 }: { actual: { m: number; v: number }[]; peers: { m: number; p25: number; p50: number; p75: number }[]; months: number; W?: number; H?: number }) {
  const ms = Array.from(new Set([...peers.map((p) => p.m), ...actual.map((a) => a.m)])).sort((a, b) => a - b);
  const data = ms.map((m) => {
    const p = peers.find((x) => x.m === m);
    const a = actual.find((x) => x.m === m);
    return { m, band: p ? [p.p25, p.p75] : null, p50: p?.p50 ?? null, v: a?.v ?? null };
  });
  const last = actual[actual.length - 1];
  const peer = peers.reduce((b, p) => (Math.abs(p.m - last.m) < Math.abs(b.m - last.m) ? p : b), peers[0]);
  return (
    <>
      <Legend
        items={[
          { label: 'This project', swatch: <i className="lg-line" /> },
          { label: 'Peer median', swatch: <i className="lg-line lg-dash" /> },
          { label: 'Middle half of peers', swatch: <i className="lg-band" /> },
        ]}
      />
      <Frame height={H} label={`Disbursed ${last.v}% at month ${last.m} against a peer median of ${peer.p50}%.`}>
        <ComposedChart data={data} margin={{ top: 14, right: 16, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey="m" type="number" domain={[0, months]} ticks={Array.from({ length: Math.floor(months / 12) + 1 }, (_, i) => i * 12)} tickFormatter={(n: number) => (n ? `yr ${n / 12}` : '0')} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `Month ${p?.[0]?.payload?.m ?? ''}`} formatter={(v, name) => (name === 'band' ? null : <span>{name === 'v' ? 'This project' : 'Peer median'}: <strong>{String(v)}%</strong></span>)} />} />
          <Area dataKey="band" type="monotone" stroke="none" fill="var(--rule)" fillOpacity={0.8} connectNulls isAnimationActive={false} />
          <Line dataKey="p50" type="monotone" stroke="var(--muted-ink)" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
          <Line dataKey="v" type="monotone" stroke="var(--ink)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          <ReferenceLine segment={[{ x: last.m, y: last.v }, { x: last.m, y: peer.p50 }]} stroke="var(--worse)" strokeWidth={2} strokeDasharray="3 3" label={{ value: `${peer.p50 - last.v} pts behind`, position: 'right', fill: 'var(--worse)', fontSize: 12, fontWeight: 700 }} />
        </ComposedChart>
      </Frame>
    </>
  );
}

const TONE: Record<string, string> = { good: 'var(--ledger)', alt: 'var(--procedure)', quiet: 'var(--rule-strong)' };

/** Horizontal bars with a value label. */
export function HBars({ rows, unit = '', max }: { rows: { label: string; note?: string; v: number; tone?: string }[]; unit?: string; max?: number }) {
  const data = rows.map((r) => ({ ...r, name: r.note ? `${r.label} (${r.note})` : r.label }));
  return (
    <Frame height={data.length * 30 + 12} label={data.map((r) => `${r.name}: ${r.v.toLocaleString('en')}${unit}`).join('; ')} className="max-w-[860px]">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} accessibilityLayer={false}>
        <XAxis type="number" domain={[0, max ?? 'dataMax']} hide />
        <YAxis type="category" dataKey="name" width={240} tick={{ ...axisTick, fill: 'var(--ink-2)', fontSize: 12.5 }} tickLine={false} axisLine={false} interval={0} />
        <Bar dataKey="v" barSize={12} radius={3} isAnimationActive={false} background={{ fill: 'var(--sunk)', radius: 3 }}>
          {data.map((r) => (
            <Cell key={r.name} fill={TONE[r.tone ?? ''] ?? 'var(--ink-2)'} />
          ))}
          <LabelList dataKey="v" position="right" formatter={(v: unknown) => `${Number(v).toLocaleString('en')}${unit}`} style={{ fontSize: 12.5, fontWeight: 700, fill: 'var(--ink)' }} />
        </Bar>
      </BarChart>
    </Frame>
  );
}

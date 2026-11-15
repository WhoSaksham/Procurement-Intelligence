'use client';

import type { Map as MlMap } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ElevationProfile } from '@/components/charts';
import { Cite } from '@/components/evidence/Cite';
import { ROADS } from '@/data/roads';
import { elevationProfile, profileStats } from '@/lib/elevation';
import { alignment, headingAt, lerpAngle, pointAt } from '@/lib/geo';
import type { Contract, RoadSegment } from '@/lib/types';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';
import { MapCanvas, STATUS, type Basemap } from './MapCanvas';
import { cssPct } from '@/lib/format';

const ENDS: Record<string, [string, string]> = { 'RRA-W-07': ['Kitui', 'Mwingi'], 'RRA-W-08': ['Wote', 'Kathonzweni'] };
const CITES: Record<string, string[]> = { 'RRA-W-07': ['s2w07', 'isr2'], 'RRA-W-08': ['s2w08'] };
const BEFORE = 2019;
const AFTER = 2024;
const SEEN = 0.1; // bare-soil index change treated as visible works
const SPEEDS = [
  { label: '1×', kmps: 0.12 },
  { label: '4×', kmps: 0.45 },
  { label: '12×', kmps: 1.4 },
];
const CLOSE = { zoom: 16.2, pitch: 66 };
const COLORS = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.color]));

const km = (segs: RoadSegment[]) => segs.reduce((s, x) => s + (x.to - x.from), 0);
const fmt = (n: number) => Math.round(n).toLocaleString('en');

/** Keep two maps on the same camera while comparing years. */
function syncMaps(a: MlMap, b: MlMap) {
  let busy = false;
  const follow = (src: MlMap, dst: MlMap) => () => {
    if (busy) return;
    busy = true;
    dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom(), bearing: src.getBearing(), pitch: src.getPitch() });
    busy = false;
  };
  const ab = follow(a, b);
  const ba = follow(b, a);
  a.on('move', ab);
  b.on('move', ba);
  ab();
  return () => {
    a.off('move', ab);
    b.off('move', ba);
  };
}

type Drive = { playing: boolean; speed: number };

/** Map for one road contract. Remounted (by key) when the contract changes. */
function RoadMap({ contract, mapped, onContract }: { contract: Contract; mapped: Contract[]; onContract: (id: string) => void }) {
  const road = ROADS[contract.id];
  const line = useMemo(() => alignment(road), [road]);
  const [imageryYear, setImageryYear] = useState(AFTER);
  const [compare, setCompare] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('s2');
  const [terrain, setTerrain] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [split, setSplit] = useState(62);
  const [showProfile, setShowProfile] = useState(true);
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const [close, setClose] = useState<{ km: number; at: number } | null>(null);
  const [drive, setDrive] = useState<Drive | null>(null);
  const [driveKm, setDriveKm] = useState(0);
  const [maps, setMaps] = useState<{ a: MlMap | null; b: MlMap | null }>({ a: null, b: null });
  const driveRef = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const profile = useAsync(contract.id, () => elevationProfile(line));

  const narrow = typeof window !== 'undefined' && window.innerWidth < 820;
  const padding = narrow ? 40 : { top: 90, bottom: showProfile ? 220 : 50, left: 380, right: 70 };

  useEffect(() => {
    if (!compare || !maps.a || !maps.b) return;
    return syncMaps(maps.a, maps.b);
  }, [compare, maps]);

  // Close view: fly to a kilometre on high-resolution imagery with terrain, looking along the road.
  useEffect(() => {
    if (!close || !maps.a) return;
    maps.a.flyTo({ center: pointAt(line, close.km), bearing: headingAt(line, close.km), ...CLOSE, duration: 2600, essential: true });
  }, [close, maps.a, line]);

  // Drive: move the camera along the alignment, smoothing the heading.
  useEffect(() => {
    const map = maps.a;
    if (!drive?.playing || !map) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    let head = map.getBearing();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      driveRef.current = Math.min(line.length, driveRef.current + SPEEDS[drive.speed].kmps * dt);
      head = lerpAngle(head, headingAt(line, driveRef.current, 0.6), Math.min(1, dt * 2));
      map.jumpTo({ center: pointAt(line, driveRef.current), bearing: head, zoom: 16, pitch: 70 });
      if (now - lastUi > 120) {
        lastUi = now;
        setDriveKm(driveRef.current);
      }
      if (driveRef.current >= line.length) {
        setDriveKm(line.length);
        setDrive((d) => d && { ...d, playing: false });
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [drive?.playing, drive?.speed, line, maps.a]);

  const goRealistic = () => {
    setCompare(false);
    setBasemap('hires');
    setTerrain(true);
  };
  const closeAt = (k: number) => {
    goRealistic();
    setClose({ km: k, at: Date.now() });
  };
  const startDrive = (from = 0) => {
    goRealistic();
    setSelected(null);
    driveRef.current = from;
    setDriveKm(from);
    setDrive({ playing: false, speed: 1 });
    maps.a?.flyTo({ center: pointAt(line, from), bearing: headingAt(line, from), zoom: 16, pitch: 70, duration: 2500 });
    maps.a?.once('moveend', () => setDrive((d) => d && { ...d, playing: true }));
  };
  const exitDrive = () => {
    setDrive(null);
    maps.a?.fitBounds([pointAt(line, 0), pointAt(line, line.length)], { padding, pitch: 45, duration: 1500 });
  };
  const pickKm = (k: number) => {
    if (drive) {
      driveRef.current = k;
      setDriveKm(k);
    } else closeAt(k);
  };

  const pts = profile.data;
  const started = road.segments.filter((s) => s.status !== 'not-started');
  const seen = road.segments.filter((s) => s.change >= SEEN);
  const mismatches = road.segments.filter((s) => s.note).length;
  const cursorKm = hoverKm ?? (drive ? driveKm : null);
  const cursor = cursorKm != null ? pointAt(line, cursorKm) : null;
  const driveSeg = road.segments.find((s) => driveKm >= s.from && driveKm <= s.to) ?? road.segments[road.segments.length - 1];
  const drivePt = pts?.reduce((b, p) => (Math.abs(p.km - driveKm) < Math.abs(b.km - driveKm) ? p : b), pts[0]);
  const whole = pts ? profileStats(pts) : null;

  const drag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = stage.current!.getBoundingClientRect();
    const move = (ev: { clientX: number }) => setSplit(Math.min(95, Math.max(5, ((ev.clientX - r.left) / r.width) * 100)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e);
  };

  const shared = { road, ends: ENDS[contract.id], basemap: compare ? ('s2' as const) : basemap, terrain, selected, onSelect: setSelected, padding, cursor };

  return (
    <div className={cn('sitemap', drive && 'is-driving')}>
      <div className="map-stage" ref={stage} data-testid="map-stage" data-ready={maps.a ? 'true' : 'false'}>
        <MapCanvas {...shared} year={compare ? BEFORE : imageryYear} onReady={(a) => setMaps((m) => ({ ...m, a }))} />
        {compare && (
          <>
            <div className="map-over" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <MapCanvas {...shared} year={AFTER} onReady={(b) => setMaps((m) => ({ ...m, b }))} />
            </div>
            <div
              className="swipe"
              style={{ left: cssPct(split) }}
              role="slider"
              tabIndex={0}
              aria-label="Compare position"
              aria-valuenow={Math.round(split)}
              aria-valuemin={5}
              aria-valuemax={95}
              onPointerDown={drag}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setSplit((s) => Math.max(5, s - 5));
                if (e.key === 'ArrowRight') setSplit((s) => Math.min(95, s + 5));
              }}
            >
              <span aria-hidden="true">⟷</span>
              <em className="swipe-tag before">{BEFORE}, before works</em>
              <em className="swipe-tag after">{AFTER}, latest</em>
            </div>
          </>
        )}

        {drive ? (
          <div className="drive-hud" role="group" aria-label="Drive controls" data-testid="drive-hud">
            <span>
              <strong>km {driveKm.toFixed(1)}</strong> of {Math.round(line.length)}
            </span>
            <span className="hud-status">
              <i className={`seg-swatch st-${driveSeg.status}`} aria-hidden="true" />
              {STATUS[driveSeg.status].label}
            </span>
            {drivePt && (
              <span>
                {fmt(drivePt.elev)} m, {drivePt.grade > 0 ? '+' : ''}
                {drivePt.grade.toFixed(1)}%
              </span>
            )}
            <button type="button" onClick={() => setDrive((d) => d && { ...d, playing: !d.playing })}>
              {drive.playing ? 'Pause' : driveKm >= line.length ? 'Done' : 'Play'}
            </button>
            <span className="seg" role="group" aria-label="Speed">
              {SPEEDS.map((s, i) => (
                <button key={s.label} type="button" aria-pressed={drive.speed === i} onClick={() => setDrive((d) => d && { ...d, speed: i })}>
                  {s.label}
                </button>
              ))}
            </span>
            <button type="button" onClick={exitDrive}>
              Exit
            </button>
          </div>
        ) : (
          <div className="map-toolbar" role="toolbar" aria-label="Map view">
            <div className="seg" role="group" aria-label="Imagery">
              <button type="button" aria-pressed={!compare && basemap === 's2' && imageryYear === BEFORE} onClick={() => (setCompare(false), setBasemap('s2'), setImageryYear(BEFORE))}>
                {BEFORE}
              </button>
              <button type="button" aria-pressed={!compare && basemap === 's2' && imageryYear === AFTER} onClick={() => (setCompare(false), setBasemap('s2'), setImageryYear(AFTER))}>
                {AFTER}
              </button>
              <button type="button" aria-pressed={compare} onClick={() => setCompare(!compare)}>
                Compare
              </button>
              <button type="button" aria-pressed={!compare && basemap === 'hires'} onClick={() => (setCompare(false), setBasemap('hires'))}>
                High-res
              </button>
            </div>
            <button type="button" className="seg-single" aria-pressed={terrain} onClick={() => setTerrain(!terrain)}>
              3D
            </button>
            <button type="button" className="seg-single" aria-pressed={showProfile} onClick={() => setShowProfile(!showProfile)}>
              Profile
            </button>
          </div>
        )}
      </div>

      {showProfile && (
        <section className="profile" aria-label="Elevation profile" data-testid="profile">
          <p className="profile-head">
            <strong>Elevation along the road</strong>
            {whole && (
              <span>
                {fmt(whole.min)}–{fmt(whole.max)} m, {fmt(whole.climb)} m of climb, steepest {Math.abs(whole.steepest.grade).toFixed(1)}% at km {whole.steepest.km.toFixed(1)}
              </span>
            )}
            <span className="profile-hint">{drive ? 'Click to jump the drive' : 'Click for a close view'}</span>
          </p>
          {pts ? (
            <ElevationProfile profile={pts} segments={road.segments} colors={COLORS} markKm={drive ? driveKm : null} onHover={setHoverKm} onPick={pickKm} />
          ) : (
            <p className="profile-wait">{profile.error ? 'Terrain data could not be loaded. Check the connection and reopen the map.' : 'Reading terrain along the alignment…'}</p>
          )}
        </section>
      )}

      <aside className="map-panel">
        <div className="seg seg-full" role="group" aria-label="Contract">
          {mapped.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === contract.id} onClick={() => onContract(p.id)}>
              {p.id}
            </button>
          ))}
        </div>
        <h1 className="font-serif text-lg leading-snug font-semibold">{contract.title}</h1>
        <p className="text-sm text-muted-ink">{contract.supplier}</p>

        <div className="my-3.5 grid grid-cols-2 border-y border-rule">
          <div className="py-2.5">
            <p className="text-2xl font-semibold">
              {km(started)} <small className="text-sm font-normal text-muted-ink">km</small>
            </p>
            <p className="text-xs text-muted-ink">Reported under way</p>
          </div>
          <div className="border-l border-rule py-2.5 pl-3.5">
            <p className={cn('text-2xl font-semibold', mismatches && 'text-worse')}>
              {km(seen)} <small className="text-sm font-normal text-muted-ink">km</small>
            </p>
            <p className="text-xs text-muted-ink">
              Change seen from space
              <Cite ids={CITES[contract.id]} />
            </p>
          </div>
        </div>

        <div className="mb-3 flex gap-2">
          <button type="button" className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-50" onClick={() => startDrive(0)} disabled={!!drive}>
            Drive the road
          </button>
          <button type="button" className="rounded-lg border border-rule-strong px-3 py-2 text-sm font-semibold hover:bg-sunk" onClick={() => closeAt(line.length / 2)}>
            Close view
          </button>
        </div>

        <ol className="segments">
          {road.segments.map((s, i) => {
            const st = pts ? profileStats(pts, s.from, s.to) : null;
            return (
              <li key={s.from} className={cn(selected === i && 'is-sel')} data-testid={`segment-${i}`}>
                <button type="button" onClick={() => setSelected(selected === i ? null : i)} aria-expanded={selected === i}>
                  <span className={`seg-swatch st-${s.status}`} aria-hidden="true" />
                  <span className="font-semibold">
                    km {s.from}–{s.to}
                  </span>
                  <span className="text-ink-2">{STATUS[s.status].label}</span>
                  {s.note ? <span className="seg-flag">Mismatch</span> : <span />}
                </button>
                {selected === i && (
                  <div className="seg-detail">
                    <p>
                      Bare-soil change {BEFORE}→{AFTER}: <strong className="text-ink">{s.change.toFixed(2)}</strong> {s.change >= SEEN ? '(works visible)' : '(no visible change)'}
                    </p>
                    {st && (
                      <p>
                        Elevation {fmt(st.min)}–{fmt(st.max)} m, steepest grade {Math.abs(st.steepest.grade).toFixed(1)}% at km {st.steepest.km.toFixed(1)}
                      </p>
                    )}
                    {s.note && (
                      <p>
                        {s.note}
                        <Cite ids={CITES[contract.id]} />
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] font-medium text-procedure-ink">
                      <button type="button" className="hover:underline" onClick={() => closeAt((s.from + s.to) / 2)}>
                        Close view
                      </button>
                      {st && Math.abs(st.steepest.grade) >= 6 && (
                        <button type="button" className="hover:underline" onClick={() => closeAt(st.steepest.km)}>
                          View steepest point
                        </button>
                      )}
                      <button type="button" className="hover:underline" onClick={() => startDrive(s.from)}>
                        Drive from km {s.from}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

/** Road contracts on Sentinel-2 imagery, with close view, drive and elevation. */
export default function SiteMap({ contractId, portfolio, onContract }: { contractId: string | null; portfolio: Contract[]; onContract: (id: string) => void }) {
  const mapped = portfolio.filter((p) => p.mapped && ROADS[p.id]);
  const contract = mapped.find((p) => p.id === contractId) ?? mapped[0];
  return <RoadMap key={contract.id} contract={contract} mapped={mapped} onContract={onContract} />;
}

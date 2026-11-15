import { useEffect, useMemo, useRef, useState } from 'react';
import MapCanvas, { STATUS } from '../components/MapCanvas.jsx';
import { ElevationProfile } from '../components/charts.jsx';
import { Cite } from '../components/Evidence.jsx';
import { ROADS } from '../data/roads.js';
import { elevationProfile, profileStats } from '../lib/elevation.js';
import { alignment, headingAt, lerpAngle, pointAt } from '../lib/geo.js';

const ENDS = { 'RRA-W-07': ['Kitui', 'Mwingi'], 'RRA-W-08': ['Wote', 'Kathonzweni'] };
const CITES = { 'RRA-W-07': ['s2w07', 'isr2'], 'RRA-W-08': ['s2w08'] };
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

const km = (segs) => segs.reduce((s, x) => s + (x.to - x.from), 0);
const fmt = (n) => Math.round(n).toLocaleString('en');

// Keep two maps on the same camera while comparing years.
function syncMaps(a, b) {
  let busy = false;
  const follow = (src, dst) => () => {
    if (busy) return;
    busy = true;
    dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom(), bearing: src.getBearing(), pitch: src.getPitch() });
    busy = false;
  };
  const ab = follow(a, b), ba = follow(b, a);
  a.on('move', ab);
  b.on('move', ba);
  ab();
  return () => { a.off('move', ab); b.off('move', ba); };
}

export default function SiteMap({ contract, setContract, portfolio }) {
  const mapped = portfolio.filter((p) => p.mapped && ROADS[p.id]);
  const c = mapped.find((p) => p.id === contract) ?? mapped[0];
  const road = ROADS[c.id];
  const line = useMemo(() => alignment(road), [road]);

  const [imageryYear, setImageryYear] = useState(AFTER);
  const [compare, setCompare] = useState(false);
  const [basemap, setBasemap] = useState('s2');
  const [terrain, setTerrain] = useState(false);
  const [selected, setSelected] = useState(null);
  const [split, setSplit] = useState(62);
  const [showProfile, setShowProfile] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(false);
  const [hoverKm, setHoverKm] = useState(null);
  const [close, setClose] = useState(null);
  const [drive, setDrive] = useState(null);
  const [driveKm, setDriveKm] = useState(0);
  const driveRef = useRef(0);
  const maps = useRef({});
  const [ready, setReady] = useState(0);
  const stage = useRef(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 820;
  const padding = narrow ? 40 : { top: 90, bottom: showProfile ? 220 : 50, left: 380, right: 70 };

  useEffect(() => {
    setSelected(null);
    setDrive(null);
    setProfile(null);
    setProfileError(false);
    let live = true;
    elevationProfile(line).then((p) => live && setProfile(p)).catch(() => live && setProfileError(true));
    return () => { live = false; };
  }, [line]);

  useEffect(() => {
    if (!compare || !maps.current.a || !maps.current.b) return;
    return syncMaps(maps.current.a, maps.current.b);
  }, [compare, ready]);

  // Close view: fly to a kilometre on high-resolution imagery with terrain,
  // looking along the road. Runs after the map has applied the new imagery.
  useEffect(() => {
    if (!close || !maps.current.a) return;
    maps.current.a.flyTo({
      center: pointAt(line, close.km),
      bearing: headingAt(line, close.km),
      ...CLOSE,
      duration: 2600,
      essential: true,
    });
  }, [close]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive: move the camera along the alignment, smoothing the heading.
  useEffect(() => {
    const map = maps.current.a;
    if (!drive?.playing || !map) return;
    let raf, last = performance.now(), lastUi = 0;
    let head = map.getBearing();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      driveRef.current = Math.min(line.length, driveRef.current + SPEEDS[drive.speed].kmps * dt);
      head = lerpAngle(head, headingAt(line, driveRef.current, 0.6), Math.min(1, dt * 2));
      map.jumpTo({ center: pointAt(line, driveRef.current), bearing: head, zoom: 16, pitch: 70 });
      if (now - lastUi > 120) { lastUi = now; setDriveKm(driveRef.current); }
      if (driveRef.current >= line.length) {
        setDriveKm(line.length);
        setDrive((d) => d && { ...d, playing: false });
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [drive?.playing, drive?.speed, line]); // eslint-disable-line react-hooks/exhaustive-deps

  const goRealistic = () => {
    setCompare(false);
    setBasemap('hires');
    setTerrain(true);
  };

  const closeAt = (k) => {
    goRealistic();
    setClose({ km: k, at: Date.now() });
  };

  const startDrive = (from = 0) => {
    goRealistic();
    setSelected(null);
    driveRef.current = from;
    setDriveKm(from);
    setDrive({ playing: false, speed: 1 });
    const map = maps.current.a;
    map?.flyTo({ center: pointAt(line, from), bearing: headingAt(line, from), zoom: 16, pitch: 70, duration: 2500 });
    map?.once('moveend', () => setDrive((d) => d && { ...d, playing: true }));
  };

  const exitDrive = () => {
    setDrive(null);
    maps.current.a?.fitBounds([pointAt(line, 0), pointAt(line, line.length)], { padding, pitch: 45, duration: 1500 });
  };

  const pickKm = (k) => {
    if (drive) { driveRef.current = k; setDriveKm(k); }
    else closeAt(k);
  };

  const started = road.segments.filter((s) => s.status !== 'not-started');
  const seen = road.segments.filter((s) => s.change >= SEEN);
  const mismatches = road.segments.filter((s) => s.note).length;
  const cursorKm = hoverKm ?? (drive ? driveKm : null);
  const cursor = cursorKm != null ? pointAt(line, cursorKm) : null;
  const driveSeg = road.segments.find((s) => driveKm >= s.from && driveKm <= s.to) ?? road.segments.at(-1);
  const drivePt = profile?.reduce((b, p) => (Math.abs(p.km - driveKm) < Math.abs(b.km - driveKm) ? p : b), profile[0]);
  const whole = profile && profileStats(profile);

  const drag = (e) => {
    const r = stage.current.getBoundingClientRect();
    const move = (ev) => setSplit(Math.min(95, Math.max(5, ((ev.clientX - r.left) / r.width) * 100)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e);
  };

  const shared = { road, ends: ENDS[c.id], basemap: compare ? 's2' : basemap, terrain, selected, onSelect: setSelected, padding, cursor };

  return (
    <div className={`sitemap${drive ? ' is-driving' : ''}`}>
      <div className="map-stage" ref={stage}>
        <MapCanvas
          {...shared}
          year={compare ? BEFORE : imageryYear}
          onReady={(m) => { maps.current.a = m; setReady((n) => n + 1); }}
        />
        {compare && (
          <>
            <div className="map-over" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <MapCanvas {...shared} year={AFTER} onReady={(m) => { maps.current.b = m; setReady((n) => n + 1); }} />
            </div>
            <div
              className="swipe"
              style={{ left: `${split}%` }}
              role="slider"
              tabIndex="0"
              aria-label="Compare position"
              aria-valuenow={Math.round(split)}
              aria-valuemin="5"
              aria-valuemax="95"
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
          <div className="drive-hud" role="group" aria-label="Drive controls">
            <span className="hud-km"><strong>km {driveKm.toFixed(1)}</strong> of {Math.round(line.length)}</span>
            <span className="hud-status"><i className={`seg-swatch st-${driveSeg.status}`} aria-hidden="true" />{STATUS[driveSeg.status].label}</span>
            {drivePt && <span>{fmt(drivePt.elev)} m, {drivePt.grade > 0 ? '+' : ''}{drivePt.grade.toFixed(1)}%</span>}
            <button type="button" onClick={() => setDrive((d) => ({ ...d, playing: !d.playing }))}>
              {drive.playing ? 'Pause' : driveKm >= line.length ? 'Done' : 'Play'}
            </button>
            <span className="seg" role="group" aria-label="Speed">
              {SPEEDS.map((s, i) => (
                <button key={s.label} type="button" aria-pressed={drive.speed === i} onClick={() => setDrive((d) => ({ ...d, speed: i }))}>{s.label}</button>
              ))}
            </span>
            <button type="button" onClick={exitDrive}>Exit</button>
          </div>
        ) : (
          <div className="map-toolbar" role="toolbar" aria-label="Map view">
            <div className="seg" aria-label="Imagery">
              <button type="button" aria-pressed={!compare && basemap === 's2' && imageryYear === BEFORE}
                onClick={() => { setCompare(false); setBasemap('s2'); setImageryYear(BEFORE); }}>{BEFORE}</button>
              <button type="button" aria-pressed={!compare && basemap === 's2' && imageryYear === AFTER}
                onClick={() => { setCompare(false); setBasemap('s2'); setImageryYear(AFTER); }}>{AFTER}</button>
              <button type="button" aria-pressed={compare} onClick={() => setCompare(!compare)}>Compare</button>
              <button type="button" aria-pressed={!compare && basemap === 'hires'}
                onClick={() => { setCompare(false); setBasemap('hires'); }}>High-res</button>
            </div>
            <button type="button" className="seg-single" aria-pressed={terrain} onClick={() => setTerrain(!terrain)}>3D</button>
            <button type="button" className="seg-single" aria-pressed={showProfile} onClick={() => setShowProfile(!showProfile)}>Profile</button>
          </div>
        )}
      </div>

      {showProfile && (
        <section className="profile" aria-label="Elevation profile">
          <p className="profile-head">
            <strong>Elevation along the road</strong>
            {whole && (
              <span>
                {fmt(whole.min)}–{fmt(whole.max)} m, {fmt(whole.climb)} m of climb, steepest {Math.abs(whole.steepest.grade).toFixed(1)}% at km {whole.steepest.km.toFixed(1)}
              </span>
            )}
            <span className="profile-hint">{drive ? 'Click to jump the drive' : 'Click for a close view'}</span>
          </p>
          {profile ? (
            <ElevationProfile profile={profile} segments={road.segments} colors={COLORS} markKm={drive ? driveKm : null} onHover={setHoverKm} onPick={pickKm} />
          ) : (
            <p className="profile-wait">{profileError ? 'Terrain data could not be loaded. Check the connection and reopen the map.' : 'Reading terrain along the alignment…'}</p>
          )}
        </section>
      )}

      <aside className="map-panel">
        <div className="seg seg-full" role="group" aria-label="Contract">
          {mapped.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === c.id} onClick={() => setContract(p.id)}>{p.id}</button>
          ))}
        </div>
        <h1 className="map-title">{c.title}</h1>
        <p className="small muted">{c.supplier}</p>

        <div className="map-stats">
          <div>
            <p className="stat-value">{km(started)} <small>km</small></p>
            <p className="stat-label">Reported under way</p>
          </div>
          <div className={mismatches ? 'is-bad' : ''}>
            <p className="stat-value">{km(seen)} <small>km</small></p>
            <p className="stat-label">Change seen from space<Cite ids={CITES[c.id]} /></p>
          </div>
        </div>

        <div className="map-actions">
          <button type="button" className="btn-primary" onClick={() => startDrive(0)} disabled={!!drive}>Drive the road</button>
          <button type="button" className="btn-secondary" onClick={() => closeAt(line.length / 2)}>Close view</button>
        </div>

        <ol className="segments">
          {road.segments.map((s, i) => {
            const st = profile && profileStats(profile, s.from, s.to);
            return (
              <li key={i} className={`${selected === i ? 'is-sel' : ''}${s.note ? ' is-flag' : ''}`}>
                <button type="button" onClick={() => setSelected(selected === i ? null : i)} aria-expanded={selected === i}>
                  <span className={`seg-swatch st-${s.status}`} aria-hidden="true" />
                  <span className="seg-km">km {s.from}–{s.to}</span>
                  <span className="seg-status">{STATUS[s.status].label}</span>
                  {s.note && <span className="seg-flag">Mismatch</span>}
                </button>
                {selected === i && (
                  <div className="seg-detail">
                    <p>
                      Bare-soil change {BEFORE}→{AFTER}: <strong>{s.change.toFixed(2)}</strong>{' '}
                      {s.change >= SEEN ? '(works visible)' : '(no visible change)'}
                    </p>
                    {st && (
                      <p>Elevation {fmt(st.min)}–{fmt(st.max)} m, steepest grade {Math.abs(st.steepest.grade).toFixed(1)}% at km {st.steepest.km.toFixed(1)}</p>
                    )}
                    {s.note && <p className="seg-note">{s.note}<Cite ids={CITES[c.id]} /></p>}
                    <div className="seg-actions">
                      <button type="button" className="link" onClick={() => closeAt((s.from + s.to) / 2)}>Close view</button>
                      {st && Math.abs(st.steepest.grade) >= 6 && (
                        <button type="button" className="link" onClick={() => closeAt(st.steepest.km)}>View steepest point</button>
                      )}
                      <button type="button" className="link" onClick={() => startDrive(s.from)}>Drive from km {s.from}</button>
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

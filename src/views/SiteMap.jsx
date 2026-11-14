import { useEffect, useRef, useState } from 'react';
import MapCanvas, { STATUS } from '../components/MapCanvas.jsx';
import { Cite } from '../components/Evidence.jsx';
import { PORTFOLIO } from '../data/reference.js';
import { ROADS } from '../data/roads.js';

const ENDS = { 'RRA-W-07': ['Kitui', 'Mwingi'], 'RRA-W-08': ['Wote', 'Kathonzweni'] };
const CITES = { 'RRA-W-07': ['s2w07', 'isr2'], 'RRA-W-08': ['s2w08'] };
const BEFORE = 2019;
const AFTER = 2024;
const SEEN = 0.1; // bare-soil index change treated as visible works

const km = (segs) => segs.reduce((s, x) => s + (x.to - x.from), 0);

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

export default function SiteMap({ contract, setContract }) {
  const mapped = PORTFOLIO.filter((p) => p.mapped);
  const c = mapped.find((p) => p.id === contract) ?? mapped[0];
  const road = ROADS[c.id];

  const [imageryYear, setImageryYear] = useState(AFTER);
  const [compare, setCompare] = useState(false);
  const [basemap, setBasemap] = useState('s2');
  const [terrain, setTerrain] = useState(false);
  const [selected, setSelected] = useState(null);
  const [split, setSplit] = useState(62);
  const maps = useRef({});
  const [ready, setReady] = useState(0);
  const stage = useRef(null);
  const narrow = typeof window !== 'undefined' && window.innerWidth < 820;
  const padding = narrow ? 40 : { top: 90, bottom: 50, left: 380, right: 70 };

  useEffect(() => setSelected(null), [c.id]);

  useEffect(() => {
    if (!compare || !maps.current.a || !maps.current.b) return;
    return syncMaps(maps.current.a, maps.current.b);
  }, [compare, ready]);

  const started = road.segments.filter((s) => s.status !== 'not-started');
  const seen = road.segments.filter((s) => s.change >= SEEN);
  const mismatches = road.segments.filter((s) => s.note).length;

  const drag = (e) => {
    const r = stage.current.getBoundingClientRect();
    const move = (ev) => setSplit(Math.min(95, Math.max(5, ((ev.clientX - r.left) / r.width) * 100)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e);
  };

  const shared = {
    road,
    ends: ENDS[c.id],
    basemap: compare ? 's2' : basemap,
    terrain,
    selected,
    onSelect: setSelected,
    padding,
  };

  return (
    <div className="sitemap">
      <div className="map-stage" ref={stage}>
        <MapCanvas
          {...shared}
          year={compare ? BEFORE : imageryYear}
          onReady={(m) => { maps.current.a = m; setReady((n) => n + 1); }}
        />
        {compare && (
          <>
            <div className="map-over" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <MapCanvas
                {...shared}
                year={AFTER}
                onReady={(m) => { maps.current.b = m; setReady((n) => n + 1); }}
              />
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
        </div>
      </div>

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

        <ol className="segments">
          {road.segments.map((s, i) => (
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
                  {s.note && <p className="seg-note">{s.note}<Cite ids={CITES[c.id]} /></p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

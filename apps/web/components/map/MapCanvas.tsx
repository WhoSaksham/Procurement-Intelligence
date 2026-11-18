'use client';

import { Map as MlMap, Marker, NavigationControl, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type LngLatBoundsLike, type PaddingOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { version } from 'maplibre-gl/package.json';
import { useEffect, useRef } from 'react';
import { TERRARIUM_URL } from '@/lib/elevation';
import { alignment, pointAt, type LngLat } from '@/lib/geo';
import type { Road } from '@/lib/types';

// The worker is copied to public/ on install (scripts/copy-maplibre-worker.mjs).
setWorkerUrl(`/vendor/maplibre-gl-worker-${version}.mjs`);

export const STATUS = {
  sealed: { label: 'Surfaced', color: '#4ade80' },
  base: { label: 'Base layer', color: '#ff9f40' },
  earthworks: { label: 'Earthworks', color: '#ffd54a' },
  'not-started': { label: 'Not started', color: '#ffffff' },
} as const;

export type Basemap = 's2' | 'hires';

const imagery = (basemap: Basemap, year: number) =>
  basemap === 'hires'
    ? {
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        maxzoom: 19,
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      }
    : {
        tiles: [`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`],
        maxzoom: 15,
        attribution: `<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless ${year}</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data ${year})`,
      };

const toGeoJSON = (road: Road): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: road.segments.map((s, idx) => ({
    type: 'Feature',
    properties: { idx, status: s.status, flag: s.note ? 1 : 0 },
    geometry: { type: 'LineString', coordinates: s.coords },
  })),
});

export const boundsOf = (coords: LngLat[]): [LngLat, LngLat] =>
  coords.reduce<[LngLat, LngLat]>(
    ([[x0, y0], [x1, y1]], [x, y]) => [
      [Math.min(x0, x), Math.min(y0, y)],
      [Math.max(x1, x), Math.max(y1, y)],
    ],
    [
      [Infinity, Infinity],
      [-Infinity, -Infinity],
    ],
  );

// Lines thin out and fade in close views so the road surface stays visible.
const width = (base: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 8, base * 0.5, 12, base, 15, base * 1.2, 18, base * 1.5];
const fade = (op: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 14, op, 17, op * 0.45];

function addOverlay(map: MlMap, road: Road) {
  const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
  map.addSource('road', { type: 'geojson', data: toGeoJSON(road) });
  map.addLayer({ id: 'road-selected', type: 'line', source: 'road', filter: ['==', ['get', 'idx'], -1], layout: round, paint: { 'line-color': '#ffffff', 'line-width': width(16), 'line-opacity': 0.55, 'line-blur': 2 } });
  map.addLayer({ id: 'road-flag', type: 'line', source: 'road', filter: ['==', ['get', 'flag'], 1], layout: round, paint: { 'line-color': '#ff4fa3', 'line-width': width(13), 'line-opacity': fade(0.9) } });
  map.addLayer({ id: 'road-casing', type: 'line', source: 'road', layout: round, paint: { 'line-color': '#0b1418', 'line-width': width(8), 'line-opacity': fade(0.75) } });
  map.addLayer({
    id: 'road-line',
    type: 'line',
    source: 'road',
    filter: ['!=', ['get', 'status'], 'not-started'],
    layout: round,
    paint: {
      'line-width': width(4.5),
      'line-opacity': fade(1),
      'line-color': ['match', ['get', 'status'], 'sealed', STATUS.sealed.color, 'base', STATUS.base.color, STATUS.earthworks.color],
    },
  });
  map.addLayer({ id: 'road-todo', type: 'line', source: 'road', filter: ['==', ['get', 'status'], 'not-started'], paint: { 'line-color': STATUS['not-started'].color, 'line-width': width(2.5), 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
}

function setImagery(map: MlMap, basemap: Basemap, year: number) {
  if (map.getLayer('imagery')) map.removeLayer('imagery');
  if (map.getSource('imagery')) map.removeSource('imagery');
  map.addSource('imagery', { type: 'raster', tileSize: 256, ...imagery(basemap, year) });
  map.addLayer({ id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': 150 } }, map.getLayer('road-selected') ? 'road-selected' : undefined);
}

export interface MapCanvasProps {
  road: Road;
  ends?: [string, string];
  basemap: Basemap;
  year: number;
  terrain: boolean;
  selected: number | null;
  onSelect: (idx: number) => void;
  onReady?: (map: MlMap | null) => void;
  padding: number | PaddingOptions;
  cursor: LngLat | null;
}

/** One MapLibre map showing a road's chainage segments over satellite imagery. */
export function MapCanvas({ road, ends, basemap, year, terrain, selected, onSelect, onReady, padding, cursor }: MapCanvasProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const markers = useRef<Marker[]>([]);
  const cursorMarker = useRef<Marker | null>(null);
  const pending = useRef<((map: MlMap) => void)[]>([]);
  const latest = useRef({ onSelect, onReady, road, basemap, year, padding });
  useEffect(() => {
    latest.current = { onSelect, onReady, road, basemap, year, padding };
  });

  // Run fn now if the style is ready, otherwise once it is.
  const whenReady = (fn: (map: MlMap) => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (loaded.current) fn(map);
    else pending.current.push(fn);
  };

  // Create the map once.
  useEffect(() => {
    const init = latest.current;
    const container = el.current!;
    const map = new MlMap({
      container,
      style: {
        version: 8,
        sources: {
          dem: { type: 'raster-dem', tiles: [TERRARIUM_URL], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Terrain: AWS Terrain Tiles' },
        },
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#1a2930' } }],
      },
      bounds: boundsOf(init.road.segments.flatMap((s) => s.coords)) as LngLatBoundsLike,
      fitBoundsOptions: { padding: init.padding },
      maxPitch: 75,
      attributionControl: {
        compact: true,
        customAttribution: 'Roads © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      },
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      // On small screens keep credits behind the (i) button so they don't cover the map.
      if (container.clientWidth < 640) container.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
      addOverlay(map, latest.current.road);
      setImagery(map, latest.current.basemap, latest.current.year);
      loaded.current = true;
      pending.current.splice(0).forEach((fn) => fn(map));
      latest.current.onReady?.(map);
    });
    for (const id of ['road-line', 'road-todo', 'road-casing']) {
      map.on('click', id, (e) => {
        const idx = e.features?.[0]?.properties?.idx;
        if (typeof idx === 'number') latest.current.onSelect(idx);
      });
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    mapRef.current = map;
    return () => {
      latest.current.onReady?.(null);
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      cursorMarker.current = null;
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
  }, []);

  useEffect(() => whenReady((map) => setImagery(map, basemap, year)), [basemap, year]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenReady((m) => {
      (m.getSource('road') as GeoJSONSource).setData(toGeoJSON(road));
      m.fitBounds(boundsOf(road.segments.flatMap((s) => s.coords)) as LngLatBoundsLike, { padding: latest.current.padding, duration: 900 });
    });
    markers.current.forEach((m) => m.remove());
    const segs = road.segments;
    const towns = (ends ?? []).map((name, i) => {
      const at = i === 0 ? segs[0].coords[0] : segs[segs.length - 1].coords[segs[segs.length - 1].coords.length - 1];
      const node = Object.assign(document.createElement('div'), { className: 'town-marker', textContent: name });
      return new Marker({ element: node, anchor: 'bottom' }).setLngLat(at).addTo(map);
    });
    // Kilometre posts every 10 km, as supervision reports refer to chainage.
    const line = alignment(road);
    const posts: Marker[] = [];
    for (let k = 10; k < line.length - 3; k += 10) {
      const node = Object.assign(document.createElement('div'), { className: 'km-post', textContent: `km ${k}` });
      posts.push(new Marker({ element: node, anchor: 'left', offset: [6, 0] }).setLngLat(pointAt(line, k)).addTo(map));
    }
    markers.current = [...towns, ...posts];
  }, [road, ends]);

  useEffect(() => {
    whenReady((map) => {
      map.setFilter('road-selected', ['==', ['get', 'idx'], selected ?? -1]);
      if (selected != null) {
        map.fitBounds(boundsOf(latest.current.road.segments[selected].coords) as LngLatBoundsLike, {
          padding: latest.current.padding,
          duration: 900,
          maxZoom: 13.5,
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        });
      }
    });
  }, [selected]);

  useEffect(() => {
    whenReady((map) => {
      if (terrain) {
        map.setTerrain({ source: 'dem', exaggeration: 1.5 });
        try {
          map.setSky({ 'sky-color': '#a9c7dc', 'horizon-color': '#e4ecef', 'sky-horizon-blend': 0.6 });
        } catch {
          /* sky is optional */
        }
        // Tilt only from a flat view, so a close view or drive keeps its own camera.
        if (map.getPitch() < 20) map.easeTo({ pitch: 62, bearing: -25, duration: 1200 });
      } else {
        map.setTerrain(null);
        map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      }
    });
  }, [terrain]);

  // A single moving marker for the profile cursor or the drive position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!cursor) {
      cursorMarker.current?.remove();
      cursorMarker.current = null;
      return;
    }
    if (!cursorMarker.current) {
      const node = Object.assign(document.createElement('div'), { className: 'cursor-dot' });
      cursorMarker.current = new Marker({ element: node }).setLngLat(cursor).addTo(map);
    } else cursorMarker.current.setLngLat(cursor);
  }, [cursor]);

  // Inline position: MapLibre's own (unlayered) CSS sets position: relative on the
  // container, which would otherwise win over the layered app styles.
  return <div className="map-canvas" ref={el} style={{ position: 'absolute', inset: 0 }} />;
}

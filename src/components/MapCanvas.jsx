import { useEffect, useRef } from 'react';
import { Map as MlMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// The bundled worker sits next to the library file; after Vite rebundles it
// that relative path breaks, so point MapLibre at the emitted asset.
setWorkerUrl(workerUrl);

export const STATUS = {
  sealed: { label: 'Surfaced', color: '#4ade80' },
  base: { label: 'Base layer', color: '#ff9f40' },
  earthworks: { label: 'Earthworks', color: '#ffd54a' },
  'not-started': { label: 'Not started', color: '#ffffff' },
};

const imagery = ({ basemap, year }) =>
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

const toGeoJSON = (road) => ({
  type: 'FeatureCollection',
  features: road.segments.map((s, idx) => ({
    type: 'Feature',
    properties: { idx, status: s.status, flag: s.note ? 1 : 0 },
    geometry: { type: 'LineString', coordinates: s.coords },
  })),
});

export const boundsOf = (coords) =>
  coords.reduce(
    ([[x0, y0], [x1, y1]], [x, y]) => [[Math.min(x0, x), Math.min(y0, y)], [Math.max(x1, x), Math.max(y1, y)]],
    [[Infinity, Infinity], [-Infinity, -Infinity]],
  );

const width = (base) => ['interpolate', ['linear'], ['zoom'], 8, base * 0.5, 12, base, 16, base * 2.2];

function addOverlay(map, road) {
  map.addSource('road', { type: 'geojson', data: toGeoJSON(road) });
  map.addLayer({ id: 'road-selected', type: 'line', source: 'road', filter: ['==', ['get', 'idx'], -1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': width(16), 'line-opacity': 0.55, 'line-blur': 2 } });
  map.addLayer({ id: 'road-flag', type: 'line', source: 'road', filter: ['==', ['get', 'flag'], 1],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ff4fa3', 'line-width': width(13), 'line-opacity': 0.9 } });
  map.addLayer({ id: 'road-casing', type: 'line', source: 'road',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0b1418', 'line-width': width(8), 'line-opacity': 0.75 } });
  map.addLayer({ id: 'road-line', type: 'line', source: 'road', filter: ['!=', ['get', 'status'], 'not-started'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': width(4.5),
      'line-color': ['match', ['get', 'status'], 'sealed', STATUS.sealed.color, 'base', STATUS.base.color, STATUS.earthworks.color] } });
  map.addLayer({ id: 'road-todo', type: 'line', source: 'road', filter: ['==', ['get', 'status'], 'not-started'],
    paint: { 'line-color': STATUS['not-started'].color, 'line-width': width(2.5), 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
}

function setImagery(map, opts) {
  if (map.getLayer('imagery')) map.removeLayer('imagery');
  if (map.getSource('imagery')) map.removeSource('imagery');
  map.addSource('imagery', { type: 'raster', tileSize: 256, ...imagery(opts) });
  map.addLayer({ id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-fade-duration': 150 } }, map.getLayer('road-selected') ? 'road-selected' : undefined);
}

export default function MapCanvas({ road, ends, basemap, year, terrain, selected, onSelect, onReady, padding }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const loaded = useRef(false);
  const markers = useRef([]);
  const latest = useRef({ onSelect });
  latest.current.onSelect = onSelect;

  // Create the map once.
  useEffect(() => {
    const map = new MlMap({
      container: el.current,
      style: {
        version: 8,
        sources: {
          dem: {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            encoding: 'terrarium',
            tileSize: 256,
            maxzoom: 14,
            attribution: 'Terrain: AWS Terrain Tiles',
          },
        },
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#1a2930' } }],
      },
      bounds: boundsOf(road.segments.flatMap((s) => s.coords)),
      fitBoundsOptions: { padding },
      maxPitch: 75,
      attributionControl: { compact: true, customAttribution: 'Roads © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' },
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', () => {
      // On small screens keep credits behind the (i) button so they don't cover the map.
      if (el.current.clientWidth < 640) el.current.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
      addOverlay(map, road);
      setImagery(map, { basemap, year });
      loaded.current = true;
      map.fire('overlay-ready');
    });
    for (const id of ['road-line', 'road-todo', 'road-casing']) {
      map.on('click', id, (e) => latest.current.onSelect?.(e.features[0].properties.idx));
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }
    mapRef.current = map;
    onReady?.(map);
    return () => {
      onReady?.(null);
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Run fn now if the style is ready, otherwise once it is.
  const whenReady = (fn) => {
    const map = mapRef.current;
    if (!map) return;
    if (loaded.current) fn(map);
    else map.once('overlay-ready', () => fn(map));
  };

  useEffect(() => whenReady((map) => setImagery(map, { basemap, year })), [basemap, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    whenReady((map) => {
      map.getSource('road').setData(toGeoJSON(road));
      map.fitBounds(boundsOf(road.segments.flatMap((s) => s.coords)), { padding, duration: 900 });
    });
    const map = mapRef.current;
    markers.current.forEach((m) => m.remove());
    markers.current = ends.map((name, i) => {
      const segs = road.segments;
      const at = i === 0 ? segs[0].coords[0] : segs[segs.length - 1].coords.at(-1);
      const node = document.createElement('div');
      node.className = 'town-marker';
      node.textContent = name;
      return new Marker({ element: node, anchor: 'bottom' }).setLngLat(at).addTo(map);
    });
  }, [road]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    whenReady((map) => {
      map.setFilter('road-selected', ['==', ['get', 'idx'], selected ?? -1]);
      if (selected != null) map.fitBounds(boundsOf(road.segments[selected].coords), { padding, duration: 900, maxZoom: 13.5, pitch: map.getPitch(), bearing: map.getBearing() });
    });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    whenReady((map) => {
      if (terrain) {
        map.setTerrain({ source: 'dem', exaggeration: 1.8 });
        try { map.setSky({ 'sky-color': '#a9c7dc', 'horizon-color': '#e4ecef', 'sky-horizon-blend': 0.6 }); } catch { /* optional */ }
        map.easeTo({ pitch: 62, bearing: -25, duration: 1200 });
      } else {
        map.setTerrain(null);
        map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      }
    });
  }, [terrain]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="map-canvas" ref={el} />;
}

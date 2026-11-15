import { pointAt } from './geo.js';

// Real elevation along a road, read from the same Terrarium DEM tiles the 3D
// view uses (AWS Terrain Tiles; about 38 m per pixel at zoom 12 near the equator).
const Z = 12;
const tiles = new Map();

function tileFloat(lng, lat, z) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}

async function decode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Terrain tile ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, 256, 256).data;
}

function tile(x, y) {
  const key = `${x}/${y}`;
  if (!tiles.has(key)) {
    const p = decode(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    p.catch(() => tiles.delete(key));
    tiles.set(key, p);
  }
  return tiles.get(key);
}

async function elevationAt([lng, lat]) {
  const [fx, fy] = tileFloat(lng, lat, Z);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256));
  const d = await tile(tx, ty);
  const i = (py * 256 + px) * 4;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}

// Sample every stepKm, smooth lightly, and derive grade in percent.
export async function elevationProfile(line, stepKm = 0.25) {
  const n = Math.floor(line.length / stepKm);
  const kms = Array.from({ length: n + 1 }, (_, i) => Math.min(line.length, i * stepKm));
  const raw = await Promise.all(kms.map((km) => elevationAt(pointAt(line, km))));
  const elev = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((s, v) => s + v, 0) / w.length;
  });
  return kms.map((km, i) => {
    const a = elev[Math.max(0, i - 2)], b = elev[Math.min(elev.length - 1, i + 2)];
    const run = (Math.min(elev.length - 1, i + 2) - Math.max(0, i - 2)) * stepKm * 1000;
    return { km, elev: elev[i], grade: run ? ((b - a) / run) * 100 : 0 };
  });
}

export function profileStats(profile, from = 0, to = Infinity) {
  const pts = profile.filter((p) => p.km >= from && p.km <= to);
  if (!pts.length) return null;
  const steep = pts.reduce((m, p) => (Math.abs(p.grade) > Math.abs(m.grade) ? p : m), pts[0]);
  let climb = 0;
  for (let i = 1; i < pts.length; i++) climb += Math.max(0, pts[i].elev - pts[i - 1].elev);
  return {
    min: Math.min(...pts.map((p) => p.elev)),
    max: Math.max(...pts.map((p) => p.elev)),
    steepest: steep,
    climb,
  };
}

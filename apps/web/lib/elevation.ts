import { pointAt, type Line, type LngLat } from '@/lib/geo';

// Real elevation along a road, read from the same Terrarium DEM tiles the 3D
// view uses (AWS Terrain Tiles; about 38 m per pixel at zoom 12 near the equator).
const Z = 12;
export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const tiles = new Map<string, Promise<Uint8ClampedArray>>();

export interface ProfilePoint {
  km: number;
  elev: number;
  /** Grade in percent, positive uphill in the direction of travel. */
  grade: number;
}

function tileFloat(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}

async function decode(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Terrain tile ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(256, 256)
      : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, 256, 256).data;
}

function tile(x: number, y: number): Promise<Uint8ClampedArray> {
  const key = `${x}/${y}`;
  let p = tiles.get(key);
  if (!p) {
    p = decode(TERRARIUM_URL.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)));
    p.catch(() => tiles.delete(key));
    tiles.set(key, p);
  }
  return p;
}

/** Terrarium encoding: metres = R·256 + G + B/256 − 32768. */
export const decodeTerrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

async function elevationAt([lng, lat]: LngLat): Promise<number> {
  const [fx, fy] = tileFloat(lng, lat, Z);
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const px = Math.min(255, Math.floor((fx - tx) * 256));
  const py = Math.min(255, Math.floor((fy - ty) * 256));
  const d = await tile(tx, ty);
  const i = (py * 256 + px) * 4;
  return decodeTerrarium(d[i], d[i + 1], d[i + 2]);
}

/** Sample every stepKm, smooth lightly, and derive grade in percent. */
export async function elevationProfile(line: Line, stepKm = 0.25): Promise<ProfilePoint[]> {
  const n = Math.floor(line.length / stepKm);
  const kms = Array.from({ length: n + 1 }, (_, i) => Math.min(line.length, i * stepKm));
  const raw = await Promise.all(kms.map((km) => elevationAt(pointAt(line, km))));
  return gradeProfile(kms, raw, stepKm);
}

/** Pure part of the profile: light smoothing and a central-difference grade. */
export function gradeProfile(kms: number[], raw: number[], stepKm: number): ProfilePoint[] {
  const elev = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((s, v) => s + v, 0) / w.length;
  });
  return kms.map((km, i) => {
    const lo = Math.max(0, i - 2);
    const hi = Math.min(elev.length - 1, i + 2);
    const run = (hi - lo) * stepKm * 1000;
    return { km, elev: elev[i], grade: run ? ((elev[hi] - elev[lo]) / run) * 100 : 0 };
  });
}

export interface ProfileStats {
  min: number;
  max: number;
  steepest: ProfilePoint;
  climb: number;
}

export function profileStats(profile: ProfilePoint[], from = 0, to = Infinity): ProfileStats | null {
  const pts = profile.filter((p) => p.km >= from && p.km <= to);
  if (!pts.length) return null;
  const steepest = pts.reduce((m, p) => (Math.abs(p.grade) > Math.abs(m.grade) ? p : m), pts[0]);
  let climb = 0;
  for (let i = 1; i < pts.length; i++) climb += Math.max(0, pts[i].elev - pts[i - 1].elev);
  return { min: Math.min(...pts.map((p) => p.elev)), max: Math.max(...pts.map((p) => p.elev)), steepest, climb };
}

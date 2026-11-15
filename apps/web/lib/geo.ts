// Distance-based helpers for walking along a road alignment.
import type { Road } from '@/lib/types';

export type LngLat = [number, number];
export interface Line {
  coords: LngLat[];
  /** Cumulative km at each vertex. */
  cum: number[];
  length: number;
}

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** One continuous line from a road's segments, with cumulative km per vertex. */
export function alignment(road: Road): Line {
  const coords: LngLat[] = [];
  road.segments.forEach((s, i) => coords.push(...(i ? s.coords.slice(1) : s.coords)));
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return { coords, cum, length: cum.at(-1) ?? 0 };
}

export function pointAt(line: Line, km: number): LngLat {
  const d = Math.max(0, Math.min(line.length, km));
  let lo = 0;
  let hi = line.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = line.cum[hi] - line.cum[lo] || 1;
  const t = (d - line.cum[lo]) / span;
  const a = line.coords[lo];
  const b = line.coords[hi];
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Direction of travel at km, looking a little ahead to smooth small kinks. */
export const headingAt = (line: Line, km: number, ahead = 0.35): number =>
  bearing(pointAt(line, km - ahead / 3), pointAt(line, km + ahead));

/** Interpolate between two bearings the short way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

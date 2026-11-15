// Distance-based helpers for walking along a road alignment.

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversine([lng1, lat1], [lng2, lat2]) {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing([lng1, lat1], [lng2, lat2]) {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// One continuous line from a road's segments, with cumulative km per vertex.
export function alignment(road) {
  const coords = [];
  road.segments.forEach((s, i) => coords.push(...(i ? s.coords.slice(1) : s.coords)));
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return { coords, cum, length: cum.at(-1) };
}

export function pointAt(line, km) {
  const d = Math.max(0, Math.min(line.length, km));
  let lo = 0, hi = line.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line.cum[mid] <= d) lo = mid; else hi = mid;
  }
  const span = line.cum[hi] - line.cum[lo] || 1;
  const t = (d - line.cum[lo]) / span;
  const [a, b] = [line.coords[lo], line.coords[hi]];
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

// Direction of travel at km, looking a little ahead to smooth small kinks.
export const headingAt = (line, km, ahead = 0.35) => bearing(pointAt(line, km - ahead / 3), pointAt(line, km + ahead));

// Interpolate between two bearings the short way round.
export function lerpAngle(a, b, t) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

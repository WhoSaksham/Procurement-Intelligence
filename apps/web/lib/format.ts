export { days, pct, riskLevel } from '@/lib/model';

/** US$ millions with one decimal, e.g. "US$18.4M". */
export const usd = (m: number) => `US$${m.toFixed(1)}M`;

/**
 * A percentage for inline styles, rounded to 2 decimals. Browsers normalise
 * long decimals in style attributes, which would otherwise make the server
 * HTML differ from the client render (a hydration mismatch).
 */
export const cssPct = (value: number) => `${Math.round(value * 100) / 100}%`;

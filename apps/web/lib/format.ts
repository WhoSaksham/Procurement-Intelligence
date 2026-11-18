// Presentation helpers only: numbers in, text or CSS out. Business rules live in the API.

export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const days = (d: number) => `${Math.round(d)} days`;
/** Words for a risk probability. */
export const riskLevel = (p: number) => (p >= 0.35 ? 'High' : p >= 0.2 ? 'Elevated' : 'Low');
/** Band for a contract's early-warning score. */
export const warnLevel = (w: number): 'high' | 'medium' | 'low' => (w >= 0.6 ? 'high' : w >= 0.3 ? 'medium' : 'low');
export const LEVEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;

/** US$ millions with one decimal, e.g. "US$18.4M". */
export const usd = (m: number) => `US$${m.toFixed(1)}M`;

/**
 * A percentage for inline styles, rounded to 2 decimals. Browsers normalise
 * long decimals in style attributes, which would otherwise make the server
 * HTML differ from the client render (a hydration mismatch).
 */
export const cssPct = (value: number) => `${Math.round(value * 100) / 100}%`;

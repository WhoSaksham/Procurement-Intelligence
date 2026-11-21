import { describe, expect, it } from 'vitest';
import { decide, numbersIn, precheck } from '../src/modules/ask/checks.js';
import type { Passage } from '../src/modules/ask/retrieve.js';

const given = new Map<string, Passage>([
  ['ca1', { id: 'ca1', title: 'Cohort', text: 'median 168 days, P80 241 days; 27.6% of packages recorded at least one re-tender. 1,250 rows.' }],
  ['pn2', { id: 'pn2', title: 'Notice', text: 'The package was advertised in FY2019 at US$18.4M.' }],
]);

describe('numbersIn', () => {
  it('normalises money, percentages, separators and years', () => {
    expect([...numbersIn('US$18.4M, 27.6%, 1,250 rows in FY2012, 3.0 lots')]).toEqual(['18.4', '27.6', '1250', '2012', '3']);
  });
});

describe('precheck', () => {
  it('drops unknown citation ids and keeps the rest', () => {
    const [c] = precheck([{ text: 'A median of 168 days.', cite: ['zz', 'ca1'] }], given);
    expect(c.cite).toEqual(['ca1']);
    expect(c.reason).toBeUndefined();
  });

  it('a claim citing only unknown ids has no valid citation', () => {
    expect(precheck([{ text: 'Something.', cite: ['zz'] }], given)[0].reason).toBe('no valid citation');
    expect(precheck([{ text: 'Something.', cite: [] }], given)[0].reason).toBe('no valid citation');
  });

  it('a number not in the cited passage is caught', () => {
    expect(precheck([{ text: 'About 28% were re-tendered.', cite: ['ca1'] }], given)[0].reason).toBe('number not in passage');
    // The number is in a passage, but not in the one cited.
    expect(precheck([{ text: 'It cost US$18.4M.', cite: ['ca1'] }], given)[0].reason).toBe('number not in passage');
  });

  it('separators and units do not matter', () => {
    expect(precheck([{ text: 'The cohort had 1250 rows and 27.6 percent re-tendered.', cite: ['ca1'] }], given)[0].reason).toBeUndefined();
    expect(precheck([{ text: 'Advertised at US$18.4 million.', cite: ['pn2', 'ca1'] }], given)[0].reason).toBeUndefined();
  });

  it('numbers in the passage title count (the model sees the title too)', () => {
    const titled = new Map<string, Passage>([['ber1', { id: 'ber1', title: 'Bid evaluation report, rural roads Lot 2', text: 'Seven of nine bids failed a US$30M turnover requirement.' }]]);
    expect(precheck([{ text: 'On Lot 2, bids failed a US$30M requirement.', cite: ['ber1'] }], titled)[0].reason).toBeUndefined();
  });

  it('a claim with no numbers passes', () => {
    expect(precheck([{ text: 'Re-tenders are common.', cite: ['ca1'] }], given)[0].reason).toBeUndefined();
  });

  it('keeps at most six claims of at most 300 characters', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ text: `Claim ${'x'.repeat(400)} ${i}`, cite: ['ca1'] }));
    const out = precheck(many, given);
    expect(out).toHaveLength(6);
    expect(out[0].text.length).toBeLessThanOrEqual(300);
  });
});

describe('decide', () => {
  const pre = precheck(
    [
      { text: 'Re-tenders are common.', cite: ['ca1'] },
      { text: 'About 28% were re-tendered.', cite: ['ca1'] },
      { text: 'Advertised in FY2019.', cite: ['pn2'] },
    ],
    given,
  );

  it('applies scores, threshold and reasons', () => {
    const out = decide(pre, new Map([[0, 0.75], [1, 0.99]]), 0.75);
    expect(out[0]).toMatchObject({ support: 0.75, kept: true });
    expect(out[0].reason).toBeUndefined();
    // A precheck failure wins over any score.
    expect(out[1]).toMatchObject({ support: 0, kept: false, reason: 'number not in passage' });
    // No score returned for a claim counts as no support.
    expect(out[2]).toMatchObject({ support: 0, kept: false, reason: 'below threshold' });
  });

  it('clamps scores to 0..1', () => {
    expect(decide(pre.slice(0, 1), new Map([[0, 1.4]]), 0.75)[0].support).toBe(1);
  });
});

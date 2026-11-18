import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decodeTerrarium, gradeProfile, profileStats } from '@/lib/elevation';
import { alignment, haversine, headingAt, lerpAngle, pointAt } from '@/lib/geo';
import type { Road } from '@/lib/types';

// The real alignment from the seed data the API serves (read at run time: it lives outside this app).
const ROADS = JSON.parse(readFileSync(path.resolve(__dirname, '../../../data/seed/roads.json'), 'utf8')) as Record<string, Road>;

describe('geo', () => {
  it('measures one degree of latitude as about 111 km', () => {
    expect(haversine([37, 0], [37, 1])).toBeCloseTo(111.19, 1);
  });

  it('builds the Kitui–Mwingi alignment close to its 96 km length', () => {
    const line = alignment(ROADS['RRA-W-07']);
    expect(line.length).toBeGreaterThan(90);
    expect(line.length).toBeLessThan(102);
    expect(pointAt(line, 0)).toEqual(line.coords[0]);
    expect(pointAt(line, 1e6)).toEqual(line.coords.at(-1));
  });

  it('heading is a compass bearing and lerpAngle takes the short way round', () => {
    const line = alignment(ROADS['RRA-W-07']);
    const h = headingAt(line, 10);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 9);
  });
});

describe('elevation', () => {
  it('decodes terrarium pixels to metres', () => {
    expect(decodeTerrarium(131, 232, 0)).toBe(1000);
  });

  it('derives grade from elevation samples', () => {
    const kms = [0, 0.25, 0.5, 0.75, 1];
    const raw = [1000, 1010, 1020, 1030, 1040];
    const profile = gradeProfile(kms, raw, 0.25);
    // Smoothing flattens the ends (1005 → 1035 over 1 km), so the centre grade is 3%.
    expect(profile[2].grade).toBeCloseTo(3, 6);
    const stats = profileStats(profile);
    expect(stats?.min).toBeCloseTo(1005, 6);
    expect(stats?.climb).toBeGreaterThan(0);
    expect(profileStats(profile, 5, 6)).toBeNull();
  });
});

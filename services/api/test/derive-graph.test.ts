import { describe, expect, it } from 'vitest';
import { buildGraphSeed, deriveGraphNodes, type SeedGraphNode } from '../src/seed/derive-graph.js';
import { loadSeedFiles } from '../src/seed/files.js';
import { SEED_DIR } from './seed-dir.js';

const files = loadSeedFiles(SEED_DIR);
const lookup = () => ({
  countries: new Map(files.countries.map((c) => [c.id, c])),
  contracts: new Map(files.contracts.map((c) => [c.id, c])),
  sources: new Map(Object.entries(files.sources)),
});

describe('graph derivation', () => {
  it('derived KE node carries the domain values', () => {
    const ke = buildGraphSeed(files).nodes.find((n) => n.id === 'KE')!;
    expect(ke).toMatchObject({ type: 'Country', label: 'Kenya', layer: 'ledger', source_id: 'wgi1', column: 0 });
    expect(ke.attrs['CPIA public sector mgmt']).toBe('3.6');
    expect(ke.attrs['WGI regulatory quality']).toBe('38th pct');
    expect(ke.attrs.FCV).toBe('No');
  });

  it('contract nodes take value, signed date and progress from the portfolio record', () => {
    const w07 = buildGraphSeed(files).nodes.find((n) => n.id === 'RRA-W-07')!;
    expect(w07.label).toBe('RRA-W-07 Kitui–Mwingi');
    expect(w07.attrs).toMatchObject({ Value: 'US$12.6M', Signed: '2024-02-12', Progress: '37% vs 58% planned' });
    expect(w07.locator).toBe('Award row 5,012');
  });

  it('keeps hand-written attributes no domain record holds', () => {
    const c02 = buildGraphSeed(files).nodes.find((n) => n.id === 'RRA-C-02')!;
    expect(c02.attrs.Method).toBe('QCBS');
  });

  it('passage nodes take layer and locator from their source', () => {
    const p = buildGraphSeed(files).nodes.find((n) => n.id === 'PS-sbd1')!;
    expect(p).toMatchObject({ layer: files.sources.sbd1.layer, source_id: 'sbd1', locator: files.sources.sbd1.locator, label: 'Turnover: 1.5–2.5× cash flow' });
  });

  it('a changed domain value flows into the graph', () => {
    const l = lookup();
    l.countries.set('KE', { ...l.countries.get('KE')!, cpia: 4.1, rq: 41 });
    const ke = deriveGraphNodes(files.graph.nodes, l).find((n) => n.id === 'KE')!;
    expect(ke.attrs['CPIA public sector mgmt']).toBe('4.1');
    expect(ke.attrs['WGI regulatory quality']).toBe('41st pct');
  });

  it('dangling ref fails loudly', () => {
    const bad: SeedGraphNode[] = [{ id: 'X', type: 'Contract', ref: { collection: 'contracts', key: 'NOPE' }, column: 2 }];
    expect(() => deriveGraphNodes(bad, lookup())).toThrow('Dangling graph ref: contracts/NOPE');
  });

  it('every node is in the graph service seed shape', () => {
    for (const n of buildGraphSeed(files).nodes) {
      expect(Object.keys(n)).toEqual(['id', 'type', 'label', 'layer', 'attrs', 'source_id', 'locator', 'column']);
    }
  });
});

describe('graph fixture', () => {
  it('graph fixture is up to date', async () => {
    const { staleFixtureFiles } = await import('../src/seed/export-graph-seed.js');
    expect(staleFixtureFiles(SEED_DIR)).toEqual([]);
  });
});

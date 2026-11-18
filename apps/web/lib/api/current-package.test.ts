import { describe, expect, it } from 'vitest';
import { CURRENT_KEY, initialPackageId } from '@/lib/api/current-package';

const store = (v: string | null) => ({ getItem: (k: string) => (k === CURRENT_KEY ? v : null) });

describe('initialPackageId', () => {
  it('prefers ?pkg=, then the remembered id, then the example', () => {
    expect(initialPackageId('?pkg=abc123', store('zzz'))).toBe('abc123');
    expect(initialPackageId('', store('zzz'))).toBe('zzz');
    expect(initialPackageId('', store(null))).toBe('example');
    expect(initialPackageId('', null)).toBe('example');
  });

  it('ignores malformed ids and throwing storage', () => {
    expect(initialPackageId('?pkg=../x', store('<script>'))).toBe('example');
    expect(initialPackageId('', { getItem: () => { throw new Error('denied'); } })).toBe('example');
  });
});

import { useCurrentPackage } from '@/lib/api/current-package';

describe('adopting the copy of the example', () => {
  it('switches to the copy, with the edits, when the example is still on screen', () => {
    useCurrentPackage.setState({ id: 'example', drafts: { example: { pkg: { lots: 2 } } } });
    useCurrentPackage.getState().adoptCopy('example', 'copy1');
    expect(useCurrentPackage.getState().id).toBe('copy1');
    expect(useCurrentPackage.getState().drafts).toEqual({ example: {}, copy1: { pkg: { lots: 2 } } });
  });

  it('only moves the edits when the analyst has already switched elsewhere', () => {
    useCurrentPackage.setState({ id: 'other', drafts: { example: { pkg: { lots: 2 } } } });
    useCurrentPackage.getState().adoptCopy('example', 'copy1');
    expect(useCurrentPackage.getState().id).toBe('other');
    expect(useCurrentPackage.getState().drafts.copy1).toEqual({ pkg: { lots: 2 } });
  });
});

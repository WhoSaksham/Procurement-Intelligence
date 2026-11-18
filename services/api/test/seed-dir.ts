import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

export const SEED_DIR = loadConfig({}).seedDir;

export const readSeed = <T>(rel: string): T => JSON.parse(readFileSync(path.join(SEED_DIR, rel), 'utf8')) as T;

/** A temporary copy of the seed directory, optionally edited, for seeder tests. */
export function tempSeedDir(edit?: (dir: string) => void): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'seed-'));
  cpSync(SEED_DIR, dir, { recursive: true });
  edit?.(dir);
  return dir;
}

export function editJson<T>(dir: string, rel: string, fn: (v: T) => T | void): void {
  const f = path.join(dir, rel);
  const v = JSON.parse(readFileSync(f, 'utf8')) as T;
  writeFileSync(f, JSON.stringify(fn(v) ?? v));
}

export const setVersion = (dir: string, v: number) => writeFileSync(path.join(dir, 'VERSION'), `${v}\n`);

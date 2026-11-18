import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from './helpers.js';

describe('database connection', () => {
  useTestDb();
  it('connects to the in-memory server', () => {
    expect(mongoose.connection.readyState).toBe(1);
  });
});

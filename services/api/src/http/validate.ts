import type { Request } from 'express';
import type { z } from 'zod';
import { fromZod } from './problem.js';

/** Parse part of a request with a zod schema; throws a 400 validation problem on failure. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

export const body = <S extends z.ZodType>(req: Request, schema: S) => parse(schema, req.body);
export const query = <S extends z.ZodType>(req: Request, schema: S) => parse(schema, req.query);
export const params = <S extends z.ZodType>(req: Request, schema: S) => parse(schema, req.params);

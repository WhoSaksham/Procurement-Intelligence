import type { NextRequest } from 'next/server';
import { apiKeyFrom, proxyApi } from '@/lib/api/proxy';

// Server-side only: the browser calls /api/v1/*, never the API directly, so the
// API URL and key stay on the server.
const options = () => ({
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  // No default key in production: an unset API_KEY makes the route refuse, not fall back to a guessable value.
  apiKey: apiKeyFrom(process.env),
  fetchImpl: fetch,
});

async function handle(request: NextRequest, ctx: RouteContext<'/api/[...path]'>) {
  const { path } = await ctx.params;
  return proxyApi(request, path, options());
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

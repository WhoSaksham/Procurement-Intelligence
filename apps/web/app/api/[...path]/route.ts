import type { NextRequest } from 'next/server';
import { apiKeyFrom, proxyApi, timeoutFor } from '@/lib/api/proxy';

// Ask can take up to ~20 s (live model with fallback); give the function room beyond the proxy's 30 s wait.
export const maxDuration = 60;

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
  return proxyApi(request, path, { ...options(), timeoutMs: timeoutFor(path) });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

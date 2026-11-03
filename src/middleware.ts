/**
 * Security + noindex headers for responses rendered by the Worker (the quote API
 * and the 404 page). Prerendered pages are served as static assets and get the
 * same headers from public/_headers; src/worker.ts adds them to the few responses
 * answered before this middleware runs. Unused framework routes answer 404, other
 * methods than GET/HEAD are refused outside /api/quote, and unexpected errors become
 * a JSON 500 that still carries the headers.
 */
import { defineMiddleware } from 'astro:middleware';
import { jsonResponse, withHeaders } from '@/lib/server/headers';

/** Framework routes this site never uses (no server islands; images are pre-optimised). */
const INTERNAL_ROUTES = new Set(['/_server-islands/[name]', '/_image']);

export const onRequest = defineMiddleware(async (context, next) => {
  // routePattern is decoded by Astro, so encoded variants (%5F, %2D…) match too.
  if (INTERNAL_ROUTES.has(context.routePattern)) return jsonResponse(404, 'not_found');
  // Only the quote endpoint accepts anything other than GET / HEAD.
  const method = context.request.method;
  if (method !== 'GET' && method !== 'HEAD' && context.routePattern !== '/api/quote') {
    return jsonResponse(405, 'method_not_allowed', { Allow: 'GET, HEAD' });
  }
  try {
    return withHeaders(await next());
  } catch {
    return jsonResponse(500, 'server_error');
  }
});

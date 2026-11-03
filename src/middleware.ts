/**
 * Security + noindex headers for responses rendered by the Worker (the quote API
 * and the 404 page). Prerendered pages are served as static assets and get the
 * same headers from public/_headers. Unused framework routes answer 404, other
 * methods than GET/HEAD are refused outside /api/quote, and unexpected errors become
 * a JSON 500 that still carries the headers.
 */
import { defineMiddleware } from 'astro:middleware';

/** Same policy as public/_headers. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://luxepool.co.il",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Robots-Tag': 'noindex, nofollow',
  ...(import.meta.env.PROD
    ? {
        'Strict-Transport-Security': 'max-age=31536000',
        'Content-Security-Policy': CSP,
        'Cross-Origin-Opener-Policy': 'same-origin',
      }
    : {}),
};

function withHeaders(response: Response): Response {
  let res = response;
  try {
    res.headers.set('X-Robots-Tag', HEADERS['X-Robots-Tag']);
  } catch {
    res = new Response(response.body, response); // immutable headers: copy first
  }
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  if (res.headers.get('content-type') === 'text/html') res.headers.set('content-type', 'text/html; charset=utf-8');
  return res;
}

const jsonResponse = (status: number, error: string, extra: Record<string, string> = {}) =>
  withHeaders(
    new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    }),
  );

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
    return withHeaders(
      new Response(JSON.stringify({ ok: false, error: 'server_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      }),
    );
  }
});

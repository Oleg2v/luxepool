/**
 * Security + noindex headers for responses rendered by the Worker (the quote API
 * and the 404 page). Prerendered pages are served as static assets and get the
 * same headers from public/_headers. Unexpected errors become a JSON 500 that still
 * carries the headers.
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

export const onRequest = defineMiddleware(async (_context, next) => {
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

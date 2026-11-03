/**
 * The site's security and noindex headers, shared by the middleware and the Worker
 * entry (src/worker.ts). Same policy as public/_headers, which covers the prerendered
 * pages and static assets served without the Worker.
 */

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

export const HEADERS: Record<string, string> = {
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

/** Adds the headers (copying the response first when its headers are immutable). */
export function withHeaders(response: Response): Response {
  let res = response;
  try {
    res.headers.set('X-Robots-Tag', HEADERS['X-Robots-Tag']);
  } catch {
    res = new Response(response.body, response);
  }
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  if (res.headers.get('content-type') === 'text/html') res.headers.set('content-type', 'text/html; charset=utf-8');
  return res;
}

/** A generic JSON error that never exposes internals. */
export const jsonResponse = (status: number, error: string, extra: Record<string, string> = {}) =>
  withHeaders(
    new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    }),
  );

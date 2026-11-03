/**
 * Security + noindex headers for responses rendered by the Worker (the quote API
 * and the 404 page). Prerendered pages are served as static assets and get the
 * same headers from public/_headers.
 */
import { defineMiddleware } from 'astro:middleware';

const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Robots-Tag': 'noindex, nofollow',
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  try {
    for (const [k, v] of Object.entries(HEADERS)) response.headers.set(k, v);
    return response;
  } catch {
    // Immutable headers (e.g. a fetched response): copy, then set.
    const copy = new Response(response.body, response);
    for (const [k, v] of Object.entries(HEADERS)) copy.headers.set(k, v);
    return copy;
  }
});

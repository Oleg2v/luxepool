/**
 * Worker entry (wrangler.jsonc → main): Astro's Cloudflare handler, plus the site's
 * security and noindex headers on every response it returns, including the few that
 * Astro answers before the middleware runs (a 400 for a malformed URL, the redirect
 * for "//"). Responses that already carry them pass through unchanged.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { withHeaders } from './lib/server/headers';

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const response = (await handle(request, env as never, ctx as never)) as Response;
    return response.headers.has('X-Robots-Tag') ? response : withHeaders(response);
  },
};

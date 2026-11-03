/**
 * POST /api/quote — stores a quote request in D1 (binding: DB).
 *
 * Protections: same-origin only (dev origins only in `astro dev`), 16 KB body cap
 * counted in bytes while streaming, strict validation, prepared statements, an edge
 * rate limiter (binding QUOTE_LIMITER) plus one atomic D1 statement enforcing 5
 * requests per visitor per 10 minutes and 300 per hour overall, and a honeypot whose
 * hits are stored as status 'spam'
 * (indistinguishable from success to a bot, never silently losing a real lead).
 * If QUOTE_WEBHOOK_URL is set, each stored lead is also forwarded in the background.
 * Responses are generic JSON and never expose internals.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hashClient, parseLead, rateKeyFromIp } from '@/lib/server/lead';

export const prerender = false;

const MAX_BODY_BYTES = 16_000;
const RATE_LIMIT = 5; // per visitor per 10 minutes
const GLOBAL_HOURLY_LIMIT = 300; // all visitors together, protects the database from floods
let warnedNoKey = false;
const SITE_ORIGIN = new URL(import.meta.env.SITE ?? 'https://luxepool.kikkey.com').origin;
const ALLOWED_ORIGINS = new Set([SITE_ORIGIN, ...(import.meta.env.DEV ? ['http://localhost:4321', 'http://127.0.0.1:4321'] : [])]);

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

class TooLarge extends Error {}

/** Read the body as text, counting bytes as they arrive; stop past the cap. */
async function readCapped(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new TooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    const origin = request.headers.get('origin');
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: 'forbidden' }, 403);

    let raw: string;
    try {
      raw = await readCapped(request);
    } catch (e) {
      if (e instanceof TooLarge) return json({ ok: false, error: 'too_large' }, 413);
      return json({ ok: false, error: 'bad_request' }, 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: 'bad_request' }, 400);
    }

    const parsed = parseLead(body, SITE_ORIGIN);
    if (!parsed.ok) return json({ ok: false, error: 'invalid', field: parsed.field }, 422);
    const lead = parsed.lead;
    const demo = !env.QUOTE_WEBHOOK_URL;

    // Honeypot (checked after validation, so a bot can't use it to probe the rules).
    const hp = (body as Record<string, unknown>).hp;
    const spam = typeof hp === 'string' && hp.trim() !== '';

    // Cloudflare always sets the client IP; without it there is no fair way to rate-limit.
    let clientAddress: string | undefined;
    try {
      clientAddress = context.clientAddress;
    } catch {
      clientAddress = undefined;
    }
    if (!clientAddress) return json({ ok: false, error: 'bad_request' }, 400);

    // Edge rate limiter (approximate, per location) before touching D1.
    if (env.QUOTE_LIMITER) {
      const { success } = await env.QUOTE_LIMITER.limit({ key: `quote:${rateKeyFromIp(clientAddress)}` });
      if (!success) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    }

    if (!env.IP_HASH_KEY && import.meta.env.PROD && !warnedNoKey) {
      warnedNoKey = true;
      console.warn('IP_HASH_KEY is not set: ip_hash falls back to a public key. Set it with `wrangler secret put IP_HASH_KEY`.');
    }
    // Today's and yesterday's key, so the 10-minute window survives midnight UTC.
    const [ipHash, ipHashYesterday] = await Promise.all([
      hashClient(clientAddress, env.IP_HASH_KEY),
      hashClient(clientAddress, env.IP_HASH_KEY, -1),
    ]);
    const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? null;
    const userAgent = (request.headers.get('user-agent') ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 300) || null;

    // One atomic statement: the per-visitor limit and the insert can't race.
    const result = await env.DB.prepare(
      `INSERT INTO leads (name, phone, city, pool_type, pool_type_label, start_window, message,
         design_json, design_summary, example_range, page, ip_hash, country, user_agent, status)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
       WHERE (
         SELECT COUNT(*) FROM leads
         WHERE ip_hash IN (?12, ?17) AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')
       ) < ?16
       AND (
         SELECT COUNT(*) FROM leads WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
       ) < ?18`,
    )
      .bind(
        lead.name,
        lead.phone,
        lead.city,
        lead.poolType,
        lead.poolTypeLabel,
        lead.start,
        lead.message,
        lead.design,
        lead.designSummary,
        lead.exampleRange,
        lead.page,
        ipHash,
        country,
        userAgent,
        spam ? 'spam' : 'new',
        RATE_LIMIT,
        ipHashYesterday,
        GLOBAL_HOURLY_LIMIT,
      )
      .run();

    const meta = (result.meta ?? {}) as { changes?: number; last_row_id?: number };
    if (!meta.changes) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '600' });

    if (!spam && env.QUOTE_WEBHOOK_URL) {
      locals.cfContext.waitUntil(
        fetch(env.QUOTE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: meta.last_row_id ?? null, ...lead, design: lead.design ? JSON.parse(lead.design) : null, createdAt: new Date().toISOString() }),
        }).catch(() => undefined),
      );
    }

    return json({ ok: true, demo }, 201);
  } catch {
    return json({ ok: false, error: 'unavailable' }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });

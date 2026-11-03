/**
 * POST /api/quote — stores a quote request in D1 (binding: DB).
 *
 * Protections: same-origin only, 16 KB body cap, honeypot, strict validation,
 * prepared statements, and at most 5 requests per visitor per 10 minutes.
 * If QUOTE_WEBHOOK_URL is set (Worker variable), each stored lead is also
 * forwarded there in the background. Responses never expose internals.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hashIp, parseLead } from '@/lib/server/lead';

export const prerender = false;

const MAX_BODY = 16_000;
const RATE_LIMIT = 5;

const ALLOWED_ORIGINS = new Set([
  new URL(import.meta.env.SITE ?? 'https://luxepool.kikkey.com').origin,
  'http://localhost:4321',
  'http://127.0.0.1:4321',
]);

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: 'forbidden' }, 403);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const demo = !env.QUOTE_WEBHOOK_URL;

  // Honeypot: real visitors never fill the hidden "company" field.
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).company === 'string' && (body as Record<string, string>).company.trim()) {
    return json({ ok: true, demo }, 201);
  }

  const parsed = parseLead(body);
  if (!parsed.ok) return json({ ok: false, error: 'invalid', field: parsed.field }, 422);
  const lead = parsed.lead;

  try {
    const ipHash = await hashIp(clientAddress);
    if (ipHash) {
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ?1 AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')",
      )
        .bind(ipHash)
        .first<{ n: number }>();
      if ((recent?.n ?? 0) >= RATE_LIMIT) return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '600' });
    }

    const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? null;
    const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 300) || null;

    const result = await env.DB.prepare(
      `INSERT INTO leads (name, phone, city, pool_type, pool_type_label, start_window, message,
         design_json, design_summary, example_range, page, ip_hash, country, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
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
      )
      .run();

    if (env.QUOTE_WEBHOOK_URL) {
      const id = (result.meta as { last_row_id?: number } | undefined)?.last_row_id ?? null;
      locals.cfContext.waitUntil(
        fetch(env.QUOTE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...lead, design: lead.design ? JSON.parse(lead.design) : null, createdAt: new Date().toISOString() }),
        }).catch(() => undefined),
      );
    }

    return json({ ok: true, demo }, 201);
  } catch {
    return json({ ok: false, error: 'unavailable' }, 503);
  }
};

export const ALL: APIRoute = () => json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });

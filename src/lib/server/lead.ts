/**
 * Server-side validation for quote requests (/api/quote).
 * Everything the browser sends is treated as untrusted: strings are cleaned and
 * length-capped, the pool type and design are checked against the site's own
 * option lists, and anything unexpected is dropped.
 */
import { edges, extras, finishes, poolTypeById, shapes, sizeLimits, startOptions } from '@/data/site';

export interface Lead {
  name: string;
  phone: string;
  city: string | null;
  poolType: string | null;
  poolTypeLabel: string | null;
  start: string | null;
  message: string | null;
  design: string | null; // validated JSON
  designSummary: string | null;
  exampleRange: string | null;
  page: string | null;
}

// Control characters except tab / newline / carriage return.
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u2028\\u2029]', 'g');

function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  let s = value.replace(CONTROL, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

const orNull = (s: string) => (s ? s : null);

export const phoneDigits = (v: string) => v.replace(/\D/g, '');

/** Israeli mobile, VoIP (07x) and landline numbers, with 0 or 972 prefix. */
export const validPhone = (v: string) => /^(?:972|0)(?:5\d{8}|7\d{8}|[23489]\d{7})$/.test(phoneDigits(v));

function cleanDesign(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Record<string, unknown>;
  const shape = shapes.find((s) => s.id === d.shape)?.id;
  const edge = edges.find((e) => e.id === d.edge)?.id;
  const finish = finishes.find((f) => f.id === d.finish)?.id;
  const length = Number(d.length);
  const width = Number(d.width);
  if (!shape || !edge || !finish) return null;
  if (!(length >= sizeLimits.length.min && length <= sizeLimits.length.max)) return null;
  if (!(width >= sizeLimits.width.min && width <= sizeLimits.width.max)) return null;
  const ex = d.extras && typeof d.extras === 'object' ? (d.extras as Record<string, unknown>) : {};
  return {
    shape,
    length,
    width,
    edge,
    finish,
    extras: Object.fromEntries(extras.map((e) => [e.id, ex[e.id] === true])),
  };
}

export type ParseResult = { ok: true; lead: Lead } | { ok: false; field: string };

export function parseLead(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' };
  const b = body as Record<string, unknown>;

  const name = text(b.name, 80);
  if (name.length < 2) return { ok: false, field: 'name' };
  const phone = text(b.phone, 32);
  if (!validPhone(phone)) return { ok: false, field: 'phone' };

  const type = poolTypeById(typeof b.poolType === 'string' ? b.poolType : null);
  const startLabel = text(b.start, 40);
  const start = startOptions.find((o) => o.label === startLabel || o.value === startLabel)?.label ?? null;
  const design = cleanDesign(b.design);

  return {
    ok: true,
    lead: {
      name,
      phone,
      city: orNull(text(b.city, 60)),
      poolType: type?.id ?? null,
      poolTypeLabel: type?.short ?? null,
      start,
      message: orNull(text(b.message, 1500, true)),
      design: design ? JSON.stringify(design) : null,
      designSummary: design ? orNull(text(b.designSummary, 240)) : null,
      exampleRange: design ? orNull(text(b.exampleRange, 80)) : null,
      page: orNull(text(b.page, 300)),
    },
  };
}

/**
 * Privacy-friendly rate-limit key: a truncated SHA-256 of the client IP with a
 * daily salt, so raw IPs are never stored and keys can't be linked across days.
 */
export async function hashIp(ip: string | undefined | null): Promise<string | null> {
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${day}|luxepool-leads`));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

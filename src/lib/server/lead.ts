/**
 * Server-side validation for quote requests (/api/quote).
 *
 * Everything the browser sends is untrusted: strings lose control, format and bidi
 * characters and are capped by code point; the phone is checked and stored in E.164;
 * the pool type and design are checked against the site's own option lists; the design
 * summary and example price are recomputed here from the validated design (the
 * client's text is ignored); the page URL is kept only if it is on this site.
 */
import { edges, extras, finishes, poolTypeById, shapes, sizeLimits, startOptions } from '@/data/site';
import { examplePrice, formatShekel } from '@/lib/pricing';
import { designSummary } from '@/lib/whatsapp';
import type { Design } from '@/lib/store';
import { cleanName, cleanText, isValidName, normalisePhone } from '@/lib/validate';

const text = cleanText;

export interface Lead {
  name: string;
  phone: string; // E.164, e.g. +972501234567
  city: string | null;
  poolType: string | null;
  poolTypeLabel: string | null;
  start: string | null;
  message: string | null;
  design: string | null; // validated JSON
  designSummary: string | null;
  exampleRange: string | null;
  page: string | null; // path on this site
}

const orNull = (s: string) => (s ? s : null);

/** Only real numbers or numeric strings (objects with custom valueOf are rejected). */
function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

function cleanDesign(value: unknown): Design | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  const shape = shapes.find((s) => s.id === d.shape)?.id;
  const edge = edges.find((e) => e.id === d.edge)?.id;
  const finish = finishes.find((f) => f.id === d.finish)?.id;
  const length = num(d.length);
  const width = num(d.width);
  if (!shape || !edge || !finish) return null;
  if (!(length >= sizeLimits.length.min && length <= sizeLimits.length.max)) return null;
  if (!(width >= sizeLimits.width.min && width <= sizeLimits.width.max)) return null;
  const ex = d.extras && typeof d.extras === 'object' && !Array.isArray(d.extras) ? (d.extras as Record<string, unknown>) : {};
  return {
    shape,
    length: Math.round(length * 2) / 2,
    width: Math.round(width * 2) / 2,
    edge,
    finish,
    extras: Object.fromEntries(extras.map((e) => [e.id, ex[e.id] === true])) as Design['extras'],
  };
}

/** Keep the page only when it is on this site; store just the path. */
function cleanPage(value: unknown, siteOrigin: string): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const u = new URL(value);
    if (u.origin !== siteOrigin) return null;
    // Always a single leading slash: "//evil.example" can never become a protocol-relative link.
    return Array.from(`/${u.pathname.replace(/^\/+/, '')}${u.search}`).slice(0, 300).join('');
  } catch {
    return null;
  }
}

export type ParseResult = { ok: true; lead: Lead } | { ok: false; field: string };

export function parseLead(body: unknown, siteOrigin: string): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' };
  const b = body as Record<string, unknown>;

  const name = cleanName(b.name, 80);
  if (!isValidName(name)) return { ok: false, field: 'name' };
  const phone = normalisePhone(typeof b.phone === 'string' ? b.phone.slice(0, 40) : '');
  if (!phone) return { ok: false, field: 'phone' };

  const type = poolTypeById(typeof b.poolType === 'string' ? b.poolType : null);
  const startLabel = text(b.start, 40);
  const start = startOptions.find((o) => o.label === startLabel || o.value === startLabel)?.label ?? null;
  const design = cleanDesign(b.design);
  const price = design ? examplePrice(design, type?.id ?? null) : null;

  return {
    ok: true,
    lead: {
      name,
      phone,
      city: orNull(cleanName(b.city, 60)),
      poolType: type?.id ?? null,
      poolTypeLabel: type?.short ?? null,
      start,
      message: orNull(text(b.message, 1500, true)),
      design: design ? JSON.stringify(design) : null,
      designSummary: design ? designSummary(design) : null,
      exampleRange: price ? `${formatShekel(price.low)}–${formatShekel(price.high)} (example only)` : null,
      page: cleanPage(b.page, siteOrigin),
    },
  };
}

/* ---------------------------------------------------------- rate-limit key */

/** IPv4 as is; IPv6 reduced to its /64 so one network can't rotate through addresses. */
export function rateKeyFromIp(ip: string): string {
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) return v4mapped[1];
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const groups = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return `${groups.slice(0, 4).map((g) => g.padStart(4, '0')).join(':')}::/64`;
}

/**
 * Privacy-friendly rate-limit key: HMAC-SHA-256 over the IP (or IPv6 /64) and the day,
 * keyed with the IP_HASH_KEY Worker secret, truncated to 128 bits. Without the secret
 * the stored value can't be reversed, and keys can't be linked across days.
 */
export async function hashClient(ip: string, secret: string | undefined, dayOffset = 0): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || 'luxepool-local-dev-only'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const day = new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${rateKeyFromIp(ip)}|${day}`));
  return Array.from(new Uint8Array(mac).slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
}

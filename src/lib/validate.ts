/**
 * Validation shared by the quote form (browser) and /api/quote (Worker), so the two
 * can never disagree about what a valid name or phone is.
 */

// Control (Cc), format (Cf: zero-width, bidi overrides/isolates, BOM…), line/paragraph
// separators, and "letters" or marks that render as nothing (Hangul fillers, variation
// selectors, grapheme joiner, Khmer inherent vowels, Mongolian selectors).
const INVISIBLE =
  /[\p{Cc}\p{Cf}\u2028\u2029\u115F\u1160\u3164\uFFA0\u034F\u17B4\u17B5\u180B-\u180F\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;
const INVISIBLE_KEEP_NEWLINES =
  /[\p{Cf}\u2028\u2029\u115F\u1160\u3164\uFFA0\u034F\u17B4\u17B5\u180B-\u180F\uFE00-\uFE0F\u{E0100}-\u{E01EF}]|(?![\t\n])\p{Cc}/gu;

/** Clean a string field and cap it by code points (never splits a surrogate pair). */
export function cleanText(value: unknown, max: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  let s = value.replace(/\r\n?/g, '\n');
  s = multiline
    ? s.replace(INVISIBLE_KEEP_NEWLINES, '').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : s.replace(INVISIBLE, '').replace(/\s+/g, ' ');
  return Array.from(s.trim()).slice(0, max).join('').trim();
}

/** Names and cities: cleaned, angle brackets removed. */
export const cleanName = (value: unknown, max: number) => cleanText(value, max).replace(/[<>]/g, '').trim();

/** At least two visible letters (any script). */
export const isValidName = (name: string) => /\p{L}.*\p{L}/su.test(name);

/** Israeli mobile, VoIP (07x) and landline numbers, with 0 or 972 prefix. */
const PHONE_DIGITS = /^(?:972|0)(?:5\d{8}|7\d{8}|[23489]\d{7})$/;

/**
 * Returns the phone in E.164 (+972…), or null if it is not a valid Israeli number.
 * Accepts the usual ways people type it: spaces, dots, slashes, brackets, any dash,
 * underscores, a leading +972 / 00972, and an optional "tel:" prefix.
 */
export function normalisePhone(raw: string): string | null {
  const s = raw.trim().replace(/^tel:?\s*/i, '');
  if (s.length > 24) return null;
  if (!/^[\d\s +().\/_\-‐-―−]+$/.test(s)) return null;
  let digits = s.replace(/\D/g, '');
  if (digits.startsWith('00972')) digits = digits.slice(2);
  if (!PHONE_DIGITS.test(digits)) return null;
  return `+972${digits.startsWith('972') ? digits.slice(3) : digits.slice(1)}`;
}

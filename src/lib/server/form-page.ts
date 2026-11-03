/**
 * Plain HTML answers for the quote form when it is posted natively: with JavaScript off,
 * or when the page script did not load. Same wording as the form; no scripts, so the
 * page works under the site's CSP and in any browser.
 */
import { phones } from '@/data/site';
import { waLink } from '@/lib/whatsapp';

export type FormOutcome = 'sent' | 'name' | 'phone' | 'limited' | 'error';

const TEXT: Record<FormOutcome, { title: string; body: string }> = {
  sent: { title: 'תודה, קיבלנו את הבקשה.', body: 'צוות הבנייה שלנו יחזור אליכם בהקדם.' },
  name: { title: 'חסר שם', body: 'איך לפנות אליכם? כתבו שם (לפחות שתי אותיות).' },
  phone: { title: 'בדקו את מספר הטלפון', body: 'בדקו את מספר הטלפון, למשל 050-1234567.' },
  limited: {
    title: 'קיבלנו כבר כמה בקשות',
    body: 'קיבלנו כבר כמה בקשות מהמכשיר הזה. נסו שוב בעוד כמה דקות, או כתבו לנו בוואטסאפ.',
  },
  error: { title: 'משהו השתבש בשליחה', body: 'נסו שוב, או כתבו לנו בוואטסאפ.' },
};

const DEMO_NOTE = 'זהו אתר קונספט: הבקשה נשמרה במערכת ההדגמה ולא הועברה ללוקספול.';
const WA_TEXT = 'שלום, אשמח לקבל הצעת מחיר לבניית בריכה.';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function formPage(outcome: FormOutcome, demo = false): string {
  const t = TEXT[outcome];
  const fix = outcome === 'name' || outcome === 'phone' ? '<p>חזרו לדף הקודם בדפדפן כדי לתקן את הפרטים.</p>' : '';
  const note = outcome === 'sent' && demo ? `<p class="note">${esc(DEMO_NOTE)}</p>` : '';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(t.title)} · לוקספול</title>
<style>
body{margin:0;background:#fff;color:#5b6673;font:400 1.0625rem/1.65 'Heebo','Arial Hebrew',Arial,system-ui,sans-serif}
main{max-inline-size:36rem;margin-inline:auto;padding:clamp(40px,10vw,96px) 20px}
h1{margin:0 0 16px;color:#1b2430;font-weight:300;font-size:clamp(1.75rem,6vw,2.5rem);line-height:1.15}
p{margin:0 0 14px}
a{color:#1c5198;font-weight:600}
a:focus-visible{outline:2px solid #1c5198;outline-offset:3px;border-radius:4px}
.ltr{direction:ltr;unicode-bidi:isolate}
.note{padding:12px 14px;border-radius:10px;background:#f5f8fb;color:#1b2430}
.fine{margin-block-start:32px;font-size:.875rem}
</style>
</head>
<body>
<main>
<h1>${esc(t.title)}</h1>
<p>${esc(t.body)}</p>
${fix}${note}
<p>אפשר גם להתקשר ל-<a class="ltr" href="tel:${phones.build.tel}">${phones.build.display}</a> או לכתוב בוואטסאפ ל-<a class="ltr" href="${esc(waLink(WA_TEXT))}">${phones.buildWhatsApp.display}</a>.</p>
<p><a href="/#contact">חזרה לאתר</a></p>
<p class="fine" lang="en" dir="ltr">Design concept. Not the official Luxepool website.</p>
</main>
</body>
</html>
`;
}

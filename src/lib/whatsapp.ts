/** WhatsApp deep links with a pre-filled Hebrew message built from the visitor's choices. */
import { edges, extras, finishes, poolTypeById, shapes, whatsappNumber } from '@/data/site';
import type { Design, State } from './store';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function designSummary(d: Design): string {
  const shape = shapes.find((s) => s.id === d.shape)?.label ?? '';
  const edge = edges.find((e) => e.id === d.edge)?.label ?? '';
  const finish = finishes.find((f) => f.id === d.finish)?.label ?? '';
  const chosen = extras.filter((e) => d.extras[e.id]).map((e) => e.label);
  const parts = [`${shape} ${fmt(d.length)} על ${fmt(d.width)} מ׳`, edge, `גימור ${finish}`];
  if (chosen.length) parts.push(`תוספות: ${chosen.join(', ')}`);
  return parts.join(', ');
}

export function quoteMessage(s: State): string {
  const lines = ['שלום לוקספול, אשמח לקבל הצעת מחיר לבריכה.'];
  const type = poolTypeById(s.poolType);
  if (type) lines.push(`סוג הבריכה: ${type.short}`);
  if (s.designTouched) lines.push(`התכנון שלי: ${designSummary(s.design)}`);
  return lines.join('\n');
}

export const serviceMessage = 'שלום לוקספול, אני צריך/ה שירות או ציוד לבריכה.';

export const waLink = (text: string, number = whatsappNumber) =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/** /sitemap.xml — prerendered. The site is noindex (design concept); the map lists its pages. */
import type { APIRoute } from 'astro';

export const prerender = true;

const PAGES = ['/', '/accessibility/'];

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://luxepool.kikkey.com');
  const urls = PAGES.map((p) => `  <url><loc>${new URL(p, base).href}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};

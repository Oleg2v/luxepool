#!/usr/bin/env node
/**
 * Composes the 1200×630 social preview (public/og.jpg) from the hero still and the
 * site's own fonts. Needs Playwright with Chromium (same as render-posters.mjs).
 *
 *   node scripts/render-og.mjs
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const f = (p) => pathToFileURL(resolve(p)).href;

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:Plex;src:url(${f('node_modules/@fontsource/ibm-plex-sans-hebrew/files/ibm-plex-sans-hebrew-hebrew-200-normal.woff2')});font-weight:200}
@font-face{font-family:Heebo;src:url(${f('node_modules/@fontsource-variable/heebo/files/heebo-hebrew-wght-normal.woff2')});font-weight:100 900}
@font-face{font-family:Inter;src:url(${f('src/assets/fonts/inter-tight-subset.woff2')});font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#fff;position:relative;overflow:hidden;font-family:Inter,Heebo,sans-serif;color:#1b2430}
.pool{position:absolute;left:0;bottom:0;width:560px;height:430px;border-top:11px solid #f5f8fb;border-right:11px solid #f5f8fb;box-shadow:0 -1px 0 rgba(27,36,48,.12),1px 0 0 rgba(27,36,48,.12);overflow:hidden}
.pool img{position:absolute;right:0;top:0;width:560px;height:560px;object-fit:cover}
.copy{position:absolute;right:72px;top:70px;width:640px;text-align:right}
.eyebrow{font:500 22px/1.3 Heebo;color:#1c5198;display:flex;gap:14px;align-items:center;justify-content:flex-start}
.eyebrow:before{content:"";width:40px;height:1px;background:#1c5198;opacity:.6}
h1{font:200 92px/1.02 Inter,Plex;letter-spacing:-.02em;margin-top:26px}
.meta{position:absolute;right:72px;bottom:70px;display:flex;gap:28px;font:400 22px/1.3 Inter,Heebo;color:#5b6673}
.meta b{font:300 34px/1 Inter,Heebo;color:#1b2430;display:block;margin-bottom:6px}
.mark{position:absolute;right:72px;top:24px;font:600 18px/1 Inter;letter-spacing:.24em;direction:ltr}
</style></head><body>
<div class="mark">LUXEPOOL</div>
<div class="copy"><p class="eyebrow">בניית בריכות שחייה · אשדוד</p><h1>החלום שלך,<br>המומחיות שלנו.</h1></div>
<div class="meta"><div><b dir="ltr">4.9</b>דירוג בגוגל</div><div><b dir="ltr">170+</b>ביקורות</div><div><b>האח הגדול</b><span dir="ltr">2023 · 2025</span></div></div>
<div class="pool"><img src="${f('public/img/hero-water-1000.webp')}" alt=""></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// Load from a file:// page so the local fonts and image resolve.
const dir = await mkdtemp(join(tmpdir(), 'og-'));
const file = join(dir, 'og.html');
await writeFile(file, html);
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 88 });
await browser.close();
await rm(dir, { recursive: true, force: true });
console.log('✓ public/og.jpg');

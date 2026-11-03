#!/usr/bin/env node
/**
 * Renders the hero's still image from the real water shader, so the low-power /
 * reduced-motion fallback and the first paint match the live WebGL frame exactly.
 *
 *   npm run build:fast && npm run posters && npm run build:fast
 *
 * Output: src/assets/posters/hero-water.jpg (Astro turns it into AVIF/WebP at build).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';

// Playwright is not a project dependency (posters are committed); resolve it from the
// environment: a local install, NODE_PATH, or `npm i -D playwright && npx playwright install chromium`.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4399;
const SIZE = 1600;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Minimal static server for the static build (run `npm run build:fast` first).
const ROOT = existsSync('dist/client') ? 'dist/client' : 'dist';
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(ROOT, path.endsWith('/') || path === '' ? join(path, 'index.html') : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, '127.0.0.1');

try {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/?poster`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.posterReady === 'true', null, { timeout: 60000 });
  await sleep(300);
  await page.screenshot({ path: 'src/assets/posters/hero-water.jpg', type: 'jpeg', quality: 93, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
  await browser.close();
  console.log('✓ src/assets/posters/hero-water.jpg');
} finally {
  server.close();
}

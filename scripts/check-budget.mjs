#!/usr/bin/env node
/**
 * Performance budget: every 3D module (its own chunk + everything it statically
 * imports, three.js included) must stay under 200 KB gzipped. Also prints the
 * initial JS a visitor downloads before any 3D is requested.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIR = 'dist/_astro';
const LIMIT = 200 * 1024;
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
const gz = new Map(files.map((f) => [f, gzipSync(readFileSync(join(DIR, f)), { level: 9 }).length]));
const src = new Map(files.map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));

/** Static imports only (dynamic import() is lazy and not part of the module cost). */
function deps(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const code = src.get(file) ?? '';
  const re = /(?:^|[;}\s])import\s*(?:[\w${}\s,*]+from\s*)?["']\.\/([^"']+\.js)["']/g;
  for (const m of code.matchAll(re)) if (gz.has(m[1])) deps(m[1], seen);
  return seen;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const modules = [
  ['hero water', /^hero-water\./],
  ['configurator', /^configurator-scene\./],
  ['build timeline', /^timeline-scene\./],
];

let failed = false;
console.log('\n3D module budget (gzip, incl. static deps):');
for (const [label, re] of modules) {
  const entry = files.find((f) => re.test(f));
  if (!entry) {
    console.log(`  ${label.padEnd(16)} — chunk not found`);
    continue;
  }
  const total = [...deps(entry)].reduce((s, f) => s + gz.get(f), 0);
  const ok = total <= LIMIT;
  failed ||= !ok;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(16)} ${kb(total).padStart(9)}  (${entry})`);
}

// Initial page JS: module scripts referenced from index.html and their static deps.
const html = readFileSync('dist/index.html', 'utf8');
const initial = new Set();
for (const m of html.matchAll(/src="\/_astro\/([^"]+\.js)"/g)) deps(m[1], initial);
const initialTotal = [...initial].reduce((s, f) => s + gz.get(f), 0);
console.log(`\nInitial JS on first load: ${kb(initialTotal)} gzip across ${initial.size} file(s)`);

if (failed) {
  console.error('\nBudget exceeded.');
  process.exit(1);
}
console.log('');

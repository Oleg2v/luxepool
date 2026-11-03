#!/usr/bin/env node
/**
 * Guarded deploy: refuses to run unless the built Worker config targets exactly
 * account be9447…, worker "luxepool", one custom domain luxepool.kikkey.com,
 * with workers.dev and preview URLs off. Then runs `wrangler deploy`.
 *
 *   npm run deploy        (builds first)
 *
 * Needs CLOUDFLARE_API_TOKEN in the environment (never printed or stored).
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const EXPECT = {
  account: 'be9447e281c6e9198712ade2d0241029',
  name: 'luxepool',
  domain: 'luxepool.kikkey.com',
};

const fail = (msg) => {
  console.error(`✗ deploy guard: ${msg}`);
  process.exit(1);
};

if (!process.env.CLOUDFLARE_API_TOKEN) fail('CLOUDFLARE_API_TOKEN is not set');

// The Astro/Cloudflare build redirects wrangler to the generated config.
const redirect = '.wrangler/deploy/config.json';
if (!existsSync(redirect)) fail(`${redirect} missing — run the build first`);
const { configPath } = JSON.parse(readFileSync(redirect, 'utf8'));
const built = JSON.parse(readFileSync(new URL(configPath, new URL(`file://${process.cwd()}/${redirect}`)), 'utf8'));

if (built.account_id !== EXPECT.account) fail(`account_id is ${built.account_id}`);
if (built.name !== EXPECT.name) fail(`worker name is ${built.name}`);
if (built.workers_dev !== false) fail('workers_dev must be false');
if (built.preview_urls !== false) fail('preview_urls must be false');
const routes = built.routes ?? [];
if (routes.length !== 1 || routes[0].pattern !== EXPECT.domain || routes[0].custom_domain !== true)
  fail(`routes must be exactly [{ pattern: "${EXPECT.domain}", custom_domain: true }]`);
const db = (built.d1_databases ?? [])[0];
if (!db || db.binding !== 'DB' || !db.database_id) fail('D1 binding DB with a database_id is required');

console.log(`✓ guard: ${EXPECT.name} → https://${EXPECT.domain} (account ${EXPECT.account.slice(0, 6)}…)`);
const r = spawnSync('npx', ['wrangler', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
process.exit(r.status ?? 1);

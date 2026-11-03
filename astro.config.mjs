// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

/**
 * Luxepool concept — Cloudflare Workers build.
 *
 * Every page is prerendered to static HTML and served by Workers static assets.
 * The only server code is /api/quote (stores quote requests in D1).
 * Sessions and the Images binding are disabled on purpose: no KV / Images
 * resources are needed, and the hero images are pre-optimised in /public/img.
 */
export default defineConfig({
  site: 'https://luxepool.kikkey.com',
  output: 'static',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  session: false,
  trailingSlash: 'ignore',
  compressHTML: true,
  devToolbar: { enabled: false },
  build: {
    // Critical CSS ships inside the HTML: no render-blocking stylesheet request.
    inlineStylesheets: 'always',
    format: 'directory',
  },
  vite: {
    build: {
      target: 'es2020',
      // three.js ends up in one shared chunk used by the hero, configurator and timeline.
      chunkSizeWarningLimit: 700,
    },
  },
});

// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Luxepool concept — static export.
 * `npm run build` writes a fully static site to /dist that deploys as-is to
 * Vercel, Netlify or Cloudflare Pages (no server runtime needed).
 */
export default defineConfig({
  output: 'static',
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

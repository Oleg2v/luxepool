# Luxepool — concept home page

A design concept for **לוקספול שירותי בריכות בע״מ** (Ashdod): one Hebrew-first, RTL home page
built to turn visitors into serious quote requests. **Design concept, not the official
Luxepool website** (`noindex` everywhere, and the footer says so).

**Live:** https://luxepool.kikkey.com (Cloudflare Workers, account Velikotrav2307).

- **Stack:** Astro 7 + `@astrojs/cloudflare` (every page prerendered, served by Workers static
  assets), TypeScript, vanilla TS islands, three.js for the hero water, the configurator and the
  build timeline, GSAP + ScrollTrigger, Lenis, self-hosted Google Fonts (IBM Plex Sans Hebrew,
  Heebo, Inter Tight).
- **Server code:** only `POST /api/quote`, which stores quote requests in the D1 database
  `luxepool-leads`, and the Worker-rendered 404 page.

## Run locally

Requires Node **22.23.4 or newer** (Astro 7).

```bash
npm install && npm run dev
```

Open http://localhost:4321. To let the form store requests locally, create the local D1 tables once:

```bash
npm run db:migrate:local
```

## Build

```bash
npm run build
```

Runs `astro check`, builds to `dist/` (`dist/client` = static site, `dist/server` = Worker) and
checks the 3D performance budget (every 3D module, three.js included, must stay under 200 KB
gzipped). `npm run build:fast` skips the checks. `npm run preview` serves the build with `wrangler dev`.

## Deploy (Cloudflare Workers)

```bash
npm run deploy
```

Builds, then `scripts/deploy.mjs` refuses to continue unless the generated Worker config targets
account `be9447…`, worker `luxepool`, exactly one custom domain `luxepool.kikkey.com`, with
workers.dev and preview URLs off, and a D1 binding; then it runs `wrangler deploy`
(`WRANGLER_SEND_METRICS=false`). It needs `CLOUDFLARE_API_TOKEN` in the environment (Workers
Scripts and Routes edit is enough; D1 rights are not needed to deploy).

Configuration lives in `wrangler.jsonc`: custom domain `luxepool.kikkey.com` (Cloudflare creates
the DNS record and certificate), `workers_dev: false`, `preview_urls: false`, `keep_vars: true`,
observability on, `nodejs_compat`, D1 binding `DB`. Sessions and the Images binding are disabled
in `astro.config.mjs` (`session: false`, `imageService: 'passthrough'`), so no KV or Images
resources are needed; the hero still is pre-optimised in `public/img` (`npm run images`).

### Quote requests (D1)

- Database `luxepool-leads` (region eeur), binding `DB`, table `leads`; schema in
  `migrations/0001_create_leads.sql`, recorded in `d1_migrations` like wrangler does.
- New migrations: add `migrations/000N_name.sql` and apply with
  `npx wrangler d1 migrations apply luxepool-leads --remote` (needs a token with D1 edit).
- Read requests in the Cloudflare dashboard (D1 → luxepool-leads → Console), e.g.
  `SELECT created_at, name, phone, city, pool_type_label, design_summary FROM leads ORDER BY id DESC LIMIT 50;`
- The endpoint accepts same-origin requests only (dev origins only in `astro dev`), reads at most
  16 KB (counted in bytes while streaming), validates every field against the site's own option
  lists, stores the phone in E.164 (`+972…`), recomputes the design summary and the example price on
  the server, keeps the page only as a same-origin path, and uses prepared statements.
- Abuse limits: an edge rate limiter (`ratelimits` binding `QUOTE_LIMITER`, 5 per minute per
  visitor) plus one atomic D1 statement that allows 5 requests per visitor per 10 minutes (IPv6 is
  limited per /64; the window survives midnight) and 300 per hour for all visitors together.
  The visitor key stored in `ip_hash` is an HMAC with the Worker secret `IP_HASH_KEY` (set once with
  `openssl rand -hex 32 | npx wrangler secret put IP_HASH_KEY`), so raw IPs are never stored.
- Honeypot hits are stored with `status = 'spam'` instead of being dropped, so a real lead can never be
  lost silently; filter them out with `WHERE status = 'new'`.
- The form and the server share one set of rules (`src/lib/validate.ts`); a rejected field is shown
  next to that field. Without JavaScript (or if the page script fails to load) the form posts natively:
  `/api/quote` runs the same checks, answers errors with a plain HTML page in the same words
  (`src/lib/server/form-page.ts`) and redirects a stored request to `GET /api/quote?sent=1`
  (Post/Redirect/Get, so a reload never sends it twice); the phone and WhatsApp links are shown next to
  the form. On a static host with `PUBLIC_QUOTE_WEBHOOK_URL` only the script can post, so there the
  form is hidden without JavaScript and those links replace it.
- Unused framework routes (`/_server-islands/*`, `/_image`) answer 404, and only `/api/quote` accepts
  anything other than GET/HEAD.
- Free-text fields (name, city, message) are stored as typed: encode them when showing them in HTML,
  and in spreadsheet exports prefix cells that start with `=`, `+`, `-` or `@`.
- Forwarding: set a Worker variable or secret `QUOTE_WEBHOOK_URL` (dashboard, or
  `npx wrangler secret put QUOTE_WEBHOOK_URL`) and each stored request is also POSTed there as JSON.
  Until then the confirmation tells visitors that this is a concept site and the request was saved
  in the demo system, not sent to Luxepool.

### Hidden from search engines, security headers

`<meta name="robots" content="noindex, nofollow">` on every page, `robots.txt` with `Disallow: /`,
and on every response (`public/_headers` for static files; `src/middleware.ts` and the Worker entry
`src/worker.ts` for Worker responses, including the few Astro answers before the middleware runs):
`X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy` and a
`Content-Security-Policy` (own origin, images from luxepool.co.il, Cloudflare Web Analytics).
Canonical, hreflang, Open Graph image (`public/og.jpg`, `npm run og`) and `sitemap.xml` use
https://luxepool.kikkey.com.

Two settings live on the **kikkey.com zone**, not in this repo:

- **Managed robots.txt** (AI Crawl Control): Cloudflare prepends its own block (a list of AI
  crawlers and `User-agent: * / Allow: /`) to this site's `robots.txt`. Indexing stays blocked by
  `X-Robots-Tag` and the meta tag; turning the option off makes `robots.txt` exactly the repo's file.
  It applies to every kikkey.com subdomain.
- **Always Use HTTPS**: plain `http://` is answered without a server-side redirect. The page bounces
  to `https://` itself and HSTS keeps returning visitors on HTTPS; the zone option adds a 301 for all
  subdomains.

### Other static hosts

`dist/client` is a complete static site. `vercel.json` and `netlify.toml` publish it as is.
Without the Worker there is no `/api/quote`, so set `PUBLIC_QUOTE_WEBHOOK_URL` (see `.env.example`)
to send the form to an external webhook instead.

## What is on the page

1. **Hero, "the surface"**: a top-down pool cut into a white deck; real-time water (heightfield
   ripples, refraction, caustics, depth colour in Luxepool's own gradient). The cursor or a finger
   leaves ripples. Headline line by line, one sentence, quote and WhatsApp buttons, trust stats
   (4.9 on Google, 170+ reviews, the Big Brother pool). Still image + CSS ripple fallback; a pause button.
2. **Which pool is yours**: a swipeable RTL selector of 8 types; real Luxepool photos where a project of
   that type exists, labelled plan illustrations where not; example build times; one tap adds the type
   to the quote form and the WhatsApp message.
3. **Design your pool**: a white-model 3D garden; shape, length, width, overflow/skimmer, finish
   (the water colour is physical: it comes from the finish seen through the water), spa, blade
   waterfall, LED (the garden turns to dusk), slatted cover. Example price range clearly labelled;
   "send this design" pre-fills the form and WhatsApp. An architectural plan is the instant view and
   the no-WebGL fallback.
4. **From excavation to the first swim**: a sectional site model that builds itself as you scroll
   (setting out, excavation, rebar and concrete, plumbing in x-ray, finishing, filling, a robot cleaner).
   Every stage is credited to Luxepool's own teams.
5. **Projects**: an editorial index of the 12 real projects with one large circular lens and a soft
   ripple transition; captions transcribed from Luxepool's own project graphics. Big Brother case (2023, 2025).
6. **What customers say**: 4.9, three short quotes in the gist of the Google reviews (no names), link to Google.
7. **Everything under one roof**: build, maintenance and renovation, equipment shop (luxepoolshop.co.il), spa and saunas.
8. **Quote request**: short form, big WhatsApp alternative, clear routing (new pool: 074-700-9884 /
   WhatsApp 050-238-1007; service and equipment: 050-523-8884), demo-aware confirmation.
9. **Footer**: white logo on Luxepool blue, contacts, address, social links, accessibility statement,
   the concept line.

## Facts, examples and assets

- Company facts come only from the brief. Project city, size and type are transcribed from the captions
  printed on Luxepool's own photos.
- Anything that is not a fact (build times, prices, depth for the volume estimate) is labelled **דוגמה**
  in the UI. The price model lives in `src/lib/pricing.ts`.
- Photos are hotlinked from luxepool.co.il. They are social graphics with the photo inside a circle, so
  every crop is computed inside that circle (`src/lib/crop.ts`); the caption panels are never shown.
- Social links are placeholders: set the real profiles in `src/data/site.ts` (`socials`).
- The hero still (`src/assets/posters/hero-water.jpg`) is rendered from the real shader:
  `npm run build:fast && npm run posters && npm run images` (needs Playwright with Chromium);
  `npm run images` writes the AVIF/WebP variants the page uses to `public/img`.

## Performance and accessibility

- Initial JavaScript is about 18 KB gzipped. three.js loads only when needed: the hero water after the
  page is interactive, the configurator and timeline when they approach the viewport. Every loop stops
  off-screen and in hidden tabs, DPR is capped, and shadows re-render only when geometry changes.
- Software GL (SwiftShader, llvmpipe), Save-Data, low memory, `prefers-reduced-motion` and a frame-rate
  watchdog all fall back to the still image, the plan view and the static timeline.
- Lighthouse mobile run on this build (headless Chromium, simulated slow 4G): Performance 99,
  Accessibility 100, Best Practices 100, LCP 1.9 s, TBT 0 ms, CLS 0. SEO reports 66 only because the
  concept is deliberately `noindex`. Headless Chromium has no GPU, so that run uses the still-image
  path; on a phone with a GPU the live water loads after the page is interactive.
- WCAG 2.2 AA and IS 5568: skip link, landmarks, full keyboard support (native radios, checkboxes and
  RTL sliders in the configurator, arrow keys rotate the 3D view), visible focus, labelled form errors,
  focus moved to the confirmation, a pause control for the water, reduced-motion versions of every
  animation, logical CSS properties throughout. Accessibility statement: `/accessibility/`.

QA flags: `?still` forces the fallbacks, `?forcegl` allows software GL (for screenshots), `?poster`
renders the poster frame.

## File tree

```
.
├── astro.config.mjs            Cloudflare adapter, site URL, inlined CSS
├── wrangler.jsonc              Worker: custom domain, D1 binding, no workers.dev
├── migrations/                 D1 schema (0001_create_leads.sql)
├── package.json
├── tsconfig.json
├── .env.example                optional external webhook for the form
├── vercel.json · netlify.toml  publish dist/client on other static hosts
├── DEMO_FEATURES.md            what the page does for sales (HE / EN)
├── public/
│   ├── _headers                noindex + security headers + caching
│   ├── img/                    pre-optimised hero still (AVIF/WebP)
│   ├── og.jpg                  social preview
│   ├── favicon.svg
│   └── robots.txt
├── scripts/
│   ├── deploy.mjs              guarded wrangler deploy
│   ├── check-budget.mjs        3D modules < 200 KB gzip each
│   ├── build-images.mjs        hero still → public/img
│   ├── render-og.mjs           public/og.jpg
│   └── render-posters.mjs      renders the hero still from the shader
└── src/
    ├── assets/
    │   ├── fonts/              Inter Tight subset (+ how to regenerate)
    │   └── posters/            hero-water.jpg (shader still)
    ├── components/
    │   ├── Header.astro        sticky header, mobile menu
    │   ├── Hero.astro          1 · the surface
    │   ├── PoolTypes.astro     2 · which pool is yours
    │   ├── PoolDiagram.astro       plan illustrations
    │   ├── Configurator.astro  3 · design your pool
    │   ├── BuildTimeline.astro 4 · from excavation to the first swim
    │   ├── Projects.astro      5 · projects + Big Brother
    │   ├── Reviews.astro       6 · what customers say
    │   ├── UnderOneRoof.astro  7 · everything under one roof
    │   ├── QuoteForm.astro     8 · quote request
    │   ├── Footer.astro        9 · footer
    │   ├── WhatsAppFab.astro       mobile WhatsApp button
    │   └── Icon.astro              inline SVG icons
    ├── data/site.ts            all content and facts
    ├── layouts/Base.astro      RTL shell, fonts, noindex
    ├── lib/
    │   ├── crop.ts             art-directed crops of the hotlinked photos
    │   ├── device.ts           capability checks, GL probe
    │   ├── plan-svg.ts         architectural plan of the configured pool
    │   ├── pricing.ts          EXAMPLE price model
    │   ├── shapes.ts           pool plan geometry
    │   ├── store.ts            shared visitor choices
    │   ├── validate.ts         name/phone rules shared by the form and the server
    │   ├── server/lead.ts      server-side validation of quote requests
    │   ├── server/headers.ts   security + noindex headers (middleware and Worker entry)
    │   ├── server/form-page.ts HTML answers for native (no-JavaScript) form posts
    │   ├── whatsapp.ts         wa.me links with pre-filled Hebrew messages
    │   └── three/
    │       ├── hero-water.ts       hero renderer (ripple sim, loop, watchdog)
    │       ├── hero-shaders.ts     hero GLSL
    │       ├── configurator-scene.ts
    │       ├── timeline-scene.ts
    │       ├── pool-materials.ts   refractive water, interior, deck
    │       ├── geometry.ts         slabs, walls, perimeter helpers
    │       └── glsl.ts             shared noise / caustics / waves
    ├── middleware.ts           security + noindex headers on Worker responses
    ├── worker.ts               Worker entry: Astro handler + headers on every response
    ├── cloudflare-env.d.ts     types for the D1 binding
    ├── pages/
    │   ├── index.astro
    │   ├── accessibility.astro
    │   ├── 404.astro           Worker-rendered 404
    │   ├── sitemap.xml.ts
    │   └── api/quote.ts        POST /api/quote → D1
    ├── scripts/
    │   ├── app.ts              WhatsApp links, mobile button, anchors, Lenis + GSAP
    │   ├── scroll-lock.ts
    │   └── toast.ts
    └── styles/global.css       tokens and base styles
```

# Luxepool — concept home page

A design concept for **לוקספול שירותי בריכות בע״מ** (Ashdod): one Hebrew-first, RTL home page
built to turn visitors into serious quote requests. **Design concept, not the official
Luxepool website** (the page carries `noindex` and says so in the footer).

- **Stack:** Astro 7 static export, TypeScript, vanilla TS islands (no UI framework),
  three.js for the hero water, the configurator and the build timeline, GSAP + ScrollTrigger,
  Lenis smooth scroll, Google Fonts self-hosted (IBM Plex Sans Hebrew, Heebo, Inter Tight).
- **Output:** plain static files in `dist/`, so it deploys to Vercel, Netlify or Cloudflare Pages as is.

## Run locally

Requires Node **22.23.4 or newer** (Astro 7).

```bash
npm install && npm run dev
```

Open http://localhost:4321.

## Build

```bash
npm run build
```

This runs `astro check`, builds to `dist/`, and checks the 3D performance budget (every 3D
module, three.js included, must stay under 200 KB gzipped). `npm run build:fast` skips the checks.

## Deploy (static)

| Host | Settings |
| --- | --- |
| **Vercel** | Import the repo. `vercel.json` sets the build command (`npm run build:fast`), output `dist`, and `noindex` / cache headers. |
| **Netlify** | Import the repo. `netlify.toml` sets the build and Node version; `public/_headers` adds `noindex` and caching. |
| **Cloudflare Pages** | Build command `npm run build:fast`, output directory `dist`, environment variable `NODE_VERSION=22.23.4`. `public/_headers` is picked up automatically. |

Or upload `dist/` to any static host.

## Quote form webhook

Copy `.env.example` to `.env` and set:

```
PUBLIC_QUOTE_WEBHOOK_URL=https://hook.example.com/...
```

The form POSTs JSON (name, phone, city, pool type, start, message, the configured design,
its summary and the example range, page URL and timestamp). The request is sent as
`text/plain` so it is a simple CORS request with no preflight; Make, Zapier, n8n and
Pipedream all parse the body as JSON. With no URL set the page runs in **demo mode**: the
form validates, shows the confirmation, and says that nothing was sent.

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
  `npm run build:fast && npm run posters` (needs Playwright with Chromium).

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
├── astro.config.mjs            static export, inlined CSS
├── package.json
├── tsconfig.json
├── .env.example                PUBLIC_QUOTE_WEBHOOK_URL
├── vercel.json · netlify.toml  deploy settings
├── DEMO_FEATURES.md            what the page does for sales (HE / EN)
├── public/
│   ├── _headers                noindex + caching (Netlify, Cloudflare Pages)
│   ├── favicon.svg
│   └── robots.txt
├── scripts/
│   ├── check-budget.mjs        3D modules < 200 KB gzip each
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
    │   ├── whatsapp.ts         wa.me links with pre-filled Hebrew messages
    │   └── three/
    │       ├── hero-water.ts       hero renderer (ripple sim, loop, watchdog)
    │       ├── hero-shaders.ts     hero GLSL
    │       ├── configurator-scene.ts
    │       ├── timeline-scene.ts
    │       ├── pool-materials.ts   refractive water, interior, deck
    │       ├── geometry.ts         slabs, walls, perimeter helpers
    │       └── glsl.ts             shared noise / caustics / waves
    ├── pages/
    │   ├── index.astro
    │   └── accessibility.astro
    ├── scripts/
    │   ├── app.ts              WhatsApp links, mobile button, anchors, Lenis + GSAP
    │   ├── scroll-lock.ts
    │   └── toast.ts
    └── styles/global.css       tokens and base styles
```

/**
 * Architectural plan of the configured pool as an SVG string. Rendered on the server for
 * the first paint, re-rendered on every change, and kept as the fallback when WebGL is
 * unavailable. Coordinates are metres (plan x → right, plan y → up the page).
 */
import { finishes } from '@/data/site';
import type { Design } from './store';
import { offsetPolygon, poolPlan, type Pt } from './shapes';

const f2 = (n: number) => n.toFixed(2);
const fmt = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : n.toFixed(1));

/** Plan y is flipped so +y (towards the house) is drawn at the top. */
const path = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f2(x)} ${f2(-y)}`).join('L')}Z`;

export function planSvg(d: Design): string {
  const plan = poolPlan(d.shape, d.length, d.width);
  const { bbox, outline } = plan;
  const fin = finishes.find((f) => f.id === d.finish) ?? finishes[0];
  const ring = d.edge === 'overflow' ? offsetPolygon(outline, 0.22) : offsetPolygon(outline, 0.32);

  // Deck/frame extents incl. extras.
  let minX = bbox.minX - 1.4;
  let maxX = bbox.maxX + 1.4;
  const minY = bbox.minY - 1.4;
  const maxY = bbox.maxY + 1.4;
  if (d.extras.jacuzzi) maxX = Math.max(maxX, plan.anchors.jacuzzi.x + plan.anchors.jacuzzi.size / 2 + 0.9);
  if (d.extras.cover) minX = Math.min(minX, bbox.minX - 1.6);
  const pad = 1.3;
  const vb = [minX - pad, -(maxY + pad), maxX - minX + pad * 2, maxY - minY + pad * 2];

  const parts: string[] = [];
  parts.push(
    `<defs>
      <linearGradient id="pw" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fin.swatch[0]}"/><stop offset="1" stop-color="${fin.swatch[1]}"/></linearGradient>
      <pattern id="pg" width="0.5" height="0.5" patternUnits="userSpaceOnUse"><path d="M0.5 0H0V0.5" fill="none" stroke="#1B2430" stroke-opacity="0.07" stroke-width="0.012"/></pattern>
      <pattern id="ph" width="0.18" height="0.18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V0.18" stroke="#1B2430" stroke-opacity="0.32" stroke-width="0.02"/></pattern>
      <clipPath id="pc"><path d="${path(outline)}"/></clipPath>
    </defs>`,
  );
  // Deck
  parts.push(`<rect x="${f2(minX)}" y="${f2(-maxY)}" width="${f2(maxX - minX)}" height="${f2(maxY - minY)}" fill="#fff" stroke="#1B2430" stroke-opacity="0.16" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  parts.push(`<rect x="${f2(minX)}" y="${f2(-maxY)}" width="${f2(maxX - minX)}" height="${f2(maxY - minY)}" fill="url(#pg)"/>`);
  // Coping / overflow channel
  if (d.edge === 'overflow') {
    parts.push(`<path d="${path(ring)}" fill="#E9EEF4" stroke="#1B2430" stroke-opacity="0.35" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
    parts.push(`<path d="${path(offsetPolygon(outline, 0.11))}" fill="none" stroke="#1B2430" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>`);
  } else {
    parts.push(`<path d="${path(ring)}" fill="#fff" stroke="#1B2430" stroke-opacity="0.28" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  }
  // Water
  parts.push(`<path d="${path(outline)}" fill="url(#pw)"/>`);
  // Caustic hint strokes
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  parts.push(
    `<g clip-path="url(#pc)" fill="none" stroke="#fff" stroke-opacity="0.4" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-linecap="round">${[0.25, 0.5, 0.75]
      .map((k, i) => {
        const y = -(bbox.minY + h * k);
        const x0 = cx - w * 0.38;
        const x1 = cx + w * 0.38;
        const a = 0.18 + i * 0.05;
        return `<path d="M${f2(x0)} ${f2(y)}C${f2(x0 + w * 0.2)} ${f2(y - a)},${f2(x1 - w * 0.3)} ${f2(y + a)},${f2(x1)} ${f2(y - a * 0.4)}"/>`;
      })
      .join('')}</g>`,
  );
  // Steps
  if (plan.steps) {
    const s = plan.steps;
    const lines: string[] = [];
    for (let k = 1; k <= s.count; k++) {
      const x = s.x0 + ((s.x1 - s.x0) / s.count) * k;
      lines.push(`M${f2(x)} ${f2(-s.y0)}V${f2(-s.y1)}`);
    }
    parts.push(`<path d="${lines.join('')}" stroke="#fff" stroke-opacity="0.9" stroke-width="1.3" vector-effect="non-scaling-stroke"/>`);
  }
  // LED
  if (d.extras.led) {
    const n = Math.max(2, Math.round(w / 2.6));
    const dots: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = bbox.minX + (w / n) * (i + 0.5);
      dots.push(`<circle cx="${f2(x)}" cy="${f2(-(bbox.minY + 0.22))}" r="0.12" fill="#2BE1F5"/><circle cx="${f2(x)}" cy="${f2(-(bbox.minY + 0.22))}" r="0.5" fill="#2BE1F5" fill-opacity="0.18"/>`);
    }
    parts.push(`<g clip-path="url(#pc)">${dots.join('')}</g>`);
  }
  // Waterfall
  if (d.extras.waterfall) {
    const a = plan.anchors.waterfall;
    parts.push(
      `<g stroke="#1B2430" stroke-opacity="0.75" fill="none" vector-effect="non-scaling-stroke"><path d="M${f2(a.x - 0.35)} ${f2(-a.y - 0.12)}H${f2(a.x + 0.35)}" stroke-width="3" vector-effect="non-scaling-stroke"/></g>
       <g stroke="#fff" stroke-opacity="0.85" fill="none" stroke-width="1.1" vector-effect="non-scaling-stroke"><path d="M${f2(a.x - 0.4)} ${f2(-a.y + 0.35)}q0.4 0.25 0.8 0"/><path d="M${f2(a.x - 0.6)} ${f2(-a.y + 0.65)}q0.6 0.35 1.2 0"/></g>`,
    );
  }
  // Cover
  if (d.extras.cover) {
    parts.push(`<path d="${path(outline)}" fill="url(#ph)"/>`);
    parts.push(`<rect x="${f2(bbox.minX - 0.95)}" y="${f2(-(bbox.maxY + 0.2))}" width="0.55" height="${f2(h + 0.4)}" fill="#E9EEF4" stroke="#1B2430" stroke-opacity="0.4" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  }
  // Pool outline on top
  parts.push(`<path d="${path(outline)}" fill="none" stroke="#1B2430" stroke-opacity="0.65" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`);
  // Jacuzzi
  if (d.extras.jacuzzi) {
    const j = plan.anchors.jacuzzi;
    const hs = j.size / 2;
    parts.push(
      `<rect x="${f2(j.x - hs)}" y="${f2(-(j.y + hs))}" width="${f2(j.size)}" height="${f2(j.size)}" fill="#fff" stroke="#1B2430" stroke-opacity="0.45" stroke-width="1" vector-effect="non-scaling-stroke"/>
       <rect x="${f2(j.x - hs + 0.22)}" y="${f2(-(j.y + hs) + 0.22)}" width="${f2(j.size - 0.44)}" height="${f2(j.size - 0.44)}" fill="url(#pw)"/>
       <g fill="#fff" fill-opacity="0.85">${[[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, 0]].map(([x, y]) => `<circle cx="${f2(j.x + x)}" cy="${f2(-(j.y + y))}" r="0.07"/>`).join('')}</g>`,
    );
  }
  // Dimension lines
  const dy = -(bbox.maxY + 0.85);
  const dx = bbox.maxX + 0.85 + (d.extras.jacuzzi ? 0 : 0);
  const tick = 0.14;
  parts.push(
    `<g stroke="#1B2430" stroke-opacity="0.55" stroke-width="1" vector-effect="non-scaling-stroke" fill="none">
      <path d="M${f2(bbox.minX)} ${f2(dy)}H${f2(bbox.maxX)}M${f2(bbox.minX)} ${f2(dy - tick)}V${f2(dy + tick)}M${f2(bbox.maxX)} ${f2(dy - tick)}V${f2(dy + tick)}"/>
      ${d.extras.jacuzzi ? '' : `<path d="M${f2(dx)} ${f2(-bbox.minY)}V${f2(-bbox.maxY)}M${f2(dx - tick)} ${f2(-bbox.minY)}H${f2(dx + tick)}M${f2(dx - tick)} ${f2(-bbox.maxY)}H${f2(dx + tick)}"/>`}
    </g>
    <g font-family="Inter Tight, Heebo, sans-serif" font-size="0.36" fill="#1B2430" text-anchor="middle">
      <text x="${f2(cx)}" y="${f2(dy - 0.22)}" direction="ltr">${fmt(d.length)}</text>
      ${d.extras.jacuzzi ? '' : `<text x="${f2(dx + 0.3)}" y="${f2(-cy)}" direction="ltr" transform="rotate(90 ${f2(dx + 0.3)} ${f2(-cy)})">${fmt(d.width)}</text>`}
    </g>`,
  );
  return `<svg class="cfg-plan" viewBox="${vb.map(f2).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="תכנית הבריכה מלמעלה">${parts.join('')}</svg>`;
}

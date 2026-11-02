/**
 * Pool plan geometry shared by the SVG plan, the 3D configurator and the price model.
 * Units are metres. x runs along the pool length, y along its width (y = z in 3D).
 */
import type { ShapeId } from '@/data/site';

export type Pt = [number, number];

export interface PoolPlan {
  outline: Pt[]; // counter-clockwise
  area: number; // m² of water surface
  /** Steps at the -x end: rectangle covering the step block, or null for freeform. */
  steps: { x0: number; x1: number; y0: number; y1: number; count: number } | null;
  /** Where extras attach, all in plan coordinates. */
  anchors: {
    jacuzzi: { x: number; y: number; size: number };
    waterfall: { x: number; y: number; dirY: number };
  };
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function bboxOf(pts: Pt[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Main lane width of the L shape as a share of the overall width. */
export const L_LANE = 0.56;

export function lWingLength(L: number) {
  return Math.min(Math.max(2.2, L * 0.38), L - 2);
}

export function poolPlan(shape: ShapeId, L: number, W: number): PoolPlan {
  const hx = L / 2;
  const hy = W / 2;
  let outline: Pt[];
  let steps: PoolPlan['steps'] = null;
  const stepCount = 3;
  const stepDepth = 0.35;

  if (shape === 'rect') {
    outline = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
    steps = { x0: -hx, x1: -hx + stepCount * stepDepth, y0: -hy, y1: hy, count: stepCount };
  } else if (shape === 'l') {
    const wing = lWingLength(L);
    const lane = W * L_LANE;
    outline = [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [hx - wing, hy],
      [hx - wing, -hy + lane],
      [-hx, -hy + lane],
    ];
    steps = { x0: -hx, x1: -hx + stepCount * stepDepth, y0: -hy, y1: -hy + lane, count: stepCount };
  } else {
    outline = freeform(hx, hy, 96);
  }

  const bbox = bboxOf(outline);
  return {
    outline,
    area: polygonArea(outline),
    steps,
    anchors: {
      // Raised spa beside the +x end, flush with the -y side.
      jacuzzi: { x: bbox.maxX + 0.35 + 1.05, y: bbox.minY + 1.05, size: 2.1 },
      // Blade waterfall on the +y coping, centred on the main body.
      waterfall: { x: shape === 'l' ? -hx + (L - lWingLength(L)) / 2 : 0, y: shape === 'l' ? -hy + W * L_LANE : edgeYAt(outline, 0, hy), dirY: -1 },
    },
    bbox,
  };
}

/** Organic "kidney" plan: a soft superellipse with one gentle waist. */
function freeform(hx: number, hy: number, n: number): Pt[] {
  const pts: Pt[] = [];
  const e = 2 / 2.7; // superellipse exponent → rounded, not oval
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    let x = hx * Math.sign(c) * Math.pow(Math.abs(c), e);
    let y = hy * Math.sign(s) * Math.pow(Math.abs(s), e);
    // Asymmetric lobes: the -x end is slightly narrower.
    const lobe = 0.9 + 0.1 * Math.tanh((x / hx) * 2.2);
    y *= lobe;
    // Waist on the +y side.
    if (y > 0) {
      const waist = 0.26 * hy * Math.exp(-Math.pow(x / (hx * 0.42), 2));
      y -= waist * (y / hy);
    }
    pts.push([x, y]);
  }
  return pts;
}

/** Highest y of the outline near a given x (used to seat the waterfall on a curved edge). */
function edgeYAt(pts: Pt[], x: number, fallback: number): number {
  let best = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    if ((x1 - x) * (x2 - x) <= 0 && x1 !== x2) {
      const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
      if (y > best) best = y;
    }
  }
  return Number.isFinite(best) ? best : fallback;
}

/**
 * Offset a closed polygon outward by d (miter, clamped). Good enough for the convex-ish
 * shapes used here (rect, L, kidney) to build copings and overflow channels.
 */
export function offsetPolygon(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  const area2 = signedArea2(pts);
  const sgn = area2 > 0 ? 1 : -1; // CCW → outward normal is (dy, -dx)
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const n1 = normal(p0, p1, sgn);
    const n2 = normal(p1, p2, sgn);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const cos = mx * n1[0] + my * n1[1];
    const len = d / Math.max(cos, 0.35);
    out.push([p1[0] + mx * len, p1[1] + my * len]);
  }
  return out;
}

function signedArea2(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a;
}

function normal(a: Pt, b: Pt, sgn: number): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [(dy / l) * sgn, (-dx / l) * sgn];
}

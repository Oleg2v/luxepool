/** Geometry helpers shared by the configurator and the build timeline (plan y → world -z). */
import { BufferAttribute, BufferGeometry, ExtrudeGeometry, Path, Shape, ShapeGeometry, Vector2 } from 'three';
import type { Pt } from '@/lib/shapes';


export const ensureCCW = (pts: Pt[]): Pt[] => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a >= 0 ? pts : [...pts].reverse();
};

export const toShape = (pts: Pt[]) => new Shape(pts.map(([x, y]) => new Vector2(x, y)));
export const toPath = (pts: Pt[]) => new Path(pts.map(([x, y]) => new Vector2(x, y)));

/** Plan polygon → horizontal slab between y0 and y1 (plan y → world -z). */
export function slab(shape: Shape, y0: number, y1: number, bevel = 0) {
  const g = new ExtrudeGeometry(shape, {
    depth: y1 - y0 - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  return g;
}

/** Flat plan polygon at height y, facing up. */
export function flat(pts: Pt[], y: number) {
  const g = new ShapeGeometry(toShape(pts), 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** Inward-facing walls along a CCW plan polygon, from yTop down to yBottom. */
export function walls(pts: Pt[], yTop: number, yBottom: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l = Math.hypot(dx, dy) || 1;
    // inward normal in plan = (-dy, dx); world = (nx, 0, -ny)
    const nx = -dy / l;
    const nz = -dx / l;
    const a = [x1, yTop, -y1];
    const b = [x2, yTop, -y2];
    const c = [x2, yBottom, -y2];
    const d = [x1, yBottom, -y1];
    // winding chosen so the face points along the inward normal
    const tri = (p: number[], q: number[], r: number[]) => {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
      const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      const cx = uy * vz - uz * vy;
      const cz = ux * vy - uy * vx;
      const flip = cx * nx + cz * nz < 0;
      const order = flip ? [p, r, q] : [p, q, r];
      for (const v of order) {
        pos.push(v[0], v[1], v[2]);
        nor.push(nx, 0, nz);
      }
    };
    tri(a, b, c);
    tri(a, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  return g;
}

/** Span of the polygon along plan y at a given plan x (single interval shapes). */
export function spanAtX(pts: Pt[], x: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    if ((x1 - x) * (x2 - x) <= 0 && x1 !== x2) {
      const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}

/** Evenly spaced points along a polygon's perimeter with their inward normals. */
export function alongPerimeter(pts: Pt[], n: number) {
  const segs = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return { p, q, l: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
  const total = segs.reduce((s, x) => s + x.l, 0);
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  for (let k = 0; k < n; k++) {
    let t = ((k + 0.5) / n) * total;
    for (const s of segs) {
      if (t <= s.l) {
        const f = t / s.l;
        const dx = (s.q[0] - s.p[0]) / s.l;
        const dy = (s.q[1] - s.p[1]) / s.l;
        out.push({ x: s.p[0] + (s.q[0] - s.p[0]) * f, y: s.p[1] + (s.q[1] - s.p[1]) * f, nx: -dy, ny: dx });
        break;
      }
      t -= s.l;
    }
  }
  return out;
}

export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt));


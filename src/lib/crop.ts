/**
 * Art-directed crops for the hotlinked project photos.
 *
 * The source files are 1600×900 social graphics with the photograph inside a circle
 * (centre cx, cy). We never show the caption panel or the yellow ring: every crop is
 * computed inside the clean radius, and applied with CSS custom properties consumed by
 * `.crop > img` in global.css (img width, left, top as % of the frame).
 */
import type { Photo } from '@/data/site';

export const SOURCE_W = 1600;
export const SOURCE_H = 900;
/** Clean photo radius inside the ring, with a safety margin for JPEG halos. */
export const CLEAN_R = 366;

export type CropVars = Record<'--crop-w' | '--crop-x' | '--crop-y', string>;

const pct = (n: number) => `${n.toFixed(3)}%`;

/** Largest rectangle of `aspect` (w/h) inscribed in the clean circle, optionally scaled/offset. */
export function rectCrop(p: Photo, aspect: number, scale = 1, dx = 0, dy = 0): CropVars {
  const r = CLEAN_R * scale;
  const k = Math.sqrt(1 + aspect * aspect);
  const cw = (2 * r * aspect) / k;
  const ch = (2 * r) / k;
  const x0 = p.cx + dx - cw / 2;
  const y0 = p.cy + dy - ch / 2;
  return {
    '--crop-w': pct((SOURCE_W / cw) * 100),
    '--crop-x': pct((-x0 / cw) * 100),
    '--crop-y': pct((-y0 / ch) * 100),
  };
}

/** The full clean circle, for round "lens" frames. */
export function circleCrop(p: Photo, r = CLEAN_R): CropVars {
  const d = 2 * r;
  return {
    '--crop-w': pct((SOURCE_W / d) * 100),
    '--crop-x': pct((-(p.cx - r) / d) * 100),
    '--crop-y': pct((-(p.cy - r) / d) * 100),
  };
}

export const cropStyle = (vars: CropVars) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

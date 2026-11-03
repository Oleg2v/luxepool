#!/usr/bin/env node
/**
 * Pre-optimised hero still (AVIF + WebP, 4 widths) → public/img/.
 * The Cloudflare build uses imageService "passthrough" (no Images binding), so the
 * responsive variants are generated once here and committed.
 *
 *   node scripts/build-images.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'src/assets/posters/hero-water.jpg';
const OUT = 'public/img';
const WIDTHS = [560, 760, 1000, 1400];

await mkdir(OUT, { recursive: true });
for (const w of WIDTHS) {
  const base = sharp(SRC).resize(w, w, { fit: 'cover' });
  await base.clone().avif({ quality: 50, effort: 6 }).toFile(`${OUT}/hero-water-${w}.avif`);
  await base.clone().webp({ quality: 72, effort: 6 }).toFile(`${OUT}/hero-water-${w}.webp`);
  console.log(`✓ hero-water-${w}.{avif,webp}`);
}

/**
 * EXAMPLE price model. These numbers are not Luxepool prices; the UI always labels the
 * result "example only — the final quote comes after a site visit".
 */
import { extras, poolTypeById, type FinishId, type PoolTypeId, type ShapeId } from '@/data/site';
import { poolPlan } from './shapes';
import type { Design } from './store';

const PER_M2: [number, number] = [4300, 5800]; // ₪ per m² of water, example
const BASE: [number, number] = [30000, 45000]; // site setup, systems — example
const SHAPE_F: Record<ShapeId, number> = { rect: 1, l: 1.08, free: 1.14 };
const FINISH_F: Record<FinishId, number> = { white: 1, sky: 1.02, deep: 1.03, stone: 1.05, graphite: 1.05 };
const OVERFLOW_F = 1.22;

const round5k = (n: number) => Math.round(n / 5000) * 5000;

export function examplePrice(d: Design, type: PoolTypeId | null) {
  const { area } = poolPlan(d.shape, d.length, d.width);
  const f =
    SHAPE_F[d.shape] *
    FINISH_F[d.finish] *
    (d.edge === 'overflow' ? OVERFLOW_F : 1) *
    (poolTypeById(type)?.priceFactor ?? 1);
  let low = area * PER_M2[0] * f + BASE[0];
  let high = area * PER_M2[1] * f + BASE[1];
  for (const e of extras) {
    if (d.extras[e.id]) {
      low += e.price[0];
      high += e.price[1];
    }
  }
  return { low: round5k(low), high: round5k(high), area };
}

export const formatShekel = (n: number) => `₪${n.toLocaleString('en-US')}`;

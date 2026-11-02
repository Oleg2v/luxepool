/**
 * Tiny shared state for the visitor's choices. The pool-type selector, the configurator,
 * the quote form and every WhatsApp link read from here, so a choice made anywhere
 * pre-fills everything else.
 */
import { sizeLimits, type EdgeId, type ExtraId, type FinishId, type PoolTypeId, type ShapeId } from '@/data/site';

export interface Design {
  shape: ShapeId;
  length: number;
  width: number;
  edge: EdgeId;
  finish: FinishId;
  extras: Record<ExtraId, boolean>;
}

export interface State {
  poolType: PoolTypeId | null;
  design: Design;
  /** True once the visitor has touched the configurator (design goes into messages). */
  designTouched: boolean;
}

export const defaultDesign = (): Design => ({
  shape: 'rect',
  length: sizeLimits.length.initial,
  width: sizeLimits.width.initial,
  edge: 'skimmer',
  finish: 'sky',
  extras: { jacuzzi: false, waterfall: false, led: false, cover: false },
});

type Listener = (s: State, prev: State) => void;

const KEY = 'lp-concept-state-v1';

function load(): State {
  const base: State = { poolType: null, design: defaultDesign(), designTouched: false };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      poolType: parsed.poolType ?? null,
      design: { ...base.design, ...parsed.design, extras: { ...base.design.extras, ...parsed.design?.extras } },
      designTouched: Boolean(parsed.designTouched),
    };
  } catch {
    return base;
  }
}

let state: State = typeof window === 'undefined' ? { poolType: null, design: defaultDesign(), designTouched: false } : load();
const listeners = new Set<Listener>();

export const store = {
  get: () => state,
  set(patch: Partial<Omit<State, 'design'>> & { design?: Partial<Design> }) {
    const prev = state;
    state = {
      ...state,
      ...patch,
      design: patch.design ? { ...state.design, ...patch.design } : state.design,
    } as State;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* private mode — state still works in memory */
    }
    listeners.forEach((l) => l(state, prev));
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

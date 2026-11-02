/** Capability checks used to decide between live WebGL and the still fallbacks. */

export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface NavigatorHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/** Heuristic for devices that should get the still image instead of live water. */
export function lowPower(): boolean {
  const nav = navigator as NavigatorHints;
  if (new URLSearchParams(location.search).has('still')) return true;
  if (nav.connection?.saveData) return true;
  if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 3) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency < 4) return true;
  return false;
}

export const isPosterMode = (): boolean => new URLSearchParams(location.search).has('poster');

/** Resolve on the next idle period (or after `timeout`). */
export const idle = (timeout = 1500) =>
  new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) {
      (window as Window & typeof globalThis).requestIdleCallback(() => resolve(), { timeout });
    } else {
      setTimeout(resolve, 200);
    }
  });

/** Yield to the main thread between heavy steps so no single task gets long. */
export const yieldToMain = () =>
  new Promise<void>((resolve) => {
    const s = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) s.yield().then(resolve);
    else setTimeout(resolve, 0);
  });

/** Fires `onEnter` once the element is within `margin` of the viewport. */
export function whenNear(el: Element, onEnter: () => void, margin = '600px') {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        onEnter();
      }
    },
    { rootMargin: margin },
  );
  io.observe(el);
}

export interface GLProbe {
  ok: boolean;
  software: boolean;
  renderer: string;
}

let probe: GLProbe | null = null;

/**
 * One-time WebGL2 check (cached). Software rasterisers (SwiftShader, llvmpipe, the
 * Windows basic renderer) can draw the scenes but not at a usable frame rate, so they
 * get the still / plan fallbacks instead of live 3D.
 */
export function probeGL(): GLProbe {
  if (probe) return probe;
  probe = { ok: false, software: false, renderer: '' };
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
      antialias: false,
      depth: false,
      stencil: false,
    }) as WebGL2RenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      probe = {
        ok: true,
        software: /swiftshader|llvmpipe|softpipe|software|basic render|offscreen/i.test(renderer),
        renderer,
      };
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no WebGL2 */
  }
  return probe;
}

/** Live 3D allowed? (?forcegl overrides for QA, ?still forces the fallback.) */
export function canRunLiveGL(): boolean {
  if (new URLSearchParams(location.search).has('forcegl')) return true;
  if (lowPower()) return false;
  const p = probeGL();
  return p.ok && !p.software;
}

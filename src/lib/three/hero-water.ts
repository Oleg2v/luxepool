/**
 * Hero water — real-time pool surface (three.js).
 *
 * Budget: one fullscreen quad, a 256-wide half-float simulation, DPR capped,
 * paused when off-screen or when the tab is hidden, self-demotes to the still image
 * if the device cannot hold the frame rate.
 */
import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { dropFrag, quadVert, simFrag, waterFrag } from './hero-shaders';

export interface HeroWater {
  setUserPaused(paused: boolean): void;
  dispose(): void;
}

interface Options {
  /** First frame is on screen. */
  onReady: () => void;
  /** Device can't keep up (or context lost): show the still instead. */
  onFail: (reason: string) => void;
  /** Deterministic single frame for the poster renderer (scripts/render-posters.mjs). */
  poster?: boolean;
  /** QA only (?forcegl): allow software GL and skip the frame-rate watchdog. */
  allowSoftware?: boolean;
}

const WORLD = 10; // metres covered by the larger side of the frame
const SIM_W = 256;
const MAX_DROPS = 8;

export function createHeroWater(host: HTMLElement, opts: Options): HeroWater {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-water__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: !(opts.poster || opts.allowSoftware),
    preserveDrawingBuffer: !!opts.poster,
  });
  renderer.autoClear = false;

  const gl = renderer.getContext();
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) {
    renderer.dispose();
    canvas.remove();
    throw new Error('float render targets unsupported');
  }

  const coarse = matchMedia('(pointer: coarse)').matches;
  let dprCap = opts.poster ? 1 : coarse ? 1.5 : 1.5;

  // ------------------------------------------------------------ scene setup
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new Mesh(new PlaneGeometry(2, 2));
  const scene = new Scene();
  scene.add(quad);

  const rtOpts = {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  } as const;

  let simW = SIM_W;
  let simH = SIM_W;
  let rtA = new WebGLRenderTarget(simW, simH, rtOpts);
  let rtB = new WebGLRenderTarget(simW, simH, rtOpts);

  const simMat = new ShaderMaterial({
    vertexShader: quadVert,
    fragmentShader: simFrag,
    uniforms: {
      uState: { value: null },
      uTexel: { value: new Vector2(1 / simW, 1 / simH) },
      uSpeed: { value: 1.1 },
      uDamp: { value: 0.993 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const drops = Array.from({ length: MAX_DROPS }, () => new Vector4());
  const dropMat = new ShaderMaterial({
    vertexShader: quadVert,
    fragmentShader: dropFrag,
    uniforms: {
      uState: { value: null },
      uDrops: { value: drops },
      uCount: { value: 0 },
      uAspect: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const waterMat = new ShaderMaterial({
    vertexShader: quadVert,
    fragmentShader: waterFrag,
    uniforms: {
      uSim: { value: null },
      uTexel: { value: new Vector2(1 / simW, 1 / simH) },
      uBox: { value: new Vector2(1, 1) },
      uScale: { value: 1 },
      uTime: { value: 0 },
      uIntro: { value: opts.poster ? 1 : 0 },
    },
    depthTest: false,
    depthWrite: false,
  });

  // ------------------------------------------------------------ sizing
  let cssW = 1;
  let cssH = 1;
  let aspect = 1;

  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, Math.round(r.width));
    cssH = Math.max(1, Math.round(r.height));
    aspect = cssW / cssH;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssW, cssH, false);
    const bw = cssW * dpr;
    const bh = cssH * dpr;
    waterMat.uniforms.uBox.value.set(bw, bh);
    waterMat.uniforms.uScale.value = Math.max(bw, bh) / WORLD;

    // Keep sim texels square on screen.
    const nextW = aspect >= 1 ? SIM_W : Math.round(SIM_W * aspect);
    const nextH = aspect >= 1 ? Math.round(SIM_W / aspect) : SIM_W;
    if (nextW !== simW || nextH !== simH) {
      simW = Math.max(64, nextW);
      simH = Math.max(64, nextH);
      rtA.dispose();
      rtB.dispose();
      rtA = new WebGLRenderTarget(simW, simH, rtOpts);
      rtB = new WebGLRenderTarget(simW, simH, rtOpts);
      clearTargets();
      simMat.uniforms.uTexel.value.set(1 / simW, 1 / simH);
      waterMat.uniforms.uTexel.value.set(1 / simW, 1 / simH);
    }
    dropMat.uniforms.uAspect.value = aspect;
  }

  function clearTargets() {
    renderer.setClearColor(0x000000, 0);
    for (const rt of [rtA, rtB]) {
      renderer.setRenderTarget(rt);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
  }

  // ------------------------------------------------------------ drops
  const queue: [number, number, number, number][] = [];

  /** u, v in 0..1 (v up); radius in texels; strength in height units. */
  function addDrop(u: number, v: number, radiusTexels: number, strength: number) {
    if (queue.length >= 32) queue.shift();
    queue.push([u, v, radiusTexels / simH, strength]);
  }

  function flushDrops() {
    if (!queue.length) return;
    while (queue.length) {
      const batch = queue.splice(0, MAX_DROPS);
      batch.forEach((d, i) => drops[i].set(d[0], d[1], d[2], d[3]));
      dropMat.uniforms.uCount.value = batch.length;
      dropMat.uniforms.uState.value = rtA.texture;
      quad.material = dropMat;
      renderer.setRenderTarget(rtB);
      renderer.render(scene, camera);
      [rtA, rtB] = [rtB, rtA];
    }
  }

  function simStep() {
    simMat.uniforms.uState.value = rtA.texture;
    quad.material = simMat;
    renderer.setRenderTarget(rtB);
    renderer.render(scene, camera);
    [rtA, rtB] = [rtB, rtA];
  }

  function draw(t: number) {
    waterMat.uniforms.uSim.value = rtA.texture;
    waterMat.uniforms.uTime.value = t;
    quad.material = waterMat;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------ input
  let last = { x: -1, y: -1, t: 0 };

  function pointerAt(clientX: number, clientY: number, force = 1) {
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return;
    const now = performance.now();
    const dist = Math.hypot(x - last.x, y - last.y);
    if (last.x >= 0 && dist < 7 && now - last.t < 120) return;
    const speed = last.x < 0 ? 0 : Math.min(dist / Math.max(now - last.t, 8), 2.2);
    last = { x, y, t: now };
    addDrop(x / r.width, 1 - y / r.height, 7, (0.012 + speed * 0.012) * force);
  }

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointerAt(e.clientX, e.clientY);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    last = { x: -1, y: -1, t: 0 };
    pointerAt(e.clientX, e.clientY, 2.2);
  };
  const onTouch = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) pointerAt(t.clientX, t.clientY, e.type === 'touchstart' ? 2 : 1.2);
  };

  if (!opts.poster) {
    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerdown', onPointerDown, { passive: true });
    host.addEventListener('touchstart', onTouch, { passive: true });
    host.addEventListener('touchmove', onTouch, { passive: true });
  }

  // ------------------------------------------------------------ loop
  let raf = 0;
  let visible = true;
  let userPaused = false;
  let running = false;
  let disposed = false;
  let time = 0;
  let acc = 0;
  let prev = 0;
  let nextAmbient = 1.2;
  let ready = false;
  let intro = opts.poster ? 1 : 0;

  // Frame-time watchdog: lower DPR first, then fall back to the still.
  const samples: number[] = [];
  let demotions = 0;

  function watchdog(dt: number) {
    if (opts.poster || opts.allowSoftware || time < 0.8) return;
    samples.push(dt);
    if (samples.length < 40) return;
    samples.sort((a, b) => a - b);
    const median = samples[20];
    samples.length = 0;
    if (median > 1 / 28) {
      demotions++;
      if (median > 1 / 14) demotions = 2; // far too slow: straight to the still
      if (demotions === 1 && dprCap > 1) {
        dprCap = 1;
        resize();
      } else if (demotions >= 2) {
        stop();
        opts.onFail('slow');
      }
    }
  }

  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000 || 0.016, 0.1);
    prev = now;
    time += dt;
    acc += dt;

    // Gentle ambient drops so the surface keeps breathing.
    if (time > nextAmbient) {
      nextAmbient = time + 2.6 + Math.random() * 3.2;
      addDrop(0.15 + Math.random() * 0.8, 0.15 + Math.random() * 0.8, 6, 0.008 + Math.random() * 0.006);
    }

    flushDrops();
    // Fixed 60 Hz simulation regardless of display refresh rate.
    let steps = 0;
    while (acc >= 1 / 60 && steps < 3) {
      simStep();
      acc -= 1 / 60;
      steps++;
    }
    if (intro < 1) {
      intro = Math.min(1, intro + dt / 1.6);
      waterMat.uniforms.uIntro.value = 1 - Math.pow(1 - intro, 3);
    }
    draw(time);
    if (!ready) {
      ready = true;
      opts.onReady();
    }
    watchdog(dt);
  }

  function start() {
    if (running || disposed || userPaused || !visible) return;
    running = true;
    prev = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
    else stop();
  });

  const onVisibility = () => (document.hidden ? stop() : start());

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    opts.onFail('context-lost');
  });

  const ro = new ResizeObserver(() => {
    resize();
    if (!running) draw(time); // keep the paused frame correct after a resize
  });

  // ------------------------------------------------------------ boot
  resize();
  clearTargets();

  if (opts.poster) {
    // Deterministic still: a few drops near the steps, simulated, then one frame.
    addDrop(0.86, 0.9, 9, 0.05);
    for (let i = 0; i < 26; i++) simStep();
    addDrop(0.52, 0.55, 8, 0.035);
    for (let i = 0; i < 40; i++) {
      flushDrops();
      simStep();
    }
    addDrop(0.7, 0.3, 7, 0.03);
    for (let i = 0; i < 14; i++) {
      flushDrops();
      simStep();
    }
    draw(7.3);
    gl.finish();
    opts.onReady();
  } else {
    // Opening gesture: one drop lands on the steps.
    addDrop(0.88, 0.9, 9, 0.045);
    io.observe(host);
    document.addEventListener('visibilitychange', onVisibility);
    ro.observe(host);
    start();
  }

  return {
    setUserPaused(p: boolean) {
      userPaused = p;
      if (p) stop();
      else start();
    },
    dispose() {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('touchstart', onTouch);
      host.removeEventListener('touchmove', onTouch);
      rtA.dispose();
      rtB.dispose();
      simMat.dispose();
      dropMat.dispose();
      waterMat.dispose();
      quad.geometry.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

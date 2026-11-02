/**
 * "From excavation to the first swim" — scroll-driven build (three.js).
 *
 * A sectional site model (cut soil block) where the pool literally builds itself as
 * progress goes 0 → 1: setting out, excavation, rebar and concrete, plumbing (x-ray),
 * finishing (tiles wipe in, coping, deck), filling, and a robot cleaner for care.
 * Each of the 7 stages owns 1/7 of the progress.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { offsetPolygon, type Pt } from '@/lib/shapes';
import { alongPerimeter, damp, flat, slab, toPath, toShape, walls } from './geometry';
import { createInteriorUniforms, createWaterMaterial, patchDeck, patchInterior, RefractionPass, WATER_LAYER } from './pool-materials';

export interface TimelineScene {
  setProgress(p: number): void;
  dispose(): void;
}

interface Options {
  reduced: boolean;
  allowSoftware?: boolean;
  background: string;
  onReady: () => void;
  onFail: (reason: string) => void;
}

const STAGES = 7;
const L = 8;
const W = 4;
const FLOOR = -1.45;
const BASE = -1.7;
const WATER = -0.12;
const BLOCK = { minX: -6.3, maxX: 9.0, minY: -4.8, maxY: 4.5, bottom: -2.7 };
/** Equipment pad, front-right of the pool (plan coordinates; world z = -y). */
const PAD = { x: 6.7, y: -2.9 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const sub = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Camera keyframes at the end of each stage: [theta, phi, radius, tx, ty, tz]. */
const KEYS: number[][] = [
  [0.24, 0.6, 31, 1.0, -0.7, 0.2],
  [0.36, 0.7, 28, 0.6, -1.0, 0.3],
  [0.5, 0.76, 26.5, 0.4, -1.1, 0.3],
  [0.82, 0.68, 28.5, 2.6, -0.8, 1.0],
  [0.6, 0.66, 28.5, 1.0, -0.6, 0.1],
  [0.42, 0.7, 26.5, 0.6, -0.8, 0.3],
  [0.28, 0.62, 28.5, 1.0, -0.6, 0.2],
];

export function createTimelineScene(host: HTMLElement, opts: Options): TimelineScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'tl-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: !opts.allowSoftware,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const bg = new Color(opts.background);
  renderer.setClearColor(bg, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.5, 120);
  camera.layers.enable(WATER_LAYER);

  scene.add(new HemisphereLight('#ffffff', '#dfe6ee', 1.3));
  const sun = new DirectionalLight('#ffffff', 2.4);
  sun.position.set(8, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 50 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  // ---------------------------------------------------------- materials
  const lawnMat = new MeshStandardMaterial({ color: '#fbfcfd', roughness: 1, transparent: true });
  const soilMat = new MeshStandardMaterial({ color: '#cfd7df', roughness: 1, transparent: true });
  soilMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLpWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLpWorld;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           // cool-grey strata with a fine speckle — a section through the ground
           float y = vLpWorld.y;
           vec3 c = vec3(0.80, 0.84, 0.88);
           c = mix(c, vec3(0.70, 0.75, 0.81), step(y, -0.32));
           c = mix(c, vec3(0.62, 0.68, 0.75), step(y, -1.1));
           c = mix(c, vec3(0.55, 0.61, 0.69), step(y, -1.9));
           // thin hairline between strata, like a drawn section
           float edge = 0.0;
           edge += 1.0 - smoothstep(0.0, 0.012, abs(y + 0.32));
           edge += 1.0 - smoothstep(0.0, 0.012, abs(y + 1.1));
           edge += 1.0 - smoothstep(0.0, 0.012, abs(y + 1.9));
           c *= 1.0 - 0.18 * clamp(edge, 0.0, 1.0);
           float sp = fract(sin(dot(floor(vLpWorld.xz * 34.0 + vLpWorld.y * 41.0), vec2(12.9898, 78.233))) * 43758.5453);
           c *= 0.94 + sp * 0.1;
           diffuseColor.rgb = c;
         }`,
      );
  };
  soilMat.customProgramCacheKey = () => 'lp-soil';
  const concreteMat = new MeshStandardMaterial({ color: '#d6dce2', roughness: 0.95 });
  const whiteMat = new MeshStandardMaterial({ color: '#fbfcfd', roughness: 0.9 });
  const copingMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
  const deckMat = new MeshStandardMaterial({ color: '#fdfdfe', roughness: 0.9 });
  patchDeck(deckMat, 0.6);
  const deckReveal = { value: 0 };
  const prevDeck = deckMat.onBeforeCompile;
  deckMat.onBeforeCompile = (shader, r) => {
    prevDeck(shader, r);
    shader.uniforms.uReveal = deckReveal;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (length(vLpWorld.xz * vec2(0.62, 1.0)) > uReveal) discard;');
  };
  deckMat.customProgramCacheKey = () => 'lp-deck-reveal';
  const steelMat = new MeshStandardMaterial({ color: '#e3e9ee', roughness: 0.25, metalness: 0.85 });
  const pipeMat = new MeshStandardMaterial({ color: '#2a72b8', roughness: 0.45 });
  pipeMat.defines = { USE_UV: '' };
  const flow = { uTime: { value: 0 }, uFlow: { value: 0 } };
  pipeMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, flow);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uFlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.1, 0.85, 1.0) * smoothstep(0.55, 0.9, fract(vUv.x * 26.0 - uTime * 1.4)) * uFlow * 1.4;',
      );
  };
  pipeMat.customProgramCacheKey = () => 'lp-pipe';
  const ledMat = new MeshBasicMaterial({ color: '#9ff6ff', toneMapped: false });
  const statusMat = new MeshBasicMaterial({ color: '#2be1f5', toneMapped: false });
  const rebarMat = new LineBasicMaterial({ color: '#1c5198', transparent: true, opacity: 0.85 });
  const blueprintMat = new LineBasicMaterial({ color: '#0090d7', transparent: true, opacity: 1 });
  const interiorU = createInteriorUniforms();
  interiorU.uWipe.value = 0;
  interiorU.uWipeMin.value = -L / 2;
  interiorU.uWipeSpan.value = L;
  interiorU.uCaustics.value = 0;
  interiorU.uWaterY.value = FLOOR - 0.5;
  const interiorMat = new MeshStandardMaterial({ color: '#8ed2ea', roughness: 0.4 });
  patchInterior(interiorMat, interiorU);
  const water = createWaterMaterial();

  const pass = new RefractionPass(renderer);

  // ---------------------------------------------------------- geometry
  const pool: Pt[] = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
  const shellOuter = offsetPolygon(pool, 0.28);
  const copingOuter = offsetPolygon(pool, 0.34);
  const blockRect: Pt[] = [[BLOCK.minX, BLOCK.minY], [BLOCK.maxX, BLOCK.minY], [BLOCK.maxX, BLOCK.maxY], [BLOCK.minX, BLOCK.maxY]];

  const add = <T extends Mesh>(m: T, cast = true, receive = true) => {
    m.castShadow = cast;
    m.receiveShadow = receive;
    scene.add(m);
    return m;
  };

  // Site block with the pit hole: soil body + thin lawn layer.
  const soilShape = toShape(blockRect);
  soilShape.holes.push(toPath(shellOuter));
  add(new Mesh(slab(soilShape, BLOCK.bottom, -0.05), soilMat), false);
  const lawnShape = toShape(blockRect);
  lawnShape.holes.push(toPath(shellOuter));
  add(new Mesh(slab(lawnShape, -0.05, 0), lawnMat), false);

  // The pit "lid": un-dug ground that sinks as excavation progresses.
  const lid = add(new Mesh(slab(toShape(shellOuter), BASE, 0), soilMat), false);
  const lidCap = add(new Mesh(flat(shellOuter, 0.002), lawnMat), false);

  // Spoil heap.
  const heap = add(new Mesh(new SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), soilMat));
  heap.position.set(-4.9, 0, 3.4);
  heap.scale.set(0.001, 0.001, 0.001);

  // Blueprint: outline + dimension ticks + stakes.
  const bpPts: number[] = [];
  const seg = (a: number[], b: number[]) => bpPts.push(...a, ...b);
  const y0 = 0.02;
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = pool[i];
    const [x2, z2] = pool[(i + 1) % 4];
    // dashed: 0.35 m dashes
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.floor(len / 0.5);
    for (let k = 0; k < n; k++) {
      const a = k / n;
      const b = (k + 0.6) / n;
      seg([x1 + (x2 - x1) * a, y0, -(z1 + (z2 - z1) * a)], [x1 + (x2 - x1) * b, y0, -(z1 + (z2 - z1) * b)]);
    }
  }
  const dz = W / 2 + 1.0;
  seg([-L / 2, y0, dz], [L / 2, y0, dz]);
  seg([-L / 2, y0, dz - 0.2], [-L / 2, y0, dz + 0.2]);
  seg([L / 2, y0, dz - 0.2], [L / 2, y0, dz + 0.2]);
  const dx = L / 2 + 1.0;
  seg([dx, y0, -W / 2], [dx, y0, W / 2]);
  seg([dx - 0.2, y0, -W / 2], [dx + 0.2, y0, -W / 2]);
  seg([dx - 0.2, y0, W / 2], [dx + 0.2, y0, W / 2]);
  const bpGeo = new BufferGeometry();
  bpGeo.setAttribute('position', new Float32BufferAttribute(bpPts, 3));
  const blueprint = new LineSegments(bpGeo, blueprintMat);
  scene.add(blueprint);
  const stakes = new Group();
  for (const [x, y] of shellOuter) {
    const s = new Mesh(new BoxGeometry(0.05, 0.6, 0.05), steelMat);
    s.position.set(x, 0.3, -y);
    s.castShadow = true;
    stakes.add(s);
  }
  scene.add(stakes);

  // Rebar cage.
  const rb: number[] = [];
  const by = BASE + 0.04;
  for (let x = -L / 2 - 0.2; x <= L / 2 + 0.21; x += 0.3) rb.push(x, by, W / 2 + 0.2, x, by, -W / 2 - 0.2);
  for (let z = -W / 2 - 0.2; z <= W / 2 + 0.21; z += 0.3) rb.push(-L / 2 - 0.2, by, z, L / 2 + 0.2, by, z);
  for (const p of alongPerimeter(offsetPolygon(pool, 0.14), 84)) rb.push(p.x, BASE, -p.y, p.x, -0.16, -p.y);
  for (const h of [-1.4, -0.95, -0.5, -0.2]) {
    const ring = offsetPolygon(pool, 0.14);
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      rb.push(x1, h, -y1, x2, h, -y2);
    }
  }
  const rebarGeo = new BufferGeometry();
  rebarGeo.setAttribute('position', new Float32BufferAttribute(rb, 3));
  const rebar = new LineSegments(rebarGeo, rebarMat);
  scene.add(rebar);
  const rebarCount = rb.length / 3;

  // Concrete shell (rises from the base) with the interior surfaces.
  const shell = new Group();
  const ringShape = toShape(shellOuter);
  ringShape.holes.push(toPath(pool));
  const ringMesh = new Mesh(slab(ringShape, BASE, WATER), concreteMat);
  ringMesh.castShadow = ringMesh.receiveShadow = true;
  const baseSlab = new Mesh(slab(toShape(pool), BASE, FLOOR), concreteMat);
  baseSlab.receiveShadow = true;
  const inner = new Mesh(walls(offsetPolygon(pool, -0.002), WATER, FLOOR), interiorMat);
  inner.receiveShadow = true;
  const floor = new Mesh(flat(pool, FLOOR + 0.001), interiorMat);
  floor.receiveShadow = true;
  shell.add(ringMesh, baseSlab, inner, floor);
  for (let k = 1; k <= 3; k++) {
    const top = -0.33 * k;
    const w = 0.36 * k;
    const g = new BoxGeometry(w, top - FLOOR, W - 0.01);
    g.translate(-L / 2 + w / 2, (top + FLOOR) / 2, 0);
    const step = new Mesh(g, interiorMat);
    step.receiveShadow = step.castShadow = true;
    shell.add(step);
  }
  scene.add(shell);

  // Systems: equipment pad, pipes (x-ray), fittings, LEDs.
  const systems = new Group();
  const pad = new Mesh(new BoxGeometry(2.6, 0.12, 1.7), concreteMat);
  pad.position.set(PAD.x, 0.06, -PAD.y);
  const filter = new Group();
  const tank = new Mesh(new CylinderGeometry(0.34, 0.34, 0.95, 28), whiteMat);
  tank.position.y = 0.6;
  const dome = new Mesh(new SphereGeometry(0.34, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), whiteMat);
  dome.position.y = 1.07;
  filter.add(tank, dome);
  filter.position.set(PAD.x - 0.7, 0, -PAD.y);
  const pump = new Group();
  const pumpBody = new Mesh(new BoxGeometry(0.55, 0.36, 0.38), whiteMat);
  pumpBody.position.y = 0.3;
  const motor = new Mesh(new CylinderGeometry(0.17, 0.17, 0.5, 20), steelMat);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(0.48, 0.3, 0);
  const status = new Mesh(new SphereGeometry(0.035, 12, 8), statusMat);
  status.position.set(0, 0.5, 0.2);
  pump.add(pumpBody, motor, status);
  pump.position.set(PAD.x + 0.25, 0, -PAD.y + 0.2);
  const cell = new Mesh(new BoxGeometry(0.42, 0.7, 0.32), whiteMat);
  cell.position.set(PAD.x + 0.95, 0.47, -PAD.y - 0.35);
  const popIns = [pad, filter, pump, cell];
  popIns.forEach((o) => {
    o.traverse((c) => {
      (c as Mesh).castShadow = true;
      (c as Mesh).receiveShadow = true;
    });
    systems.add(o);
  });
  const pipeY = -0.38;
  // Pipe runs on the camera side, so the x-ray stage shows them clearly.
  const pz = -PAD.y;
  const pipePaths = [
    [new Vector3(L / 2 + 0.05, -0.32, -1.1), new Vector3(L / 2 + 0.9, pipeY, -0.2), new Vector3(PAD.x - 0.9, pipeY, pz - 0.6), new Vector3(PAD.x - 0.7, 0.2, pz)],
    [new Vector3(0, FLOOR - 0.2, 0.2), new Vector3(2.6, FLOOR - 0.15, 0.7), new Vector3(L / 2 + 0.7, -0.95, 1.4), new Vector3(PAD.x - 0.2, pipeY, pz - 0.3), new Vector3(PAD.x + 0.25, 0.2, pz - 0.2)],
    [new Vector3(-1.2, -0.5, W / 2 + 0.06), new Vector3(1.6, pipeY, W / 2 + 0.7), new Vector3(L / 2 + 0.6, pipeY, pz + 0.55), new Vector3(PAD.x + 0.95, pipeY, pz + 0.45), new Vector3(PAD.x + 0.95, 0.15, pz + 0.35)],
  ];
  const pipes = pipePaths.map((pts) => {
    const geo = new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), 90, 0.065, 10, false);
    const m = new Mesh(geo, pipeMat);
    m.castShadow = true;
    systems.add(m);
    return m;
  });
  const fittings = new Group();
  const skimmer = new Mesh(new BoxGeometry(0.42, 0.16, 0.06), whiteMat);
  skimmer.position.set(L / 2 - 0.6, WATER - 0.1, -W / 2 + 0.03);
  const drain = new Mesh(new CylinderGeometry(0.18, 0.18, 0.02, 24), steelMat);
  drain.position.set(0, FLOOR + 0.012, 0);
  fittings.add(skimmer, drain);
  for (let i = 0; i < 3; i++) {
    const led = new Mesh(new CylinderGeometry(0.09, 0.09, 0.02, 20), ledMat);
    led.rotation.x = Math.PI / 2;
    led.position.set(-L / 2 + 1.6 + i * 2.4, WATER - 0.5, W / 2 - 0.012);
    const led2 = led.clone();
    led2.position.z = -W / 2 + 0.012;
    fittings.add(led, led2);
  }
  systems.add(fittings);
  scene.add(systems);

  // Coping stones (instanced, drop in one by one).
  const copingStones: Matrix4[] = [];
  {
    const mid = offsetPolygon(pool, 0.17);
    for (let i = 0; i < mid.length; i++) {
      const [x1, y1] = mid[i];
      const [x2, y2] = mid[(i + 1) % mid.length];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.round(len / 0.6);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const m = new Matrix4().makeRotationY(-Math.atan2(y2 - y1, x2 - x1));
        m.setPosition(x1 + (x2 - x1) * t, 0.025, -(y1 + (y2 - y1) * t));
        copingStones.push(m);
      }
    }
  }
  const coping = new InstancedMesh(new BoxGeometry(0.585, 0.06, 0.36), copingMat, copingStones.length);
  coping.castShadow = coping.receiveShadow = true;
  scene.add(coping);

  // Deck (revealed outward from the pool).
  const deckShape = toShape([[-6.0, -3.6], [5.2, -3.6], [5.2, 3.7], [-6.0, 3.7]]);
  deckShape.holes.push(toPath(copingOuter));
  const deck = add(new Mesh(slab(deckShape, -0.01, 0.05), deckMat), false);

  // Water.
  const waterMesh = new Mesh(flat(pool, WATER), water);
  waterMesh.layers.set(WATER_LAYER);
  scene.add(waterMesh);

  // Robot cleaner.
  const robot = new Group();
  const rBody = new Mesh(new BoxGeometry(0.46, 0.2, 0.38), whiteMat);
  rBody.position.y = 0.1;
  const rTop = new Mesh(new BoxGeometry(0.3, 0.05, 0.3), steelMat);
  rTop.position.y = 0.22;
  robot.add(rBody, rTop);
  scene.add(robot);

  // Two model trees on the block.
  const canopyGeo = new IcosahedronGeometry(1, 1);
  for (const [x, z, s] of [[-5.4, -3.6, 1.2], [8.1, -3.4, 1.0]] as const) {
    const trunk = add(new Mesh(new CylinderGeometry(0.07, 0.1, 1.7, 8), whiteMat));
    trunk.position.set(x, 0.85, z);
    const can = add(new Mesh(canopyGeo, whiteMat));
    can.scale.set(s, s * 0.9, s);
    can.position.set(x, 1.7 + s * 0.6, z);
    can.rotation.set(s, s * 2, 0);
  }

  // ---------------------------------------------------------- state
  let progress = 0;
  let shown = -1;
  const rig = { theta: KEYS[0][0], phi: KEYS[0][1], radius: KEYS[0][2], target: new Vector3(KEYS[0][3], KEYS[0][4], KEYS[0][5]) };
  const goal = { theta: rig.theta, phi: rig.phi, radius: rig.radius, target: rig.target.clone() };
  const m4 = new Matrix4();

  function cameraGoal(p: number) {
    if (opts.reduced) {
      const k = KEYS[4];
      goal.theta = k[0];
      goal.phi = k[1];
      goal.radius = k[2];
      goal.target.set(k[3], k[4], k[5]);
      return;
    }
    const f = clamp01(p) * (STAGES - 1);
    const i = Math.min(STAGES - 2, Math.floor(f));
    const t = ease(f - i);
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const mix = (j: number) => a[j] + (b[j] - a[j]) * t;
    goal.theta = mix(0);
    goal.phi = mix(1);
    goal.radius = mix(2) * fitScale;
    goal.target.set(mix(3) * (camera.aspect < 1 ? 0.4 : 1), mix(4), mix(5));
  }

  let fitScale = 1;

  function apply(p: number) {
    const s = (i: number) => clamp01(p * STAGES - i);
    const s0 = s(0), s1 = s(1), s2 = s(2), s3 = s(3), s4 = s(4), s5 = s(5), s6 = s(6);

    // 0 · setting out
    const bpCount = Math.floor((bpPts.length / 3) * ease(sub(s0, 0, 0.8)));
    bpGeo.setDrawRange(0, bpCount - (bpCount % 2));
    blueprintMat.opacity = 1 - 0.85 * sub(s1, 0.1, 0.6);
    blueprint.visible = s1 < 0.95;
    stakes.children.forEach((c, i) => {
      const k = easeOutBack(sub(s0, 0.3 + i * 0.08, 0.6 + i * 0.08));
      c.scale.set(1, Math.max(0.001, k), 1);
      c.position.y = 0.3 * k;
    });
    stakes.visible = s2 < 0.3;

    // 1 · excavation
    const dig = ease(s1);
    lid.visible = dig < 0.999;
    lid.scale.y = Math.max(0.0001, 1 - dig);
    // keep the lid's bottom on the base: scale around y = BASE
    lid.position.y = BASE * (1 - lid.scale.y);
    lidCap.visible = dig < 0.01;
    const heapK = ease(sub(s1, 0.05, 1)) * (1 - ease(sub(s4, 0.5, 1)));
    heap.scale.set(1.9 * heapK + 0.001, 0.95 * heapK + 0.001, 1.4 * heapK + 0.001);

    // 2 · structure: rebar draws, then concrete rises
    const rbk = ease(sub(s2, 0, 0.45));
    const rc = Math.floor(rebarCount * rbk);
    rebarGeo.setDrawRange(0, rc - (rc % 2));
    rebar.visible = s2 > 0 && s3 < 0.2;
    const rise = ease(sub(s2, 0.35, 1));
    shell.visible = rise > 0.001;
    shell.scale.y = Math.max(0.001, rise);
    shell.position.y = BASE * (1 - shell.scale.y);

    // 3 · systems (x-ray through the ground)
    const xray = sub(s3, 0, 0.15) * (1 - sub(s3, 0.85, 1));
    soilMat.opacity = 1 - 0.68 * xray;
    lawnMat.opacity = 1 - 0.72 * xray;
    soilMat.depthWrite = xray < 0.05;
    lawnMat.depthWrite = xray < 0.05;
    systems.visible = s3 > 0;
    popIns.forEach((o, i) => {
      const k = easeOutBack(sub(s3, 0.04 + i * 0.07, 0.26 + i * 0.07));
      o.scale.setScalar(Math.max(0.001, k));
    });
    pipes.forEach((pm, i) => {
      const k = ease(sub(s3, 0.12 + i * 0.06, 0.48 + i * 0.05));
      const idx = pm.geometry.index!.count;
      const n = Math.floor((idx * k) / 6) * 6;
      pm.geometry.setDrawRange(0, n);
      pm.visible = n > 0 && (xray > 0.02 || s3 < 1);
    });
    pipes.forEach((pm) => (pm.visible = pm.visible && s4 < 0.6));
    flow.uFlow.value = sub(s3, 0.45, 0.65);
    fittings.visible = s3 > 0.6;

    // 4 · finishing
    interiorU.uWipe.value = ease(sub(s4, 0, 0.6));
    const stonesOn = ease(sub(s4, 0.15, 0.75)) * copingStones.length;
    copingStones.forEach((m, i) => {
      const k = clamp01(stonesOn - i);
      const drop = (1 - easeOutBack(k)) * 0.5;
      m4.copy(m);
      m4.elements[13] = 0.025 + drop;
      if (k <= 0) m4.makeScale(0.0001, 0.0001, 0.0001);
      coping.setMatrixAt(i, m4);
    });
    coping.instanceMatrix.needsUpdate = true;
    coping.visible = s4 > 0.1;
    deckReveal.value = ease(sub(s4, 0.5, 1)) * 11;
    deck.visible = deckReveal.value > 0.01;

    // 5 · filling
    const level = ease(s5);
    waterMesh.visible = level > 0.01;
    waterMesh.position.y = (FLOOR - WATER) * (1 - level);
    interiorU.uWaterY.value = level > 0.01 ? FLOOR + (WATER - FLOOR) * level : FLOOR - 0.5;
    interiorU.uCaustics.value = sub(s5, 0.15, 0.6);
    water.uniforms.uWaveAmp.value = 0.35 + 0.65 * level;

    // 6 · care: the robot sweeps the floor in lanes
    robot.visible = s6 > 0.02;
    if (robot.visible) {
      const lanes = 4;
      const u = s6 * lanes;
      const lane = Math.min(lanes - 1, Math.floor(u));
      const f = u - lane;
      const zLane = -W / 2 + 0.6 + (lane * (W - 1.2)) / (lanes - 1);
      const xa = -L / 2 + 1.6;
      const xb = L / 2 - 0.5;
      const x = lane % 2 === 0 ? xa + (xb - xa) * f : xb - (xb - xa) * f;
      robot.position.set(x, FLOOR, zLane);
      robot.rotation.y = lane % 2 === 0 ? 0 : Math.PI;
    }
    statusMat.color.set(s6 > 0 || s5 > 0.5 ? '#2be1f5' : '#9aa7b3');

    cameraGoal(p);
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------------------------------------------------------- loop
  let raf = 0;
  let visible = false;
  let clock = 0;
  let last = performance.now();
  let ready = false;

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Narrow (portrait) frames need more distance to keep the block in view.
    fitScale = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : camera.aspect < 1.3 ? 1.08 : 1;
    cameraGoal(progress);
    wake();
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!opts.reduced) clock += dt;

    if (shown !== progress) {
      apply(progress);
      shown = progress;
    }
    const lam = opts.reduced ? 1000 : 6;
    rig.theta = damp(rig.theta, goal.theta, lam, dt);
    rig.phi = damp(rig.phi, goal.phi, lam, dt);
    rig.radius = damp(rig.radius, goal.radius, lam, dt);
    rig.target.lerp(goal.target, 1 - Math.exp(-lam * dt));
    const sp = Math.sin(rig.phi);
    camera.position.set(
      rig.target.x + rig.radius * sp * Math.sin(rig.theta),
      rig.target.y + rig.radius * Math.cos(rig.phi),
      rig.target.z + rig.radius * sp * Math.cos(rig.theta),
    );
    camera.lookAt(rig.target);

    water.uniforms.uTime.value = clock;
    interiorU.uTime.value = clock;
    flow.uTime.value = clock;
    pass.render(scene, camera, [water]);
    if (!ready) {
      ready = true;
      opts.onReady();
    }
    const settling = Math.abs(rig.theta - goal.theta) + Math.abs(rig.radius - goal.radius) + rig.target.distanceTo(goal.target) > 0.002;
    const animated = !opts.reduced && (progress > 3 / STAGES + 0.05);
    if (visible && (settling || animated)) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (!visible || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && !document.hidden;
    if (visible) wake();
  });
  io.observe(host);
  const onVis = () => {
    visible = !document.hidden && host.getBoundingClientRect().bottom > 0;
    if (visible) wake();
  };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    opts.onFail('context-lost');
  });

  apply(0);
  resize();
  Object.assign(rig, { theta: goal.theta, phi: goal.phi, radius: goal.radius });
  rig.target.copy(goal.target);
  visible = true;
  wake();

  return {
    setProgress(p: number) {
      progress = clamp01(p);
      wake();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
      });
      pass.dispose();
      [lawnMat, soilMat, concreteMat, whiteMat, copingMat, deckMat, steelMat, pipeMat, ledMat, statusMat, rebarMat, blueprintMat, interiorMat, water].forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

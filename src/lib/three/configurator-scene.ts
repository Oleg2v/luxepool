/**
 * "Design your pool" — 3D scene (three.js).
 *
 * A white architectural model of a garden with the configured pool, seen from a
 * three-quarter top view. Only the water carries colour, and that colour is physical:
 * it comes from the chosen finish seen through the water. Extras animate in place
 * (spa, blade waterfall, LED dusk mode, rolling slatted cover).
 *
 * Performance: shadows re-render only when geometry changes, DPR capped, the loop stops
 * off-screen, reduced motion renders on demand only.
 */
import {
  BackSide,
  BoxGeometry,
  type BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { finishes, type PoolTypeId } from '@/data/site';
import { offsetPolygon, poolPlan } from '@/lib/shapes';
import { alongPerimeter, damp, ensureCCW, flat, slab, spanAtX, toPath, toShape, walls } from './geometry';
import type { Design } from '@/lib/store';
import {
  createInteriorUniforms,
  createWaterMaterial,
  MAX_LEDS,
  patchDeck,
  patchInterior,
  RefractionPass,
  WATER_LAYER,
} from './pool-materials';

export interface ConfiguratorScene {
  update(design: Design, type: PoolTypeId | null): void;
  dispose(): void;
}

interface Options {
  design: Design;
  reduced: boolean;
  allowSoftware?: boolean;
  onReady: () => void;
  onFail: (reason: string) => void;
}

const DEPTH = 1.35;
const DAY_BG = new Color('#f2f6f9');
const DUSK_BG = new Color('#0d2240');

/* ---------------------------------------------------------- scene */

export function createConfiguratorScene(host: HTMLElement, opts: Options): ConfiguratorScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'cfg-canvas';
  host.appendChild(canvas);

  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: !opts.allowSoftware,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(DAY_BG, 1);

  const scene = new Scene();
  scene.fog = new Fog(DAY_BG.clone(), 26, 60);

  const camera = new PerspectiveCamera(30, 1, 0.5, 120);
  camera.layers.enable(WATER_LAYER);

  // ------------------------------------------------------- lights
  const hemi = new HemisphereLight('#ffffff', '#e4eaf0', 1.25);
  scene.add(hemi);
  const sun = new DirectionalLight('#ffffff', 2.5);
  sun.position.set(9, 15, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 5;
  const sc = sun.shadow.camera;
  sc.left = -16;
  sc.right = 16;
  sc.top = 16;
  sc.bottom = -16;
  sc.near = 2;
  sc.far = 50;
  scene.add(sun);
  scene.add(sun.target);

  // ------------------------------------------------------- materials
  const white = new MeshStandardMaterial({ color: '#fbfcfd', roughness: 0.92 });
  const deckMat = new MeshStandardMaterial({ color: '#fdfdfe', roughness: 0.9 });
  patchDeck(deckMat, 0.6);
  const copingMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 });
  const grateMat = new MeshStandardMaterial({ color: '#9aa7b3', roughness: 0.6, metalness: 0.2 });
  patchDeck(grateMat, 0.045);
  const groundMat = new MeshStandardMaterial({ color: '#eef3f6', roughness: 1 });
  const lawnMat = new MeshStandardMaterial({ color: '#e1ebe6', roughness: 1 });
  const glassMat = new MeshStandardMaterial({ color: '#b7c9d8', roughness: 0.12, metalness: 0.1, emissive: new Color('#9fd8ff'), emissiveIntensity: 0 });
  const steelMat = new MeshStandardMaterial({ color: '#e3e9ee', roughness: 0.22, metalness: 0.9 });
  const slatMat = new MeshStandardMaterial({ color: '#e7edf2', roughness: 0.55 });
  const ledMat = new MeshBasicMaterial({ color: '#9ff6ff', toneMapped: false });

  const interiorU = createInteriorUniforms();
  const interiorMat = new MeshStandardMaterial({ color: '#8ed2ea', roughness: 0.4 });
  patchInterior(interiorMat, interiorU);
  const spaU = createInteriorUniforms();
  const spaMat = new MeshStandardMaterial({ color: '#8ed2ea', roughness: 0.4, side: BackSide });
  patchInterior(spaMat, spaU);
  spaU.uBand.value = 0;
  spaU.uWaterY.value = 0.42;

  const water = createWaterMaterial();
  const spaWater = createWaterMaterial();
  spaWater.uniforms.uBubbles.value = 1;
  const waters = [water, spaWater];

  const sheetMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main() {
        float streak = h(vec2(floor(vUv.x * 46.0), 0.0));
        float flow = fract(vUv.y * 3.0 - uTime * 1.6 + streak);
        float a = 0.32 + 0.38 * smoothstep(0.2, 1.0, flow) * streak;
        a *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        gl_FragColor = vec4(vec3(0.92, 0.98, 1.0), a);
      }
    `,
  });

  const pass = new RefractionPass(renderer);

  // ------------------------------------------------------- static garden
  const garden = new Group();
  scene.add(garden);
  // Ground and lawn are rings around the deck (the deck covers the rest), so nothing
  // can ever sit above the pool interior. Rebuilt when the deck size changes.
  const ground = new Mesh(new BufferGeometry(), groundMat);
  ground.receiveShadow = true;
  garden.add(ground);
  const lawn = new Mesh(new BufferGeometry(), lawnMat);
  lawn.receiveShadow = true;
  garden.add(lawn);

  // House at the back (world -z).
  const house = new Group();
  const body = new Mesh(new BoxGeometry(17, 3.3, 7), white);
  body.position.set(0, 1.65 - 0.12, -3.5);
  body.castShadow = body.receiveShadow = true;
  const roof = new Mesh(new BoxGeometry(18.4, 0.28, 9), white);
  roof.position.set(0, 3.32, -3.2);
  roof.castShadow = roof.receiveShadow = true;
  const glass = new Mesh(new PlaneGeometry(9.5, 2.5), glassMat);
  glass.position.set(-1.2, 1.15, 0.012);
  const mullion = new Mesh(new BoxGeometry(0.06, 2.5, 0.05), white);
  mullion.position.set(-1.2, 1.15, 0.03);
  const mullion2 = mullion.clone();
  mullion2.position.x = 2.0;
  const mullion3 = mullion.clone();
  mullion3.position.x = -4.4;
  house.add(body, roof, glass, mullion, mullion2, mullion3);
  garden.add(house);

  // Trees — faceted white canopies, like model-making foam.
  const canopyGeo = new IcosahedronGeometry(1, 1);
  const trunkGeo = new CylinderGeometry(0.07, 0.1, 1.7, 8);
  const trees = new Group();
  const treeSpots: [number, number, number][] = [
    [-1, 0.2, 1.25],
    [-1, 0.75, 0.95],
    [1, 0.85, 1.35],
    [1, 0.2, 1.05],
  ];
  const treeMeshes = treeSpots.map(([, , s]) => {
    const t = new Group();
    const trunk = new Mesh(trunkGeo, white);
    trunk.position.y = 0.85 - 0.12;
    const canopy = new Mesh(canopyGeo, white);
    canopy.scale.set(s, s * 0.9, s);
    canopy.position.y = 1.7 + s * 0.6;
    canopy.rotation.set(s, s * 2, 0);
    trunk.castShadow = canopy.castShadow = true;
    canopy.receiveShadow = true;
    t.add(trunk, canopy);
    trees.add(t);
    return t;
  });
  garden.add(trees);

  // Two loungers on the front deck, facing the pool (backrests away from the water).
  const loungers = new Group();
  for (let i = 0; i < 2; i++) {
    const l = new Group();
    const base = new Mesh(new BoxGeometry(0.68, 0.26, 1.55), white);
    base.position.set(0, 0.13, -0.15);
    const back = new Mesh(new BoxGeometry(0.68, 0.07, 0.68), white);
    back.position.set(0, 0.42, 0.78);
    back.rotation.x = -0.9;
    base.castShadow = back.castShadow = true;
    base.receiveShadow = true;
    l.add(base, back);
    l.position.x = -i * 0.95;
    loungers.add(l);
  }
  garden.add(loungers);

  // Planter strip with shrubs.
  const planters = new Group();
  const planterBox = new Mesh(new BoxGeometry(0.7, 0.45, 5), white);
  planterBox.position.y = 0.225 - 0.12;
  planterBox.castShadow = planterBox.receiveShadow = true;
  planters.add(planterBox);
  for (let i = 0; i < 5; i++) {
    const shrub = new Mesh(canopyGeo, white);
    const s = 0.32 + (i % 2) * 0.08;
    shrub.scale.setScalar(s);
    shrub.position.set(0, 0.45 + s * 0.55, -2 + i);
    shrub.castShadow = true;
    planters.add(shrub);
  }
  garden.add(planters);

  // ------------------------------------------------------- pool (rebuilt)
  let poolGroup = new Group();
  scene.add(poolGroup);
  let slats: InstancedMesh | null = null;
  let slatSpans: { x: number; z: number; len: number }[] = [];
  let sheet: Mesh | null = null;

  function disposeGroup(g: Object3D) {
    g.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry && m.geometry !== canopyGeo && m.geometry !== trunkGeo) m.geometry.dispose();
    });
  }

  function mesh(geo: BufferGeometry, mat: Material, shadow = true) {
    const m = new Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  let deckBounds = { minX: -6, maxX: 6, minZ: -4, maxZ: 4 };

  function build(d: Design, L: number, W: number) {
    disposeGroup(poolGroup);
    scene.remove(poolGroup);
    poolGroup = new Group();
    slats = null;
    sheet = null;

    const plan = poolPlan(d.shape, L, W);
    const outline = ensureCCW(plan.outline);
    const { bbox } = plan;
    const overflow = d.edge === 'overflow';
    const ringW = overflow ? 0.22 : 0.32;
    const ring = ensureCCW(offsetPolygon(outline, ringW));
    const waterY = overflow ? -0.006 : -0.13;

    // Deck rectangle (pool + extras + margins).
    let minX = bbox.minX - 1.6;
    let maxX = bbox.maxX + 1.6;
    const minY = bbox.minY - 2.7;
    const maxY = bbox.maxY + 1.5;
    if (d.extras.jacuzzi) maxX = Math.max(maxX, plan.anchors.jacuzzi.x + plan.anchors.jacuzzi.size / 2 + 1.1);
    if (d.extras.cover) minX = Math.min(minX, bbox.minX - 1.9);
    deckBounds = { minX, maxX, minZ: -maxY, maxZ: -minY };

    const deckShape = toShape([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]);
    deckShape.holes.push(toPath(ring));
    poolGroup.add(mesh(slab(deckShape, -0.12, 0), deckMat, false));

    const ringShape = toShape(ring);
    ringShape.holes.push(toPath(outline));
    if (overflow) {
      poolGroup.add(mesh(slab(ringShape, -0.22, -0.07), grateMat, false));
    } else {
      poolGroup.add(mesh(slab(ringShape, -0.12, 0.045, 0.012), copingMat, true));
    }

    // Interior: walls, floor, steps.
    const wallTop = overflow ? -0.012 : -0.12;
    poolGroup.add(mesh(walls(outline, wallTop, -DEPTH), interiorMat, false));
    poolGroup.add(mesh(flat(outline, -DEPTH), interiorMat, false));
    if (plan.steps) {
      const s = plan.steps;
      const tread = (s.x1 - s.x0) / s.count;
      for (let k = 1; k <= s.count; k++) {
        const top = -0.33 * k;
        const w = tread * k;
        const geo = new BoxGeometry(w, top + DEPTH, s.y1 - s.y0);
        geo.translate(s.x0 + w / 2, (top - DEPTH) / 2, -(s.y0 + s.y1) / 2);
        poolGroup.add(mesh(geo, interiorMat, false));
      }
    }
    interiorU.uWaterY.value = waterY;
    interiorU.uBand.value = overflow ? 0 : 1;

    // Water surface.
    const surface = new Mesh(flat(outline, waterY), water);
    surface.layers.set(WATER_LAYER);
    poolGroup.add(surface);

    // ---- extras
    if (d.extras.jacuzzi) {
      const j = plan.anchors.jacuzzi;
      const spa = new Group();
      const outer = toShape([[-j.size / 2, -j.size / 2], [j.size / 2, -j.size / 2], [j.size / 2, j.size / 2], [-j.size / 2, j.size / 2]]);
      const inner = j.size / 2 - 0.2;
      outer.holes.push(toPath([[-inner, -inner], [-inner, inner], [inner, inner], [inner, -inner]]));
      spa.add(mesh(slab(outer, 0, 0.5, 0.012), copingMat));
      const basin = new Mesh(new BoxGeometry(inner * 2, 0.5, inner * 2), spaMat);
      basin.position.y = 0.25;
      basin.receiveShadow = true;
      spa.add(basin);
      const spaSurf = new Mesh(new PlaneGeometry(inner * 2, inner * 2), spaWater);
      spaSurf.rotation.x = -Math.PI / 2;
      spaSurf.position.y = 0.42;
      spaSurf.layers.set(WATER_LAYER);
      spa.add(spaSurf);
      spa.position.set(j.x, 0, -j.y);
      poolGroup.add(spa);
    }

    water.uniforms.uFallOn.value = 0;
    if (d.extras.waterfall) {
      const a = plan.anchors.waterfall;
      const blade = mesh(new BoxGeometry(0.72, 0.05, 0.34), steelMat);
      const lipZ = -a.y + 0.1; // just inside the edge
      blade.position.set(a.x, 0.16, -a.y - 0.04);
      const post = mesh(new BoxGeometry(0.16, 0.2, 0.16), steelMat);
      post.position.set(a.x, 0.06, -a.y - 0.2);
      poolGroup.add(blade, post);
      // Falling sheet: parabola from the blade lip to the surface.
      const g = new PlaneGeometry(0.64, 1, 1, 18);
      const p = g.attributes.position as BufferAttribute;
      const drop = 0.16 - waterY;
      for (let i = 0; i < p.count; i++) {
        const t = 1 - (p.getY(i) + 0.5); // 0 top → 1 bottom
        p.setXYZ(i, p.getX(i), 0.15 - drop * t * t, t * 0.42);
      }
      g.computeVertexNormals();
      sheet = new Mesh(g, sheetMat);
      sheet.position.set(a.x, 0, lipZ);
      sheet.layers.set(WATER_LAYER);
      poolGroup.add(sheet);
      water.uniforms.uFall.value.set(a.x, waterY, lipZ + 0.42);
      water.uniforms.uFallOn.value = 1;
    }

    // LEDs along the walls (positions also feed the water glow).
    const leds = d.extras.led ? alongPerimeter(outline, Math.min(MAX_LEDS, Math.max(4, Math.round((L + W) / 2.4)))) : [];
    water.uniforms.uLightCount.value = leds.length;
    leds.forEach((l, i) => {
      const disc = new Mesh(new CircleGeometry(0.09, 20), ledMat);
      const x = l.x + l.nx * 0.012;
      const y = l.y + l.ny * 0.012;
      disc.position.set(x, waterY - 0.42, -y);
      disc.lookAt(x + l.nx, waterY - 0.42, -(y + l.ny));
      poolGroup.add(disc);
      water.uniforms.uLights.value[i].set(l.x + l.nx * 0.6, waterY, -(l.y + l.ny * 0.6));
    });

    // Cover: slats (instanced) + roller box at the -x end.
    if (d.extras.cover) {
      const roller = mesh(new BoxGeometry(0.6, 0.44, bbox.maxY - bbox.minY + 0.5), white);
      roller.position.set(bbox.minX - ringW - 0.5, 0.22 - 0.0, -(bbox.minY + bbox.maxY) / 2);
      poolGroup.add(roller);
      const pitch = 0.1;
      const n = Math.ceil((bbox.maxX - bbox.minX) / pitch);
      slatSpans = [];
      for (let i = 0; i < n; i++) {
        const x = bbox.minX + pitch * (i + 0.5);
        const s = spanAtX(outline, x);
        if (s) slatSpans.push({ x, z: -(s[0] + s[1]) / 2, len: Math.max(0.01, s[1] - s[0] - 0.03) });
      }
      slats = new InstancedMesh(new BoxGeometry(pitch * 0.96, 0.035, 1), slatMat, slatSpans.length);
      slats.castShadow = true;
      slats.receiveShadow = true;
      slats.userData.waterY = waterY;
      poolGroup.add(slats);
      applyCover(state.cover);
    }

    scene.add(poolGroup);
    placeGarden();
    renderer.shadowMap.needsUpdate = true;
  }

  const m4 = new Matrix4();
  function applyCover(progress: number) {
    if (!slats) return;
    const y = (slats.userData.waterY as number) + 0.025;
    const total = slatSpans.length;
    slatSpans.forEach((s, i) => {
      const on = i < progress * total;
      m4.makeScale(1, 1, on ? s.len : 0.0001);
      m4.setPosition(s.x, on ? y : -5, s.z);
      slats!.setMatrixAt(i, m4);
    });
    slats.instanceMatrix.needsUpdate = true;
  }

  function placeGarden() {
    const b = deckBounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    // plan coordinates: y = -z
    const deckRect: [number, number][] = [[b.minX + 0.02, -b.maxZ + 0.02], [b.maxX - 0.02, -b.maxZ + 0.02], [b.maxX - 0.02, -b.minZ - 0.02], [b.minX + 0.02, -b.minZ - 0.02]];
    const lawnOuter: [number, number][] = [[b.minX - 4.5, -b.maxZ - 4.2], [b.maxX + 4.5, -b.maxZ - 4.2], [b.maxX + 4.5, -b.minZ + 0.2], [b.minX - 4.5, -b.minZ + 0.2]];
    const lawnShape = toShape(lawnOuter);
    lawnShape.holes.push(toPath(deckRect));
    lawn.geometry.dispose();
    lawn.geometry = new ShapeGeometry(lawnShape, 1).rotateX(-Math.PI / 2).translate(0, -0.119, 0);
    const groundOuter: [number, number][] = [[cx - 60, -cz - 60], [cx + 60, -cz - 60], [cx + 60, -cz + 60], [cx - 60, -cz + 60]];
    const groundShape = toShape(groundOuter);
    groundShape.holes.push(toPath(lawnOuter));
    ground.geometry.dispose();
    ground.geometry = new ShapeGeometry(groundShape, 1).rotateX(-Math.PI / 2).translate(0, -0.121, 0);
    house.position.set(cx + 0.8, 0, b.minZ - 2.3);
    treeMeshes.forEach((t, i) => {
      const [side, along] = treeSpots[i];
      const x = side < 0 ? b.minX - 2.1 : b.maxX + 2.0;
      t.position.set(x, 0, b.minZ + (b.maxZ - b.minZ) * along);
    });
    loungers.position.set(b.maxX - 1.0, 0, b.maxZ - 1.25);
    planters.position.set(b.minX - 0.9, 0, (b.minZ + b.maxZ) / 2 + 0.6);
    // Shadow frustum follows the scene size.
    const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 6;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.updateProjectionMatrix();
    sun.target.position.set(cx, 0, (b.minZ + b.maxZ) / 2);
    sun.position.set(cx + 9, 15, (b.minZ + b.maxZ) / 2 + 7);
  }

  // ------------------------------------------------------- camera rig
  const rig = { theta: 0.62, phi: 0.82, tTheta: 0.62, tPhi: 0.82, radius: 22, tRadius: 22 };
  const target = new Vector3();
  const tTarget = new Vector3();

  function fit() {
    const b = deckBounds;
    tTarget.set((b.minX + b.maxX) / 2, -0.4, (b.minZ + b.maxZ) / 2 - 0.3);
    const halfW = (b.maxX - b.minX) / 2 + 0.6;
    const halfD = (b.maxZ - b.minZ) / 2 + 0.6;
    const R = Math.hypot(halfW, halfD);
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const f = Math.min(vfov, hfov);
    rig.tRadius = (R / Math.sin(f / 2)) * (camera.aspect < 1 ? 0.86 : 0.8);
  }

  function placeCamera() {
    const sp = Math.sin(rig.phi);
    camera.position.set(
      target.x + rig.radius * sp * Math.sin(rig.theta),
      target.y + rig.radius * Math.cos(rig.phi),
      target.z + rig.radius * sp * Math.cos(rig.theta),
    );
    camera.lookAt(target);
  }

  // Drag to orbit. Horizontal drags rotate; vertical page scroll stays native on touch.
  let drag: { x: number; y: number; id: number } | null = null;
  let interacted = 0;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    host.classList.add('is-grabbing');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    rig.tTheta = Math.min(1.25, Math.max(-0.35, rig.tTheta - dx * 0.006));
    if (e.pointerType !== 'touch') rig.tPhi = Math.min(1.08, Math.max(0.5, rig.tPhi - dy * 0.004));
    interacted = performance.now();
    wake();
  });
  const endDrag = () => {
    drag = null;
    host.classList.remove('is-grabbing');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'תצוגת תלת-ממד של הבריכה שתכננתם. אפשר לסובב עם החיצים.');
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') rig.tTheta = Math.min(1.25, rig.tTheta + 0.12);
    else if (k === 'ArrowRight') rig.tTheta = Math.max(-0.35, rig.tTheta - 0.12);
    else if (k === 'ArrowUp') rig.tPhi = Math.max(0.5, rig.tPhi - 0.08);
    else if (k === 'ArrowDown') rig.tPhi = Math.min(1.08, rig.tPhi + 0.08);
    else return;
    e.preventDefault();
    interacted = performance.now();
    wake();
  });

  // ------------------------------------------------------- state & loop
  const state = {
    design: opts.design,
    L: opts.design.length,
    W: opts.design.width,
    builtKey: '',
    dusk: opts.design.extras.led ? 1 : 0,
    cover: opts.design.extras.cover ? 1 : 0,
    tile: new Color(finishes.find((f) => f.id === opts.design.finish)?.tile ?? '#8ed2ea'),
  };
  interiorMat.color.copy(state.tile);
  spaMat.color.copy(state.tile);

  const keyOf = (d: Design, L: number, W: number) =>
    `${d.shape}|${d.edge}|${L.toFixed(3)}|${W.toFixed(3)}|${d.extras.jacuzzi}|${d.extras.waterfall}|${d.extras.led}|${d.extras.cover}`;

  function resize() {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
    wake();
  }

  const dayHemiSky = new Color('#ffffff');
  const duskHemiSky = new Color('#3b6aa8');
  const dayHemiGround = new Color('#e4eaf0');
  const duskHemiGround = new Color('#0b1a30');
  const daySkyTop = new Color('#cfe3f2');
  const duskSkyTop = new Color('#0a1a33');
  const daySkyHor = new Color('#ffffff');
  const duskSkyHor = new Color('#1d3b66');
  const tmp = new Color();

  function applyDusk(k: number) {
    tmp.copy(DAY_BG).lerp(DUSK_BG, k);
    renderer.setClearColor(tmp, 1);
    (scene.fog as Fog).color.copy(tmp);
    hemi.intensity = 1.25 - 1.0 * k;
    hemi.color.copy(dayHemiSky).lerp(duskHemiSky, k);
    hemi.groundColor.copy(dayHemiGround).lerp(duskHemiGround, k);
    sun.intensity = 2.5 * (1 - k) + 0.12 * k;
    for (const w of waters) {
      w.uniforms.uSkyTop.value.copy(daySkyTop).lerp(duskSkyTop, k);
      w.uniforms.uSkyHorizon.value.copy(daySkyHor).lerp(duskSkyHor, k);
      w.uniforms.uSunCol.value.setScalar(1 - k * 0.95);
    }
    water.uniforms.uLed.value = k;
    spaWater.uniforms.uLed.value = k * 0.6;
    interiorU.uCaustics.value = 1 - k * 0.8;
    spaU.uCaustics.value = 1 - k * 0.8;
    glassMat.emissiveIntensity = k * 0.55;
    host.style.setProperty('--dusk', k.toFixed(3));
  }

  let raf = 0;
  let running = false;
  let visible = true;
  let last = performance.now();
  let clock = 0;
  let readySent = false;
  let idleFrames = 0;

  function frame(now: number) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!opts.reduced) clock += dt;
    const d = state.design;
    let busy = false;

    // Animate size toward target, rebuilding geometry while it moves.
    const lam = opts.reduced ? 1000 : 9;
    const nL = damp(state.L, d.length, lam, dt);
    const nW = damp(state.W, d.width, lam, dt);
    state.L = Math.abs(nL - d.length) < 0.004 ? d.length : nL;
    state.W = Math.abs(nW - d.width) < 0.004 ? d.width : nW;
    const key = keyOf(d, state.L, state.W);
    if (key !== state.builtKey) {
      build(d, state.L, state.W);
      state.builtKey = key;
      fit();
      busy = true;
    }

    // Finish colour.
    const tile = new Color(finishes.find((f) => f.id === d.finish)?.tile ?? '#8ed2ea');
    if (!interiorMat.color.equals(tile)) {
      interiorMat.color.lerp(tile, opts.reduced ? 1 : 1 - Math.exp(-dt * 8));
      if (Math.abs(interiorMat.color.r - tile.r) + Math.abs(interiorMat.color.g - tile.g) + Math.abs(interiorMat.color.b - tile.b) < 0.003) interiorMat.color.copy(tile);
      spaMat.color.copy(interiorMat.color);
      busy = true;
    }

    // Dusk for LEDs, cover roll.
    const duskT = d.extras.led ? 1 : 0;
    if (Math.abs(state.dusk - duskT) > 0.001) {
      state.dusk = opts.reduced ? duskT : damp(state.dusk, duskT, 3.2, dt);
      if (Math.abs(state.dusk - duskT) < 0.002) state.dusk = duskT;
      applyDusk(state.dusk);
      busy = true;
    }
    const coverT = d.extras.cover ? 1 : 0;
    if (Math.abs(state.cover - coverT) > 0.001) {
      state.cover = opts.reduced ? coverT : damp(state.cover, coverT, 2.6, dt);
      if (Math.abs(state.cover - coverT) < 0.002) state.cover = coverT;
      applyCover(state.cover);
      renderer.shadowMap.needsUpdate = true;
      busy = true;
    }

    // Camera: ease toward targets; a slow drift when nobody is touching it.
    if (!opts.reduced && now - interacted > 2600 && !drag) {
      rig.tTheta += (0.62 + Math.sin(clock * 0.12) * 0.07 - rig.tTheta) * 0.004;
    }
    const camLam = opts.reduced ? 1000 : 5;
    rig.theta = damp(rig.theta, rig.tTheta, camLam, dt);
    rig.phi = damp(rig.phi, rig.tPhi, camLam, dt);
    rig.radius = damp(rig.radius, rig.tRadius, camLam, dt);
    target.lerp(tTarget, 1 - Math.exp(-camLam * dt));
    placeCamera();
    if (Math.abs(rig.theta - rig.tTheta) + Math.abs(rig.radius - rig.tRadius) > 0.002) busy = true;

    // Water.
    for (const w of waters) w.uniforms.uTime.value = clock;
    interiorU.uTime.value = clock;
    spaU.uTime.value = clock;
    sheetMat.uniforms.uTime.value = clock;

    pass.render(scene, camera, waters);
    if (!readySent) {
      readySent = true;
      opts.onReady();
    }

    // Keep animating while visible (water moves); reduced motion stops when settled.
    idleFrames = busy ? 0 : idleFrames + 1;
    if (running && visible && (!opts.reduced || idleFrames < 2)) raf = requestAnimationFrame(frame);
    else running = false;
  }

  function wake() {
    if (!visible) return;
    if (!running) {
      running = true;
      last = performance.now();
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) wake();
  });
  io.observe(host);
  const onVis = () => {
    visible = !document.hidden;
    if (visible) wake();
  };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    opts.onFail('context-lost');
  });

  applyDusk(state.dusk);
  resize();
  rig.radius = rig.tRadius;
  target.copy(tTarget);
  wake();

  return {
    update(design: Design) {
      state.design = design;
      wake();
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      disposeGroup(poolGroup);
      disposeGroup(garden);
      canopyGeo.dispose();
      trunkGeo.dispose();
      pass.dispose();
      [white, deckMat, copingMat, grateMat, groundMat, lawnMat, glassMat, steelMat, slatMat, ledMat, interiorMat, spaMat, water, spaWater, sheetMat].forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

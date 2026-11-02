/**
 * Materials shared by the configurator and the build timeline:
 *  - a refractive water surface (screen-space refraction of an opaque pass + Beer–Lambert
 *    absorption, so the colour comes from the finish under the water, as in reality),
 *  - an interior patch for MeshStandardMaterial (tile grid, caustics, waterline band,
 *    concrete → finish wipe used by the timeline),
 *  - a deck patch (stone joints).
 */
import {
  Color,
  DepthTexture,
  type IUniform,
  LinearFilter,
  type MeshStandardMaterial,
  type PerspectiveCamera,
  RGBAFormat,
  type Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { noiseGLSL, wavesGLSL } from './glsl';

export const WATER_LAYER = 1;
export const MAX_LEDS = 8;

/* ----------------------------------------------------------------- water */

export type WaterUniforms = Record<string, IUniform> & {
  tScene: IUniform;
  tDepth: IUniform;
  uRes: IUniform<Vector2>;
  uNear: IUniform<number>;
  uFar: IUniform<number>;
  uTime: IUniform<number>;
  uAbsorb: IUniform<Vector3>;
  uDeep: IUniform<Color>;
  uSkyTop: IUniform<Color>;
  uSkyHorizon: IUniform<Color>;
  uSunDir: IUniform<Vector3>;
  uSunCol: IUniform<Color>;
  uLed: IUniform<number>;
  uLedCol: IUniform<Color>;
  uLights: IUniform<Vector3[]>;
  uLightCount: IUniform<number>;
  uFall: IUniform<Vector3>;
  uFallOn: IUniform<number>;
  uBubbles: IUniform<number>;
  uWaveAmp: IUniform<number>;
};

export function createWaterMaterial(): ShaderMaterial & { uniforms: WaterUniforms } {
  const uniforms: WaterUniforms = {
    tScene: { value: null },
    tDepth: { value: null },
    uRes: { value: new Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uTime: { value: 0 },
    // Per-metre absorption (linear RGB): red goes first, so depth turns water blue.
    uAbsorb: { value: new Vector3(0.62, 0.16, 0.085) },
    uDeep: { value: new Color('#0d4a86') },
    uSkyTop: { value: new Color('#cfe3f2') },
    uSkyHorizon: { value: new Color('#ffffff') },
    uSunDir: { value: new Vector3(0.45, 0.8, 0.35).normalize() },
    uSunCol: { value: new Color('#ffffff') },
    uLed: { value: 0 },
    uLedCol: { value: new Color('#2be1f5') },
    uLights: { value: Array.from({ length: MAX_LEDS }, () => new Vector3()) },
    uLightCount: { value: 0 },
    uFall: { value: new Vector3() },
    uFallOn: { value: 0 },
    uBubbles: { value: 0 },
    uWaveAmp: { value: 1 },
  };

  const mat = new ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <packing>
      uniform sampler2D tScene;
      uniform sampler2D tDepth;
      uniform vec2 uRes;
      uniform float uNear;
      uniform float uFar;
      uniform float uTime;
      uniform vec3 uAbsorb;
      uniform vec3 uDeep;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunCol;
      uniform float uLed;
      uniform vec3 uLedCol;
      uniform vec3 uLights[${MAX_LEDS}];
      uniform int uLightCount;
      uniform vec3 uFall;
      uniform float uFallOn;
      uniform float uBubbles;
      uniform float uWaveAmp;
      varying vec3 vWorld;
      ${noiseGLSL}
      ${wavesGLSL}

      float viewDist(float d) { return -perspectiveDepthToViewZ(d, uNear, uFar); }

      void main() {
        vec2 p = vWorld.xz;
        vec2 slope = lpWaves(p, uTime) * uWaveAmp;
        if (uFallOn > 0.0) {
          vec2 d = p - uFall.xz;
          float r = length(d) + 1e-3;
          slope += uFallOn * 0.11 * (d / r) * cos(r * 16.0 - uTime * 8.0) * exp(-r * 1.4);
        }
        if (uBubbles > 0.0) {
          slope += uBubbles * 0.12 * vec2(lpNoise(p * 9.0 + uTime * 3.1) - 0.5, lpNoise(p * 9.0 - uTime * 2.7 + 7.0) - 0.5);
        }
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 V = normalize(cameraPosition - vWorld);

        vec2 suv = gl_FragCoord.xy / uRes;
        float surf = viewDist(gl_FragCoord.z);
        vec2 ruv = suv + n.xz * 0.028;
        float scene = viewDist(texture2D(tDepth, ruv).r);
        if (scene < surf) { ruv = suv; scene = viewDist(texture2D(tDepth, suv).r); }
        float thick = clamp(scene - surf, 0.0, 6.0);

        vec3 refr = texture2D(tScene, ruv).rgb;
        vec3 T = exp(-uAbsorb * thick);
        vec3 col = refr * T + uDeep * (1.0 - T);

        // LED: light pools along the walls + a soft glow from within.
        if (uLed > 0.0) {
          float g = 0.0;
          for (int i = 0; i < ${MAX_LEDS}; i++) {
            if (i >= uLightCount) break;
            vec2 d = p - uLights[i].xz;
            g += exp(-dot(d, d) * 0.9);
          }
          col += uLedCol * uLed * (g * 0.55 + 0.12) * (0.6 + 0.4 * T.g);
        }

        // Reflection of the sky + sun glints.
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y, 0.0, 1.0));
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        col = mix(col, sky, clamp(F, 0.0, 1.0));
        vec3 H = normalize(V + uSunDir);
        float nh = max(dot(n, H), 0.0);
        col += uSunCol * (pow(nh, 700.0) * 2.4 + pow(nh, 60.0) * 0.06);

        if (uBubbles > 0.0) {
          float foam = smoothstep(0.62, 0.9, lpNoise(p * 14.0 + vec2(uTime * 1.7, -uTime * 1.3)));
          col = mix(col, vec3(1.0), foam * 0.45 * uBubbles);
        }

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }) as ShaderMaterial & { uniforms: WaterUniforms };
  return mat;
}

/* --------------------------------------------------------- opaque pass */

/**
 * Renders everything except water into a target the water samples (colour + depth),
 * then renders the full frame. Shadows are rendered once per frame at most.
 */
export class RefractionPass {
  readonly target: WebGLRenderTarget;

  constructor(private renderer: WebGLRenderer) {
    this.target = new WebGLRenderTarget(2, 2, {
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
    });
    this.target.depthTexture = new DepthTexture(2, 2, UnsignedIntType);
  }

  setSize(w: number, h: number) {
    this.target.setSize(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)));
  }

  render(scene: Scene, camera: PerspectiveCamera, waters: { uniforms: WaterUniforms }[]) {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new Vector2());
    if (this.target.width !== size.x || this.target.height !== size.y) this.setSize(size.x, size.y);
    for (const w of waters) {
      w.uniforms.tScene.value = this.target.texture;
      w.uniforms.tDepth.value = this.target.depthTexture;
      w.uniforms.uRes.value.copy(size);
      w.uniforms.uNear.value = camera.near;
      w.uniforms.uFar.value = camera.far;
    }
    camera.layers.disable(WATER_LAYER);
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    const auto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    camera.layers.enable(WATER_LAYER);
    r.setRenderTarget(null);
    r.clear();
    r.render(scene, camera);
    r.shadowMap.autoUpdate = auto;
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
  }
}

/* ---------------------------------------------------- interior patch */

export interface InteriorUniforms {
  uTime: IUniform<number>;
  uCaustics: IUniform<number>; // 0 dry → 1 full
  uWaterY: IUniform<number>;
  uBand: IUniform<number>; // waterline mosaic band visible
  uTile: IUniform<number>; // tile size (m)
  uConcrete: IUniform<Color>;
  uWipe: IUniform<number>; // 0 concrete → 1 finished
  uWipeMin: IUniform<number>;
  uWipeSpan: IUniform<number>;
  [k: string]: IUniform;
}

export function createInteriorUniforms(): InteriorUniforms {
  return {
    uTime: { value: 0 },
    uCaustics: { value: 1 },
    uWaterY: { value: -0.12 },
    uBand: { value: 1 },
    uTile: { value: 0.125 },
    uConcrete: { value: new Color('#c9d0d7') },
    uWipe: { value: 1 },
    uWipeMin: { value: -6 },
    uWipeSpan: { value: 12 },
  };
}

export function patchInterior(mat: MeshStandardMaterial, u: InteriorUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLpWorld;\nvarying vec3 vLpNormal;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         vLpNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vLpWorld;
         varying vec3 vLpNormal;
         uniform float uTime;
         uniform float uCaustics;
         uniform float uWaterY;
         uniform float uBand;
         uniform float uTile;
         uniform vec3 uConcrete;
         uniform float uWipe;
         uniform float uWipeMin;
         uniform float uWipeSpan;
         ${noiseGLSL}
         float lpGrid(vec2 q) {
           vec2 g = abs(fract(q + 0.5) - 0.5);
           vec2 w = fwidth(q) * 1.2;
           vec2 l = 1.0 - smoothstep(vec2(0.0), w + 0.02, g);
           return max(l.x, l.y);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 an = abs(vLpNormal);
           vec3 q = vLpWorld / uTile;
           float grid = an.y > 0.5 ? lpGrid(q.xz) : (an.x > an.z ? lpGrid(q.zy) : lpGrid(q.xy));
           vec3 fin = diffuseColor.rgb * mix(1.0, 0.86, grid);
           // waterline mosaic band on the walls
           float band = (1.0 - an.y) * uBand * step(uWaterY - 0.16, vLpWorld.y) * step(vLpWorld.y, uWaterY + 0.1);
           fin = mix(fin, fin * vec3(0.42, 0.52, 0.66), band);
           float k = clamp((uWipe * (uWipeSpan + 1.6) - (vLpWorld.x - uWipeMin)) / 1.6, 0.0, 1.0);
           diffuseColor.rgb = mix(uConcrete, fin, k);
         }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           float below = 1.0 - smoothstep(uWaterY - 0.05, uWaterY, vLpWorld.y);
           float up = clamp(vLpNormal.y, 0.0, 1.0);
           vec2 cp = vLpWorld.xz + vec2(vLpWorld.y * 0.7);
           float c = lpCaustics(cp, uTime, mix(0.6, 0.2, up));
           totalEmissiveRadiance += vec3(0.75, 0.95, 1.0) * c * uCaustics * below * mix(0.12, 0.42, up);
         }`,
      );
  };
  mat.customProgramCacheKey = () => 'lp-interior-v1';
}

/* -------------------------------------------------------- deck patch */

export function patchDeck(mat: MeshStandardMaterial, tile = 0.6) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLpWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLpWorld;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec2 q = vLpWorld.xz / ${tile.toFixed(3)};
           vec2 g = abs(fract(q + 0.5) - 0.5);
           vec2 w = fwidth(q) * 1.1;
           vec2 l = 1.0 - smoothstep(vec2(0.0), w + 0.012, g);
           diffuseColor.rgb *= mix(1.0, 0.9, max(l.x, l.y));
         }`,
      );
  };
  mat.customProgramCacheKey = () => `lp-deck-${tile}`;
}

/**
 * GLSL for the hero water ("the surface").
 *
 * The pool is seen from straight above. A heightfield wave simulation (ping-pong
 * half-float targets) carries the ripples; the render pass refracts a procedural pool
 * floor (white tiles, three entry steps, depth slope), lights it with animated caustics,
 * and colours it by depth so the water reads as Luxepool's own gradient:
 * shallow steps → aqua, deep end → #1C5198.
 *
 * World units are metres. The visible corner of the pool is the top-right coping
 * (x = 0, y = 0); x grows negative to the left, y negative downward.
 */

export const quadVert = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** One step of the discrete wave equation. r = height, g = velocity. */
export const simFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform float uSpeed;
  uniform float uDamp;
  in vec2 vUv;
  void main() {
    vec4 s = texture(uState, vUv);
    float avg = (
      texture(uState, vUv + vec2(uTexel.x, 0.0)).r +
      texture(uState, vUv - vec2(uTexel.x, 0.0)).r +
      texture(uState, vUv + vec2(0.0, uTexel.y)).r +
      texture(uState, vUv - vec2(0.0, uTexel.y)).r
    ) * 0.25;
    s.g += (avg - s.r) * uSpeed;
    // The left and bottom edges of the frame are not walls: absorb waves there.
    float absorb = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, vUv.y);
    s.g *= mix(0.9, uDamp, absorb);
    s.r += s.g;
    s.r *= 0.9992;
    gl_FragColor = s;
  }
`;

/** Adds up to 8 smooth drops in one pass. drop = (u, v, radius, strength). */
export const dropFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uState;
  uniform vec4 uDrops[8];
  uniform int uCount;
  uniform float uAspect;
  in vec2 vUv;
  void main() {
    vec4 s = texture(uState, vUv);
    for (int i = 0; i < 8; i++) {
      if (i >= uCount) break;
      vec2 d = (vUv - uDrops[i].xy) * vec2(uAspect, 1.0);
      float k = max(0.0, 1.0 - length(d) / uDrops[i].z);
      k = 0.5 - 0.5 * cos(k * 3.14159265);
      s.r += k * uDrops[i].w;
    }
    gl_FragColor = s;
  }
`;

export const waterFrag = /* glsl */ `
  precision highp float;

  uniform sampler2D uSim;
  uniform vec2 uTexel;     // sim texel size
  uniform vec2 uBox;       // frame size in device pixels
  uniform float uScale;    // device pixels per metre
  uniform float uTime;
  uniform float uIntro;    // 0 → 1 light fade-in

  in vec2 vUv;

  // ---------------------------------------------------------------- noise
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(hash2(i), vec2(0.5));
    float b = dot(hash2(i + vec2(1.0, 0.0)), vec2(0.5));
    float c = dot(hash2(i + vec2(0.0, 1.0)), vec2(0.5));
    float d = dot(hash2(i + vec2(1.0, 1.0)), vec2(0.5));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Animated cellular network: distance to the nearest cell border (F2 - F1).
  float cells(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = hash2(i + g);
        o = 0.5 + 0.42 * sin(t + 6.2831 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }

  // Caustic light on the floor: two warped cellular networks with a sharp core and a soft
  // glow; where they cross, the light concentrates (brighter cusps). Sharper in shallow water.
  float caustics(vec2 p, float t, float depth) {
    vec2 q = p * 1.05;
    vec2 w1 = vec2(vnoise(q * 0.6 + t * 0.05), vnoise(q * 0.6 + 5.2 - t * 0.04));
    vec2 w2 = vec2(vnoise(q * 1.7 - t * 0.07 + 2.3), vnoise(q * 1.7 + 8.1 + t * 0.06));
    q += (w1 - 0.5) * 0.85 + (w2 - 0.5) * 0.28;
    float deep = smoothstep(0.3, 1.9, depth);
    float sharp = mix(0.03, 0.085, deep);
    float e1 = cells(q, t * 0.45);
    float e2 = cells(q * 1.55 + 7.7, t * 0.36 + 1.3);
    float l1 = exp(-e1 / sharp);
    float l2 = exp(-e2 / (sharp * 1.35));
    float c = l1 * 0.8 + l2 * 0.32 + l1 * l2 * 1.6;
    c = pow(c, 1.25);
    return c * mix(1.0, 0.55, deep);
  }

  // ---------------------------------------------------------------- pool
  // Steps: three treads along the top wall, near the right corner.
  const float STEP_W = 2.7;
  const float TREAD = 0.36;

  float floorDepth(vec2 p) {
    // General floor slopes from 1.05 m near the corner to 1.9 m deep end.
    float far = length(vec2(p.x * 0.55, p.y));
    float d = mix(1.05, 1.9, smoothstep(1.4, 8.5, far));
    if (p.x > -STEP_W && p.y > -3.0 * TREAD) {
      float k = floor(-p.y / TREAD);
      d = 0.26 * (k + 1.0);
    }
    return d;
  }

  // Grout lines of 50 cm floor tiles.
  float tileLines(vec2 p, float px) {
    vec2 g = abs(fract(p / 0.5 + 0.5) - 0.5) * 0.5;
    float lw = 0.006 + px * 0.6;
    float l = 1.0 - smoothstep(lw * 0.5, lw, min(g.x, g.y));
    return l;
  }

  // Thin dark-blue safety stripes on the step noses.
  float stepNosing(vec2 p, float px) {
    if (p.x < -STEP_W - 0.02 || p.y < -3.0 * TREAD - 0.03) return 0.0;
    float s = 0.0;
    float hw = 0.014;
    for (int k = 1; k <= 3; k++) {
      float y = -float(k) * TREAD;
      s = max(s, 1.0 - smoothstep(hw, hw + px * 1.5, abs(p.y - (y + 0.03))));
    }
    float side = (1.0 - smoothstep(hw, hw + px * 1.5, abs(p.x + STEP_W - 0.03))) * step(-3.0 * TREAD, p.y);
    return max(s, side);
  }

  // Soft shadows cast by the steps (sun from the top-right): a strip on each lower tread,
  // and one on the floor beside the step block. 1 = lit.
  float stepShadow(vec2 p) {
    float sh = 1.0;
    if (p.x > -STEP_W && p.y > -3.0 * TREAD - 0.32) {
      for (int k = 1; k <= 3; k++) {
        float y = -float(k) * TREAD;
        float d = y - p.y; // distance below the nose
        sh = min(sh, mix(0.72, 1.0, smoothstep(0.0, 0.2, d) + step(d, 0.0)));
      }
    }
    // beside the block (floor to the left of it)
    float dx = -STEP_W - p.x;
    if (dx > 0.0 && p.y > -3.0 * TREAD) sh = min(sh, mix(0.7, 1.0, smoothstep(0.0, 0.42, dx)));
    return sh;
  }

  // Shadow of the coping on the floor (sun from the top-right). 1 = lit.
  float copingShadow(vec2 p, float depth) {
    float w = 0.04 + depth * 0.12;
    float top = smoothstep(w * 0.4, w * 1.4, -p.y);
    float right = smoothstep(w * 0.3, w * 1.1, -p.x);
    return min(top, right);
  }

  // Brand gradient as a function of depth (sRGB).
  vec3 depthColor(float d) {
    vec3 c0 = vec3(0.74, 0.95, 0.99);
    vec3 c1 = vec3(0.42, 0.85, 0.96);
    vec3 c2 = vec3(0.25, 0.70, 0.90);
    vec3 c3 = vec3(0.00, 0.53, 0.82);
    vec3 c4 = vec3(0.10, 0.33, 0.62);
    vec3 c = mix(c0, c1, smoothstep(0.15, 0.62, d));
    c = mix(c, c2, smoothstep(0.62, 1.05, d));
    c = mix(c, c3, smoothstep(1.05, 1.45, d));
    c = mix(c, c4, smoothstep(1.45, 2.0, d));
    return c;
  }

  // Low, slow swell so the surface is alive without interaction (returns slope).
  vec2 swell(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 d1 = vec2(0.80, 0.60), d2 = vec2(-0.48, 0.88), d3 = vec2(0.96, -0.28), d4 = vec2(0.2, 0.98);
    g += 0.020 * d1 * cos(dot(p, d1) * 2.1 + t * 0.85);
    g += 0.015 * d2 * cos(dot(p, d2) * 3.3 + t * 1.10);
    g += 0.010 * d3 * cos(dot(p, d3) * 5.1 + t * 1.45);
    g += 0.007 * d4 * cos(dot(p, d4) * 7.7 + t * 1.80);
    return g;
  }

  void main() {
    vec2 frag = vUv * uBox;                   // device px from bottom-left
    vec2 p = (frag - uBox) / uScale;          // metres, (0,0) = top-right corner
    float px = 1.0 / uScale;                  // metres per device px

    // ---- surface normal: simulated ripples + ambient swell
    float hL = texture(uSim, vUv - vec2(uTexel.x, 0.0)).r;
    float hR = texture(uSim, vUv + vec2(uTexel.x, 0.0)).r;
    float hD = texture(uSim, vUv - vec2(0.0, uTexel.y)).r;
    float hU = texture(uSim, vUv + vec2(0.0, uTexel.y)).r;
    vec2 slope = vec2(hR - hL, hU - hD) * 9.0 + swell(p, uTime);
    vec3 n = normalize(vec3(-slope, 1.0));

    // ---- refraction: look up the floor where the bent ray lands
    float d0 = floorDepth(p);
    vec2 pf = p - n.xy * d0 * 0.55;
    float d = floorDepth(pf);

    // ---- floor shading
    float lit = copingShadow(pf, d) * stepShadow(pf);
    float grout = tileLines(pf, px);
    float nose = stepNosing(pf, px);
    vec3 albedo = mix(vec3(1.0), vec3(0.78, 0.86, 0.93), grout * 0.55);
    albedo = mix(albedo, vec3(0.22, 0.42, 0.72), nose * 0.7);

    vec3 water = depthColor(d);
    vec3 col = water * albedo * (0.66 + 0.34 * lit);

    float c = caustics(pf, uTime, d);
    vec3 causTint = mix(vec3(0.9, 1.0, 1.0), vec3(0.55, 0.92, 1.0), smoothstep(0.4, 1.8, d));
    col += causTint * c * smoothstep(0.55, 1.0, lit) * 0.34 * uIntro;

    // ---- the inner face of the far walls (thin waterline band seen in perspective)
    float band = (1.0 - smoothstep(0.0, 0.035 + px, -p.y)) + (1.0 - smoothstep(0.0, 0.03 + px, -p.x));
    col = mix(col, vec3(0.11, 0.30, 0.56), clamp(band, 0.0, 1.0) * 0.45);

    // ---- surface: soft sky reflection on slopes + sun glints on ripples
    vec3 V = vec3(0.0, 0.0, 1.0);
    float fres = 0.02 + 0.98 * pow(1.0 - max(n.z, 0.0), 5.0);
    col = mix(col, vec3(0.96, 0.99, 1.0), clamp(fres * 2.2, 0.0, 0.4));
    vec3 L = normalize(vec3(0.42, 0.52, 0.74));
    vec3 H = normalize(L + V);
    float nh = max(dot(n, H), 0.0);
    col += vec3(1.0) * (pow(nh, 260.0) * 0.9 + pow(nh, 30.0) * 0.035) * uIntro;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

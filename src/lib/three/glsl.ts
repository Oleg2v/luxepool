/** GLSL snippets shared by the configurator and the build timeline. */

export const noiseGLSL = /* glsl */ `
  vec2 lpHash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float lpNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(lpHash2(i), vec2(0.5));
    float b = dot(lpHash2(i + vec2(1.0, 0.0)), vec2(0.5));
    float c = dot(lpHash2(i + vec2(0.0, 1.0)), vec2(0.5));
    float d = dot(lpHash2(i + vec2(1.0, 1.0)), vec2(0.5));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float lpCells(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = lpHash2(i + g);
        o = 0.5 + 0.42 * sin(t + 6.2831 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; }
        else if (d < d2) { d2 = d; }
      }
    }
    return sqrt(d2) - sqrt(d1);
  }
  // Caustic light pattern in world metres.
  float lpCaustics(vec2 p, float t, float soft) {
    vec2 q = p * 1.7;
    q += 0.3 * vec2(lpNoise(q * 0.6 + t * 0.08), lpNoise(q * 0.6 + 4.7 - t * 0.07)) - 0.15;
    float w = mix(0.05, 0.16, soft);
    float a = 1.0 - smoothstep(0.0, w, lpCells(q, t * 0.6));
    float b = 1.0 - smoothstep(0.0, w * 1.3, lpCells(q * 1.73 + 11.3, t * 0.45 + 2.0));
    return a * 0.7 + b * 0.4 + a * b * 0.8;
  }
`;

/** Directional wave slope field for the water surfaces (world xz → slope). */
export const wavesGLSL = /* glsl */ `
  vec2 lpWaves(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 d1 = vec2(0.80, 0.60), d2 = vec2(-0.60, 0.80), d3 = vec2(0.30, -0.95), d4 = vec2(-0.92, -0.38), d5 = vec2(0.99, 0.12);
    g += 0.050 * d1 * cos(dot(p, d1) * 2.6 + t * 1.25);
    g += 0.038 * d2 * cos(dot(p, d2) * 4.1 + t * 1.65);
    g += 0.026 * d3 * cos(dot(p, d3) * 6.9 + t * 2.20);
    g += 0.018 * d4 * cos(dot(p, d4) * 11.3 + t * 2.90);
    g += 0.012 * d5 * cos(dot(p, d5) * 17.1 + t * 3.70);
    return g;
  }
`;

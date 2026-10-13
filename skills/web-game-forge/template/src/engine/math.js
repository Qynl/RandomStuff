// Small math + easing toolbox. Everything here is allocation-free so it is safe
// to call thousands of times per frame.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Frame-rate independent exponential smoothing. `rate` ~ how snappy (higher = faster).
// Use this instead of `a += (b - a) * 0.1`, which changes behaviour with the frame rate.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// Shortest signed difference between two angles (radians).
export const angleDiff = (from, to) => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const rand = (a = 0, b = 1, r = Math.random) => a + (b - a) * r();
export const pick = (arr, r = Math.random) => arr[(r() * arr.length) | 0];

// Easing curves. Output-heavy easings ("out") feel responsive; "back" and "elastic"
// add overshoot, which reads as playful and expensive in UI.
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInCubic = (t) => t * t * t;
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
};

// Seeded RNG (mulberry32). Use it when you need reproducible runs, daily challenges,
// or deterministic automated tests.
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

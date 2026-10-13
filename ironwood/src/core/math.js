/**
 * IRONWOOD - core math helpers.
 * Dependency-free: everything here works on plain numbers and {x,y,z} objects
 * so it can run in the game loop, in tools and in node-based tests.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const saturate = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a === 0 ? 1e-6 : b - a);
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const smoothstep = (e0, e1, x) => {
  const t = saturate((x - e0) / (e1 - e0 === 0 ? 1e-6 : e1 - e0));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (e0, e1, x) => {
  const t = saturate((x - e0) / (e1 - e0 === 0 ? 1e-6 : e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Frame-rate independent exponential interpolation. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dampVec = (a, b, lambda, dt) => {
  const t = 1 - Math.exp(-lambda * dt);
  a.x = lerp(a.x, b.x, t);
  a.y = lerp(a.y, b.y, t);
  a.z = lerp(a.z, b.z, t);
  return a;
};

export const shortestAngle = (from, to) => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dampAngle = (a, b, lambda, dt) => a + shortestAngle(a, b) * (1 - Math.exp(-lambda * dt));

/** Deterministic PRNG (mulberry32). Returns a function producing [0,1). */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rand(a = 1, b) {
  if (b === undefined) return Math.random() * a;
  return a + Math.random() * (b - a);
}
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const randRange = (a, b) => a + Math.random() * (b - a);
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/* Noise                                                               */
/* ------------------------------------------------------------------ */

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 2D value noise in [0,1]. */
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal brownian motion, returns roughly [-1,1]. */
export function fbm(x, y, opts = {}) {
  const { octaves = 4, seed = 0, lacunarity = 2.0, gain = 0.5, ridged = false } = opts;
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = noise2(x * freq, y * freq, seed + i * 131);
    n = n * 2 - 1;
    if (ridged) n = 1 - Math.abs(n) * 2;
    sum += n * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / (norm || 1);
}

/** Tiling fbm used by the texture baker (period wraps at `period`). */
export function fbmTiled(x, y, period, opts = {}) {
  const { octaves = 4, seed = 0, gain = 0.5 } = opts;
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const p = Math.max(2, Math.round(period * freq));
    sum += amp * (tileNoise(x * freq, y * freq, p, seed + i * 71) * 2 - 1);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / (norm || 1);
}

function tileNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const wrap = (n) => ((n % period) + period) % period;
  const x0 = wrap(xi);
  const x1 = wrap(xi + 1);
  const y0 = wrap(yi);
  const y1 = wrap(yi + 1);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/* ------------------------------------------------------------------ */
/* Vectors (plain-object, allocation-light)                            */
/* ------------------------------------------------------------------ */

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vclone = (a) => ({ x: a.x, y: a.y, z: a.z });
export const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vmad = (a, b, s) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a) => Math.hypot(a.x, a.y, a.z);
export const vlen2 = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const vdist2 = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
export const vcross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export function vnorm(a) {
  const l = vlen(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
export function vlerp(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
/** Horizontal length helper. */
export const vlenXZ = (a) => Math.hypot(a.x, a.z);

/* ------------------------------------------------------------------ */
/* Collision primitives                                                */
/* ------------------------------------------------------------------ */

export class AABB {
  constructor(min, max) {
    this.min = { x: min.x, y: min.y, z: min.z };
    this.max = { x: max.x, y: max.y, z: max.z };
  }
  static fromCenter(cx, cy, cz, sx, sy, sz) {
    return new AABB(
      { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
      { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 }
    );
  }
  get center() {
    return { x: (this.min.x + this.max.x) / 2, y: (this.min.y + this.max.y) / 2, z: (this.min.z + this.max.z) / 2 };
  }
  get size() {
    return { x: this.max.x - this.min.x, y: this.max.y - this.min.y, z: this.max.z - this.min.z };
  }
  containsPoint(p) {
    return (
      p.x >= this.min.x && p.x <= this.max.x &&
      p.y >= this.min.y && p.y <= this.max.y &&
      p.z >= this.min.z && p.z <= this.max.z
    );
  }
  intersectsSphere(c, r) {
    const cx = clamp(c.x, this.min.x, this.max.x);
    const cy = clamp(c.y, this.min.y, this.max.y);
    const cz = clamp(c.z, this.min.z, this.max.z);
    const dx = c.x - cx;
    const dy = c.y - cy;
    const dz = c.z - cz;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
  closestPoint(p) {
    return {
      x: clamp(p.x, this.min.x, this.max.x),
      y: clamp(p.y, this.min.y, this.max.y),
      z: clamp(p.z, this.min.z, this.max.z),
    };
  }
  expanded(m) {
    return new AABB(
      { x: this.min.x - m, y: this.min.y, z: this.min.z - m },
      { x: this.max.x + m, y: this.max.y + m, z: this.max.z + m }
    );
  }
}

/** Slab test. Returns entry distance or -1 (no hit). dir need not be normalized. */
export function rayAABB(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0;
  let tmax = Infinity;
  const inv = [1 / (dx || 1e-9), 1 / (dy || 1e-9), 1 / (dz || 1e-9)];
  const o = [ox, oy, oz];
  const mn = [box.min.x, box.min.y, box.min.z];
  const mx = [box.max.x, box.max.y, box.max.z];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    let t1 = (mn[i] - o[i]) * inv[i];
    let t2 = (mx[i] - o[i]) * inv[i];
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  void d;
  return tmin;
}

/** Ray vs vertical capsule/cylinder (used for soldiers and trees). */
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, radius, y0, y1) {
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const fx = ox - cx;
  const fz = oz - cz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return -1;
  const y = oy + dy * t;
  if (y < y0 || y > y1) return -1;
  return t;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  return t < 0 ? -1 : t;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Critically-ish damped spring for recoil / weapon sway. */
export class Spring {
  constructor(value = 0, stiffness = 120, damping = 18) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  set(v) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
    return this;
  }
  impulse(v) {
    this.velocity += v;
    return this;
  }
  update(dt) {
    const steps = Math.max(1, Math.min(6, Math.ceil(dt / 0.008)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

/** Simple fixed-size ring buffer. */
export class Ring {
  constructor(size) {
    this.size = size;
    this.items = [];
  }
  push(item) {
    this.items.push(item);
    if (this.items.length > this.size) this.items.shift();
    return item;
  }
  clear() {
    this.items.length = 0;
  }
  get last() {
    return this.items[this.items.length - 1];
  }
}

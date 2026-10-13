/**
 * IRONWOOD - procedural texture library.
 *
 * Streams, battlefields and military shooters live or die on their materials,
 * so instead of shipping downloaded image files (licensing + weight) this
 * module *bakes* every texture in the browser at load time:
 *
 *   albedo (sRGB)  - the colour you see
 *   normal         - derived from a height function via finite differences
 *   ORM packed     - R: ambient occlusion, G: roughness, B: metalness
 *   alpha sprites  - foliage, smoke, decals, muzzle flash...
 *
 * Each material is declared once as a small set of analytic functions
 * (color/height/rough/metal) and then rasterised. Everything tiles seamlessly.
 */

import * as THREE from 'three';
import { lerp, saturate, fbmTiled, makeRng, TAU } from '../core/math.js';

const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return { canvas: c, ctx };
}

function toTexture(canvas, { srgb = true, repeat = 1, aniso = 8, clampEdges = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = clampEdges ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = clampEdges ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  if (Array.isArray(repeat)) tex.repeat.set(repeat[0], repeat[1]);
  else tex.repeat.set(repeat, repeat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Baking: analytic material -> textures                               */
/* ------------------------------------------------------------------ */

/**
 * Rasterise a material definition.
 * spec = {
 *   size, color(u,v,rng)->[r,g,b] 0..1, height(u,v)->0..1,
 *   rough(u,v)->0..1, metal(u,v)->0..1, ao(u,v)->0..1, normalStrength
 * }
 */
function bakeMaterial(spec, opts = {}) {
  const size = spec.size || 256;
  const { canvas: cA, ctx: a } = makeCanvas(size, size);
  const { canvas: cN, ctx: n } = makeCanvas(size, size);
  const { canvas: cO, ctx: o } = makeCanvas(size, size);
  const imgA = a.createImageData(size, size);
  const orm = o.createImageData(size, size);
  const imgN = n.createImageData(size, size);

  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      H[y * size + x] = spec.height ? spec.height(x / size, y / size) : 0.5;
    }
  }
  const strength = spec.normalStrength ?? 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const idx = (y * size + x) * 4;
      const rgb = spec.color(u, v) || [0.5, 0.5, 0.5];
      imgA.data[idx] = saturate(rgb[0]) * 255;
      imgA.data[idx + 1] = saturate(rgb[1]) * 255;
      imgA.data[idx + 2] = saturate(rgb[2]) * 255;
      imgA.data[idx + 3] = 255;

      // central differences on the wrapped height field
      const xm = H[y * size + ((x - 1 + size) % size)];
      const xp = H[y * size + ((x + 1) % size)];
      const ym = H[((y - 1 + size) % size) * size + x];
      const yp = H[((y + 1) % size) * size + x];
      let nx = (xm - xp) * strength;
      let ny = (ym - yp) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      imgN.data[idx] = (nx * 0.5 + 0.5) * 255;
      imgN.data[idx + 1] = (ny * 0.5 + 0.5) * 255;
      imgN.data[idx + 2] = (nz * 0.5 + 0.5) * 255;
      imgN.data[idx + 3] = 255;

      const rough = spec.rough ? spec.rough(u, v) : 0.85;
      const metal = spec.metal ? spec.metal(u, v) : 0.0;
      const ao = spec.ao ? spec.ao(u, v) : 1.0;
      orm.data[idx] = saturate(ao) * 255;
      orm.data[idx + 1] = saturate(rough) * 255;
      orm.data[idx + 2] = saturate(metal) * 255;
      orm.data[idx + 3] = 255;
    }
  }
  a.putImageData(imgA, 0, 0);
  n.putImageData(imgN, 0, 0);
  o.putImageData(orm, 0, 0);

  return {
    map: toTexture(cA, { srgb: true, repeat: opts.repeat ?? 1 }),
    normalMap: toTexture(cN, { srgb: false, repeat: opts.repeat ?? 1 }),
    ormMap: toTexture(cO, { srgb: false, repeat: opts.repeat ?? 1 }),
    canvas: cA,
  };
}

/* ------------------------------------------------------------------ */
/* Material definitions                                                */
/* ------------------------------------------------------------------ */

const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

const MAT_DEFS = {
  /* ---- ground ---- */
  grass: {
    size: 512, repeat: 1,
    color: (u, v) => {
      const patch = fbmTiled(u * 4, v * 4, 4, { octaves: 4, seed: 11 });
      const blades = fbmTiled(u * 46, v * 46, 46, { octaves: 2, seed: 12 });
      const dry = saturate(fbmTiled(u * 2.5, v * 2.5, 3, { octaves: 3, seed: 13 }) * 0.8 + 0.35);
      const g = mix([0.10, 0.24, 0.07], [0.34, 0.46, 0.13], saturate(patch * 0.6 + 0.5));
      const dryC = [0.42, 0.38, 0.16];
      const c = mix(g, dryC, dry * 0.45);
      const b = 0.75 + blades * 0.5;
      return [c[0] * b, c[1] * b, c[2] * b];
    },
    height: (u, v) => fbmTiled(u * 46, v * 46, 46, { octaves: 2, seed: 12 }) * 0.5 + fbmTiled(u * 6, v * 6, 6, { octaves: 3, seed: 11 }) * 0.5,
    rough: (u, v) => 0.78 + fbmTiled(u * 12, v * 12, 12, { octaves: 2, seed: 14 }) * 0.2,
  },
  dirt: {
    size: 512,
    color: (u, v) => {
      const n = fbmTiled(u * 8, v * 8, 8, { octaves: 5, seed: 21 });
      const stones = fbmTiled(u * 34, v * 34, 34, { octaves: 2, seed: 22 });
      const base = mix([0.20, 0.14, 0.09], [0.44, 0.34, 0.22], saturate(n * 0.7 + 0.5));
      const grav = saturate((stones - 0.45) * 4);
      return mix(base, [0.5, 0.46, 0.4], grav * 0.6);
    },
    height: (u, v) => fbmTiled(u * 34, v * 34, 34, { octaves: 2, seed: 22 }) * 0.7 + fbmTiled(u * 9, v * 9, 9, { octaves: 3, seed: 21 }) * 0.3,
    rough: (u, v) => 0.86 + fbmTiled(u * 20, v * 20, 20, { octaves: 2, seed: 23 }) * 0.12,
  },
  rock: {
    size: 256,
    color: (u, v) => {
      const n = fbmTiled(u * 6, v * 6, 6, { octaves: 5, seed: 31, gain: 0.55 });
      const crack = Math.abs(fbmTiled(u * 11, v * 11, 11, { octaves: 3, seed: 32 }));
      const c = mix([0.16, 0.16, 0.16], [0.42, 0.4, 0.37], saturate(n * 0.8 + 0.5));
      return mix(c, [0.08, 0.08, 0.07], saturate((0.12 - crack) * 6));
    },
    height: (u, v) => fbmTiled(u * 6, v * 6, 6, { octaves: 5, seed: 31, gain: 0.55 }),
    rough: () => 0.92,
  },
  stone: {
    size: 512,
    color: (u, v) => {
      const rows = 5;
      const ry = v * rows;
      const row = Math.floor(ry);
      const offset = (row % 2) * 0.5;
      const cols = 3;
      const cx = u * cols + offset;
      const col = Math.floor(cx);
      const fx = cx - col;
      const fy = ry - row;
      // mortar lines
      const mortar = Math.min(fx, 1 - fx, fy, 1 - fy);
      const isMortar = mortar < 0.055;
      const wear = fbmTiled(u * 18, v * 18, 18, { octaves: 4, seed: 41 + col * 7 + row * 13 });
      const stoneCol = mix([0.30, 0.29, 0.26], [0.56, 0.54, 0.48], saturate(wear * 0.8 + 0.45));
      // moss creeps out of the mortar and along the bottom of blocks
      const mossN = fbmTiled(u * 7, v * 7, 7, { octaves: 4, seed: 44 });
      const moss = saturate((mossN * 0.8 + 0.2) * saturate((0.14 - mortar) * 4.5) * 1.6);
      const base = isMortar ? [0.22, 0.21, 0.19] : stoneCol;
      return mix(base, [0.14, 0.26, 0.10], moss * 0.75);
    },
    height: (u, v) => {
      const rows = 5;
      const ry = v * rows;
      const row = Math.floor(ry);
      const offset = (row % 2) * 0.5;
      const cols = 3;
      const cx = u * cols + offset;
      const col = Math.floor(cx);
      const fx = cx - col;
      const fy = ry - row;
      const mortar = Math.min(fx, 1 - fx, fy, 1 - fy);
      const block = saturate(mortar * 14);
      const wear = fbmTiled(u * 18, v * 18, 18, { octaves: 4, seed: 41 + col * 7 + row * 13 });
      return block * 0.85 + wear * 0.15;
    },
    rough: (u, v) => 0.85 + fbmTiled(u * 24, v * 24, 24, { octaves: 2, seed: 45 }) * 0.12,
  },
  concrete: {
    size: 256,
    color: (u, v) => {
      const n = fbmTiled(u * 9, v * 9, 9, { octaves: 5, seed: 51 });
      const crack = Math.abs(fbmTiled(u * 6, v * 6, 6, { octaves: 3, seed: 52 }));
      const base = mix([0.30, 0.30, 0.29], [0.52, 0.52, 0.50], saturate(n * 0.7 + 0.5));
      return mix(base, [0.17, 0.17, 0.16], saturate((0.09 - crack) * 7));
    },
    height: (u, v) => fbmTiled(u * 9, v * 9, 9, { octaves: 5, seed: 51 }) * 0.6,
    rough: () => 0.88,
  },
  sandbag: {
    size: 256,
    color: (u, v) => {
      const weave = (Math.sin(u * Math.PI * 180) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 180) * 0.5 + 0.5);
      const n = fbmTiled(u * 5, v * 5, 5, { octaves: 4, seed: 61 });
      const base = mix([0.36, 0.30, 0.19], [0.56, 0.48, 0.32], saturate(n * 0.8 + 0.45));
      const seam = saturate(1 - Math.abs(fbmTiled(u * 3, v * 3, 3, { octaves: 3, seed: 62 }) * 3));
      const c = mix(base, [0.30, 0.25, 0.16], seam * 0.4);
      const wk = 0.85 + weave * 0.3;
      return [c[0] * wk, c[1] * wk, c[2] * wk];
    },
    height: (u, v) => (Math.sin(u * Math.PI * 180) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 180) * 0.5 + 0.5),
    rough: () => 0.95,
  },

  /* ---- wood / vegetation ---- */
  wood: {
    size: 256,
    color: (u, v) => {
      const plank = Math.floor(v * 4);
      const fy = v * 4 - plank;
      const grain = fbmTiled(u * 3 + plank * 3.1, v * 26, 26, { octaves: 3, seed: 71 + plank });
      const seam = Math.min(fy, 1 - fy);
      const dark = saturate(1 - seam * 12);
      const base = mix([0.21, 0.18, 0.14], [0.34, 0.30, 0.24], saturate(grain * 0.7 + 0.5));
      return mix(base, [0.10, 0.085, 0.065], dark * 0.9);
    },
    height: (u, v) => {
      const fy = v * 4 - Math.floor(v * 4);
      return saturate(Math.min(fy, 1 - fy) * 12) * 0.8 + 0.1;
    },
    rough: () => 0.8,
  },
  bark: {
    size: 256,
    color: (u, v) => {
      const ridge = Math.abs(fbmTiled(u * 9, v * 3, 9, { octaves: 4, seed: 81 }));
      const n = fbmTiled(u * 20, v * 20, 20, { octaves: 3, seed: 82 });
      const base = mix([0.09, 0.085, 0.07], [0.28, 0.25, 0.20], saturate(ridge * 1.6));
      const moss = saturate(fbmTiled(u * 4, v * 4, 4, { octaves: 4, seed: 83 }) * 1.4 - 0.4);
      return mix(mix(base, base.map((c) => c * 0.6 + n * 0.06), 0.5), [0.13, 0.22, 0.10], moss * 0.55);
    },
    height: (u, v) => Math.abs(fbmTiled(u * 9, v * 3, 9, { octaves: 4, seed: 81 })),
    rough: () => 0.94,
  },

  /* ---- military kit ---- */
  metalPainted: {
    size: 256,
    color: (u, v) => {
      const n = fbmTiled(u * 14, v * 14, 14, { octaves: 4, seed: 91 });
      const scratch = saturate(Math.abs(fbmTiled(u * 40, v * 40, 40, { octaves: 2, seed: 92 })) * 3 - 2.2);
      const base = mix([0.16, 0.20, 0.14], [0.30, 0.34, 0.24], saturate(n * 0.8 + 0.45));
      return mix(base, [0.45, 0.44, 0.40], scratch * 0.55);
    },
    height: (u, v) => fbmTiled(u * 40, v * 40, 40, { octaves: 2, seed: 92 }) * 0.4,
    rough: (u, v) => 0.42 + fbmTiled(u * 16, v * 16, 16, { octaves: 3, seed: 93 }) * 0.35,
    metal: () => 0.85,
  },
  rust: {
    size: 256,
    color: (u, v) => {
      const n = fbmTiled(u * 7, v * 7, 7, { octaves: 5, seed: 101 });
      const pit = fbmTiled(u * 26, v * 26, 26, { octaves: 3, seed: 102 });
      const rustCol = mix([0.30, 0.14, 0.06], [0.62, 0.35, 0.14], saturate(n * 0.8 + 0.5));
      const paint = mix([0.18, 0.22, 0.16], [0.34, 0.36, 0.26], saturate(pit * 0.6 + 0.6));
      return mix(paint, rustCol, saturate((n - 0.35) * 2.2));
    },
    height: (u, v) => fbmTiled(u * 26, v * 26, 26, { octaves: 3, seed: 102 }),
    rough: (u, v) => 0.55 + saturate(fbmTiled(u * 7, v * 7, 7, { octaves: 4, seed: 101 }) * 1.4) * 0.4,
    metal: () => 0.6,
  },
  gunmetal: {
    size: 256,
    color: (u, v) => {
      const n = fbmTiled(u * 22, v * 22, 22, { octaves: 3, seed: 111 });
      const base = mix([0.055, 0.055, 0.06], [0.14, 0.14, 0.15], saturate(n * 0.8 + 0.5));
      const edge = saturate(Math.abs(fbmTiled(u * 60, v * 60, 60, { octaves: 2, seed: 112 })) * 2.6 - 1.9);
      return mix(base, [0.30, 0.30, 0.32], edge * 0.5);
    },
    height: (u, v) => fbmTiled(u * 60, v * 60, 60, { octaves: 2, seed: 112 }) * 0.3,
    rough: (u, v) => 0.34 + fbmTiled(u * 30, v * 30, 30, { octaves: 3, seed: 113 }) * 0.3,
    metal: () => 0.95,
  },
  polymer: {
    size: 256,
    color: (u, v) => {
      const stipple = fbmTiled(u * 90, v * 90, 90, { octaves: 2, seed: 121 });
      const n = fbmTiled(u * 10, v * 10, 10, { octaves: 3, seed: 122 });
      const base = [0.07, 0.07, 0.075];
      return mix(base, [0.16, 0.16, 0.17], saturate(stipple * 0.8 * 0.5 + n * 0.3));
    },
    height: (u, v) => fbmTiled(u * 90, v * 90, 90, { octaves: 2, seed: 121 }),
    rough: () => 0.7,
    metal: () => 0.0,
  },
  camoUS: {
    size: 256,
    color: (u, v) => {
      const a = fbmTiled(u * 3.5, v * 3.5, 4, { octaves: 3, seed: 131 });
      const b = fbmTiled(u * 7, v * 7, 7, { octaves: 3, seed: 132 });
      const c = fbmTiled(u * 15, v * 15, 15, { octaves: 2, seed: 133 });
      let col = [0.42, 0.40, 0.28]; // tan base
      col = mix(col, [0.24, 0.30, 0.17], saturate((a + 0.15) * 1.6)); // olive
      col = mix(col, [0.30, 0.21, 0.13], saturate((b - 0.35) * 2.4)); // brown
      col = mix(col, [0.55, 0.52, 0.40], saturate((c - 0.62) * 4)); // sand highlight
      return col;
    },
    height: (u, v) => fbmTiled(u * 60, v * 60, 60, { octaves: 2, seed: 134 }) * 0.2,
    rough: () => 0.92,
  },
  camoOPFOR: {
    size: 256,
    color: (u, v) => {
      const a = fbmTiled(u * 2.6, v * 2.6, 3, { octaves: 3, seed: 141 });
      const b = fbmTiled(u * 6, v * 6, 6, { octaves: 3, seed: 142 });
      let col = [0.24, 0.26, 0.22];
      col = mix(col, [0.13, 0.15, 0.13], saturate((a + 0.1) * 1.7));
      col = mix(col, [0.36, 0.35, 0.28], saturate((b - 0.45) * 3.0));
      return col;
    },
    height: (u, v) => fbmTiled(u * 60, v * 60, 60, { octaves: 2, seed: 143 }) * 0.2,
    rough: () => 0.93,
  },
  cloth: {
    size: 256,
    color: (u, v) => {
      const weave = (Math.sin(u * Math.PI * 140) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 140) * 0.5 + 0.5);
      const n = fbmTiled(u * 6, v * 6, 6, { octaves: 4, seed: 151 });
      const c = mix([0.24, 0.25, 0.18], [0.34, 0.34, 0.24], saturate(n * 0.7 + 0.5));
      const w = 0.9 + weave * 0.2;
      return [c[0] * w, c[1] * w, c[2] * w];
    },
    height: (u, v) => (Math.sin(u * Math.PI * 140) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 140) * 0.5 + 0.5),
    rough: () => 0.95,
  },
  leatherGlove: {
    size: 256,
    color: (u, v) => {
      const stipple = fbmTiled(u * 70, v * 70, 70, { octaves: 2, seed: 161 });
      const n = fbmTiled(u * 8, v * 8, 8, { octaves: 4, seed: 162 });
      const c = mix([0.07, 0.07, 0.065], [0.15, 0.14, 0.12], saturate(n * 0.7 + 0.5));
      return mix(c, [0.22, 0.21, 0.19], saturate(stipple * 0.6 - 0.1) * 0.6);
    },
    height: (u, v) => fbmTiled(u * 70, v * 70, 70, { octaves: 2, seed: 161 }),
    rough: () => 0.75,
  },
  tire: {
    size: 256,
    color: (u, v) => {
      const tread = Math.sin(v * Math.PI * 26) * 0.5 + 0.5;
      const n = fbmTiled(u * 30, v * 30, 30, { octaves: 3, seed: 171 });
      const c = mix([0.03, 0.03, 0.03], [0.12, 0.12, 0.12], n);
      return c.map((cc) => cc * (0.7 + tread * 0.6));
    },
    height: (u, v) => Math.sin(v * Math.PI * 26) * 0.5 + 0.5,
    rough: () => 0.95,
  },
  waterNormal: {
    size: 256,
    color: (u, v) => [0.5, 0.5, 1],
    height: (u, v) =>
      fbmTiled(u * 6, v * 6, 6, { octaves: 4, seed: 181 }) * 0.6 +
      fbmTiled(u * 13, v * 13, 13, { octaves: 3, seed: 182 }) * 0.4,
    rough: () => 0.05,
    metal: () => 0.2,
    normalStrength: 1.1,
  },

  /**
   * Ground detail for the terrain: mostly luminance structure (blade streaks,
   * pebbles, small roots). The terrain mesh supplies the colour through vertex
   * colours, so this stays close to neutral.
   */
  groundDetail: {
    size: 512,
    color: (u, v) => {
      const blades = fbmTiled(u * 64, v * 64, 64, { octaves: 3, seed: 191 });
      const patches = fbmTiled(u * 7, v * 7, 7, { octaves: 4, seed: 192 });
      const pebbles = saturate((fbmTiled(u * 40, v * 40, 40, { octaves: 2, seed: 193 }) - 0.62) * 5);
      const dirt = saturate(fbmTiled(u * 17, v * 17, 17, { octaves: 3, seed: 194 }) * 1.6 + 0.1);
      let l = 0.72 + patches * 0.22 + blades * 0.18;
      l = lerp(l, 0.62, dirt * 0.7);
      l = lerp(l, 0.86, pebbles * 0.5);
      const warm = 1 + patches * 0.06;
      return [l * warm, l, l * (1 - patches * 0.05)];
    },
    height: (u, v) => {
      const blades = fbmTiled(u * 64, v * 64, 64, { octaves: 3, seed: 191 });
      const lumps = fbmTiled(u * 12, v * 12, 12, { octaves: 3, seed: 192 });
      const pebbles = saturate((fbmTiled(u * 40, v * 40, 40, { octaves: 2, seed: 193 }) - 0.62) * 5);
      return blades * 0.45 + lumps * 0.4 + pebbles * 0.6;
    },
    rough: (u, v) => 0.8 + fbmTiled(u * 30, v * 30, 30, { octaves: 3, seed: 195 }) * 0.18,
    normalStrength: 1.6,
  },
};


/* ------------------------------------------------------------------ */
/* Alpha sprite painters                                               */
/* ------------------------------------------------------------------ */

const SPRITES = {
  /** A clump of jungle leaves - used on cards for the canopy. */
  leafCluster: (ctx, s) => {
    const rng = makeRng(7);
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 34; i++) {
      const x = s * (0.5 + (rng() - 0.5) * 0.92);
      const y = s * (0.5 + (rng() - 0.5) * 0.94);
      const r = s * (0.045 + rng() * 0.085);
      const rot = rng() * TAU;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const light = 0.5 + rng() * 0.5;
      g.addColorStop(0, `rgba(${Math.floor(60 * light)},${Math.floor(120 * light)},${Math.floor(40 * light)},0.98)`);
      g.addColorStop(0.7, `rgba(${Math.floor(30 * light)},${Math.floor(70 * light)},${Math.floor(22 * light)},0.95)`);
      g.addColorStop(1, 'rgba(10,26,10,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(1, 1.6);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  },

  treeSilhouette: (ctx, s) => {
    const rng = makeRng(23);
    ctx.clearRect(0, 0, s, s);
    // trunk
    const trunkW = s * 0.055;
    const g = ctx.createLinearGradient(s * 0.5 - trunkW, 0, s * 0.5 + trunkW, 0);
    g.addColorStop(0, 'rgba(30,32,22,0.95)');
    g.addColorStop(0.5, 'rgba(48,50,34,0.98)');
    g.addColorStop(1, 'rgba(26,28,18,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s * 0.5 - trunkW * 1.4, s);
    ctx.quadraticCurveTo(s * 0.5 - trunkW * 0.6, s * 0.5, s * 0.5 + trunkW * 0.4, s * 0.06);
    ctx.lineTo(s * 0.5 + trunkW * 1.2, s * 0.08);
    ctx.quadraticCurveTo(s * 0.5 + trunkW * 0.4, s * 0.5, s * 0.5 + trunkW * 1.4, s);
    ctx.closePath();
    ctx.fill();
    // canopy blobs form a ragged crown
    for (let i = 0; i < 30; i++) {
      const a = rng() * TAU;
      const rad = Math.pow(rng(), 0.7);
      const cx = s * 0.5 + Math.cos(a) * rad * s * 0.36;
      const cy = s * 0.3 + Math.sin(a) * rad * s * 0.24;
      const r = s * (0.07 + rng() * 0.11) * (1 - rad * 0.35);
      const shade = 0.6 + rng() * 0.4;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, `rgba(${Math.floor(34 * shade)},${Math.floor(56 * shade)},${Math.floor(28 * shade)},0.95)`);
      rg.addColorStop(0.75, `rgba(${Math.floor(20 * shade)},${Math.floor(36 * shade)},${Math.floor(18 * shade)},0.8)`);
      rg.addColorStop(1, 'rgba(12,22,12,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
    }
  },

  fern: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const rng = makeRng(19);
    const fronds = 7;
    for (let f = 0; f < fronds; f++) {
      const angle = (-Math.PI / 2) + (f - (fronds - 1) / 2) * 0.42;
      const len = s * (0.42 + rng() * 0.14);
      const x0 = s * 0.5;
      const y0 = s * 0.98;
      const steps = 22;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const x = x0 + Math.cos(angle) * len * t;
        const y = y0 + Math.sin(angle) * len * t;
        const w = s * 0.075 * (1 - t) + s * 0.006;
        const light = 0.55 + 0.45 * (1 - t);
        ctx.fillStyle = `rgba(${Math.floor(46 * light)},${Math.floor(104 * light)},${Math.floor(38 * light)},${0.98 - t * 0.1})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, w, w * 0.42, 0.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  },

  grassTuft: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const rng = makeRng(23);
    for (let i = 0; i < 15; i++) {
      const x0 = s * (0.5 + (rng() - 0.5) * 0.8);
      const h = s * (0.35 + rng() * 0.6);
      const bend = (rng() - 0.5) * s * 0.35;
      const w = s * (0.012 + rng() * 0.02);
      const light = 0.5 + rng() * 0.5;
      ctx.strokeStyle = `rgba(${Math.floor(70 * light)},${Math.floor(132 * light)},${Math.floor(46 * light)},0.96)`;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, s);
      ctx.quadraticCurveTo(x0 + bend * 0.4, s - h * 0.55, x0 + bend, s - h);
      ctx.stroke();
    }
  },

  bush: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const rng = makeRng(31);
    for (let i = 0; i < 60; i++) {
      const a = rng() * TAU;
      const r = Math.pow(rng(), 0.6) * s * 0.44;
      const x = s * 0.5 + Math.cos(a) * r;
      const y = s * 0.6 + Math.sin(a) * r * 0.8;
      const rad = s * (0.03 + rng() * 0.06) * (1 - r / (s * 0.5)) * 1.4;
      const light = 0.45 + rng() * 0.55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${Math.floor(52 * light)},${Math.floor(108 * light)},${Math.floor(40 * light)},0.95)`);
      g.addColorStop(1, 'rgba(20,50,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, rad), 0, TAU);
      ctx.fill();
    }
  },

  smoke: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s;
        const v = y / s;
        const d = Math.hypot(u - 0.5, v - 0.5) * 2;
        const n = fbmTiled(u * 5, v * 5, 5, { octaves: 5, seed: 55 });
        const a = saturate((1 - d) * 1.4) * saturate(0.55 + n * 0.9);
        const idx = (y * s + x) * 4;
        img.data[idx] = 235;
        img.data[idx + 1] = 235;
        img.data[idx + 2] = 232;
        img.data[idx + 3] = Math.floor(saturate(a) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  muzzleFlash: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.42);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.25, 'rgba(255,226,150,0.9)');
    g.addColorStop(0.6, 'rgba(255,150,60,0.35)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // star spikes
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI + 0.3;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      const lg = ctx.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
      lg.addColorStop(0, 'rgba(255,200,120,0)');
      lg.addColorStop(0.5, 'rgba(255,240,190,0.95)');
      lg.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(-s * 0.5, -s * 0.012, s, s * 0.024);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  spark: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,214,140,0.8)');
    g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  },

  tracer: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,180,90,0)');
    g.addColorStop(0.75, 'rgba(255,210,140,0.55)');
    g.addColorStop(0.94, 'rgba(255,245,220,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, s * 0.46, s, s * 0.08);
  },

  bulletHole: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.5);
    g.addColorStop(0, 'rgba(6,6,6,0.98)');
    g.addColorStop(0.28, 'rgba(24,20,18,0.85)');
    g.addColorStop(0.5, 'rgba(60,54,48,0.35)');
    g.addColorStop(1, 'rgba(90,84,76,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const rng = makeRng(41);
    ctx.strokeStyle = 'rgba(30,26,24,0.6)';
    for (let i = 0; i < 12; i++) {
      const a = rng() * TAU;
      const len = s * (0.08 + rng() * 0.3);
      ctx.lineWidth = 1 + rng() * 1.6;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * s * 0.08, c + Math.sin(a) * s * 0.08);
      ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
      ctx.stroke();
    }
  },

  scorch: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    for (let i = 0; i < 5; i++) {
      const r = s * (0.18 + i * 0.08);
      const g = ctx.createRadialGradient(c, c, r * 0.2, c, c, r);
      g.addColorStop(0, 'rgba(8,8,8,0.75)');
      g.addColorStop(1, 'rgba(20,18,16,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, TAU);
      ctx.fill();
    }
  },

  bloodMist: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const rng = makeRng(53);
    for (let i = 0; i < 34; i++) {
      const a = rng() * TAU;
      const r = Math.pow(rng(), 0.5) * s * 0.42;
      const x = s * 0.5 + Math.cos(a) * r;
      const y = s * 0.5 + Math.sin(a) * r;
      const rad = s * (0.03 + rng() * 0.09) * (1 - r / (s * 0.5));
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, rad));
      const dark = 0.35 + rng() * 0.3;
      g.addColorStop(0, `rgba(${Math.floor(150 * dark)},${Math.floor(18 * dark)},${Math.floor(20 * dark)},0.55)`);
      g.addColorStop(1, 'rgba(80,6,8,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, rad), 0, TAU);
      ctx.fill();
    }
  },

  cloud: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / s;
        const v = y / s;
        const n = fbmTiled(u * 3, v * 3, 3, { octaves: 6, seed: 71, gain: 0.55 });
        const d = Math.hypot((u - 0.5) * 1.6, (v - 0.5) * 2.2) * 2;
        const a = saturate((0.62 + n * 0.7 - d * 0.8) * 1.4);
        const idx = (y * s + x) * 4;
        img.data[idx] = 255;
        img.data[idx + 1] = 253;
        img.data[idx + 2] = 248;
        img.data[idx + 3] = Math.floor(saturate(a) * 235);
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  lensDirt: (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const rng = makeRng(83);
    for (let i = 0; i < 160; i++) {
      const x = rng() * s;
      const y = rng() * s;
      const r = s * (0.002 + Math.pow(rng(), 3) * 0.03);
      ctx.fillStyle = `rgba(${Math.floor(150 + rng() * 80)},${Math.floor(150 + rng() * 80)},${Math.floor(140 + rng() * 80)},${0.05 + rng() * 0.18})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  },
};

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

export class TextureLibrary {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.quality = opts.quality || 'high';
    this.aniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 4);
    this.materials = new Map();
    this.sprites = new Map();
    this.built = false;
  }

  sizeFor(base) {
    if (this.quality === 'low') return Math.max(64, Math.floor(base / 4));
    if (this.quality === 'medium') return Math.floor(base / 2);
    return base;
  }

  /** Bake everything. Reports progress 0..1 with a label. */
  async build(onProgress = () => {}) {
    const names = Object.keys(MAT_DEFS);
    const total = names.length + Object.keys(SPRITES).length;
    let done = 0;
    const tick = async (label) => {
      done++;
      onProgress(done / total, label);
      if (done % 3 === 0) await yieldFrame();
    };

    for (const name of names) {
      const def = MAT_DEFS[name];
      const spec = { ...def, size: this.sizeFor(def.size || 256) };
      const baked = bakeMaterial(spec, { repeat: def.repeat ?? 1 });
      baked.map.anisotropy = this.aniso;
      baked.normalMap.anisotropy = this.aniso;
      this.materials.set(name, baked);
      await tick(`material: ${name}`);
    }

    for (const [name, painter] of Object.entries(SPRITES)) {
      const size = this.sizeFor(name === 'cloud' ? 512 : 256);
      const { canvas, ctx } = makeCanvas(size, size);
      painter(ctx, size);
      this.sprites.set(name, toTexture(canvas, { srgb: true, repeat: 1, aniso: this.aniso, clampEdges: true }));
      await tick(`sprite: ${name}`);
    }

    this.built = true;
    return this;
  }

  /** Albedo texture. */
  tex(name) {
    return this.materials.get(name)?.map ?? null;
  }
  normal(name) {
    return this.materials.get(name)?.normalMap ?? null;
  }
  orm(name) {
    return this.materials.get(name)?.ormMap ?? null;
  }
  sprite(name) {
    const base = this.sprites.get(name);
    if (!base) return null;
    // Repeated use: hand out clones so callers can set their own repeat.
    const t = base.clone();
    t.needsUpdate = true;
    return t;
  }

  /**
   * Convenience PBR material factory.
   * opts: { repeat, color, roughness, metalness, normalScale, alphaTest, transparent, side, flatShading }
   */
  pbr(name, opts = {}) {
    const entry = this.materials.get(name);
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 1,
      side: opts.side ?? THREE.FrontSide,
      transparent: !!opts.transparent,
      alphaTest: opts.alphaTest ?? 0,
      flatShading: !!opts.flatShading,
      depthWrite: opts.depthWrite !== false,
      vertexColors: !!opts.vertexColors,
    });
    if (entry) {
      mat.map = this.tiled(entry.map, opts.repeat ?? 1);
      mat.normalMap = this.tiled(entry.normalMap, opts.repeat ?? 1);
      mat.roughnessMap = this.tiled(entry.ormMap, opts.repeat ?? 1);
      mat.metalnessMap = mat.roughnessMap;
      mat.aoMap = null;
      if (mat.normalMap) mat.normalScale = new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1);
      // ORM packing: roughness/metalness come from the texture's G/B channels.
      mat.roughness = opts.roughness ?? 1;
      mat.metalness = opts.metalness ?? 1;
    } else {
      mat.color = new THREE.Color(opts.color ?? 0x808080);
    }
    if (opts.emissive !== undefined) mat.emissive = new THREE.Color(opts.emissive);
    if (opts.emissiveIntensity !== undefined) mat.emissiveIntensity = opts.emissiveIntensity;
    mat.userData.surface = opts.surface || name;
    return mat;
  }

  /** Clone a texture with independent repeat so materials don't fight. */
  tiled(tex, repeat) {
    if (!tex) return null;
    if (repeat === 1) return tex;
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(repeat, repeat);
    t.wrapS = three_wrap(tex);
    t.wrapT = three_wrap(tex);
    return t;
  }

  /** Sprite material (additive or alpha blended billboards / cards). */
  spriteMaterial(name, opts = {}) {
    const tex = this.sprite(name);
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: opts.depthWrite ?? false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: opts.side ?? THREE.DoubleSide,
      alphaTest: opts.alphaTest ?? 0,
      color: opts.color ?? 0xffffff,
      toneMapped: opts.toneMapped ?? true,
    });
  }

  dispose() {
    for (const entry of this.materials.values()) {
      entry.map?.dispose();
      entry.normalMap?.dispose();
      entry.ormMap?.dispose();
    }
    for (const t of this.sprites.values()) t.dispose();
    this.materials.clear();
    this.sprites.clear();
  }
}

function three_wrap(tex) {
  return tex.wrapS;
}

export { mix, saturate as clamp01 };

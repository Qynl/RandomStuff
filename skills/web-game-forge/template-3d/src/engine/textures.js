// Procedural textures, generated at runtime on canvases. No image files are needed,
// which keeps the repo small and the game fully self-contained.

import * as THREE from 'three';
import { createRng } from './math.js';

function canvasTexture(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Stone block masonry with grout, colour variation, and speckle noise.
// Returns albedo `map` and a grayscale `bumpMap` for fake surface relief.
export function makeStoneTexture(size = 512, seed = 7) {
  const rng = createRng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const b = document.createElement('canvas');
  b.width = b.height = size;
  const gb = b.getContext('2d');

  g.fillStyle = '#4b463f';
  g.fillRect(0, 0, size, size);
  gb.fillStyle = '#404040';
  gb.fillRect(0, 0, size, size);

  const rows = 8;
  const bh = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const bw = size / cols;
    const off = (r % 2) * bw * 0.5;
    for (let k = -1; k < cols; k++) {
      const x = k * bw + off;
      const v = 105 + rng() * 40;
      const tint = rng() * 14 - 7;
      g.fillStyle = `rgb(${v + tint},${v * 0.96 + tint},${v * 0.9 + tint})`;
      g.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
      const bv = 150 + rng() * 60;
      gb.fillStyle = `rgb(${bv},${bv},${bv})`;
      gb.fillRect(x + 6, r * bh + 6, bw - 12, bh - 12);
    }
  }
  for (let i = 0; i < 9000; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const a = rng() * 0.35;
    g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.5})`;
    g.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
    const bv = rng() * 255;
    gb.fillStyle = `rgba(${bv},${bv},${bv},0.25)`;
    gb.fillRect(x, y, 2, 2);
  }
  return { map: canvasTexture(c, true), bumpMap: canvasTexture(b, false) };
}

// Soft radial glow used for torch flames, shockwave dust, and light halos.
export function makeGlowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

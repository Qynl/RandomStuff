/* Procedural textures. Nothing is fetched at runtime: every surface is painted
 * to a canvas when the scene boots, so the build has no asset pipeline and no
 * network dependency beyond the two fonts in index.html.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { makeRng } from './rng.js';

function canvasOf(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

function toTexture(canvas, { srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function grainTexture(size = 256) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 96 + Math.random() * 132;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // Soft blotches so the bump map has larger features than per-pixel noise.
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * (size * 0.14);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, Math.random() > 0.5 ? 'rgba(60,60,60,.5)' : 'rgba(210,210,210,.35)');
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(canvas, { srgb: false });
}

/* ------------------------------------------------------------- surfaces --- */

function plaster(base = '#8b8e85', accent = '#cfccb6', dirt = '#3c3e35') {
  const size = 512;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Broad water staining, then fine speckle on top.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 120;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(40,44,36,${0.07 + Math.random() * 0.12})`);
    grad.addColorStop(1, 'rgba(18,20,16,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.globalAlpha = Math.random() * 0.05;
    ctx.fillStyle = Math.random() > 0.45 ? accent : dirt;
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hairline cracks.
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#0a0c09';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 12; s++) {
      x += (Math.random() - 0.5) * 40;
      y += Math.random() * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

function concrete(base = '#6d6a60', accent = '#a89f8c') {
  const size = 512;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.globalAlpha = Math.random() * 0.13;
    ctx.fillStyle = Math.random() > 0.5 ? accent : '#070707';
    ctx.fillRect(x, y, 2 + Math.random() * 8, 1 + Math.random() * 1.6);
  }
  // Slab seams.
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#0b0b09';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.stroke();
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

function wood(base = '#6b4d38', accent = '#b08a5f') {
  const size = 512;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.globalAlpha = Math.random() * 0.14;
    ctx.fillStyle = Math.random() > 0.45 ? accent : '#140d09';
    ctx.fillRect(x, y, 1 + Math.random() * 2.4, 10 + Math.random() * 90);
  }
  // Plank joints.
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = '#100a07';
  ctx.lineWidth = 2;
  for (let x = 0; x <= size; x += 128) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

function tile(base = '#c3ccc4', grout = '#4c524c') {
  const size = 512;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const step = 128;
  for (let x = 0; x < size; x += step) {
    for (let y = 0; y < size; y += step) {
      ctx.fillStyle = base;
      ctx.globalAlpha = 0.72 + Math.random() * 0.28;
      ctx.fillRect(x + 4, y + 4, step - 8, step - 8);
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.globalAlpha = Math.random() * 0.16;
    ctx.fillStyle = Math.random() > 0.6 ? '#5c4a34' : '#11130f';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

function fabric(base = '#6a6152', accent = '#9c8d70') {
  const size = 256;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = accent;
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#0d0f0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, size - 20, size - 20);
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

/* Portrait canvases for the gallery: a figure, a face that is only a smear,
 * and a lot of varnish. Different seed, different portrait.
 */
function portrait(seed) {
  const size = 256;
  const rng = makeRng(seed);
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, `hsl(${rng.int(28, 52)}, 14%, ${rng.int(16, 26)}%)`);
  bg.addColorStop(1, `hsl(${rng.int(20, 40)}, 12%, ${rng.int(7, 12)}%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2 + rng.float(-16, 16);
  const headY = size * 0.34;
  const headR = size * 0.115;
  ctx.fillStyle = `hsl(${rng.int(26, 40)}, 14%, ${rng.int(26, 40)}%)`;
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR * 0.86, headR, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulders dissolve into the background.
  const body = ctx.createLinearGradient(0, headY, 0, size);
  body.addColorStop(0, `hsla(${rng.int(20, 40)}, 16%, 22%, 0.95)`);
  body.addColorStop(1, 'rgba(10,10,9,0.1)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 3.4, size);
  ctx.quadraticCurveTo(cx - headR * 1.9, headY + headR * 0.5, cx, headY + headR * 0.7);
  ctx.quadraticCurveTo(cx + headR * 1.9, headY + headR * 0.5, cx + headR * 3.4, size);
  ctx.closePath();
  ctx.fill();

  // Eyes: two dark smudges. Nothing sharper than that.
  ctx.fillStyle = 'rgba(6,6,5,0.85)';
  for (const dx of [-headR * 0.38, headR * 0.38]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx, headY - headR * 0.1, headR * 0.2, headR * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Varnish bloom and scratches.
  for (let i = 0; i < 22; i++) {
    const x = rng.float(0, size);
    const y = rng.float(0, size);
    const r = rng.float(10, 90);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(226,205,160,${rng.float(0.02, 0.06)})`);
    grad.addColorStop(1, 'rgba(226,205,160,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = '#000';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(rng.float(0, size), rng.float(0, size));
    ctx.lineTo(rng.float(0, size), rng.float(0, size));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas);
}

function clone(texture, x, y) {
  const copy = texture.clone();
  copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
  copy.repeat.set(x, y);
  copy.needsUpdate = true;
  return copy;
}

export function useTextures() {
  return useMemo(() => {
    const wall = plaster();
    const floor = concrete();
    const board = wood();
    const tiles = tile();
    const cloth = fabric();
    const grain = grainTexture();

    const wallRepeat = (x, y) => clone(wall, x, y);
    const bumpRepeat = (x, y) => clone(grain, x, y);

    return {
      wall: wallRepeat(2.4, 1.5),
      wallWide: wallRepeat(4.4, 1.4),
      wallPiece: wallRepeat(1.7, 1.5),
      floor: clone(floor, 3.2, 3.2),
      floorSmall: clone(floor, 1.6, 1.6),
      wood: clone(board, 1, 1.6),
      woodSmall: clone(board, 1, 1),
      woodTable: clone(board, 1.2, 0.9),
      tile: clone(tiles, 2.2, 1.6),
      tileFloor: clone(tiles, 2.6, 2.6),
      fabric: clone(cloth, 2, 3),
      bumpWall: bumpRepeat(2.4, 1.5),
      bumpWallWide: bumpRepeat(4.4, 1.4),
      bumpPiece: bumpRepeat(1.7, 1.5),
      bumpFloor: bumpRepeat(3.2, 3.2),
      bumpWood: bumpRepeat(1, 1.6),
      bumpTable: bumpRepeat(1.2, 0.9),
      bumpTile: bumpRepeat(2.2, 1.6),
      bumpFabric: bumpRepeat(2, 3),
      portraits: [portrait(11), portrait(29), portrait(47), portrait(83), portrait(131), portrait(197)],
    };
  }, []);
}

#!/usr/bin/env node
/**
 * IRONWOOD navigation report.
 *
 * The map is only fun if the bots can actually get everywhere: spawns,
 * objectives, the temple, the village and every bridge must live in one
 * connected walkable graph. This prints the component breakdown, a route
 * between the spawns and a walkability check at each named landmark.
 *
 *   node tools/nav-check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function ensureThreeShim() {
  const dir = path.join(root, 'node_modules', 'three');
  fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(dir, 'package.json');
  const entry = path.join(dir, 'three.module.js');
  const pkgBody = JSON.stringify({ name: 'three', version: '0.186.1', type: 'module', main: 'three.module.js', exports: { '.': './three.module.js' } }, null, 2);
  if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgBody) fs.writeFileSync(pkg, pkgBody);
  const reexport = "export * from '../../vendor/three.module.min.js';\n";
  if (!fs.existsSync(entry) || fs.readFileSync(entry, 'utf8') !== reexport) fs.writeFileSync(entry, reexport);
}

ensureThreeShim();
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
}

const THREE = await import('three');
const { World, terrainHeight } = await import('../src/world/map.js');

function fakeTexture() {
  const t = new THREE.Texture();
  t.repeat = new THREE.Vector2(1, 1);
  t.offset = new THREE.Vector2(0, 0);
  return t;
}
const stubTextures = {
  quality: 'low',
  pbr() {
    const m = new THREE.MeshStandardMaterial();
    m.map = fakeTexture();
    m.normalMap = fakeTexture();
    m.roughnessMap = fakeTexture();
    m.metalnessMap = m.roughnessMap;
    return m;
  },
  tiled: (t) => t || fakeTexture(),
  sprite: () => fakeTexture(),
  spriteMaterial: () => new THREE.MeshBasicMaterial(),
  tex: () => fakeTexture(),
  normal: () => fakeTexture(),
  orm: () => fakeTexture(),
};

const started = Date.now();
const world = new World(new THREE.Scene(), stubTextures, { seed: 1337, quality: 'low' });
await world.build(() => {});
const nav = world.nav;
const { size, originX, originZ, cell } = nav;
console.log(`\nIRONWOOD nav report  (world built in ${Date.now() - started} ms)`);

const comp = new Int32Array(size * size).fill(-1);
const sizes = [];
let count = 0;
for (let i = 0; i < size * size; i++) {
  if (!nav.walkable[i] || comp[i] >= 0) continue;
  const id = count++;
  const stack = [i];
  comp[i] = id;
  let n = 0;
  while (stack.length) {
    const c = stack.pop();
    n++;
    const gx = c % size;
    const gz = (c / size) | 0;
    if (gx > 0 && nav.walkable[c - 1] && comp[c - 1] < 0) { comp[c - 1] = id; stack.push(c - 1); }
    if (gx < size - 1 && nav.walkable[c + 1] && comp[c + 1] < 0) { comp[c + 1] = id; stack.push(c + 1); }
    if (gz > 0 && nav.walkable[c - size] && comp[c - size] < 0) { comp[c - size] = id; stack.push(c - size); }
    if (gz < size - 1 && nav.walkable[c + size] && comp[c + size] < 0) { comp[c + size] = id; stack.push(c + size); }
  }
  sizes[id] = n;
}
const walkableCount = nav.walkable.reduce((a, b) => a + b, 0);
const ranked = sizes.map((n, id) => ({ id, n })).sort((a, b) => b.n - a.n);
const main = ranked.length ? ranked[0].id : -1;
console.log(`walkable cells ${walkableCount}  ·  components ${count}  ·  connectors carved ${nav.stitched || 0}`);
console.log(`largest component holds ${ranked.length ? ranked[0].n : 0} cells (${(100 * (ranked.length ? ranked[0].n : 0) / Math.max(1, walkableCount)).toFixed(1)}%)`);
console.log('top components: ' + ranked.slice(0, 6).map((r) => r.n).join(' / '));

const cid = (x, z) => {
  const gx = Math.floor((x - originX) / cell);
  const gz = Math.floor((z - originZ) / cell);
  if (gx < 0 || gz < 0 || gx >= size || gz >= size) return -1;
  return comp[gz * size + gx];
};

const landmarks = [
  ['us spawn', -74, 78], ['opfor spawn', 100, -80], ['temple', 52, -52],
  ['crossroads', 2, -2], ['village', -58, 38],
  ['bridge: village road', -68.5, 55.8], ['bridge: crossroads road', -24.8, 9.1],
  ['bridge: temple approach', 24.7, -20.7], ['bridge: link crossing', 26, 6],
  ['bridge: ridge road', 78.5, -39.4],
];
let stranded = 0;
for (const [name, x, z] of landmarks) {
  const id = cid(x, z);
  const ok = id >= 0 && id === main;
  if (!ok) stranded++;
  console.log(`  ${ok ? 'ok  ' : 'WARN'} ${name.padEnd(24)} floor ${nav.floorAt(x, z).toFixed(2).padStart(6)}  component ${id}${ok ? '' : ` (size ${sizes[id] ?? '-'})`}`);
}

const a = world.spawns.us[0];
const b = world.spawns.opfor[0];
const route = nav.findPath(a.x, a.z, b.x, b.z, 14000);
const partial = route && route[route.length - 1].partial;
const pathLen = route ? route.reduce((acc, p, i, arr) => (i ? acc + Math.hypot(p.x - arr[i - 1].x, p.z - arr[i - 1].z) : 0), 0) : 0;
console.log(`\nroute us spawn -> opfor spawn: ${route ? `${route.length} nodes, ${pathLen.toFixed(1)} m${partial ? ' (PARTIAL - goal unreachable)' : ''}` : 'NO PATH'}`);
const probeShots = [
  ['village -> crossroads', { x: -62, z: 34 }, { x: 2, z: -2 }],
  ['temple -> us spawn', { x: 52, z: -52 }, { x: -74, z: 78 }],
  ['crossroads -> ridge road', { x: 2, z: -2 }, { x: 78.5, z: -39.4 }],
];
for (const [name, from, to] of probeShots) {
  const p = nav.findPath(from.x, from.z, to.x, to.z, 14000);
  const part = p && p[p.length - 1].partial;
  console.log(`  ${p && !part ? 'ok  ' : 'WARN'} ${name.padEnd(24)} ${p ? `${p.length} nodes${part ? ' (partial)' : ''}` : 'no path'}`);
}
console.log('');
process.exit(stranded || !route || partial ? 1 : 0);

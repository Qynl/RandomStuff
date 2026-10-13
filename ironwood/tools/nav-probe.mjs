#!/usr/bin/env node
/** Why is a point (not) walkable? Tiny diagnostic for the nav grid. */
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const dir = path.join(root, 'node_modules', 'three'); fs.mkdirSync(dir, { recursive: true });
if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
const THREE = await import('three');
const { World, terrainHeight, MAP } = await import('../src/world/map.js');
const fakeTexture = () => { const t = new THREE.Texture(); t.repeat = new THREE.Vector2(1,1); t.offset = new THREE.Vector2(0,0); return t; };
const stub = { quality: 'low', pbr: () => { const m = new THREE.MeshStandardMaterial(); m.map = fakeTexture(); m.normalMap = fakeTexture(); m.roughnessMap = fakeTexture(); m.metalnessMap = m.roughnessMap; return m; }, tiled: (t) => t || fakeTexture(), sprite: () => fakeTexture(), spriteMaterial: () => new THREE.MeshBasicMaterial(), tex: () => fakeTexture(), normal: () => fakeTexture(), orm: () => fakeTexture() };
const world = new World(new THREE.Scene(), stub, { seed: 1337, quality: 'low' });
await world.build(() => {});
const pts = process.argv.slice(2, 4);
for (const arg of pts) {
  const [x, z] = arg.split(',').map(Number);
  const h = terrainHeight(x, z);
  const wk = world.walkwayAt(x, z);
  console.log(`\n(${x},${z}) terrain ${h.toFixed(2)} waterDepth ${world.waterDepth(x,z).toFixed(2)} navWalkable ${world.nav.isWalkable(x,z)} floorAt ${world.nav.floorAt(x,z).toFixed(2)} walkway ${wk ? wk.y.toFixed(2) : 'none'}`);
  for (const col of world.colliders) {
    if (col.type === 'box') {
      const b = col.box;
      if (x > b.min.x - 0.42 && x < b.max.x + 0.42 && z > b.min.z - 0.42 && z < b.max.z + 0.42) {
        console.log(`   box tag=${col.tag} deck=${!!col.deck} y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}  topRelFloor=${(b.max.y - Math.max(h, wk?wk.y:-99)).toFixed(2)} size ${(b.max.x-b.min.x).toFixed(1)}x${(b.max.z-b.min.z).toFixed(1)}`);
      }
    } else if ((x - col.x) ** 2 + (z - col.z) ** 2 < (col.r + 0.42) ** 2) {
      console.log(`   cyl tag=${col.tag} r=${col.r.toFixed(2)} y ${col.y0.toFixed(2)}..${col.y1.toFixed(2)}`);
    }
  }
}

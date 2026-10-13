/**
 * IRONWOOD - the map: "Ruins of Vinh Long".
 *
 * Everything is generated from a single seed:
 *   - a heightfield valley with a river, cleared paths and flat compounds
 *   - a temple complex, a ruined village, a crash site, watchtower, bridge
 *   - instanced jungle (trees, palms, ferns, bushes, grass) with wind
 *   - collision volumes, line-of-sight, a baked nav grid with A*, cover points
 *   - minimap vector data for the HUD
 *
 * The same analytic height function drives both the mesh and the gameplay
 * queries, so what you see is exactly what you collide with.
 */

import * as THREE from 'three';
import {
  AABB, TAU, clamp, saturate, lerp, smoothstep, fbm, noise2, makeRng,
  rand, vlenXZ,
} from '../core/math.js';

export const MAP = {
  size: 220,
  half: 110,
  visualHalf: 300,
  segments: 176,
  seed: 1337,
  waterLevel: -0.6,
  groundTextureRepeat: 42,
};

/** Extra detail visible from outside the playable area (jungle wall). */
const BOUNDS_PADDING = 6;

/* ------------------------------------------------------------------ */
/* World layout constants (metres, origin = map centre)                */
/* ------------------------------------------------------------------ */

const CLEARINGS = [
  { x: -86, z: 78, r: 20, h: 2.2, label: 'us_spawn' },
  { x: 88, z: -80, r: 20, h: 3.4, label: 'opfor_spawn' },
  { x: 52, z: -52, r: 24, h: 5.2, label: 'temple' },
  { x: -62, z: 34, r: 22, h: 1.4, label: 'village' },
  { x: 2, z: -2, r: 18, h: 2.6, label: 'crossroads' },
];

/** River centreline (a lazy diagonal through the west of the map). */
const RIVER = [
  { x: -150, z: 96 },
  { x: -96, z: 74 },
  { x: -52, z: 46 },
  { x: -14, z: 22 },
  { x: 30, z: -6 },
  { x: 78, z: -40 },
  { x: 140, z: -84 },
];
const RIVER_WIDTH = 8.5;

/** Path splines: village road, temple approach, crossroads link. */
const PATH_SPLINES = [
  [
    { x: -86, z: 78 }, { x: -74, z: 66 }, { x: -62, z: 44 }, { x: -56, z: 30 },
    { x: -40, z: 16 }, { x: -18, z: 6 }, { x: 2, z: -2 },
  ],
  [
    { x: 2, z: -2 }, { x: 22, z: -18 }, { x: 38, z: -34 }, { x: 52, z: -52 },
  ],
  [
    { x: 2, z: -2 }, { x: 26, z: 6 }, { x: 52, z: 4 }, { x: 74, z: -20 },
    { x: 88, z: -80 },
  ],
];

/* ------------------------------------------------------------------ */
/* Height field                                                        */
/* ------------------------------------------------------------------ */

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 1e-9 ? (wx * vx + wz * vz) / len2 : 0;
  t = saturate(t);
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

function riverDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const r = distToSegment(x, z, RIVER[i].x, RIVER[i].z, RIVER[i + 1].x, RIVER[i + 1].z);
    if (r.dist < best) best = r.dist;
  }
  return best;
}

function pathDistance(x, z) {
  let best = Infinity;
  for (const spline of PATH_SPLINES) {
    for (let i = 0; i < spline.length - 1; i++) {
      const r = distToSegment(x, z, spline[i].x, spline[i].z, spline[i + 1].x, spline[i + 1].z);
      if (r.dist < best) best = r.dist;
    }
  }
  return best;
}

/** Analytic terrain height - the single source of truth. */
export function terrainHeight(x, z) {
  let h = 0;
  h += fbm(x * 0.0115, z * 0.0115, { octaves: 4, seed: MAP.seed }) * 8.0;
  h += fbm(x * 0.042, z * 0.042, { octaves: 3, seed: 77 }) * 1.7;
  h += fbm(x * 0.16, z * 0.16, { octaves: 2, seed: 5 }) * 0.32;

  // jungle basin: the world rises steeply outside the play area
  const r = Math.hypot(x, z);
  const bowl = smoothstep(72, 132, r);
  h += bowl * bowl * 52;

  // flatten the compounds
  for (const c of CLEARINGS) {
    const d = Math.hypot(x - c.x, z - c.z);
    const w = smoothstep(c.r * 1.55, c.r * 0.75, d);
    if (w > 0.001) h = lerp(h, c.h, w);
  }

  // paths get a subtle worn groove
  const pd = pathDistance(x, z);
  const pathW = smoothstep(3.2, 0.0, pd);
  h = lerp(h, h - 0.12, pathW * 0.7);

  // river channel
  const rd = riverDistance(x, z);
  const channel = smoothstep(RIVER_WIDTH * 1.7, RIVER_WIDTH * 0.15, rd);
  h = lerp(h, MAP.waterLevel - 1.8, channel * 0.96);

  return h;
}

export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.6;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  out.set(hL - hR, 2 * e, hD - hU).normalize();
  return out;
}

/* ------------------------------------------------------------------ */
/* Small geometry builders                                             */
/* ------------------------------------------------------------------ */

function geomKey(geo) {
  return geo;
}

function applyWind(material, strength = 0.35, heightScale = 0.5) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: strength };
    shader.uniforms.uWindHeight = { value: heightScale };
    shader.vertexShader = `uniform float uWindTime;\nuniform float uWindStrength;\nuniform float uWindHeight;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 windOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 windOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      float windPhase = uWindTime * 1.6 + windOrigin.x * 0.28 + windOrigin.z * 0.21;
      float gust = sin(windPhase) * 0.7 + sin(windPhase * 2.3 + 1.7) * 0.3;
      float heightMask = clamp(max(transformed.y, 0.0) * uWindHeight, 0.0, 1.0);
      float amount = uWindStrength * heightMask;
      transformed.x += gust * amount;
      transformed.z += gust * amount * 0.55;
      `
    );
    material.userData.windShader = shader;
  };
  material.userData.windStrength = strength;
  return material;
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

export class World {
  constructor(scene, textures, opts = {}) {
    this.scene = scene;
    this.textures = textures;
    this.seed = opts.seed ?? MAP.seed;
    this.quality = opts.quality || 'high';
    this.rng = makeRng(this.seed);
    this.colliders = [];
    this.coverPoints = [];
    this.spawns = { us: [], opfor: [] };
    this.props = [];
    this.smokeEmitters = [];
    this.groups = new Map();
    this.windMaterials = [];
    this.staticMeshes = [];
    this.treeInstances = [];
    this.buildingRects = [];
    this.waterMesh = null;
    this.terrain = null;
    this.minimap = null;
    this.nav = null;
    this._hashGrid = new Map();
    this._time = 0;
    this._rayHit = { hit: false };
  }

  /* ---------------- low level helpers ---------------- */

  group(name) {
    if (!this.groups.has(name)) {
      const g = new THREE.Group();
      g.name = name;
      this.scene.add(g);
      this.groups.set(name, g);
    }
    return this.groups.get(name);
  }

  addCollider(collider) {
    this.colliders.push(collider);
    return collider;
  }

  addBoxCollider(x, y, z, sx, sy, sz, surface = 'stone', ref = null, opts = {}) {
    const box = AABB.fromCenter(x, y + sy / 2, z, sx, sy, sz);
    return this.addCollider({ type: 'box', box, surface, ref, climbable: !!opts.climbable, tag: opts.tag || null });
  }

  addCylCollider(x, z, radius, y0, y1, surface = 'wood', ref = null, tag = null) {
    return this.addCollider({ type: 'cyl', x, z, r: radius, y0, y1, surface, ref, tag });
  }

  /** Mesh + matching collider, the workhorse for architecture. */
  box(sx, sy, sz, x, y, z, material, opts = {}) {
    const geo = new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y + sy / 2, z);
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    if (opts.rotY) {
      // rotated boxes use an oriented collider approximated by a slightly
      // larger axis aligned one (cheap and invisible in practice)
      const c = Math.abs(Math.cos(opts.rotY));
      const s = Math.abs(Math.sin(opts.rotY));
      const ex = sx * c + sz * s;
      const ez = sx * s + sz * c;
      this.addBoxCollider(x, y, z, ex, sy, ez, opts.surface || 'stone', mesh, opts);
    } else if (opts.collide !== false) {
      this.addBoxCollider(x, y, z, sx, sy, sz, opts.surface || 'stone', mesh, opts);
    }
    (opts.parent || this.group(opts.group || 'structures')).add(mesh);
    this.staticMeshes.push(mesh);
    if (sy > 1.2 && opts.tag !== 'decor') {
      this.buildingRects.push({ x, z, w: sx, d: sz, rot: opts.rotY || 0 });
    }
    return mesh;
  }

  cylinder(rTop, rBottom, h, x, y, z, material, opts = {}) {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, h, opts.segments || 10, 1, false);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    if (opts.collide !== false) {
      this.addCylCollider(x, z, Math.max(rTop, rBottom) * (opts.colliderScale ?? 1), y, y + h, opts.surface || 'stone', mesh, opts.tag || null);
    }
    (opts.parent || this.group(opts.group || 'structures')).add(mesh);
    this.staticMeshes.push(mesh);
    return mesh;
  }

  /* ---------------- build steps ---------------- */

  async build(onProgress = () => {}) {
    const steps = [
      ['terrain', () => this.buildTerrain()],
      ['water', () => this.buildWater()],
      ['paths', () => this.buildPaths()],
      ['temple', () => this.buildTemple()],
      ['village', () => this.buildVillage()],
      ['crossroads', () => this.buildCrossroads()],
      ['camps', () => this.buildCamps()],
      ['bridge', () => this.buildBridge()],
      ['rocks', () => this.buildRocks()],
      ['trees', () => this.buildTrees()],
      ['undergrowth', () => this.buildUndergrowth()],
      ['props', () => this.buildProps()],
      ['bounds', () => this.buildBounds()],
      ['nav', () => this.buildNav()],
      ['minimap', () => this.buildMinimapData()],
      ['spawns', () => this.buildSpawns()],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [name, fn] = steps[i];
      fn();
      onProgress((i + 1) / steps.length, `world: ${name}`);
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    return this;
  }

  buildTerrain() {
    const S = MAP.size;
    const seg = this.quality === 'low' ? 96 : this.quality === 'medium' ? 128 : MAP.segments;
    const visualSeg = Math.min(seg, 128);
    // One plane covering the visual skirmish area, refined inside the play area.
    const geo = new THREE.PlaneGeometry(MAP.visualHalf * 2, MAP.visualHalf * 2, visualSeg * 2, visualSeg * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const detailRepeat = MAP.groundTextureRepeat;
    const uv = geo.attributes.uv;
    const col = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);
      uv.setXY(i, (x + MAP.visualHalf) / (MAP.visualHalf * 2) * detailRepeat, (z + MAP.visualHalf) / (MAP.visualHalf * 2) * detailRepeat);

      // vertex tint: grass / dirt / rock / mud blending
      const n = terrainNormal(x, z, new THREE.Vector3());
      const slope = 1 - saturate(n.y);
      const macro = fbm(x * 0.02, z * 0.02, { octaves: 4, seed: 404 }) * 0.5 + 0.5;
      const moist = fbm(x * 0.045, z * 0.045, { octaves: 3, seed: 909 }) * 0.5 + 0.5;
      const riverD = riverDistance(x, z);
      const nearWater = smoothstep(RIVER_WIDTH * 2.6, RIVER_WIDTH * 0.9, riverD);
      const pathD = pathDistance(x, z);
      const onPath = smoothstep(4.4, 2.0, pathD);

      let r = lerp(0.30, 0.52, macro);
      let g = lerp(0.46, 0.62, macro * 0.9 + moist * 0.1);
      let b = lerp(0.16, 0.26, macro * 0.7);
      // dry patches
      const dry = saturate(macro * 1.5 - 0.75);
      r = lerp(r, 0.52, dry * 0.5);
      g = lerp(g, 0.48, dry * 0.5);
      b = lerp(b, 0.26, dry * 0.5);
      // mud near water and rock on slopes
      r = lerp(r, 0.24, nearWater * 0.65);
      g = lerp(g, 0.17, nearWater * 0.65);
      b = lerp(b, 0.11, nearWater * 0.65);
      r = lerp(r, 0.42, slope * 1.15);
      g = lerp(g, 0.40, slope * 1.15);
      b = lerp(b, 0.36, slope * 1.15);
      // worn dirt paths
      r = lerp(r, 0.58, onPath * 0.75);
      g = lerp(g, 0.45, onPath * 0.75);
      b = lerp(b, 0.28, onPath * 0.75);

      // gentle per-vertex luminance break-up
      const jitter = 0.9 + noise2(x * 0.9, z * 0.9, 17) * 0.2;
      col.setRGB(r * jitter, g * jitter, b * jitter);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = this.textures.pbr('groundDetail', { repeat: 1, surface: 'dirt' });
    mat.vertexColors = true;
    mat.color = new THREE.Color(0xffffff);
    mat.normalScale = new THREE.Vector2(1.1, 1.1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain';
    this.group('terrain').add(mesh);
    this.terrain = mesh;
    this.terrainMat = mat;
    this.terrainSegments = visualSeg * 2;
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(MAP.visualHalf * 2, MAP.visualHalf * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1d2a22),
      transparent: true,
      opacity: 0.82,
      roughness: 0.08,
      metalness: 0.42,
      normalMap: this.textures.tiled(this.textures.normal('waterNormal'), 14),
      normalScale: new THREE.Vector2(0.45, 0.45),
      depthWrite: false,
    });
    mat.userData.surface = 'water';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = MAP.waterLevel + 0.35;
    mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    mesh.name = 'water';
    this.group('water').add(mesh);
    this.waterMesh = mesh;
    this.waterMat = mat;
  }

  /** Dirt ribbons along the path splines. */
  buildPaths() {
    const mat = this.textures.pbr('dirt', { repeat: 1, surface: 'dirt' });
    mat.map.repeat.set(1, 1);
    const group = this.group('paths');
    for (const spline of PATH_SPLINES) {
      const pts = [];
      for (let i = 0; i < spline.length - 1; i++) {
        const a = spline[i];
        const b = spline[i + 1];
        const segs = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 2));
        for (let s = 0; s < segs; s++) {
          const t = s / segs;
          pts.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
        }
      }
      pts.push({ ...spline[spline.length - 1] });
      const verts = [];
      const uvs = [];
      const width = 3.4;
      let dist = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const tx = next.x - prev.x;
        const tz = next.z - prev.z;
        const tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl;
        const nz = tx / tl;
        if (i > 0) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
        const w = width * (0.75 + 0.5 * noise2(p.x * 0.08, p.z * 0.08, 3));
        const lx = p.x + nx * w * 0.5;
        const lz = p.z + nz * w * 0.5;
        const rx = p.x - nx * w * 0.5;
        const rz = p.z - nz * w * 0.5;
        verts.push(lx, terrainHeight(lx, lz) + 0.05, lz);
        verts.push(rx, terrainHeight(rx, rz) + 0.05, rz);
        uvs.push(0, dist * 0.25, 1, dist * 0.25);
      }
      const index = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const m = mat.clone();
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      group.add(mesh);
    }
    this.pathMeshes = group.children.slice();
  }

  /* ---------------- architecture ---------------- */

  stoneMat(repeat = 1.4) {
    if (!this._stoneMat) {
      this._stoneMat = {};
    }
    const key = String(repeat);
    if (!this._stoneMat[key]) {
      this._stoneMat[key] = this.textures.pbr('stone', { repeat, surface: 'stone' });
      this._stoneMat[key].normalScale = new THREE.Vector2(1.15, 1.15);
    }
    return this._stoneMat[key];
  }

  woodMat(repeat = 2) {
    this._woodMats = this._woodMats || {};
    const key = String(repeat);
    if (!this._woodMats[key]) this._woodMats[key] = this.textures.pbr('wood', { repeat, surface: 'wood' });
    return this._woodMats[key];
  }

  concreteMat(repeat = 1.6) {
    this._concreteMats = this._concreteMats || {};
    const key = String(repeat);
    if (!this._concreteMats[key]) this._concreteMats[key] = this.textures.pbr('concrete', { repeat, surface: 'concrete' });
    return this._concreteMats[key];
  }

  sandbagMat(repeat = 1.1) {
    if (!this._sandbagMat) this._sandbagMat = this.textures.pbr('sandbag', { repeat, surface: 'sandbag' });
    return this._sandbagMat;
  }

  /** The temple: a stepped platform, colonnade, arches and collapsed roofs. */
  buildTemple() {
    const g = this.group('temple');
    const rng = this.rng;
    const stone = this.stoneMat(1.2);
    const base = CLEARINGS.find((c) => c.label === 'temple');
    const bx = base.x;
    const bz = base.z;
    const bh = base.h;

    // stepped platform
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const size = 34 - i * 3.2;
      const y = bh - 2.4 + i * 0.55;
      this.box(size, 0.55, size * 0.78, bx, y, bz, stone, { group: 'temple', surface: 'stone', tag: 'decor' });
    }
    const platformY = bh - 2.4 + steps * 0.55;

    // main hall: two rows of columns
    const colPositions = [];
    for (let i = 0; i < 5; i++) {
      const cx = bx - 12 + i * 6;
      colPositions.push({ x: cx, z: bz - 7 });
      colPositions.push({ x: cx, z: bz + 7 });
    }
    for (const c of colPositions) {
      const broken = rng() < 0.3;
      const h = broken ? rand(1.6, 3.2) : 6.4;
      this.cylinder(0.62, 0.78, h, c.x, platformY, c.z, stone, { segments: 12, surface: 'stone' });
      // capital
      if (!broken) this.box(1.7, 0.5, 1.7, c.x, platformY + h, c.z, stone, { group: 'temple', tag: 'decor' });
      else {
        // rubble beside the broken column
        this.box(rand(0.7, 1.3), rand(0.4, 0.8), rand(0.7, 1.3), c.x + rand(-1.4, 1.4), platformY, c.z + rand(-1.4, 1.4), stone, {
          group: 'temple', rotY: rng() * TAU, tag: 'decor', surface: 'stone',
        });
      }
    }

    // lintels over the front colonnade + two arches
    this.box(30, 0.8, 1.5, bx, platformY + 6.9, bz - 7, stone, { group: 'temple', tag: 'decor' });
    this.box(30, 0.8, 1.5, bx, platformY + 6.9, bz + 7, stone, { group: 'temple', tag: 'decor' });

    for (const side of [-1, 1]) {
      const ax = bx + side * 17.5;
      this.box(1.6, 7.2, 1.6, ax, platformY, bz - 4.2, stone, { group: 'temple' });
      this.box(1.6, 7.2, 1.6, ax, platformY, bz + 4.2, stone, { group: 'temple' });
      this.box(1.6, 1.4, 10, ax, platformY + 7.2, bz, stone, { group: 'temple', tag: 'decor' });
    }

    // the back wall of the sanctuary, half collapsed
    for (let i = 0; i < 6; i++) {
      const x = bx - 13 + i * 5.4;
      const h = i === 2 || i === 4 ? rand(0.8, 1.8) : rand(4.5, 6.6);
      this.box(5.4, h, 1.1, x, platformY, bz + 13, stone, { group: 'temple', surface: 'stone' });
    }

    // sanctuary interior: plinths, a fallen statue, crates staged by troops
    this.box(2.4, 1.3, 2.4, bx + 2, platformY, bz + 9, stone, { group: 'temple' });
    this.box(2.4, 1.3, 2.4, bx - 4, platformY, bz + 9, stone, { group: 'temple' });
    const statue = this.box(2.0, 3.4, 1.4, bx + 1, platformY + 1.0, bz + 6.5, stone, { group: 'temple', rotY: 0.4, tag: 'decor' });
    statue.rotation.x = 0.42;

    // outer court walls with firing gaps
    const wallY = bh;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        if (rng() < 0.25) continue;
        const x = bx + side * 22;
        const z = bz - 16 + i * 4.4;
        const h = rand(1.2, 3.2);
        this.box(1.3, h, 4.2, x, wallY, z, stone, { group: 'temple', surface: 'stone' });
      }
    }
    for (let i = 0; i < 9; i++) {
      if (rng() < 0.3) continue;
      this.box(4.6, rand(1.0, 2.6), 1.2, bx - 20 + i * 4.8, wallY, bz + 19, stone, { group: 'temple', surface: 'stone' });
    }

    // rubble field around the temple
    this.templeRubble = { x: bx, z: bz, r: 30 };
    void g;
  }

  /** A ruined village of stilt houses, a well and market stalls. */
  buildVillage() {
    const rng = this.rng;
    const base = CLEARINGS.find((c) => c.label === 'village');
    const wood = this.woodMat(1.6);
    const stone = this.stoneMat(1.1);
    const cloth = this.textures.pbr('cloth', { repeat: 2, surface: 'cloth' });

    const houseSpots = [
      { x: base.x - 10, z: base.z - 8, rot: 0.2, w: 9, d: 7 },
      { x: base.x + 9, z: base.z - 6, rot: -0.5, w: 8, d: 6.5 },
      { x: base.x - 4, z: base.z + 10, rot: 1.1, w: 10, d: 7 },
      { x: base.x + 12, z: base.z + 9, rot: 0.8, w: 7.5, d: 6 },
      { x: base.x - 16, z: base.z + 3, rot: -0.2, w: 7, d: 6 },
      { x: base.x + 3, z: base.z - 16, rot: 1.7, w: 8.5, d: 6.5 },
    ];

    for (const spot of houseSpots) {
      const y = terrainHeight(spot.x, spot.z) - 0.2;
      const rot = spot.rot;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const local = (lx, lz) => ({ x: spot.x + lx * cos - lz * sin, z: spot.z + lx * sin + lz * cos });
      // floor slab (stilts read as a raised platform)
      this.box(spot.w, 0.5, spot.d, spot.x, y, spot.z, wood, { group: 'village', rotY: rot, surface: 'wood' });
      const floorY = y + 0.5;
      const wallH = rand(2.2, 3.0);
      // 4 walls, with a doorway and a blown-out section
      const specs = [
        { lx: 0, lz: -spot.d / 2, w: spot.w, d: 0.35, gap: rng() < 0.6 },
        { lx: 0, lz: spot.d / 2, w: spot.w, d: 0.35, gap: rng() < 0.5 },
        { lx: -spot.w / 2, lz: 0, w: 0.35, d: spot.d, gap: rng() < 0.5 },
        { lx: spot.w / 2, lz: 0, w: 0.35, d: spot.d, gap: rng() < 0.7 },
      ];
      for (const s of specs) {
        const p = local(s.lx, s.lz);
        if (s.gap) {
          // two stubs with a hole between them
          const stub = s.w > s.d ? s.w * 0.32 : s.d * 0.32;
          const off1 = local(s.lx + (s.w > s.d ? -(s.w / 2 - stub / 2) : 0), s.lz + (s.w > s.d ? 0 : -(s.d / 2 - stub / 2)));
          const off2 = local(s.lx + (s.w > s.d ? (s.w / 2 - stub / 2) : 0), s.lz + (s.w > s.d ? 0 : (s.d / 2 - stub / 2)));
          const h = wallH * rand(0.55, 0.95);
          this.box(s.w > s.d ? stub : 0.35, h, s.w > s.d ? 0.35 : stub, off1.x, floorY, off1.z, wood, { group: 'village', rotY: rot, surface: 'wood' });
          this.box(s.w > s.d ? stub : 0.35, h * 0.85, s.w > s.d ? 0.35 : stub, off2.x, floorY, off2.z, wood, { group: 'village', rotY: rot, surface: 'wood' });
        } else {
          this.box(s.w, wallH * rand(0.7, 1.0), s.d, p.x, floorY, p.z, wood, { group: 'village', rotY: rot, surface: 'wood' });
        }
      }
      // partial roof: a few beams and a tarp
      if (rng() < 0.7) {
        const beamY = floorY + wallH;
        for (let i = 0; i < 4; i++) {
          const lx = -spot.w / 2 + (i / 3) * spot.w;
          const p = local(lx, 0);
          this.box(0.25, 0.25, spot.d, p.x, beamY, p.z, wood, { group: 'village', rotY: rot, surface: 'wood', tag: 'decor' });
        }
        const p = local(0, 0);
        this.box(spot.w * 0.8, 0.1, spot.d * 0.8, p.x, beamY + 0.3, p.z, cloth, { group: 'village', rotY: rot, surface: 'cloth', tag: 'decor' });
      }
      // interior dressing
      if (rng() < 0.6) {
        const p = local(rand(-2, 2), rand(-2, 2));
        this.box(0.9, 0.55, 0.6, p.x, floorY, p.z, this.textures.pbr('wood', { repeat: 2 }), { group: 'village', rotY: rng() * TAU, surface: 'wood', tag: 'decor' });
      }
    }

    // village well
    const wy = terrainHeight(base.x, base.z + 2);
    this.cylinder(1.5, 1.6, 1.1, base.x, wy, base.z + 2, stone, { segments: 14, surface: 'stone' });
    this.box(0.25, 2.2, 0.25, base.x - 1.1, wy + 1.1, base.z + 2, wood, { group: 'village', tag: 'decor' });
    this.box(0.25, 2.2, 0.25, base.x + 1.1, wy + 1.1, base.z + 2, wood, { group: 'village', tag: 'decor' });
    this.box(2.6, 0.2, 1.2, base.x, wy + 3.3, base.z + 2, wood, { group: 'village', tag: 'decor' });

    // market stalls
    for (let i = 0; i < 3; i++) {
      const sx = base.x - 6 + i * 7;
      const sz = base.z - 12;
      const y = terrainHeight(sx, sz);
      this.box(3.4, 0.15, 2.0, sx, y + 1.0, sz, wood, { group: 'village', surface: 'wood', tag: 'decor' });
      for (const dx of [-1.6, 1.6]) {
        for (const dz of [-0.9, 0.9]) {
          this.box(0.14, 2.2, 0.14, sx + dx, y, sz + dz, wood, { group: 'village', tag: 'decor' });
        }
      }
      this.box(4.0, 0.08, 2.4, sx, y + 2.3, sz, cloth, { group: 'village', surface: 'cloth', tag: 'decor' });
    }

    // dry-stone wall snake along the village edge (great cover)
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = base.x - 26 + t * 52;
      const z = base.z + 22 + Math.sin(t * 5.4) * 3.2;
      const h = rand(1.0, 1.45);
      const y = terrainHeight(x, z) - 0.15;
      this.box(2.2, h, 0.9, x, y, z, stone, { group: 'village', rotY: Math.sin(t * 5.4) * 0.25, surface: 'stone' });
      if (rng() < 0.35) this.box(1.1, 0.4, 0.8, x + rand(-1, 1), y + h, z + rand(-0.6, 0.6), stone, { group: 'village', rotY: rng(), surface: 'stone', tag: 'decor' });
    }
  }

  /** Crash site at the centre: barricades, a downed helicopter, cover. */
  buildCrossroads() {
    const rng = this.rng;
    const base = CLEARINGS.find((c) => c.label === 'crossroads');
    const cx = base.x;
    const cz = base.z;
    const metal = this.textures.pbr('metalPainted', { repeat: 1.4, surface: 'metal' });
    const rust = this.textures.pbr('rust', { repeat: 1.2, surface: 'metal' });
    const sandbag = this.sandbagMat();

    // downed helicopter, broken in half
    const heliY = terrainHeight(cx + 6, cz - 4);
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.15, 8.4, 12, 1, true),
      metal
    );
    fuselage.rotation.z = Math.PI / 2;
    fuselage.rotation.y = 0.35;
    fuselage.position.set(cx + 6, heliY + 1.5, cz - 4);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    this.group('crossroads').add(fuselage);
    this.addBoxCollider(cx + 6, heliY + 0.2, cz - 4, 8.4, 2.6, 3.0, 'metal', fuselage, { tag: 'cover' });
    this.buildingRects.push({ x: cx + 6, z: cz - 4, w: 8.4, d: 3, rot: 0.35 });
    // tail boom, sheared off
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 6.2, 10), metal);
    tail.rotation.z = Math.PI / 2;
    tail.rotation.y = -0.9;
    tail.position.set(cx + 13, heliY + 0.9, cz + 1.5);
    tail.castShadow = true;
    this.group('crossroads').add(tail);
    this.addBoxCollider(cx + 13, heliY + 0.4, cz + 1.5, 6.2, 0.9, 0.9, 'metal', tail, { tag: 'cover' });
    // bent main rotor
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.09, 0.5), metal);
      blade.position.set(cx + 6 + Math.cos(a) * 4.2, heliY + 3.1, cz - 4 + Math.sin(a) * 4.2);
      blade.rotation.y = -a;
      blade.rotation.z = rand(-0.25, 0.25);
      blade.castShadow = true;
      this.group('crossroads').add(blade);
    }
    // skids
    for (const dz of [-1.4, 1.4]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.14, 0.34), metal);
      skid.position.set(cx + 6, heliY + 0.25, cz - 4 + dz);
      skid.rotation.y = 0.35;
      this.group('crossroads').add(skid);
    }
    this.smokeEmitters.push({ x: cx + 6, y: heliY + 2.2, z: cz - 4, rate: 7, size: 3.4, life: 7, color: 0x2a2a2a });

    // sandbag emplacements guarding the crossing
    const rings = [
      { x: cx - 9, z: cz + 5, r: 4.4, rot: 0.3, opening: 1.2 },
      { x: cx + 1, z: cz + 11, r: 3.6, rot: -0.6, opening: 0.8 },
      { x: cx - 4, z: cz - 9, r: 4.0, rot: 2.2, opening: 1.0 },
    ];
    for (const ring of rings) this.sandbagRing(ring.x, ring.z, ring.r, ring.rot, ring.opening, sandbag);

    // concrete blast barriers + crates near the crash
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.6;
      const x = cx - 2 + Math.cos(a) * 12;
      const z = cz + 4 + Math.sin(a) * 9;
      const y = terrainHeight(x, z);
      if (rng() < 0.5) {
        this.box(2.4, 1.5, 1.0, x, y - 0.1, z, this.concreteMat(1.2), { group: 'crossroads', rotY: a, surface: 'concrete', tag: 'cover' });
      } else {
        this.treeStumpOrCrate(x, z, rust);
      }
    }

    // roadblock of burnt vehicles
    for (let i = 0; i < 2; i++) {
      const x = cx - 14 + i * 5;
      const z = cz - 2 + i * 2.5;
      const y = terrainHeight(x, z);
      this.box(4.2, 1.1, 1.9, x, y + 0.55, z, rust, { group: 'crossroads', rotY: 0.4 + i, surface: 'metal', tag: 'cover' });
      this.box(2.2, 0.9, 1.8, x + 0.2, y + 1.5, z, rust, { group: 'crossroads', rotY: 0.4 + i, surface: 'metal', tag: 'decor' });
      for (const [dx, dz] of [[-1.6, -1], [1.6, -1], [-1.6, 1], [1.6, 1]]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12),
          this.textures.pbr('tire', { repeat: 2, surface: 'rubber' })
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.rotation.y = 0.4 + i;
        wheel.position.set(x + dx, y + 0.42, z + dz);
        wheel.castShadow = true;
        this.group('crossroads').add(wheel);
      }
    }
  }

  treeStumpOrCrate(x, z, mat) {
    const y = terrainHeight(x, z);
    const r = this.rng();
    if (r < 0.5) {
      this.box(1.2, 1.1, 1.2, x, y, z, this.woodMat(2), { group: 'props', rotY: this.rng() * TAU, surface: 'wood', tag: 'cover' });
    } else {
      this.box(0.9, 0.9, 1.6, x, y, z, mat, { group: 'props', rotY: this.rng() * TAU, surface: 'metal', tag: 'cover' });
    }
  }

  /** A horseshoe of sandbags - instant cover that reads well from any angle. */
  sandbagRing(x, z, radius, rot, opening, mat) {
    const bagGeo = new THREE.SphereGeometry(0.5, 8, 6);
    bagGeo.scale(1.15, 0.46, 0.78);
    const rows = 3;
    const count = Math.floor((TAU - opening) * radius / 0.62) * rows;
    const mesh = new THREE.InstancedMesh(bagGeo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const color = new THREE.Color();
    let i = 0;
    for (let row = 0; row < rows; row++) {
      const rr = radius - row * 0.28;
      const step = 0.62 / rr;
      for (let a = opening / 2; a < TAU - opening / 2; a += step) {
        if (i >= count) break;
        const ang = a + rot;
        const bx = x + Math.cos(ang) * rr;
        const bz = z + Math.sin(ang) * rr;
        const by = terrainHeight(bx, bz) + 0.22 + row * 0.36;
        p.set(bx, by, bz);
        q.setFromEuler(new THREE.Euler(row * 0.04, -ang + Math.PI / 2, (row % 2) * 0.06));
        s.set(1, 1, 1);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        const t = 0.82 + this.rng() * 0.32;
        color.setRGB(t * 0.9, t * 0.84, t * 0.68);
        mesh.setColorAt(i, color);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group('crossroads').add(mesh);
    // one cheap collider for the whole ring (a ring of small boxes is overkill)
    const segs = 7;
    for (let k = 0; k < segs; k++) {
      const a0 = rot + opening / 2 + ((TAU - opening) * k) / segs;
      const a1 = rot + opening / 2 + ((TAU - opening) * (k + 1)) / segs;
      const mx = x + Math.cos((a0 + a1) / 2) * radius;
      const mz = z + Math.sin((a0 + a1) / 2) * radius;
      const len = radius * Math.abs(a1 - a0) * 1.15;
      const ang = (a0 + a1) / 2;
      const c = Math.abs(Math.cos(ang));
      const sn = Math.abs(Math.sin(ang));
      const sx = Math.abs(len * sn) + 0.7 * c;
      const sz = Math.abs(len * c) + 0.7 * sn;
      this.addBoxCollider(mx, terrainHeight(mx, mz) - 0.2, mz, Math.max(sx, 0.7), 1.25, Math.max(sz, 0.7), 'sandbag', null, { tag: 'cover' });
    }
    void vlenXZ;
  }

  /** Forward operating bases: tents, watchtowers, crates, HESCO. */
  buildCamps() {
    const rng = this.rng;
    const cloth = this.textures.pbr('cloth', { repeat: 2, surface: 'cloth' });
    const wood = this.woodMat(1.8);
    const metal = this.textures.pbr('metalPainted', { repeat: 1.2, surface: 'metal' });

    for (const base of CLEARINGS.filter((c) => c.label.endsWith('spawn'))) {
      // HESCO perimeter with firing gaps
      const r = base.r + 3;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU;
        if (i % 7 === 3) continue; // gate
        const x = base.x + Math.cos(a) * r;
        const z = base.z + Math.sin(a) * r;
        const y = terrainHeight(x, z);
        this.box(5.2, 1.7, 1.2, x, y - 0.2, z, metal, { group: 'camps', rotY: -a, surface: 'metal', tag: 'cover' });
      }
      // tents
      for (let i = 0; i < 2; i++) {
        const tx = base.x + (i - 0.5) * 6;
        const tz = base.z + (i % 2 === 0 ? -4 : 4);
        const y = terrainHeight(tx, tz);
        this.box(4.6, 0.1, 3.0, tx, y, tz, cloth, { group: 'camps', rotY: 0.2 * i, surface: 'cloth', tag: 'decor' });
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 4.6, 10, 1, false, 0, Math.PI), cloth);
        roof.rotation.z = Math.PI / 2;
        roof.rotation.y = 0.2 * i;
        roof.position.set(tx, y + 0.05, tz);
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.group('camps').add(roof);
        this.addBoxCollider(tx, y, tz, 4.6, 1.9, 3.0, 'cloth', roof, { tag: 'cover' });
      }
      // watchtower
      const wx = base.x + 9;
      const wz = base.z - 7;
      const wy = terrainHeight(wx, wz);
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        this.box(0.3, 4.6, 0.3, wx + dx, wy, wz + dz, wood, { group: 'camps', surface: 'wood' });
      }
      this.box(3.6, 0.25, 3.6, wx, wy + 4.6, wz, wood, { group: 'camps', surface: 'wood', tag: 'cover' });
      for (const [dx, dz, sx2, sz2] of [[0, -1.75, 3.6, 0.2], [0, 1.75, 3.6, 0.2], [-1.75, 0, 0.2, 3.6], [1.75, 0, 0.2, 3.6]]) {
        this.box(sx2, 1.0, sz2, wx + dx, wy + 4.85, wz + dz, wood, { group: 'camps', surface: 'wood', tag: 'decor' });
      }
      // roof
      const troof = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.2, 4), metal);
      troof.position.set(wx, wy + 6.3, wz);
      troof.rotation.y = Math.PI / 4;
      troof.castShadow = true;
      this.group('camps').add(troof);
      // ladder
      for (let i = 0; i < 10; i++) {
        this.box(1.0, 0.08, 0.12, wx - 1.9, wy + 0.4 + i * 0.46, wz, wood, { group: 'camps', tag: 'decor', collide: false });
      }
      this.buildingRects.push({ x: wx, z: wz, w: 3.6, d: 3.6, rot: 0 });
      // crates and barrels
      for (let i = 0; i < 8; i++) {
        const cx = base.x + rand(-r * 0.7, r * 0.7);
        const cz = base.z + rand(-r * 0.7, r * 0.7);
        const y = terrainHeight(cx, cz);
        if (rng() < 0.5) {
          this.box(1.0, 0.95, 1.0, cx, y, cz, this.woodMat(3), { group: 'camps', rotY: rng() * TAU, surface: 'wood', tag: 'cover' });
        } else {
          this.cylinder(0.42, 0.42, 1.0, cx, y, cz, this.textures.pbr('rust', { repeat: 1.4 }), { segments: 12, surface: 'metal', tag: 'cover' });
        }
      }
      this.smokeEmitters.push({ x: base.x + 12, y: terrainHeight(base.x + 12, base.z + 6) + 1, z: base.z + 6, rate: 2.2, size: 1.8, life: 8, color: 0x9a9a94 });
    }
  }

  buildBridge() {
    const p = { x: -56, z: 36 };
    const a = { x: -70, z: 48 };
    const b = { x: -42, z: 24 };
    const dirX = b.x - a.x;
    const dirZ = b.z - a.z;
    const len = Math.hypot(dirX, dirZ);
    const ang = Math.atan2(dirZ, dirX);
    const wood = this.woodMat(2);
    const stoneSt = this.stoneMat(1.2);
    const y = MAP.waterLevel + 1.6;
    // piers
    for (const t of [0.28, 0.72]) {
      const px = lerp(a.x, b.x, t);
      const pz = lerp(a.z, b.z, t);
      this.cylinder(0.9, 1.0, y - (MAP.waterLevel - 2.2), px, MAP.waterLevel - 2.2, pz, stoneSt, { segments: 12, surface: 'stone' });
    }
    // deck
    this.box(len, 0.3, 4.2, p.x, y, p.z, wood, { group: 'bridge', rotY: ang, surface: 'wood', tag: 'cover' });
    // planks detail
    const planks = Math.floor(len / 0.55);
    for (let i = 0; i < planks; i++) {
      const t = i / (planks - 1);
      const px = lerp(a.x, b.x, t);
      const pz = lerp(a.z, b.z, t);
      this.box(0.5, 0.1, 4.3, px, y + 0.3, pz, wood, { group: 'bridge', rotY: ang, surface: 'wood', tag: 'decor', collide: false });
    }
    // rails
    for (const side of [-1, 1]) {
      const ox = Math.cos(ang + Math.PI / 2) * 2.0 * side;
      const oz = Math.sin(ang + Math.PI / 2) * 2.0 * side;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const px = lerp(a.x, b.x, t) + ox;
        const pz = lerp(a.z, b.z, t) + oz;
        this.box(0.14, 1.1, 0.14, px, y + 0.3, pz, wood, { group: 'bridge', tag: 'decor', collide: false });
      }
      this.box(len, 0.1, 0.1, p.x + ox, y + 1.35, p.z + oz, wood, { group: 'bridge', rotY: ang, tag: 'decor', collide: false });
    }
    // rope sag for looks
    this.smokeEmitters.length = this.smokeEmitters.length;
  }

  buildRocks() {
    const rng = this.rng;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n = 0.68 + noise2(x * 2.1 + 4, z * 2.1 + y * 1.7, 91) * 0.62;
      pos.setXYZ(i, x * n, y * n * 0.82, z * n);
    }
    geo.computeVertexNormals();
    const mat = this.textures.pbr('rock', { repeat: 1, surface: 'stone' });
    const count = this.quality === 'low' ? 90 : 170;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const color = new THREE.Color();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 30) {
      const x = rand(-MAP.half, MAP.half);
      const z = rand(-MAP.half, MAP.half);
      const dPath = pathDistance(x, z);
      if (dPath < 2.6) continue;
      if (riverDistance(x, z) < RIVER_WIDTH * 0.8) continue;
      if (CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 0.65)) continue;
      const y = terrainHeight(x, z);
      const scale = rand(0.5, 2.4) * (this.rng() < 0.12 ? 1.9 : 1);
      p.set(x, y - scale * 0.25, z);
      e.set(rand(-0.2, 0.2), rng() * TAU, rand(-0.2, 0.2));
      q.setFromEuler(e);
      s.set(scale * rand(0.8, 1.3), scale * rand(0.6, 1.0), scale * rand(0.8, 1.3));
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      const t = 0.8 + rng() * 0.4;
      color.setRGB(t, t * 0.99, t * 0.95);
      mesh.setColorAt(placed, color);
      if (scale > 1.1) {
        this.addCylCollider(x, z, scale * 0.75, y - 1, y + scale * 0.6, 'stone', null, 'cover');
      }
      placed++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group('rocks').add(mesh);
    this.rockMesh = mesh;
  }

  /** Jungle: instanced trunks + leaf card canopies, palms, banana plants. */
  buildTrees() {
    const rng = this.rng;
    const trunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 11, 7, 4);
    // bend the trunk a little so they don't look like poles
    {
      const pos = trunkGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y + 5.5) / 11;
        pos.setX(i, pos.getX(i) + Math.sin(t * 2.1) * 0.9 * t);
        pos.setZ(i, pos.getZ(i) + Math.cos(t * 1.6) * 0.7 * t);
      }
      trunkGeo.computeVertexNormals();
      trunkGeo.translate(0, 5.5, 0);
    }
    const barkMat = this.textures.pbr('bark', { repeat: 2.4, surface: 'bark' });
    const leafMat = this.textures.pbr('groundDetail', { repeat: 1 });
    // leaf cards use an alpha-tested sprite so shadows dapple the ground
    const cardMat = new THREE.MeshStandardMaterial({
      map: this.textures.sprite('leafCluster'),
      transparent: false,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.86,
      metalness: 0,
      color: new THREE.Color(0xa8c98a),
    });
    cardMat.userData.surface = 'leaf';
    applyWind(cardMat, 0.16, 0.14);
    this.windMaterials.push(cardMat);

    const candidates = this.quality === 'low' ? 150 : this.quality === 'medium' ? 260 : 360;
    const trees = [];
    const minDist = 4.2;
    let guard = 0;
    while (trees.length < candidates && guard++ < candidates * 40) {
      // bias placement toward the rim (dense jungle wall) and away from the paths
      const a = rng() * TAU;
      const bias = Math.pow(rng(), 0.55);
      const r = lerp(46, MAP.visualHalf * 0.55, bias);
      const x = Math.cos(a) * r + rand(-8, 8);
      const z = Math.sin(a) * r + rand(-8, 8);
      if (Math.hypot(x, z) < 40) continue;
      if (pathDistance(x, z) < 3.6) continue;
      if (riverDistance(x, z) < RIVER_WIDTH * 0.75) continue;
      if (CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 0.8)) continue;
      let ok = true;
      for (const t of trees) {
        if ((t.x - x) ** 2 + (t.z - z) ** 2 < minDist * minDist) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      trees.push({ x, z, scale: rand(0.75, 1.65), lean: rand(0, TAU), r: rand(0.3, 0.62) });
    }

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    trunkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const color = new THREE.Color();

    const cardsPerTree = this.quality === 'low' ? 3 : 5;
    const cards = [];
    const cardGeo = new THREE.PlaneGeometry(6.2, 6.2, 1, 1);

    trees.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z) - 0.4;
      p.set(t.x, y, t.z);
      e.set(rand(-0.06, 0.06), t.lean, rand(-0.06, 0.06));
      q.setFromEuler(e);
      s.set(t.scale * 1.0, t.scale * rand(0.9, 1.25), t.scale * 1.0);
      m.compose(p, q, s);
      trunkMesh.setMatrixAt(i, m);
      const shade = 0.8 + rng() * 0.4;
      color.setRGB(shade, shade * 0.98, shade * 0.92);
      trunkMesh.setColorAt(i, color);
      const topY = y + 11 * s.y;
      for (let c = 0; c < cardsPerTree; c++) {
        const ang = (c / cardsPerTree) * TAU + rng() * 1.2;
        const rad = rand(1.2, 3.6) * t.scale;
        cards.push({
          x: t.x + Math.cos(ang) * rad,
          y: topY - rand(0.6, 3.4) * t.scale,
          z: t.z + Math.sin(ang) * rad,
          rot: ang + Math.PI / 2 + rand(-0.5, 0.5),
          tilt: rand(-0.5, 0.1),
          scale: t.scale * rand(0.85, 1.5),
        });
      }
      if (Math.hypot(t.x, t.z) < MAP.half + 8) {
        this.addCylCollider(t.x, t.z, 0.55 * t.scale, y, y + 11 * s.y, 'bark', null, 'tree');
        this.treeInstances.push({ x: t.x, z: t.z, r: 0.55 * t.scale, h: 11 * s.y, y });
      }
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
    this.group('trees').add(trunkMesh);

    const cardMesh = new THREE.InstancedMesh(cardGeo, cardMat, cards.length);
    cardMesh.castShadow = true;
    cardMesh.receiveShadow = true;
    cardMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    cards.forEach((c, i) => {
      p.set(c.x, c.y, c.z);
      e.set(c.tilt, c.rot, rand(-0.3, 0.3));
      q.setFromEuler(e);
      s.set(c.scale, c.scale, c.scale);
      m.compose(p, q, s);
      cardMesh.setMatrixAt(i, m);
      const shade = 0.72 + rng() * 0.5;
      color.setRGB(shade * 0.95, shade, shade * 0.82);
      cardMesh.setColorAt(i, color);
    });
    cardMesh.instanceMatrix.needsUpdate = true;
    if (cardMesh.instanceColor) cardMesh.instanceColor.needsUpdate = true;
    this.group('trees').add(cardMesh);

    // distant silhouette ring so the horizon is never empty
    const farGeo = new THREE.PlaneGeometry(11, 13);
    const farMat = cardMat.clone();
    farMat.userData.surface = 'leaf';
    const farCount = 220;
    const farMesh = new THREE.InstancedMesh(farGeo, farMat, farCount);
    farMesh.castShadow = false;
    farMesh.receiveShadow = false;
    for (let i = 0; i < farCount; i++) {
      const a = (i / farCount) * TAU + rng() * 0.05;
      const r = rand(MAP.visualHalf * 0.52, MAP.visualHalf * 0.86);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = terrainHeight(x, z) + rand(4, 12);
      p.set(x, y, z);
      e.set(rand(-0.2, 0.2), -a + Math.PI / 2, rand(-0.2, 0.2));
      q.setFromEuler(e);
      const sc = rand(1.4, 2.6);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      farMesh.setMatrixAt(i, m);
      const shade = 0.6 + rng() * 0.3;
      color.setRGB(shade * 0.9, shade, shade * 0.85);
      farMesh.setColorAt(i, color);
    }
    farMesh.instanceMatrix.needsUpdate = true;
    if (farMesh.instanceColor) farMesh.instanceColor.needsUpdate = true;
    this.group('trees').add(farMesh);

    // palms
    const palmCount = this.quality === 'low' ? 18 : 34;
    const palmGeo = new THREE.CylinderGeometry(0.16, 0.3, 9, 7, 3);
    {
      const pos = palmGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y + 4.5) / 9;
        pos.setX(i, pos.getX(i) + Math.sin(t * 1.5) * 1.6 * t * t);
      }
      palmGeo.computeVertexNormals();
      palmGeo.translate(0, 4.5, 0);
    }
    const palmMesh = new THREE.InstancedMesh(palmGeo, barkMat, palmCount);
    palmMesh.castShadow = true;
    const frondGeo = new THREE.PlaneGeometry(1.1, 5.2);
    const frondMat = cardMat.clone();
    const frondMesh = new THREE.InstancedMesh(frondGeo, frondMat, palmCount * 7);
    frondMesh.castShadow = true;
    let frondIndex = 0;
    for (let i = 0; i < palmCount; i++) {
      let x = 0;
      let z = 0;
      let tries = 0;
      do {
        const a = rng() * TAU;
        const r = rand(30, MAP.half + 20);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        tries++;
      } while (tries < 40 && (pathDistance(x, z) < 3 || riverDistance(x, z) < RIVER_WIDTH));
      const y = terrainHeight(x, z) - 0.3;
      p.set(x, y, z);
      e.set(0, rng() * TAU, 0);
      q.setFromEuler(e);
      const sc = rand(0.8, 1.3);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      palmMesh.setMatrixAt(i, m);
      for (let f = 0; f < 7; f++) {
        const ang = (f / 7) * TAU + rng() * 0.4;
        p.set(x + Math.cos(ang) * 1.5 * sc, y + 8.6 * sc, z + Math.sin(ang) * 1.5 * sc);
        e.set(rand(-1.35, -0.95), ang, rand(-0.3, 0.3));
        q.setFromEuler(e);
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        frondMesh.setMatrixAt(frondIndex++, m);
      }
      if (Math.hypot(x, z) < MAP.half) this.addCylCollider(x, z, 0.4, y, y + 9 * sc, 'bark', null, 'tree');
    }
    palmMesh.instanceMatrix.needsUpdate = true;
    frondMesh.instanceMatrix.needsUpdate = true;
    this.group('trees').add(palmMesh);
    this.group('trees').add(frondMesh);

    // hanging vines on a few big trees near the temples
    const vineMat = new THREE.MeshBasicMaterial({ color: 0x3d5a30, side: THREE.DoubleSide });
    const vineGeo = new THREE.PlaneGeometry(0.25, 5);
    const vineCount = 120;
    const vines = new THREE.InstancedMesh(vineGeo, vineMat, vineCount);
    for (let i = 0; i < vineCount; i++) {
      const t = trees[Math.floor(rng() * trees.length)] || { x: 0, z: 0, scale: 1 };
      const ang = rng() * TAU;
      const rad = rand(1.0, 3.0) * t.scale;
      const x = t.x + Math.cos(ang) * rad;
      const z = t.z + Math.sin(ang) * rad;
      const yTop = terrainHeight(t.x, t.z) + rand(6, 10) * t.scale;
      p.set(x, yTop - 2.5, z);
      e.set(0, rng() * TAU, rand(-0.15, 0.15));
      q.setFromEuler(e);
      s.set(1, rand(0.7, 1.6), 1);
      m.compose(p, q, s);
      vines.setMatrixAt(i, m);
    }
    vines.instanceMatrix.needsUpdate = true;
    this.group('trees').add(vines);
    void leafMat;
    void geomKey;
  }

  /** Grass, ferns, bushes: the ground cover that makes it read as jungle. */
  buildUndergrowth() {
    const rng = this.rng;
    const quality = this.quality;
    const grassCount = quality === 'low' ? 1800 : quality === 'medium' ? 4200 : 7200;
    const grassGeo = (() => {
      const g1 = new THREE.PlaneGeometry(1.0, 1.0);
      const g2 = g1.clone();
      g2.rotateY(Math.PI / 2);
      const merged = mergeGeometries([g1, g2]);
      merged.translate(0, 0.5, 0);
      return merged;
    })();
    const grassMat = new THREE.MeshStandardMaterial({
      map: this.textures.sprite('grassTuft'),
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      color: new THREE.Color(0x9db86a),
    });
    grassMat.userData.surface = 'grass';
    applyWind(grassMat, 0.22, 0.9);
    this.windMaterials.push(grassMat);
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    grass.castShadow = false;
    grass.receiveShadow = true;
    grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const color = new THREE.Color();
    let placed = 0;
    let guard = 0;
    while (placed < grassCount && guard++ < grassCount * 12) {
      const x = rand(-MAP.half - 20, MAP.half + 20);
      const z = rand(-MAP.half - 20, MAP.half + 20);
      if (riverDistance(x, z) < RIVER_WIDTH * 0.85) continue;
      if (pathDistance(x, z) < 2.2) continue;
      const d = noise2(x * 0.08, z * 0.08, 33);
      if (d < 0.32) continue;
      const y = terrainHeight(x, z);
      const n = terrainNormal(x, z, new THREE.Vector3());
      if (n.y < 0.72) continue;
      const scale = rand(0.6, 1.5) * (1 + d);
      p.set(x, y - 0.05, z);
      e.set(0, rng() * TAU, rand(-0.08, 0.08));
      q.setFromEuler(e);
      s.set(scale, scale * rand(0.8, 1.4), scale);
      m.compose(p, q, s);
      grass.setMatrixAt(placed, m);
      const t = 0.7 + rng() * 0.55;
      color.setRGB(t, t * 1.06, t * 0.78);
      grass.setColorAt(placed, color);
      placed++;
    }
    grass.count = placed;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.group('foliage').add(grass);

    // ferns and bushes near cover, water and ruins
    const fernGeo = new THREE.PlaneGeometry(2.4, 2.4);
    fernGeo.translate(0, 1.0, 0);
    const fernMat = new THREE.MeshStandardMaterial({
      map: this.textures.sprite('fern'),
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0,
      color: new THREE.Color(0x8fb06a),
    });
    fernMat.userData.surface = 'leaf';
    applyWind(fernMat, 0.1, 0.5);
    this.windMaterials.push(fernMat);
    const fernCount = quality === 'low' ? 260 : 620;
    const ferns = new THREE.InstancedMesh(fernGeo, fernMat, fernCount);
    ferns.castShadow = true;
    ferns.receiveShadow = true;
    placed = 0;
    guard = 0;
    while (placed < fernCount && guard++ < fernCount * 20) {
      const x = rand(-MAP.half - 14, MAP.half + 14);
      const z = rand(-MAP.half - 14, MAP.half + 14);
      if (pathDistance(x, z) < 2.6) continue;
      if (riverDistance(x, z) < RIVER_WIDTH * 0.6) continue;
      if (noise2(x * 0.05, z * 0.05, 44) < 0.4 && rng() < 0.6) continue;
      const y = terrainHeight(x, z);
      const scale = rand(0.7, 1.5);
      p.set(x, y - 0.1, z);
      e.set(0, rng() * TAU, rand(-0.06, 0.06));
      q.setFromEuler(e);
      s.set(scale, scale * rand(0.85, 1.3), scale);
      m.compose(p, q, s);
      ferns.setMatrixAt(placed, m);
      const t = 0.72 + rng() * 0.5;
      color.setRGB(t, t * 1.05, t * 0.8);
      ferns.setColorAt(placed, color);
      placed++;
    }
    ferns.count = placed;
    ferns.instanceMatrix.needsUpdate = true;
    if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
    this.group('foliage').add(ferns);

    const bushGeo = (() => {
      const g1 = new THREE.PlaneGeometry(3.0, 2.6);
      const g2 = g1.clone();
      g2.rotateY(Math.PI / 2);
      const merged = mergeGeometries([g1, g2]);
      merged.translate(0, 1.1, 0);
      return merged;
    })();
    const bushMat = new THREE.MeshStandardMaterial({
      map: this.textures.sprite('bush'),
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      color: new THREE.Color(0x7d9c5a),
    });
    bushMat.userData.surface = 'leaf';
    applyWind(bushMat, 0.12, 0.6);
    this.windMaterials.push(bushMat);
    const bushCount = quality === 'low' ? 150 : 340;
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
    bushes.castShadow = true;
    bushes.receiveShadow = true;
    placed = 0;
    guard = 0;
    while (placed < bushCount && guard++ < bushCount * 24) {
      const x = rand(-MAP.half, MAP.half);
      const z = rand(-MAP.half, MAP.half);
      if (pathDistance(x, z) < 3.0) continue;
      if (riverDistance(x, z) < RIVER_WIDTH * 0.7) continue;
      if (CLEARINGS.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 0.45)) continue;
      const y = terrainHeight(x, z);
      const scale = rand(0.7, 1.6);
      p.set(x, y - 0.15, z);
      e.set(0, rng() * TAU, 0);
      q.setFromEuler(e);
      s.set(scale, scale * rand(0.8, 1.2), scale);
      m.compose(p, q, s);
      bushes.setMatrixAt(placed, m);
      const t = 0.7 + rng() * 0.55;
      color.setRGB(t, t * 1.04, t * 0.8);
      bushes.setColorAt(placed, color);
      placed++;
    }
    bushes.count = placed;
    bushes.instanceMatrix.needsUpdate = true;
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    this.group('foliage').add(bushes);
  }

  buildProps() {
    const rng = this.rng;
    const details = [
      { x: 10, z: -30, n: 6 },
      { x: -30, z: -8, n: 5 },
      { x: 30, z: 22, n: 5 },
      { x: -18, z: 30, n: 4 },
      { x: 44, z: -20, n: 5 },
    ];
    for (const spot of details) {
      for (let i = 0; i < spot.n; i++) {
        const x = spot.x + rand(-6, 6);
        const z = spot.z + rand(-6, 6);
        if (pathDistance(x, z) < 2.4) continue;
        const y = terrainHeight(x, z);
        const r = rng();
        if (r < 0.34) {
          this.box(1.05, 1.0, 1.05, x, y, z, this.woodMat(3), { group: 'props', rotY: rng() * TAU, surface: 'wood', tag: 'cover' });
        } else if (r < 0.62) {
          const barrel = this.cylinder(0.42, 0.42, 1.05, x, y, z, this.textures.pbr('rust', { repeat: 1.3 }), { segments: 12, surface: 'metal', tag: 'cover' });
          barrel.rotation.z = rng() < 0.3 ? rand(-0.2, 0.2) : 0;
        } else if (r < 0.8) {
          this.box(0.75, 0.45, 0.5, x, y, z, this.textures.pbr('metalPainted', { repeat: 2 }), { group: 'props', rotY: rng() * TAU, surface: 'metal', tag: 'cover' });
        } else {
          const tire = this.cylinder(0.55, 0.55, 0.34, x, y, z, this.textures.pbr('tire', { repeat: 2 }), { segments: 12, surface: 'rubber', tag: 'cover' });
          tire.rotation.z = Math.PI / 2;
        }
      }
    }

    // ammunition resupply crates at fixed spots (gameplay hooks for later)
    this.resupplyPoints = [
      { x: -86, z: 78, y: terrainHeight(-86, 78) },
      { x: 88, z: -80, y: terrainHeight(88, -80) },
      { x: 2, z: -2, y: terrainHeight(2, -2) },
    ];
    for (const rp of this.resupplyPoints) {
      this.box(2.2, 0.9, 1.2, rp.x + 4, rp.y, rp.z - 4, this.textures.pbr('metalPainted', { repeat: 2 }), {
        group: 'props', rotY: 0.3, surface: 'metal', tag: 'cover',
      });
    }
    void rng;
  }

  buildBounds() {
    const B = MAP.half + BOUNDS_PADDING;
    const h = 30;
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const walls = [
      { x: 0, z: -B, sx: B * 2, sz: 2 },
      { x: 0, z: B, sx: B * 2, sz: 2 },
      { x: -B, z: 0, sx: 2, sz: B * 2 },
      { x: B, z: 0, sx: 2, sz: B * 2 },
    ];
    for (const w of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.sx, h, w.sz), mat);
      m.position.set(w.x, h / 2 - 4, w.z);
      this.group('bounds').add(m);
      this.addBoxCollider(w.x, -6, w.z, w.sx, h, w.sz, 'wall', m, { tag: 'bounds' });
    }
  }

  /* ---------------- queries ---------------- */

  /** Highest walkable support at (x,z) considering boxes within step range. */
  supportHeight(x, z, feetY) {
    let best = terrainHeight(x, z);
    for (const col of this.colliders) {
      if (col.type !== 'box') continue;
      const b = col.box;
      if (b.max.y > feetY + 0.62) continue;
      if (b.max.y < best) continue;
      if (x < b.min.x - 0.25 || x > b.max.x + 0.25) continue;
      if (z < b.min.z - 0.25 || z > b.max.z + 0.25) continue;
      best = Math.max(best, b.max.y);
    }
    return best;
  }

  waterDepth(x, z) {
    const h = terrainHeight(x, z);
    return Math.max(0, MAP.waterLevel + 0.35 - h);
  }

  /** Resolve a capsule-ish player volume against the world, moving `pos`. */
  resolveCollisions(pos, radius, height) {
    let grounded = false;
    const feet = pos.y;
    const head = pos.y + height;
    for (const col of this.colliders) {
      if (col.type === 'box') {
        const b = col.box;
        if (head < b.min.y || feet > b.max.y - 0.02) continue;
        const cx = clamp(pos.x, b.min.x, b.max.x);
        const cz = clamp(pos.z, b.min.z, b.max.z);
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius) continue;
        if (feet >= b.max.y - 0.2) {
          grounded = true;
          continue;
        }
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          const dxMin = pos.x - b.min.x;
          const dxMax = b.max.x - pos.x;
          const dzMin = pos.z - b.min.z;
          const dzMax = b.max.z - pos.z;
          const mn = Math.min(dxMin, dxMax, dzMin, dzMax);
          if (mn === dxMin) pos.x = b.min.x - radius;
          else if (mn === dxMax) pos.x = b.max.x + radius;
          else if (mn === dzMin) pos.z = b.min.z - radius;
          else pos.z = b.max.z + radius;
        }
      } else if (col.type === 'cyl') {
        if (head < col.y0 || feet > col.y1) continue;
        const dx = pos.x - col.x;
        const dz = pos.z - col.z;
        const rr = col.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const push = rr - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }
    return grounded;
  }

  /** Ray vs terrain via marching + bisection. Returns distance or -1. */
  _rayTerrain(ox, oy, oz, dx, dy, dz, maxDist) {
    let t = 0;
    let step = 0.9;
    let prev = oy - terrainHeight(ox, oz);
    if (prev < 0) prev = 0.0001;
    while (t < maxDist) {
      const nt = Math.min(maxDist, t + step);
      const nx = ox + dx * nt;
      const ny = oy + dy * nt;
      const nz = oz + dz * nt;
      const d = ny - terrainHeight(nx, nz);
      if (d <= 0) {
        // bisect between t and nt
        let lo = t;
        let hi = nt;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          const my = oy + dy * mid;
          const md = my - terrainHeight(ox + dx * mid, oz + dz * mid);
          if (md <= 0) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = d;
      t = nt;
      // adaptive step: bigger when far above the ground
      step = clamp(0.5 + prev * 0.25, 0.5, 3.0);
    }
    return -1;
  }

  /**
   * Full ray query used by bullets, AI vision and interactions.
   * returns { hit, point:{x,y,z}, normal, distance, surface, object, penetration }
   */
  raycast(origin, dir, maxDist = 200, opts = {}) {
    let bestT = maxDist;
    let hitSurface = null;
    let hitObject = null;
    let hitNormal = null;

    if (opts.terrain !== false) {
      const t = this._rayTerrain(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
      if (t >= 0 && t < bestT) {
        bestT = t;
        hitSurface = 'dirt';
        hitObject = this.terrain;
        const px = origin.x + dir.x * t;
        const pz = origin.z + dir.z * t;
        const n = terrainNormal(px, pz, new THREE.Vector3());
        hitNormal = { x: n.x, y: n.y, z: n.z };
        if (this.waterDepth(px, pz) > 0.15) hitSurface = 'water';
      }
    }

    if (opts.colliders !== false) {
      for (const col of this.colliders) {
        if (col.tag === 'bounds' && opts.bounds === false) continue;
        let t = -1;
        let n = null;
        if (col.type === 'box') {
          t = this._rayBox(origin, dir, col.box, (nx, ny, nz) => {
            n = { x: nx, y: ny, z: nz };
          });
        } else {
          t = this._rayCyl(origin, dir, col);
          if (t >= 0) {
            const px = origin.x + dir.x * t;
            const pz = origin.z + dir.z * t;
            const dx = px - col.x;
            const dz = pz - col.z;
            const l = Math.hypot(dx, dz) || 1;
            n = { x: dx / l, y: 0, z: dz / l };
          }
        }
        if (t >= 0 && t < bestT) {
          bestT = t;
          hitSurface = col.surface;
          hitObject = col.ref || col;
          hitNormal = n || { x: -dir.x, y: -dir.y, z: -dir.z };
        }
      }
    }

    if (!hitSurface) return null;
    return {
      hit: true,
      distance: bestT,
      point: { x: origin.x + dir.x * bestT, y: origin.y + dir.y * bestT, z: origin.z + dir.z * bestT },
      normal: hitNormal,
      surface: hitSurface,
      object: hitObject,
    };
  }

  _rayBox(o, d, box, normalOut) {
    let tmin = 0;
    let tmax = Infinity;
    let axis = 0;
    let sign = 1;
    const oArr = [o.x, o.y, o.z];
    const dArr = [d.x, d.y, d.z];
    const mn = [box.min.x, box.min.y, box.min.z];
    const mx = [box.max.x, box.max.y, box.max.z];
    for (let i = 0; i < 3; i++) {
      const inv = 1 / (dArr[i] || 1e-9);
      let t1 = (mn[i] - oArr[i]) * inv;
      let t2 = (mx[i] - oArr[i]) * inv;
      let s = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        s = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = i;
        sign = s;
      }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    if (tmin < 0) return -1;
    if (normalOut) {
      if (axis === 0) normalOut(sign, 0, 0);
      else if (axis === 1) normalOut(0, sign, 0);
      else normalOut(0, 0, sign);
    }
    return tmin;
  }

  _rayCyl(o, d, col) {
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return -1;
    const fx = o.x - col.x;
    const fz = o.z - col.z;
    const b = 2 * (fx * d.x + fz * d.z);
    const c = fx * fx + fz * fz - col.r * col.r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a);
    if (t < 0) return -1;
    const y = o.y + d.y * t;
    if (y < col.y0 || y > col.y1) return -1;
    return t;
  }

  lineOfSight(a, b, opts = {}) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.001) return true;
    const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
    const hit = this.raycast(a, dir, dist - (opts.margin ?? 0.25), {
      terrain: opts.terrain !== false,
      colliders: opts.colliders !== false,
    });
    if (!hit) return true;
    // thin props (grass, cloth) don't block sight
    if (opts.through && opts.through.includes(hit.surface)) return true;
    return false;
  }

  /* ---------------- navigation ---------------- */

  buildNav() {
    const cell = 1.25;
    const size = Math.ceil((MAP.half * 2) / cell);
    const originX = -MAP.half;
    const originZ = -MAP.half;
    const walkable = new Uint8Array(size * size);
    const slopeLimit = 0.62; // cos of ~52 degrees
    for (let gz = 0; gz < size; gz++) {
      for (let gx = 0; gx < size; gx++) {
        const x = originX + (gx + 0.5) * cell;
        const z = originZ + (gz + 0.5) * cell;
        const h = terrainHeight(x, z);
        if (this.waterDepth(x, z) > 0.8) continue;
        const n = terrainNormal(x, z, new THREE.Vector3());
        if (n.y < slopeLimit) continue;
        // blocked by colliders?
        let blocked = false;
        for (const col of this.colliders) {
          if (col.tag === 'tree') {
            if ((x - col.x) ** 2 + (z - col.z) ** 2 < (col.r + 0.5) ** 2) {
              blocked = true;
              break;
            }
            continue;
          }
          if (col.type === 'box') {
            const b = col.box;
            if (b.max.y - h < 0.55) continue; // low enough to walk over
            if (x > b.min.x - 0.42 && x < b.max.x + 0.42 && z > b.min.z - 0.42 && z < b.max.z + 0.42) {
              blocked = true;
              break;
            }
          } else if ((x - col.x) ** 2 + (z - col.z) ** 2 < (col.r + 0.42) ** 2 && col.y1 - h > 0.55) {
            blocked = true;
            break;
          }
        }
        if (!blocked) walkable[gz * size + gx] = 1;
      }
    }

    const isWalkable = (x, z) => {
      const gx = Math.floor((x - originX) / cell);
      const gz = Math.floor((z - originZ) / cell);
      if (gx < 0 || gz < 0 || gx >= size || gz >= size) return false;
      return walkable[gz * size + gx] === 1;
    };

    const nearestWalkable = (x, z, maxRadius = 12) => {
      if (isWalkable(x, z)) return { x, z };
      for (let r = cell; r < maxRadius; r += cell) {
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * TAU;
          const nx = x + Math.cos(ang) * r;
          const nz = z + Math.sin(ang) * r;
          if (isWalkable(nx, nz)) return { x: nx, z: nz };
        }
      }
      return null;
    };

    this.nav = {
      cell,
      size,
      originX,
      originZ,
      walkable,
      isWalkable,
      nearestWalkable,
      findPath: (ax, az, bx, bz, limit = 6000) => this._astar(ax, az, bx, bz, limit),
      smoothPath: (path) => this._smoothPath(path),
      randomWalkable: (rng = Math.random, nearX = 0, nearZ = 0, radius = MAP.half) => {
        for (let i = 0; i < 400; i++) {
          const a = rng() * TAU;
          const r = Math.sqrt(rng()) * radius;
          const x = nearX + Math.cos(a) * r;
          const z = nearZ + Math.sin(a) * r;
          if (isWalkable(x, z)) return { x, z };
        }
        return null;
      },
    };

    // cover points: walkable cells hugging a collider, with a crouch-friendly height
    const covers = [];
    for (const col of this.colliders) {
      if (!col.tag || col.tag === 'bounds' || col.tag === 'decor') continue;
      const px = col.type === 'box' ? (col.box.min.x + col.box.max.x) / 2 : col.x;
      const pz = col.type === 'box' ? (col.box.min.z + col.box.max.z) / 2 : col.z;
      const extent = col.type === 'box'
        ? Math.max(col.box.max.x - col.box.min.x, col.box.max.z - col.box.min.z) / 2 + 1.0
        : col.r + 1.0;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.3;
        const x = px + Math.cos(a) * extent;
        const z = pz + Math.sin(a) * extent;
        if (!isWalkable(x, z)) continue;
        covers.push({ x, z, y: terrainHeight(x, z), against: { x: px, z: pz }, radius: extent });
      }
    }
    this.coverPoints = covers;
    this.navReady = true;
  }

  _astar(ax, az, bx, bz, limit) {
    const nav = this.nav;
    const { cell, size, originX, originZ } = nav;
    const toIdx = (x, z) => {
      const gx = clamp(Math.floor((x - originX) / cell), 0, size - 1);
      const gz = clamp(Math.floor((z - originZ) / cell), 0, size - 1);
      return gz * size + gx;
    };
    const start = nav.nearestWalkable(ax, az, 14);
    const goal = nav.nearestWalkable(bx, bz, 20);
    if (!start || !goal) return null;
    const s = toIdx(start.x, start.z);
    const g = toIdx(goal.x, goal.z);
    if (s === g) return [{ x: goal.x, z: goal.z }];

    const total = size * size;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const cameFrom = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const heap = new MinHeap();
    const gx = (i) => i % size;
    const gz = (i) => (i / size) | 0;
    const h = (i) => {
      const dx = gx(i) - gx(g);
      const dz = gz(i) - gz(g);
      return Math.hypot(dx, dz) * 1.02;
    };
    gScore[s] = 0;
    fScore[s] = h(s);
    heap.push(s, fScore[s]);
    let expanded = 0;
    const neighbours = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    while (heap.size && expanded < limit) {
      const current = heap.pop();
      if (current === g) break;
      if (closed[current]) continue;
      closed[current] = 1;
      expanded++;
      const cgx = gx(current);
      const cgz = gz(current);
      for (const [dx, dz, cost] of neighbours) {
        const nx = cgx + dx;
        const nz = cgz + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const ni = nz * size + nx;
        if (!nav.walkable[ni] || closed[ni]) continue;
        // no corner cutting
        if (dx !== 0 && dz !== 0) {
          if (!nav.walkable[cgz * size + nx] || !nav.walkable[nz * size + cgx]) continue;
        }
        const tentative = gScore[current] + cost;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          fScore[ni] = tentative + h(ni);
          cameFrom[ni] = current;
          heap.push(ni, fScore[ni]);
        }
      }
    }
    if (cameFrom[g] === -1) return null;
    const path = [];
    let node = g;
    while (node !== -1 && path.length < 4096) {
      path.push({ x: originX + (gx(node) + 0.5) * cell, z: originZ + (gz(node) + 0.5) * cell });
      node = cameFrom[node];
      if (node === s) break;
    }
    path.reverse();
    return path;
  }

  _smoothPath(path) {
    if (!path || path.length < 3) return path;
    const out = [path[0]];
    let i = 0;
    let guard = 0;
    while (i < path.length - 1 && guard++ < 512) {
      let j = path.length - 1;
      for (; j > i + 1; j--) {
        if (this._walkableLine(path[i], path[j])) break;
      }
      out.push(path[j]);
      i = j;
    }
    return out;
  }

  _walkableLine(a, b) {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(dist / 0.9);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = lerp(a.x, b.x, t);
      const z = lerp(a.z, b.z, t);
      if (!this.nav.isWalkable(x, z)) return false;
      if (this.waterDepth(x, z) > 0.8) return false;
    }
    return true;
  }

  buildMinimapData() {
    this.minimap = {
      half: MAP.half,
      buildings: this.buildingRects.filter((b) => Math.abs(b.x) < MAP.half && Math.abs(b.z) < MAP.half),
      trees: this.treeInstances.map((t) => ({ x: t.x, z: t.z, r: Math.max(0.7, t.r * 1.4) })),
      paths: PATH_SPLINES.map((s) => s.map((p) => ({ x: p.x, z: p.z }))),
      river: RIVER.filter((p) => Math.abs(p.x) < MAP.half * 1.4).map((p) => ({ x: p.x, z: p.z })),
      riverWidth: RIVER_WIDTH,
      clearings: CLEARINGS.map((c) => ({ x: c.x, z: c.z, r: c.r, label: c.label })),
      buildingsLarge: this.buildingRects.filter((b) => b.w > 3 && b.d > 3),
    };
  }

  buildSpawns() {
    const make = (cx, cz, r, team, count) => {
      const list = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        let x = cx + Math.cos(a) * r;
        let z = cz + Math.sin(a) * r;
        const spot = this.nav.nearestWalkable(x, z, 14);
        if (spot) {
          x = spot.x;
          z = spot.z;
        }
        // face the middle of the map
        const yaw = Math.atan2(-(cx - 0), -(cz - 0));
        list.push({ x, y: terrainHeight(x, z), z, yaw, team });
      }
      return list;
    };
    const us = CLEARINGS.find((c) => c.label === 'us_spawn');
    const op = CLEARINGS.find((c) => c.label === 'opfor_spawn');
    this.spawns.us = make(us.x, us.z, us.r * 0.6, 'us', 10);
    this.spawns.opfor = make(op.x, op.z, op.r * 0.6, 'opfor', 10);
    this.objectives = [
      { x: CLEARINGS.find((c) => c.label === 'temple').x, z: CLEARINGS.find((c) => c.label === 'temple').z, name: 'TEMPLE' },
      { x: CLEARINGS.find((c) => c.label === 'village').x, z: CLEARINGS.find((c) => c.label === 'village').z, name: 'VILLAGE' },
      { x: CLEARINGS.find((c) => c.label === 'crossroads').x, z: CLEARINGS.find((c) => c.label === 'crossroads').z, name: 'CROSSROADS' },
    ];
  }

  /* ---------------- runtime ---------------- */

  update(dt, camera) {
    this._time += dt;
    for (const mat of this.windMaterials) {
      const shader = mat.userData.windShader;
      if (shader) shader.uniforms.uWindTime.value = this._time;
    }
    if (this.waterMat?.normalMap) {
      this.waterMat.normalMap.offset.x = this._time * 0.017;
      this.waterMat.normalMap.offset.y = this._time * 0.011;
    }
    void camera;
  }

  /** Walkable surface name for footstep audio. */
  surfaceAt(x, z) {
    if (this.waterDepth(x, z) > 0.12) return 'water';
    const pd = pathDistance(x, z);
    if (pd < 2.6) return 'dirt';
    const n = terrainNormal(x, z, new THREE.Vector3());
    if (n.y < 0.86) return 'stone';
    return 'grass';
  }

  dispose() {
    this.scene.traverse((obj) => {
      if (obj.isInstancedMesh) {
        obj.geometry.dispose();
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  get size() {
    return this.items.length;
  }
  push(value, key) {
    this.items.push(value);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this._swap(i, parent);
      i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop();
    const lastKey = this.keys.pop();
    if (this.items.length) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.keys[l] < this.keys[smallest]) smallest = l;
        if (r < this.items.length && this.keys[r] < this.keys[smallest]) smallest = r;
        if (smallest === i) break;
        this._swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }
  _swap(a, b) {
    const ti = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = ti;
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
  }
}

/**
 * Merge simple non-indexed geometries (position/normal/uv).
 * Keeps us independent of three's addons folder.
 */
function mergeGeometries(geoms) {
  let totalVerts = 0;
  const prepared = geoms.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    totalVerts += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  let o = 0;
  for (const g of prepared) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      if (n) {
        nor[(o + i) * 3] = n.getX(i);
        nor[(o + i) * 3 + 1] = n.getY(i);
        nor[(o + i) * 3 + 2] = n.getZ(i);
      }
      if (t) {
        uv[(o + i) * 2] = t.getX(i);
        uv[(o + i) * 2 + 1] = t.getY(i);
      }
    }
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export { mergeGeometries, pathDistance, riverDistance, BOUNDS_PADDING };

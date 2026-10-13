// The arena: a circular courtyard with a ring of pillars, a central altar, broken
// columns, and crates. Also owns the lights and the collision set for props.

import * as THREE from 'three';
import { makeStoneTexture, makeGlowTexture } from '../engine/textures.js';
import { createRng, clamp } from '../engine/math.js';
import { ARENA_RADIUS } from './config.js';

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // { x, z, r }
    this.torches = [];
    this.rng = createRng(42);
    const stone = makeStoneTexture(512, 7);
    this.stone = stone;
    this.glow = makeGlowTexture();
    this._build();
    this._lights();
  }

  _stoneMat(repeat, color = 0xffffff) {
    const map = this.stone.map.clone();
    const bumpMap = this.stone.bumpMap.clone();
    map.needsUpdate = bumpMap.needsUpdate = true;
    map.repeat.set(repeat[0], repeat[1]);
    bumpMap.repeat.set(repeat[0], repeat[1]);
    return new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 0.035, roughness: 0.88, metalness: 0, color });
  }

  _build() {
    const R = ARENA_RADIUS;
    const scene = this.scene;

    // Courtyard floor.
    const floorGeo = new THREE.CircleGeometry(R, 96);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, this._stoneMat([10, 10]));
    floor.receiveShadow = true;
    scene.add(floor);

    // Dark ring of outer wall, seen from inside.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 2, R + 2, 4, 96, 1, true),
      this._stoneMat([24, 1], 0x9a9aa0),
    );
    wall.position.y = 2;
    wall.material.side = THREE.BackSide;
    wall.receiveShadow = true;
    scene.add(wall);

    const pillarMat = this._stoneMat([1, 3], 0xd8d2c8);
    const addPillar = (x, z, h, r = 0.9, collide = true) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 20), pillarMat);
      m.position.set(x, h / 2, z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.5, r * 2.6), pillarMat);
      cap.position.set(x, h + 0.25, z);
      cap.castShadow = cap.receiveShadow = true;
      scene.add(cap);
      if (collide) this.colliders.push({ x, z, r: r + 0.2 });
    };

    // Ring of 10 tall pillars.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      addPillar(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), 7.5, 0.95);
    }

    // Broken columns of varied height inside the ring.
    for (let i = 0; i < 6; i++) {
      const a = 0.4 + (i / 6) * Math.PI * 2;
      const rad = 12 + (i % 2) * 3;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      // Heights are drawn even when skipped, so the layout stays stable across tweaks.
      const h = 2 + this.rng() * 2.5;
      // Keep the player's spawn lane clear, or the over-the-shoulder camera gets pinned against it.
      if (Math.hypot(x, z - 14) < 4.5) continue;
      addPillar(x, z, h, 0.7);
    }

    // Central altar with glowing rune ring.
    const altarMat = this._stoneMat([2, 2], 0xb8b0a6);
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.7, 1.0, 40), altarMat);
    altar.position.y = 0.5;
    altar.castShadow = altar.receiveShadow = true;
    scene.add(altar);
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 1.9, 64),
      new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }),
    );
    rune.rotation.x = -Math.PI / 2;
    rune.position.y = 1.02;
    scene.add(rune);
    this.rune = rune;
    this.colliders.push({ x: 0, z: 0, r: 2.6 });

    // Crates scattered as cover.
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x5b3f2a, roughness: 0.95 });
    for (let i = 0; i < 9; i++) {
      const a = this.rng() * Math.PI * 2;
      const rad = 6 + this.rng() * 16;
      const s = 0.7 + this.rng() * 0.5;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      // Keep the centre and the player's spawn lane clear of cover.
      if (Math.hypot(x, z) < 4 || Math.hypot(x, z - 14) < 8) continue;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      crate.position.set(x, s / 2, z);
      crate.rotation.y = this.rng() * Math.PI;
      crate.castShadow = crate.receiveShadow = true;
      scene.add(crate);
      this.colliders.push({ x, z, r: s * 0.6 });
    }

    // Torch holders on four pillars.
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * (R - 3);
      const z = Math.sin(a) * (R - 3);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.18, 0.4, 16), ironMat);
      bowl.position.set(x, 7.9, z);
      scene.add(bowl);
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      );
      flame.scale.set(1.8, 2.4, 1);
      flame.position.set(x, 8.9, z);
      scene.add(flame);
      const light = new THREE.PointLight(0xff9a4a, 60, 16, 1.6);
      light.position.set(x * 0.92, 8.3, z * 0.92);
      scene.add(light);
      this.torches.push({ light, flame, base: 60, phase: i * 1.7 });
    }
  }

  _lights() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight(0x8ea6d8, 0x2a1c14, 0.55));

    const sun = new THREE.DirectionalLight(0xffd7a8, 2.6);
    sun.position.set(-14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 26;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 80 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
  }

  // Move a point out of any prop and back inside the arena. Mutates pos.x/pos.z.
  resolve(pos, radius) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
    const lim = ARENA_RADIUS - 2.2 - radius;
    const r = Math.hypot(pos.x, pos.z);
    if (r > lim) {
      pos.x *= lim / r;
      pos.z *= lim / r;
    }
  }

  // True if the segment a→b passes through a prop (used by camera collision).
  segmentBlocked(ax, az, bx, bz, margin = 0) {
    let best = 1;
    const dx = bx - ax;
    const dz = bz - az;
    for (const c of this.colliders) {
      const fx = ax - c.x;
      const fz = az - c.z;
      const A = dx * dx + dz * dz;
      if (A < 1e-9) continue;
      const B = 2 * (fx * dx + fz * dz);
      const C = fx * fx + fz * fz - (c.r + margin) * (c.r + margin);
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t > 0 && t < best) best = t;
    }
    return best;
  }

  update(t) {
    const r = this.rune;
    r.material.color.setRGB(1, 0.7 + Math.sin(t * 2) * 0.08, 0.3);
    for (const tch of this.torches) {
      const flick = 0.85 + 0.12 * Math.sin(t * 9 + tch.phase) + 0.05 * Math.sin(t * 23 + tch.phase * 2);
      tch.light.intensity = tch.base * clamp(flick, 0.6, 1.1);
      tch.flame.material.opacity = 0.85 * clamp(flick, 0.6, 1.1);
      tch.flame.scale.set(1.8 * flick, 2.4 * (0.9 + 0.2 * flick), 1);
    }
  }
}

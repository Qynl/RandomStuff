/**
 * IRONWOOD - effects layer.
 *
 * Pooled, allocation-free particle systems: tracers, muzzle flash, impacts,
 * decals, dust, blood, explosions, water splashes and smoke plumes.
 * Everything is instanced or reused so combat stays at frame rate.
 */

import * as THREE from 'three';
import { TAU, clamp, rand, randInt, saturate, randRange } from '../core/math.js';

const DECAL_LIFETIME = 26;

class InstancedPool {
  constructor(geometry, material, count, opts = {}) {
    this.count = count;
    this.geometry = geometry;
    this.material = material;
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1, endSize: 1, rot: 0, spin: 0,
        r: 1, g: 1, b: 1, a: 1, gravity: 0, drag: 1, fade: 1,
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.opts = opts;
    this.hideAll();
  }

  hideAll() {
    this._m.makeScale(0, 0, 0);
    for (let i = 0; i < this.count; i++) this.mesh.setMatrixAt(i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(cfg) {
    let slot = null;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        slot = p;
        break;
      }
    }
    if (!slot) {
      // recycle the oldest
      let oldest = this.particles[0];
      for (const p of this.particles) if (p.life < oldest.life) oldest = p;
      slot = oldest;
    }
    const { x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0, life = 1, size = 1, endSize = 0,
      rot = 0, spin = 0, color = 0xffffff, alpha = 1, gravity = 0, drag = 1, fade = 1 } = cfg;
    slot.active = true;
    slot.x = x; slot.y = y; slot.z = z;
    slot.vx = vx; slot.vy = vy; slot.vz = vz;
    slot.life = 0; slot.maxLife = life;
    slot.size = size; slot.endSize = endSize;
    slot.rot = rot; slot.spin = spin;
    const c = this._c.set(color);
    slot.r = c.r; slot.g = c.g; slot.b = c.b;
    slot.a = alpha;
    slot.gravity = gravity;
    slot.drag = drag;
    slot.fade = fade;
    return slot;
  }

  update(dt, billboardCamera) {
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        p.active = false;
        this._m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this._m);
        dirty = true;
        continue;
      }
      p.vy -= p.gravity * dt;
      const dragF = Math.pow(p.drag, dt * 60);
      p.vx *= dragF;
      p.vy *= dragF;
      p.vz *= dragF;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const size = p.size + (p.endSize - p.size) * t;
      this._p.set(p.x, p.y, p.z);
      if (billboardCamera) {
        this._e.set(0, Math.atan2(billboardCamera.position.x - p.x, billboardCamera.position.z - p.z), 0);
        this._q.setFromEuler(this._e);
        this._q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, p.rot)));
      } else {
        this._e.set(0, p.rot, 0);
        this._q.setFromEuler(this._e);
      }
      const s = Math.max(0.0001, size);
      this._s.set(s, s, s);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
      this._c.setRGB(p.r, p.g, p.b);
      this.mesh.setColorAt(i, this._c);
      dirty = true;
    }
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

export class FX {
  constructor(scene, world, textures, audio, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.textures = textures;
    this.audio = audio;
    this.quality = opts.quality || 'high';
    this.camera = null;
    this._time = 0;
    this.lights = [];
    this.decals = [];
    this.decalLimit = this.quality === 'low' ? 60 : this.quality === 'medium' ? 110 : 170;
    this.tracers = [];

    const scale = this.quality === 'low' ? 0.4 : this.quality === 'medium' ? 0.7 : 1;
    const poolCount = (n) => Math.max(24, Math.round(n * scale));

    // Additive sparks / embers
    this.sparks = new InstancedPool(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: textures.sprite('spark'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
      poolCount(220)
    );

    // Soft smoke / dust
    this.smoke = new InstancedPool(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: textures.sprite('smoke'),
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
        side: THREE.DoubleSide,
        color: 0xbfbdb4,
      }),
      poolCount(260)
    );

    // Blood mist
    this.blood = new InstancedPool(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: textures.sprite('bloodMist'),
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
      poolCount(90)
    );

    // Solid debris chunks (rotating, non-billboard)
    this.debris = new InstancedPool(
      new THREE.BoxGeometry(1, 1, 1),
      this._debrisMaterial(textures),
      poolCount(120)
    );

    // Muzzle flash sprites (kept separate: short life, additive, big)
    this.flashes = new InstancedPool(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: textures.sprite('muzzleFlash'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
      poolCount(40)
    );

    scene.add(this.sparks.mesh, this.smoke.mesh, this.blood.mesh, this.debris.mesh, this.flashes.mesh);

    // Tracer pool (stretched quads oriented along the shot)
    const tracerMat = new THREE.MeshBasicMaterial({
      map: textures.sprite('tracer'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      color: 0xffd9a0,
    });
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), tracerMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0, maxLife: 0.07, from: new THREE.Vector3(), to: new THREE.Vector3() });
    }

    // Muzzle flash point lights (small pool, shadows off)
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffd9a0, 0, 22, 2);
      light.visible = false;
      scene.add(light);
      this.lights.push({ light, life: 0, maxLife: 0.06 });
    }

    // Decals (hole / scorch / blood)
    const decalSpecs = [
      { name: 'hole', texture: textures.sprite('bulletHole'), blending: THREE.NormalBlending, depthWrite: false },
      { name: 'scorch', texture: textures.sprite('scorch'), blending: THREE.NormalBlending, depthWrite: false },
    ];
    this.decalMaterials = {};
    for (const spec of decalSpecs) {
      this.decalMaterials[spec.name] = new THREE.MeshBasicMaterial({
        map: spec.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: THREE.DoubleSide,
      });
    }
    this._decalGeo = new THREE.PlaneGeometry(1, 1);

    // Persistent smoke columns (crash sites, burning vehicles)
    this.smokeEmitters = [];
  }

  _debrisMaterial(textures) {
    const mat = textures.pbr('dirt', { repeat: 1, surface: 'dirt' });
    mat.side = THREE.DoubleSide;
    return mat;
  }

  setCamera(camera) {
    this.camera = camera;
  }

  /* ------------------------------------------------------------ */
  /* Spawned effects                                              */
  /* ------------------------------------------------------------ */

  muzzleFlash(position, dir, scale = 1, opts = {}) {
    const px = position.x + dir.x * 0.35 * scale;
    const py = position.y + dir.y * 0.35 * scale;
    const pz = position.z + dir.z * 0.35 * scale;
    this.flashes.spawn({
      x: px, y: py, z: pz,
      life: 0.045 + Math.random() * 0.025,
      size: 0.9 * scale,
      endSize: 0.45 * scale,
      rot: Math.random() * TAU,
      color: opts.color ?? 0xffe6b0,
    });
    // hot core
    this.flashes.spawn({
      x: px + dir.x * 0.12, y: py + dir.y * 0.12, z: pz + dir.z * 0.12,
      life: 0.03,
      size: 0.5 * scale,
      endSize: 0.2 * scale,
      rot: Math.random() * TAU,
      color: 0xfff6de,
    });
    // muzzle smoke drifting with the shot
    if (!opts.suppressed) {
      for (let i = 0; i < 2; i++) {
        this.smoke.spawn({
          x: px + dir.x * 0.5, y: py + dir.y * 0.5 + 0.05, z: pz + dir.z * 0.5,
          vx: dir.x * rand(1.2, 3.0) + rand(-0.4, 0.4),
          vy: rand(0.4, 1.3),
          vz: dir.z * rand(1.2, 3.0) + rand(-0.4, 0.4),
          life: rand(0.5, 1.1),
          size: rand(0.28, 0.5) * scale,
          endSize: rand(1.1, 1.8) * scale,
          color: 0xa9a69c,
          alpha: 0.5,
          drag: 0.94,
        });
      }
      // ejects a spark or two
      this.sparks.spawn({
        x: px, y: py, z: pz,
        vx: dir.x * rand(4, 9) + rand(-1.5, 1.5),
        vy: rand(0.5, 2.2),
        vz: dir.z * rand(4, 9) + rand(-1.5, 1.5),
        life: rand(0.06, 0.16),
        size: rand(0.1, 0.2),
        endSize: 0.02,
        color: 0xffcc7a,
      });
    }
    this.flashLight(px, py, pz, opts.lightIntensity ?? 3.2);
  }

  flashLight(x, y, z, intensity = 3) {
    for (const slot of this.lights) {
      if (slot.life <= 0) {
        slot.light.position.set(x, y, z);
        slot.light.intensity = intensity;
        slot.light.visible = true;
        slot.life = 0.001;
        slot.maxLife = 0.06;
        return;
      }
    }
  }

  tracer(from, to, opts = {}) {
    const slot = this.tracers.find((t) => t.life <= 0 || !t.mesh.visible);
    if (!slot) return;
    slot.from.set(from.x, from.y, from.z);
    slot.to.set(to.x, to.y, to.z);
    slot.life = 1e-4;
    slot.maxLife = opts.life ?? 0.075;
    slot.mesh.visible = true;
    this._placeTracer(slot);
    slot.mesh.material.opacity = 1;
  }

  _placeTracer(slot) {
    const dx = slot.to.x - slot.from.x;
    const dy = slot.to.y - slot.from.y;
    const dz = slot.to.z - slot.from.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const mid = {
      x: (slot.from.x + slot.to.x) / 2,
      y: (slot.from.y + slot.to.y) / 2,
      z: (slot.from.z + slot.to.z) / 2,
    };
    slot.mesh.position.set(mid.x, mid.y, mid.z);
    slot.mesh.scale.set(dist, Math.max(0.35, dist * 0.02), 1);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.asin(clamp(dy / dist, -1, 1));
    slot.mesh.rotation.set(0, yaw + Math.PI / 2, 0);
    slot.mesh.rotateY(0);
    slot.mesh.rotation.z = -pitch;
    if (this.camera) {
      // keep the streak roughly facing the viewer
      slot.mesh.lookAt(this.camera.position);
      slot.mesh.rotateZ(Math.atan2(dx, dz) + Math.PI / 2 - Math.atan2(dx, dz));
    }
  }

  impact(point, normal, surface = 'dirt', opts = {}) {
    const n = normal || { x: 0, y: 1, z: 0 };
    const back = { x: -n.x * 0.02, y: -n.y * 0.02, z: -n.z * 0.02 };
    const px = point.x + back.x;
    const py = point.y + back.y;
    const pz = point.z + back.z;

    if (surface === 'water') {
      this.splash(point);
      return;
    }
    if (surface === 'flesh') {
      this.bloodBurst(point, n, opts.damage ?? 1);
      return;
    }

    const dustColor = {
      dirt: 0x8a7455,
      grass: 0x6b7550,
      stone: 0x9a978f,
      concrete: 0xa8a49c,
      wood: 0x7d6440,
      bark: 0x6a5638,
      metal: 0xb9b9bd,
      sandbag: 0xa08c62,
      leaf: 0x5f7040,
      rubber: 0x3a3a3a,
      cloth: 0x6d6a55,
      water: 0x9fb2b5,
      wall: 0x888888,
    }[surface] ?? 0x8a8a8a;

    const count = opts.spark ? randInt(5, 9) : randInt(3, 6);
    for (let i = 0; i < count; i++) {
      this.sparks.spawn({
        x: px, y: py, z: pz,
        vx: n.x * rand(1.5, 4.5) + rand(-1.6, 1.6),
        vy: n.y * rand(1.5, 4.5) + rand(0.2, 2.4),
        vz: n.z * rand(1.5, 4.5) + rand(-1.6, 1.6),
        life: rand(0.08, 0.28),
        size: rand(0.07, 0.16),
        endSize: 0.01,
        color: opts.spark ? 0xffe08a : 0xffd9a8,
        gravity: 9,
        drag: 0.96,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.smoke.spawn({
        x: px, y: py, z: pz,
        vx: n.x * rand(0.6, 1.8) + rand(-0.5, 0.5),
        vy: rand(0.3, 1.4),
        vz: n.z * rand(0.6, 1.8) + rand(-0.5, 0.5),
        life: rand(0.5, 1.3),
        size: rand(0.18, 0.34),
        endSize: rand(0.9, 1.6),
        color: dustColor,
        alpha: 0.62,
        drag: 0.9,
      });
    }
    for (let i = 0; i < 2; i++) {
      this.debris.spawn({
        x: px, y: py, z: pz,
        vx: n.x * rand(1.5, 4) + rand(-1.4, 1.4),
        vy: rand(0.8, 3.2),
        vz: n.z * rand(1.5, 4) + rand(-1.4, 1.4),
        life: rand(0.5, 1.4),
        size: rand(0.04, 0.11),
        endSize: rand(0.03, 0.09),
        rot: rand(0, TAU),
        spin: rand(-9, 9),
        gravity: 11,
        drag: 0.985,
        color: dustColor,
      });
    }
    if (opts.decal !== false && !opts.noDecal) {
      this.decal(point, n, surface === 'metal' || surface === 'concrete' ? 'hole' : surface === 'dirt' || surface === 'grass' ? 'hole' : 'hole');
    }
    if (this.audio && opts.silent !== true) {
      this.audio.impact(surface, { position: point, distance: opts.distance ?? 2 });
    }
  }

  bloodBurst(point, normal, amount = 1) {
    const n = normal || { x: 0, y: 1, z: 0 };
    const puffs = Math.round(3 * clamp(amount, 0.4, 2));
    for (let i = 0; i < puffs; i++) {
      this.blood.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: n.x * rand(0.6, 2.4) + rand(-0.8, 0.8),
        vy: rand(0.2, 1.6),
        vz: n.z * rand(0.6, 2.4) + rand(-0.8, 0.8),
        life: rand(0.28, 0.6),
        size: rand(0.2, 0.42) * amount,
        endSize: rand(0.9, 1.7) * amount,
        color: 0xffffff,
        alpha: 0.55,
        drag: 0.88,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.sparks.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: n.x * rand(1, 3) + rand(-1.2, 1.2),
        vy: rand(0.5, 2.6),
        vz: n.z * rand(1, 3) + rand(-1.2, 1.2),
        life: rand(0.1, 0.3),
        size: rand(0.06, 0.12),
        endSize: 0.01,
        color: 0x8e1414,
        gravity: 12,
        drag: 0.95,
      });
    }
  }

  splash(point) {
    for (let i = 0; i < 10; i++) {
      this.sparks.spawn({
        x: point.x, y: point.y + 0.05, z: point.z,
        vx: rand(-2.4, 2.4),
        vy: rand(2.2, 6),
        vz: rand(-2.4, 2.4),
        life: rand(0.2, 0.5),
        size: rand(0.06, 0.14),
        endSize: 0.02,
        color: 0xd7e6ea,
        gravity: 14,
        drag: 0.98,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.smoke.spawn({
        x: point.x, y: point.y + 0.1, z: point.z,
        vx: rand(-0.6, 0.6),
        vy: rand(0.6, 1.6),
        vz: rand(-0.6, 0.6),
        life: rand(0.4, 0.9),
        size: 0.3,
        endSize: 1.3,
        color: 0xc9d6d8,
        alpha: 0.4,
        drag: 0.9,
      });
    }
    if (this.audio) this.audio.impact('water', { position: point, distance: 3 });
  }

  explosion(point, opts = {}) {
    const radius = opts.radius ?? 6;
    // fireball
    for (let i = 0; i < 14; i++) {
      this.sparks.spawn({
        x: point.x + rand(-0.4, 0.4),
        y: point.y + rand(0, 0.8),
        z: point.z + rand(-0.4, 0.4),
        vx: rand(-6, 6), vy: rand(2, 10), vz: rand(-6, 6),
        life: rand(0.2, 0.6),
        size: rand(0.4, 1.2),
        endSize: 0.05,
        color: i % 3 === 0 ? 0xfff0c0 : 0xff9a30,
        gravity: 4,
        drag: 0.92,
      });
    }
    // smoke column
    for (let i = 0; i < 22; i++) {
      this.smoke.spawn({
        x: point.x + rand(-1.4, 1.4),
        y: point.y + rand(0, 2.2),
        z: point.z + rand(-1.4, 1.4),
        vx: rand(-2.2, 2.2),
        vy: rand(1.6, 5.0),
        vz: rand(-2.2, 2.2),
        life: rand(1.4, 3.4),
        size: rand(1.0, 2.2),
        endSize: rand(4.5, 8),
        color: 0x3a3733,
        alpha: 0.7,
        drag: 0.9,
      });
    }
    // dirt spray
    for (let i = 0; i < 18; i++) {
      this.debris.spawn({
        x: point.x + rand(-0.6, 0.6),
        y: point.y + rand(0, 0.6),
        z: point.z + rand(-0.6, 0.6),
        vx: rand(-7, 7), vy: rand(3, 11), vz: rand(-7, 7),
        life: rand(0.8, 2.0),
        size: rand(0.08, 0.24),
        endSize: rand(0.06, 0.2),
        rot: rand(0, TAU),
        spin: rand(-12, 12),
        gravity: 12,
        drag: 0.99,
        color: 0x6a5a44,
      });
    }
    this.decal(point, { x: 0, y: 1, z: 0 }, 'scorch', 3.4 + radius * 0.25);
    this.flashLight(point.x, point.y + 0.8, point.z, 12);
    if (this.audio) this.audio.explosion({ position: point, distance: 6 });
    void radius;
  }

  /** A single drifting smoke puff (used by smoke grenades and wrecks). */
  smokePuff(point, opts = {}) {
    this.smoke.spawn({
      x: point.x, y: point.y, z: point.z,
      vx: opts.vx ?? rand(-0.3, 0.3),
      vy: opts.vy ?? rand(0.4, 1.1),
      vz: opts.vz ?? rand(-0.3, 0.3),
      life: opts.life ?? rand(1.6, 3.2),
      size: opts.size ?? rand(0.8, 1.6),
      endSize: (opts.size ?? 1.2) * rand(2.6, 4.2),
      color: opts.color ?? 0xbfbfb8,
      alpha: opts.alpha ?? 0.55,
      drag: 0.92,
    });
  }

  /** Blood decal on the ground for kills near the player. */
  groundScorch(x, z, scale = 2) {
    const y = this.world.terrainHeightAt ? this.world.terrainHeightAt(x, z) : this.world.supportHeight(x, z, 999);
    this.decal({ x, y: y + 0.02, z }, { x: 0, y: 1, z: 0 }, 'scorch', scale);
  }

  decal(point, normal, kind = 'hole', scale = 1) {
    if (this.decals.length >= this.decalLimit) {
      const old = this.decals.shift();
      this.scene.remove(old.mesh);
      old.mesh.visible = false;
      this.decalPool = this.decalPool || [];
      this.decalPool.push(old.mesh);
    }
    let mesh = this.decalPool && this.decalPool.length ? this.decalPool.pop() : null;
    if (!mesh) {
      mesh = new THREE.Mesh(this._decalGeo, this.decalMaterials.hole);
      mesh.frustumCulled = false;
    }
    mesh.material = this.decalMaterials[kind] || this.decalMaterials.hole;
    mesh.visible = true;
    const size = (kind === 'scorch' ? 1.4 : 0.24) * scale * rand(0.85, 1.2);
    mesh.position.set(point.x + normal.x * 0.012, point.y + normal.y * 0.012, point.z + normal.z * 0.012);
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, n);
    const spin = new THREE.Quaternion().setFromAxisAngle(n, Math.random() * TAU);
    mesh.quaternion.copy(spin).multiply(quat);
    mesh.scale.set(size, size, size);
    if (!mesh.parent) this.scene.add(mesh);
    this.decals.push({ mesh, life: 0, maxLife: DECAL_LIFETIME });
  }

  /* ------------------------------------------------------------ */
  /* Emitters (persistent)                                        */
  /* ------------------------------------------------------------ */

  registerSmokeEmitters(list = []) {
    for (const e of list) {
      this.smokeEmitters.push({ ...e, timer: Math.random() * 0.4 });
    }
  }

  /* ------------------------------------------------------------ */

  update(dt) {
    this._time += dt;
    for (const pool of [this.sparks, this.smoke, this.blood, this.debris, this.flashes]) {
      pool.update(dt, this.camera);
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life += dt;
      const k = t.life / t.maxLife;
      if (k >= 1) {
        t.life = 0;
        t.mesh.visible = false;
        continue;
      }
      t.mesh.material.opacity = 1 - k;
    }
    for (const slot of this.lights) {
      if (slot.life <= 0) continue;
      slot.life += dt;
      const k = slot.life / slot.maxLife;
      if (k >= 1) {
        slot.light.intensity = 0;
        slot.light.visible = false;
        slot.life = 0;
        continue;
      }
      slot.light.intensity *= 0.82;
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life += dt;
      if (d.life > d.maxLife) {
        d.mesh.visible = false;
        this.scene.remove(d.mesh);
        this.decalPool = this.decalPool || [];
        this.decalPool.push(d.mesh);
        this.decals.splice(i, 1);
      } else if (d.life > d.maxLife - 3) {
        d.mesh.material.opacity = saturate((d.maxLife - d.life) / 3) * 0.95;
      }
    }

    // drifting smoke plumes
    for (const e of this.smokeEmitters) {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = 1 / (e.rate ?? 3);
        this.smokePuff(
          { x: e.x + rand(-0.6, 0.6), y: e.y + rand(-0.2, 0.2), z: e.z + rand(-0.6, 0.6) },
          { size: (e.size ?? 2) * 0.5, life: e.life ?? 6, color: e.color ?? 0x9c9a94, alpha: 0.35, vy: rand(0.5, 1.2) }
        );
      }
    }
    void randRange;
  }
}

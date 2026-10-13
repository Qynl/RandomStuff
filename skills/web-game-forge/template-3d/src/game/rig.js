// A jointed humanoid built from primitives, plus a small animation system:
//
//   * locomotion is procedural (idle breathing, run cycle) and fills every joint
//   * "holds" are static poses (blocking, winding up) that override locomotion arms
//   * "clips" are keyframed one-shot moves (attacks, dodge, hurt, death) that override
//     both. Clips only define the joints they care about, so legs keep running
//     through an attack.
//
// Every joint's rotation eases toward its target every frame (damp), so transitions
// blend instead of snapping. Clip keys are plain data, so new moves need no new code.
//
// Character forward is +Z. Arms hang down along -Y at rest.

import * as THREE from 'three';
import { damp, lerp, TAU } from '../engine/math.js';

export const JOINTS = ['hips', 'torso', 'head', 'armL', 'foreArmL', 'armR', 'foreArmR', 'legL', 'shinL', 'legR', 'shinR'];

export function createHumanoid({
  body = 0x3b3f4a, armor = 0x9aa4b2, skin = 0xd8a57b, accent = 0xffb347, scale = 1, bladeLength = 0.85,
} = {}) {
  const root = new THREE.Group();
  const matBody = new THREE.MeshStandardMaterial({ color: body, roughness: 0.75 });
  const matArmor = new THREE.MeshStandardMaterial({ color: armor, roughness: 0.32, metalness: 0.75 });
  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const matAccent = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.3 });
  const matBlade = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, roughness: 0.18, metalness: 0.95 });
  const matGrip = new THREE.MeshStandardMaterial({ color: 0x2b1f18, roughness: 0.9 });

  const j = {};
  const meshes = [];
  const joint = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    j[name] = g;
    return g;
  };
  const part = (geo, m, x, y, z, parent) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  joint('hips', root, 0, 0.95, 0);
  part(new THREE.BoxGeometry(0.36, 0.2, 0.24), matBody, 0, 0, 0, j.hips);
  joint('torso', j.hips, 0, 0.08, 0);
  part(new THREE.CapsuleGeometry(0.2, 0.3, 4, 12), matArmor, 0, 0.28, 0, j.torso);
  part(new THREE.BoxGeometry(0.36, 0.1, 0.24), matBody, 0, -0.04, 0, j.torso);
  joint('head', j.torso, 0, 0.62, 0);
  part(new THREE.SphereGeometry(0.15, 16, 12), matSkin, 0, 0.05, 0, j.head);
  part(new THREE.SphereGeometry(0.175, 16, 10, 0, TAU, 0, Math.PI * 0.55), matArmor, 0, 0.08, 0, j.head);
  part(new THREE.BoxGeometry(0.22, 0.03, 0.05), matAccent, 0, 0.05, 0.14, j.head);

  for (const side of [-1, 1]) {
    const s = side === 1 ? 'L' : 'R';
    joint(`arm${s}`, j.torso, 0.3 * side, 0.5, 0);
    part(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8), matArmor, 0, -0.16, 0, j[`arm${s}`]);
    joint(`foreArm${s}`, j[`arm${s}`], 0, -0.34, 0);
    part(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), matBody, 0, -0.15, 0, j[`foreArm${s}`]);
    part(new THREE.SphereGeometry(0.065, 8, 6), matSkin, 0, -0.33, 0, j[`foreArm${s}`]);
    joint(`leg${s}`, j.hips, 0.13 * side, -0.08, 0);
    part(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), matBody, 0, -0.22, 0, j[`leg${s}`]);
    joint(`shin${s}`, j[`leg${s}`], 0, -0.44, 0);
    part(new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), matArmor, 0, -0.2, 0, j[`shin${s}`]);
    part(new THREE.BoxGeometry(0.12, 0.08, 0.26), matBody, 0, -0.4, 0.05, j[`shin${s}`]);
  }

  // Sword in the right hand, pointing down the forearm.
  const L = bladeLength;
  part(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 8), matGrip, 0, -0.36, 0, j.foreArmR);
  part(new THREE.BoxGeometry(0.2, 0.04, 0.06), matArmor, 0, -0.43, 0, j.foreArmR);
  const blade = part(new THREE.BoxGeometry(0.05, L, 0.015), matBlade, 0, -0.43 - L / 2, 0, j.foreArmR);
  blade.castShadow = true;
  const weaponTip = new THREE.Object3D();
  weaponTip.position.set(0, -0.45 - L, 0);
  j.foreArmR.add(weaponTip);

  root.scale.setScalar(scale);
  return { root, j, meshes, accent: matAccent, bodyMat: matBody, armorMat: matArmor, height: 1.9 * scale, weaponTip };
}

// --- Procedural locomotion ---------------------------------------------------

function locomotion(out, t, speed, phase) {
  const sw = Math.sin(phase) * 0.85 * speed;
  const breath = Math.sin(t * 2.1) * 0.025;
  out.legL = [sw, 0, 0];
  out.legR = [-sw, 0, 0];
  out.shinL = [Math.max(0, -Math.sin(phase)) * 1.0 * speed, 0, 0];
  out.shinR = [Math.max(0, Math.sin(phase)) * 1.0 * speed, 0, 0];
  out.armL = [-sw * 0.6 + breath - 0.04, 0, 0.1];
  out.armR = [sw * 0.6 + breath - 0.06, 0, -0.1];
  out.foreArmL = [-0.2 - 0.25 * speed, 0, 0];
  out.foreArmR = [-0.25 - 0.2 * speed, 0, 0];
  out.torso = [0.04 + 0.1 * speed + breath * 0.5, 0, 0];
  out.head = [-0.02 * speed - breath * 0.4, 0, 0];
  out.hips = [0, 0, 0];
  return out;
}

// --- Holds: static poses, override locomotion arms -----------------------

export const HOLDS = {
  windup: { torso: [-0.1, 0.4, 0], armR: [2.3, 0, 0], foreArmR: [-0.9, 0, 0], armL: [0.3, 0, 0.3] },
  block: { torso: [0.05, 0, 0], armL: [-1.3, 0.3, 0.4], foreArmL: [-1.6, 0, 0], armR: [-1.0, -0.3, 0], foreArmR: [-1.8, 0, 0] },
  slamUp: { torso: [-0.2, 0, 0], armL: [2.8, 0, 0.2], armR: [2.8, 0, -0.2], foreArmL: [-0.3, 0, 0], foreArmR: [-0.3, 0, 0] },
  roar: { torso: [-0.2, 0, 0], head: [-0.5, 0, 0], armL: [-0.4, 0, 1.3], armR: [-0.4, 0, -1.3] },
  charge: { torso: [0.5, 0, 0], armL: [-0.5, 0, 0.2], armR: [-0.9, 0, -0.2], foreArmR: [-0.7, 0, 0] },
};

// --- Clips: keyframed one-shot moves ------------------------------------
// keys: [{ t, p: { joint: [x, y, z] } }]. Joints not mentioned in a key are left
// alone. A "spin" pseudo-joint rotates the whole character around Y (radians).

export const CLIPS = {
  attack1: {
    dur: 0.55,
    keys: [
      { t: 0.0, p: { torso: [0, 0, 0] } },
      { t: 0.2, p: { torso: [-0.1, 0.45, 0], armR: [2.3, 0, 0], foreArmR: [-0.9, 0, 0] } },
      { t: 0.34, p: { torso: [0.05, -0.65, 0], armR: [-1.2, 0, 0], foreArmR: [-0.15, 0, 0] } },
      { t: 0.5, p: { torso: [0, -0.1, 0], armR: [-0.3, 0, 0], foreArmR: [-0.4, 0, 0] } },
      { t: 0.55, p: { torso: [0, 0, 0], armR: [0, 0, 0], foreArmR: [-0.2, 0, 0] } },
    ],
  },
  attack2: {
    dur: 0.65,
    keys: [
      { t: 0.0, p: { torso: [0, 0, 0] } },
      { t: 0.25, p: { torso: [-0.25, 0, 0], armR: [2.7, 0, 0], foreArmR: [-1.2, 0, 0], armL: [1.0, 0, 0.2] } },
      { t: 0.42, p: { torso: [0.35, 0, 0], armR: [-1.8, 0, 0], foreArmR: [-0.1, 0, 0], armL: [-0.6, 0, 0.2] } },
      { t: 0.55, p: { torso: [0.1, 0, 0], armR: [-0.8, 0, 0], armL: [-0.3, 0, 0.2] } },
      { t: 0.65, p: { torso: [0, 0, 0], armR: [0, 0, 0], armL: [0, 0, 0.1] } },
    ],
  },
  spin: {
    dur: 0.75,
    keys: [
      { t: 0.0, p: { armR: [-0.8, 0, -0.6], foreArmR: [-0.4, 0, 0], spin: [0] } },
      { t: 0.18, p: { armR: [-0.9, 0, -1.3], foreArmR: [-0.3, 0, 0], torso: [0.05, 0, 0] } },
      { t: 0.5, p: { armR: [-0.9, 0, -1.3], spin: [0] } },
      { t: 0.7, p: { armR: [-0.9, 0, -1.3], spin: [-TAU] } },
      { t: 0.75, p: { armR: [0, 0, 0], torso: [0, 0, 0], spin: [-TAU] } },
    ],
  },
  dodge: {
    dur: 0.5,
    keys: [
      { t: 0.0, p: { torso: [0.6, 0, 0], legL: [-1.0, 0, 0], legR: [0.4, 0, 0], shinL: [1.6, 0, 0], shinR: [1.2, 0, 0], armL: [-1.2, 0, 0.3], armR: [-1.2, 0, -0.3] } },
      { t: 0.5, p: { torso: [0, 0, 0], legL: [0, 0, 0], legR: [0, 0, 0], shinL: [0, 0, 0], shinR: [0, 0, 0], armL: [0, 0, 0.1], armR: [0, 0, -0.1] } },
    ],
  },
  hurt: {
    dur: 0.35,
    keys: [
      { t: 0.0, p: { torso: [0, 0, 0], head: [0, 0, 0] } },
      { t: 0.08, p: { torso: [-0.35, 0, 0], head: [-0.4, 0, 0], armL: [-0.4, 0, 0.1] } },
      { t: 0.35, p: { torso: [0, 0, 0], head: [0, 0, 0], armL: [0, 0, 0.1] } },
    ],
  },
  strike: {
    dur: 0.45,
    keys: [
      { t: 0.0, p: { armR: [2.2, 0, 0], foreArmR: [-0.9, 0, 0], torso: [-0.1, 0.4, 0] } },
      { t: 0.18, p: { armR: [-1.3, 0, 0], foreArmR: [-0.2, 0, 0], torso: [0.1, -0.6, 0] } },
      { t: 0.45, p: { armR: [-0.2, 0, 0], foreArmR: [-0.3, 0, 0], torso: [0, 0, 0] } },
    ],
  },
  slam: {
    dur: 0.42,
    keys: [
      { t: 0.0, p: { armL: [2.8, 0, 0.2], armR: [2.8, 0, -0.2], torso: [-0.3, 0, 0] } },
      { t: 0.3, p: { armL: [-1.9, 0, 0.2], armR: [-1.9, 0, -0.2], torso: [0.5, 0, 0] } },
      { t: 0.42, p: { armL: [-1.0, 0, 0.2], armR: [-1.0, 0, -0.2], torso: [0.1, 0, 0] } },
    ],
  },
  death: {
    dur: 1.1,
    hold: true,
    keys: [
      { t: 0.0, p: { torso: [0, 0, 0] } },
      { t: 1.1, p: { torso: [-1.45, 0, 0], head: [-0.6, 0, 0], armL: [0.4, 0, 0.9], armR: [0.4, 0, -0.9], legL: [-0.8, 0, 0], shinL: [1.2, 0, 0], legR: [-0.5, 0, 0], shinR: [1.0, 0, 0] } },
    ],
  },
};

// Pre-index clip keys by joint: byJoint[joint] = [{ t, v }] sorted by time.
function compile(def) {
  if (def.byJoint) return def;
  def.byJoint = {};
  for (const k of def.keys) {
    for (const name in k.p) {
      (def.byJoint[name] ||= []).push({ t: k.t, v: k.p[name] });
    }
  }
  return def;
}
for (const k in CLIPS) compile(CLIPS[k]);

function sample(keys, t) {
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const e = u * u * (3 - 2 * u); // smoothstep ease between keys
      return [lerp(a.v[0], b.v[0], e), lerp(a.v[1], b.v[1], e), lerp(a.v[2], b.v[2], e)];
    }
  }
  return keys[keys.length - 1].v;
}

// --- Rig: the runtime animator ------------------------------------------

export class Rig {
  constructor(human) {
    this.h = human;
    this.j = human.j;
    this.cur = {};
    this.tgt = {};
    for (const n of JOINTS) this.cur[n] = [0, 0, 0];
    this.phase = 0;
    this.time = 0;
    this.clip = null;
    this.hold = null;
    this.spin = 0;     // spin pseudo-joint, applied by the owner to root yaw
    this.bob = 0;
    this.hipBaseY = human.j.hips.position.y;
  }

  play(name, { speed = 1, onDone = null, hold = false } = {}) {
    const def = CLIPS[name];
    if (!def) throw new Error(`unknown clip ${name}`);
    this.clip = { name, def, t: 0, speed, onDone, hold: hold || !!def.hold, fired: false };
  }

  get clipName() {
    return this.clip?.name ?? null;
  }

  get clipDone() {
    return !this.clip;
  }

  setHold(name) {
    this.hold = name ? HOLDS[name] : null;
  }

  // speed01: 0 = standing, 1 = full run.
  update(dt, speed01) {
    this.time += dt;
    this.phase += dt * speed01 * 13;
    const tgt = locomotion(this.tgt, this.time, speed01, this.phase);

    if (this.hold) for (const n in this.hold) tgt[n] = this.hold[n];

    let spinTarget = null;
    const c = this.clip;
    if (c) {
      c.t += dt * c.speed;
      const tt = Math.min(c.t, c.def.dur);
      for (const n in c.def.byJoint) {
        const v = sample(c.def.byJoint[n], tt);
        if (n === 'spin') spinTarget = v[0];
        else tgt[n] = v;
      }
      if (spinTarget !== null) this.spin = spinTarget;
      if (c.t >= c.def.dur) {
        if (!c.fired) {
          c.fired = true;
          c.onDone?.();
        }
        if (!c.hold) {
          // A spin ends on a full turn, so resetting to 0 is visually identical.
          if (c.name === 'spin') this.spin = 0;
          this.clip = null;
        }
      }
    } else {
      this.spin = damp(this.spin, 0, 10, dt);
    }

    const rate = c ? 26 : 13;
    for (const n of JOINTS) {
      const cu = this.cur[n];
      const tg = tgt[n] || [0, 0, 0];
      cu[0] = damp(cu[0], tg[0], rate, dt);
      cu[1] = damp(cu[1], tg[1], rate, dt);
      cu[2] = damp(cu[2], tg[2], rate, dt);
      this.j[n].rotation.set(cu[0], cu[1], cu[2]);
    }
    // Footfall bob: small vertical hip movement on each step.
    const targetBob = Math.abs(Math.sin(this.phase)) * 0.045 * speed01;
    this.bob = damp(this.bob, targetBob, 20, dt);
    this.j.hips.position.y = this.hipBaseY - this.bob;
  }
}

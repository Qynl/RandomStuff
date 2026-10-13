/**
 * IRONWOOD - soldier rigs.
 *
 * Every soldier in the game is assembled from primitives in code and animated
 * procedurally: no skeletons, no animation files, no motion capture. The rig
 * exposes damage spheres (head / torso / limbs with multipliers) that bullets
 * and AI vision use, plus a muzzle socket for tracers and muzzle flash.
 */

import * as THREE from 'three';
import { TAU, clamp, lerp, saturate, damp, rand, choice } from '../core/math.js';

export const TEAM_DEFS = {
  us: {
    id: 'us',
    name: 'US Army',
    camo: 'camoUS',
    vestColor: 0x4e5138,
    helmetColor: 0x4a4c3c,
    skinColor: 0x6a4f39,
    accentColor: 0x7d8a5a,
    hudColor: '#8bd46a',
    short: 'US',
  },
  opfor: {
    id: 'opfor',
    name: 'OpFor',
    camo: 'camoOPFOR',
    vestColor: 0x2f332c,
    helmetColor: 0x33352e,
    skinColor: 0x5c4534,
    accentColor: 0x6b7280,
    hudColor: '#e06a5a',
    short: 'OP',
  },
};

const LIMB_R = 0.062;
const ARM_R = 0.052;

function capsule(radius, length, material, segments = 6) {
  const geo = new THREE.CapsuleGeometry(radius, length, 3, segments);
  geo.translate(0, -length / 2 - radius, 0);
  const mesh = new THREE.Mesh(geo, material);
  return mesh;
}

function boxMesh(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** A compact rifle silhouette for soldiers held in other people's hands. */
function buildCarriedRifle(textures, opts = {}) {
  const g = new THREE.Group();
  const metal = textures.pbr('gunmetal', { repeat: 1.6, surface: 'metal' });
  g.add(boxMesh(0.075, 0.11, 0.52, metal, 0, 0, -0.16));        // receiver
  g.add(boxMesh(0.03, 0.03, 0.42, metal, 0, 0.02, -0.6));       // barrel
  const mag = boxMesh(0.045, 0.17, 0.07, textures.pbr('polymer', { repeat: 2 }), 0, -0.12, -0.14);
  mag.rotation.x = 0.22;
  g.add(mag);
  g.add(boxMesh(0.05, 0.09, 0.16, textures.pbr('polymer', { repeat: 2 }), 0, -0.07, 0.12)); // grip
  g.add(boxMesh(0.055, 0.08, 0.22, textures.pbr('polymer', { repeat: 2 }), 0, 0.0, 0.28));  // stock
  if (opts.scope) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 10), metal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.16);
    g.add(scope);
  } else {
    g.add(boxMesh(0.04, 0.05, 0.1, metal, 0, 0.08, -0.1));
  }
  return g;
}

export class SoldierRig {
  constructor(textures, teamId = 'us', opts = {}) {
    this.textures = textures;
    this.team = TEAM_DEFS[teamId] ? teamId : 'us';
    const team = TEAM_DEFS[this.team];
    this.opts = opts;

    const camo = textures.pbr(team.camo, { repeat: 2.4, surface: 'cloth' });
    this.materials = {
      camo,
      vest: textures.pbr('cloth', { repeat: 3, color: team.vestColor, surface: 'cloth' }),
      helmet: textures.pbr('metalPainted', { repeat: 2, color: team.helmetColor, surface: 'metal' }),
      glove: textures.pbr('leatherGlove', { repeat: 2, surface: 'ruber' }),
      boot: textures.pbr('leatherGlove', { repeat: 3, color: 0x2a2118, surface: 'rubber' }),
      skin: new THREE.MeshStandardMaterial({ color: team.skinColor, roughness: 0.72, metalness: 0 }),
    };

    this.group = new THREE.Group();
    this.group.name = `soldier-${this.team}`;

    // --- bone hierarchy -----------------------------------------
    this.root = new THREE.Group();               // feet at origin
    this.body = new THREE.Group();               // yaw + prone handling
    this.hips = new THREE.Group();
    this.hips.position.y = 0.94;
    this.torso = new THREE.Group();
    this.torso.position.y = 0.0;
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.22, 0.5, 0);
    this.armR.position.set(0.22, 0.5, 0);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.11, -0.02, 0);
    this.legR.position.set(0.11, -0.02, 0);

    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.add(this.torso);
    this.hips.add(this.legL, this.legR);
    this.torso.add(this.head, this.armL, this.armR);
    this.group.add(this.root);

    // --- torso ---------------------------------------------------
    const chest = boxMesh(0.4, 0.5, 0.24, camo, 0, 0.22, 0);
    chest.castShadow = true;
    this.torso.add(chest);
    const abdomen = boxMesh(0.33, 0.26, 0.21, camo, 0, -0.08, 0);
    abdomen.castShadow = true;
    this.torso.add(abdomen);
    // plate carrier + pouches
    const vest = boxMesh(0.43, 0.42, 0.3, this.materials.vest, 0, 0.24, 0.005);
    vest.castShadow = true;
    this.torso.add(vest);
    for (let i = 0; i < 3; i++) {
      this.torso.add(boxMesh(0.09, 0.1, 0.06, this.materials.vest, -0.1 + i * 0.1, 0.02, -0.14));
    }
    if (opts.radio) {
      const pouch = boxMesh(0.1, 0.16, 0.05, this.materials.vest, -0.14, 0.2, -0.17);
      this.torso.add(pouch);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 5), this.materials.helmet);
      antenna.position.set(-0.16, 0.5, -0.18);
      this.torso.add(antenna);
    }
    // shoulder pads
    for (const s of [-1, 1]) {
      const pad = boxMesh(0.11, 0.1, 0.22, this.materials.vest, s * 0.23, 0.4, 0);
      pad.castShadow = true;
      this.torso.add(pad);
    }

    // --- head ----------------------------------------------------
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 8), this.materials.skin);
    neck.position.y = -0.04;
    this.head.add(neck);
    const skull = boxMesh(0.17, 0.21, 0.19, this.materials.skin, 0, 0.1, 0);
    skull.castShadow = true;
    this.head.add(skull);
    const jaw = boxMesh(0.13, 0.07, 0.15, this.materials.skin, 0, -0.01, 0.02);
    this.head.add(jaw);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, TAU, 0, Math.PI * 0.62), this.materials.helmet);
    helmet.position.y = 0.13;
    helmet.scale.set(1.05, 0.95, 1.12);
    helmet.castShadow = true;
    this.head.add(helmet);
    if (opts.goggles !== false) {
      const goggles = boxMesh(0.15, 0.05, 0.04, this.materials.vest, 0, 0.16, 0.115);
      this.head.add(goggles);
    }
    this.head.rotation.y = Math.PI; // face -Z by default (matches forward)

    // --- arms ----------------------------------------------------
    this.armL.userData.upper = capsule(ARM_R, 0.26, this.materials.camo);
    this.armL.add(this.armL.userData.upper);
    this.foreL = new THREE.Group();
    this.foreL.position.y = -0.32;
    this.armL.add(this.foreL);
    this.foreL.userData.mesh = capsule(ARM_R * 0.92, 0.24, this.materials.camo);
    this.foreL.add(this.foreL.userData.mesh);
    this.handL = new THREE.Group();
    this.handL.position.y = -0.3;
    this.foreL.add(this.handL);
    this.handL.userData.mesh = boxMesh(0.09, 0.11, 0.1, this.materials.glove);
    this.handL.add(this.handL.userData.mesh);

    this.armR.userData.upper = capsule(ARM_R, 0.26, this.materials.camo);
    this.armR.add(this.armR.userData.upper);
    this.foreR = new THREE.Group();
    this.foreR.position.y = -0.32;
    this.armR.add(this.foreR);
    this.foreR.userData.mesh = capsule(ARM_R * 0.92, 0.24, this.materials.camo);
    this.foreR.add(this.foreR.userData.mesh);
    this.handR = new THREE.Group();
    this.handR.position.y = -0.3;
    this.foreR.add(this.handR);
    this.handR.userData.mesh = boxMesh(0.09, 0.11, 0.1, this.materials.glove);
    this.handR.add(this.handR.userData.mesh);

    // --- legs ----------------------------------------------------
    for (const leg of [this.legL, this.legR]) {
      leg.userData.thigh = capsule(LIMB_R * 1.25, 0.42, this.materials.camo);
      leg.add(leg.userData.thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.5;
      leg.add(knee);
      leg.userData.knee = knee;
      knee.userData.shin = capsule(LIMB_R, 0.42, this.materials.camo);
      knee.add(knee.userData.shin);
      const foot = new THREE.Group();
      foot.position.y = -0.5;
      knee.add(foot);
      leg.userData.foot = foot;
      foot.userData.mesh = boxMesh(0.12, 0.09, 0.24, this.materials.boot, 0, -0.02, 0.03);
      foot.add(foot.userData.mesh);
      // kneepad
      const pad = boxMesh(0.12, 0.12, 0.1, this.materials.vest, 0, 0.0, 0.06);
      knee.add(pad);
    }

    // --- carried weapon -----------------------------------------
    this.weaponMount = new THREE.Group();
    this.weaponMount.position.set(0.06, -0.1, -0.1);
    this.torso.add(this.weaponMount);
    this.rifle = buildCarriedRifle(textures, { scope: opts.scope });
    this.weaponMount.add(this.rifle);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, -0.86);
    this.weaponMount.add(this.muzzle);

    // --- animation state -----------------------------------------
    this.phase = Math.random() * TAU;
    this.time = 0;
    this.speed = 0;
    this.stance = 'stand';
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.aimAlpha = 0;
    this.recoil = 0;
    this.reloadT = 0;
    this.dead = false;
    this.deadTime = 0;
    this.hitReact = 0;
    this.fallDir = 1;
    this.proneness = 0;
    this.lastStepSide = 1;
    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.camera = null;
  }

  setTeam(teamId) {
    void teamId;
  }

  /** World-space muzzle position (for tracers + flash). */
  getMuzzleWorld(out = new THREE.Vector3()) {
    this.muzzle.getWorldPosition(out);
    return out;
  }

  getEyeWorld(out = new THREE.Vector3()) {
    this.head.getWorldPosition(out);
    out.y += 0.1;
    return out;
  }

  /** Standing/ crouching/ prone height offset handled by the owner. */
  setStance(stance) {
    this.stance = stance;
  }

  /**
   * Damage spheres in world space.
   * Each: { name, part, x, y, z, r, mult }
   */
  hitSpheres(out = []) {
    out.length = 0;
    const v = new THREE.Vector3();
    const push = (name, obj, r, mult, dy = 0) => {
      obj.getWorldPosition(v);
      out.push({ name, part: name, x: v.x, y: v.y + dy, z: v.z, r, mult });
    };
    push('head', this.head, 0.135, 3.4, 0.1);
    push('chest', this.torso, 0.26, 1.0, 0.26);
    push('abdomen', this.torso, 0.24, 0.95, -0.06);
    push('hips', this.hips, 0.24, 0.9, -0.02);
    push('armL', this.armL, 0.115, 0.6, -0.16);
    push('armR', this.armR, 0.115, 0.6, -0.16);
    push('foreL', this.foreL, 0.1, 0.65, -0.16);
    push('foreR', this.foreR, 0.1, 0.65, -0.16);
    push('legL', this.legL, 0.135, 0.7, -0.26);
    push('legR', this.legR, 0.135, 0.7, -0.26);
    push('calfL', this.legL.userData.knee, 0.115, 0.72, -0.26);
    push('calfR', this.legR.userData.knee, 0.115, 0.72, -0.26);
    return out;
  }

  /** Returns a step event ('left'|'right'|null) so owners can play footsteps. */
  animate(dt, state = {}) {
    this.time += dt;
    const speed = state.speed ?? this.speed;
    this.speed = speed;
    const moving = speed > 0.15;
    const sprinting = !!state.sprinting;
    const crouch = state.crouch ?? this.stance === 'crouch';
    this.dead = !!state.dead;
    this.aimAlpha = damp(this.aimAlpha, state.aiming ? 1 : 0, 9, dt);
    this.aimYaw = state.aimYaw ?? this.aimYaw;
    this.aimPitch = state.aimPitch ?? this.aimPitch;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.hitReact = Math.max(0, this.hitReact - dt * 4);
    if (state.firing) this.recoil = 1;
    if (state.reloading) this.reloadT = Math.min(1, (this.reloadT || 0) + dt * 1.1);
    else this.reloadT = Math.max(0, (this.reloadT || 0) - dt * 2.2);

    let stepEvent = null;

    if (this.dead) {
      this.deadTime += dt;
      const t = clamp(this.deadTime * 1.6, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.body.rotation.x = ease * (Math.PI / 2) * this.fallDir;
      this.hips.position.y = lerp(0.94, 0.18, ease);
      this.armL.rotation.set(lerp(-0.4, 0.9, ease), 0, lerp(0.3, 1.4, ease));
      this.armR.rotation.set(lerp(-0.4, 0.7, ease), 0, lerp(-0.3, -1.1, ease));
      this.foreL.rotation.x = lerp(-0.5, -0.2, ease);
      this.foreR.rotation.x = lerp(-0.5, -0.1, ease);
      this.legL.rotation.x = lerp(0, 0.5, ease);
      this.legR.rotation.x = lerp(0, -0.3, ease);
      this.head.rotation.x = lerp(0, 0.4, ease);
      return null;
    }
    this.deadTime = 0;

    // stance: crouch lowers the hips, prone goes flat
    const proneTarget = state.prone ? 1 : 0;
    this.proneness = damp(this.proneness, proneTarget, 8, dt);
    const crouchTarget = crouch ? 1 : 0;
    this._crouch = damp(this._crouch ?? 0, crouchTarget, 10, dt);

    // walk cycle
    const cycleSpeed = speed * (sprinting ? 1.75 : 1.5) + 0.6;
    if (moving) this.phase += dt * cycleSpeed * 2.2;
    const swing = moving ? Math.min(1, speed / 4.6) * (sprinting ? 1.25 : 1) : 0;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    const crouchAmount = this._crouch * (1 - this.proneness);
    this.hips.position.y = lerp(0.94, 0.62, crouchAmount) - this.proneness * 0.62;
    this.body.rotation.x = this.proneness * (Math.PI / 2) * 0.86;

    const legSwing = swing * 0.62;
    this.legL.rotation.x = s * legSwing;
    this.legR.rotation.x = -s * legSwing;
    this.legL.userData.knee.rotation.x = Math.max(-0.1, -Math.abs(c) * swing * 0.5 - crouchAmount * 0.7 - this.proneness * 0.4);
    this.legR.userData.knee.rotation.x = Math.max(-0.1, -Math.abs(s) * swing * 0.5 - crouchAmount * 0.7 - this.proneness * 0.4);
    this.legL.userData.foot.rotation.x = -this.legL.rotation.x * 0.4 + crouchAmount * 0.3;
    this.legR.userData.foot.rotation.x = -this.legR.rotation.x * 0.4 + crouchAmount * 0.3;

    // leg step events for footstep audio
    if (moving) {
      const prev = this._prevSin ?? 0;
      if (prev <= 0 && s > 0 && this.lastStepSide !== 1) {
        stepEvent = 'right';
        this.lastStepSide = 1;
      } else if (prev >= 0 && s < 0 && this.lastStepSide !== -1) {
        stepEvent = 'left';
        this.lastStepSide = -1;
      }
      this._prevSin = s;
    }

    // torso counter rotation + bob
    this.torso.rotation.y = -c * swing * 0.12;
    this.torso.rotation.x = this._crouch * 0.3 + this.proneness * -0.55 + Math.abs(s) * swing * 0.03 + this.recoil * 0.06;
    this.hips.rotation.z = c * swing * 0.05;

    // head: turns toward where the owner is looking
    const yaw = clamp((state.aimYaw ?? 0) * 0.6, -0.8, 0.8);
    const pitch = clamp((state.aimPitch ?? 0) * 0.7, -0.7, 0.7);
    this.head.rotation.y = Math.PI + yaw;
    this.head.rotation.x = pitch * 0.8 + this._crouch * 0.12;

    // arms: hip carry vs shouldered aim
    const aim = this.aimAlpha;
    const recoil = this.recoil;
    const idleSway = moving ? Math.sin(this.phase * 0.5) * 0.04 : Math.sin(this.time * 1.4) * 0.02;

    // support hand (left) goes to the handguard when aiming
    const lTarget = {
      x: lerp(-0.35 + idleSway, -0.42, aim),
      y: lerp(-0.15, -1.05, aim),
      z: lerp(-0.55, -0.62, aim),
    };
    const rTarget = {
      x: lerp(0.3, 0.34, aim),
      y: lerp(-0.35, -0.85, aim),
      z: lerp(-0.25, -0.42, aim),
    };
    this.armL.rotation.x = damp(this.armL.rotation.x, lTarget.y - Math.PI / 2, 12, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, 0.55 - lTarget.x, 12, dt);
    this.armL.rotation.y = damp(this.armL.rotation.y, lerp(-0.5, 0.15, aim), 12, dt);
    this.foreL.rotation.x = damp(this.foreL.rotation.x, lerp(-1.5, -0.75, aim), 12, dt);
    void lTarget;
    this.armR.rotation.x = damp(this.armR.rotation.x, rTarget.y - Math.PI / 2 - recoil * 0.25, 12, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, -0.5 + rTarget.x, 12, dt);
    this.armR.rotation.y = damp(this.armR.rotation.y, lerp(0.25, -0.1, aim), 12, dt);
    this.foreR.rotation.x = damp(this.foreR.rotation.x, lerp(-1.9, -1.35, aim), 12, dt);
    void rTarget;

    // weapon mount: hip fire juts forward, ADS tucks into the shoulder line
    this.weaponMount.rotation.x = lerp(0.12, 0, aim) - recoil * 0.12 + this.recoil * 0.0;
    this.weaponMount.position.set(lerp(0.14, 0.0, aim), lerp(-0.34, -0.16, aim), lerp(-0.3, -0.34, aim));
    this.rifle.rotation.x = recoil * 0.12;
    this.rifle.position.z = recoil * 0.06;

    // reload: left hand drops to the mag well and back
    if (this.reloadT > 0) {
      const rt = Math.sin(saturate(this.reloadT) * Math.PI);
      this.armL.rotation.x -= rt * 0.5;
      this.foreL.rotation.x += rt * 0.4;
      this.rifle.rotation.z = rt * 0.22;
    }

    // hit flinch
    if (this.hitReact > 0.01) {
      const f = this.hitReact;
      this.torso.rotation.z = Math.sin(this.time * 40) * 0.06 * f;
      this.torso.rotation.x += f * 0.08;
    }

    this.rifle.visible = !!state.showWeapon;
    return stepEvent;
  }
}

/** Pre-built rig cache so bots spawn without hitching. */
export class SoldierFactory {
  constructor(textures) {
    this.textures = textures;
  }
  create(team, opts) {
    return new SoldierRig(this.textures, team, opts);
  }
}

export { buildCarriedRifle, choice as _choice, rand as _rand };

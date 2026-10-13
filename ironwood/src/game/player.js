/**
 * IRONWOOD - player controller.
 *
 * Acceleration based movement on the analytic heightfield with step-up over
 * low cover, stamina, stances, fall damage, view bob and the small camera
 * touches that make a shooter feel like a shooter (strafe roll, landing dip,
 * suppression shake).
 *
 * The same class drives remote soldiers: when `isRemote` is set the owner calls
 * applyNetworkState() instead of reading local input.
 */

import * as THREE from 'three';
import { TAU, clamp, lerp, damp, smoothstep, rand, vlenXZ } from '../core/math.js';

export const STANCES = {
  stand: { eye: 1.62, speed: 4.35, scale: 1 },
  crouch: { eye: 1.06, speed: 2.25, scale: 0.78 },
  prone: { eye: 0.58, speed: 1.05, scale: 0.55 },
};

export class Player {
  constructor(world, opts = {}) {
    this.world = world;
    this.id = opts.id ?? `p${Math.floor(Math.random() * 1e6)}`;
    this.name = opts.name ?? 'Operator';
    this.team = opts.team ?? 'us';
    this.isLocal = !!opts.isLocal;
    this.isBot = false;
    this.isRemote = !!opts.isRemote;
    this.audio = opts.audio ?? null;
    this.fx = opts.fx ?? null;
    this.radius = 0.38;
    this.height = 1.8;

    this.position = new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    this.velocity = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.pitch = 0;

    this.stance = 'stand';
    this.eyeHeight = STANCES.stand.eye;
    this.targetEye = STANCES.stand.eye;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.stamina = 1;
    this.staminaDelay = 0;
    this.grounded = false;
    this.coyote = 0;
    this.speed = 0;
    this.sprinting = false;
    this.wasSprinting = false;
    this.stepAccum = 0;
    this.bobPhase = 0;
    this.bobOffset = new THREE.Vector3();
    this.roll = 0;
    this.landDip = 0;
    this.suppression = 0;
    this.damageShake = 0;
    this.regenDelay = 0;
    this.lastDamageDir = null;
    this.footstepSurface = 'dirt';
    this.jumpCooldown = 0;
    this.deathTime = 0;
    this.kills = 0;
    this.deaths = 0;
    this.rig = null;
    this.lastGroundY = this.position.y;
    this._tmp = new THREE.Vector3();
    this._hitSpheres = [];
    this.weaponId = opts.weapon ?? 'm4a1';
    this.netSeq = 0;
  }

  attachRig(rig) {
    this.rig = rig;
    rig.group.position.copy(this.position);
    rig.group.rotation.y = this.yaw;
    if (this.isLocal && rig.group) {
      // The local soldier exists only to cast a shadow into the world (and to
      // be visible to spectators on other machines). Drawing it with
      // colorWrite/depthWrite off keeps it invisible to the first person camera
      // while the shadow map still picks it up.
      rig.group.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone ? o.material.clone() : o.material;
          o.material.colorWrite = false;
          o.material.depthWrite = false;
          o.material.side = THREE.FrontSide;
          o.castShadow = true;
        }
      });
    }
  }

  eyePosition(out = new THREE.Vector3()) {
    return out.set(
      this.position.x,
      this.position.y + this.eyeHeight + this.bobOffset.y + this.landDip,
      this.position.z
    );
  }

  lookDirection(out = new THREE.Vector3()) {
    out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return out;
  }

  get chestHeight() {
    return this.stance === 'prone' ? 0.42 : this.stance === 'crouch' ? 0.85 : 1.25;
  }

  /** Damage spheres used by bullets and by bots' aim points. */
  hitSpheres() {
    if (this.rig && this.rig.group.visible !== false) return this.rig.hitSpheres(this._hitSpheres);
    const out = this._hitSpheres;
    out.length = 0;
    const h = this.stance === 'prone' ? 0.4 : this.stance === 'crouch' ? 0.95 : 1.62;
    out.push({ name: 'head', part: 'head', x: this.position.x, y: this.position.y + h, z: this.position.z, r: 0.16, mult: 3.4 });
    out.push({ name: 'chest', part: 'chest', x: this.position.x, y: this.position.y + h * 0.76, z: this.position.z, r: 0.3, mult: 1.0 });
    out.push({ name: 'abdomen', part: 'abdomen', x: this.position.x, y: this.position.y + h * 0.55, z: this.position.z, r: 0.28, mult: 0.95 });
    out.push({ name: 'hips', part: 'hips', x: this.position.x, y: this.position.y + h * 0.42, z: this.position.z, r: 0.28, mult: 0.9 });
    out.push({ name: 'legL', part: 'legL', x: this.position.x - 0.12, y: this.position.y + h * 0.24, z: this.position.z, r: 0.18, mult: 0.7 });
    out.push({ name: 'legR', part: 'legR', x: this.position.x + 0.12, y: this.position.y + h * 0.24, z: this.position.z, r: 0.18, mult: 0.7 });
    return out;
  }

  aimPoint() {
    return {
      x: this.position.x,
      y: this.position.y + (this.stance === 'prone' ? 0.4 : this.stance === 'crouch' ? 0.95 : 1.4),
      z: this.position.z,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                          */
  /* ------------------------------------------------------------------ */

  readCommand(input) {
    const cmd = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      crouch: false,
      prone: false,
      sprint: false,
      yaw: this.yaw,
      pitch: this.pitch,
    };
    if (input.touch.active) {
      cmd.moveX = input.touch.moveX;
      cmd.moveZ = input.touch.moveY;
    } else {
      if (input.isDown('forward')) cmd.moveZ -= 1;
      if (input.isDown('back')) cmd.moveZ += 1;
      if (input.isDown('left')) cmd.moveX -= 1;
      if (input.isDown('right')) cmd.moveX += 1;
    }
    const len = Math.hypot(cmd.moveX, cmd.moveZ);
    if (len > 1) {
      cmd.moveX /= len;
      cmd.moveZ /= len;
    }
    cmd.jump = input.isDown('jump') || input.touch.jump;
    cmd.crouch = input.isDown('crouch');
    cmd.prone = input.wasPressed('prone');
    cmd.sprint = input.isDown('sprint') && cmd.moveZ < -0.4 && !input.adsDown();
    return cmd;
  }

  update(dt, cmd, ctx = {}) {
    if (!this.alive) {
      this.deathTime += dt;
      this.velocity.set(0, 0, 0);
      if (this.rig) this.rig.animate(dt, { dead: true });
      return;
    }

    const stanceDef = STANCES[this.stance];
    const wantsSprint = !!cmd.sprint && this.stamina > 0.06 && this.stance === 'stand';
    this.sprinting = wantsSprint && Math.hypot(cmd.moveX, cmd.moveZ) > 0.2;

    // stamina
    if (this.sprinting) {
      this.stamina = clamp(this.stamina - dt * 0.19, 0, 1);
      this.staminaDelay = 0.9;
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay <= 0) this.stamina = clamp(this.stamina + dt * 0.24, 0, 1);
    }

    // movement input in world space
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const wx = cmd.moveX * cos - cmd.moveZ * sin;
    const wz = -cmd.moveX * sin - cmd.moveZ * cos;
    const inputLen = Math.hypot(wx, wz);

    let maxSpeed = stanceDef.speed * (this.sprinting ? 1.52 : 1);
    if (this.health < 30) maxSpeed *= 0.94;
    // wading drags: knee deep is annoying, waist deep is slow
    const wade = this.world.waterDepth(this.position.x, this.position.z);
    if (wade > 0.25) maxSpeed *= 1 - Math.min(0.45, (wade - 0.25) * 0.3);

    const accel = this.grounded ? 52 : 14;
    const targetVx = wx * maxSpeed;
    const targetVz = wz * maxSpeed;
    if (inputLen > 0.01) {
      this.velocity.x += (targetVx - this.velocity.x) * clamp(accel * dt / Math.max(maxSpeed, 0.001), 0, 1);
      this.velocity.z += (targetVz - this.velocity.z) * clamp(accel * dt / Math.max(maxSpeed, 0.001), 0, 1);
    } else if (this.grounded) {
      const friction = Math.exp(-11 * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
      if (Math.abs(this.velocity.x) < 0.02) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.02) this.velocity.z = 0;
    }

    // gravity + jump
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.grounded) this.coyote = 0.12;
    else this.coyote = Math.max(0, this.coyote - dt);
    if (cmd.jump && this.coyote > 0 && this.jumpCooldown <= 0) {
      this.velocity.y = 6.35;
      this.grounded = false;
      this.coyote = 0;
      this.jumpCooldown = 0.25;
      if (this.audio) this.audio.jump();
      if (ctx.onJump) ctx.onJump();
    }
    this.velocity.y -= 22 * dt;
    if (this.velocity.y < -60) this.velocity.y = -60;

    // cliffs and deep water are walls to a soldier on foot
    if (this.grounded) {
      const limited = this.world.clampGroundMove(this.position.x, this.position.z, this.velocity.x, this.velocity.z);
      this.velocity.x = limited.x;
      this.velocity.z = limited.z;
    }

    // integrate
    const prevY = this.position.y;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // stance transitions
    if (this.stance !== 'prone' && cmd.prone) this.stance = 'prone';
    else if (this.stance === 'prone' && (cmd.jump || (cmd.crouch && !cmd.prone))) this.stance = 'crouch';
    else if (this.stance === 'crouch' && !cmd.crouch) this.stance = 'stand';
    else if (this.stance === 'stand' && cmd.crouch) this.stance = 'crouch';
    if (this.sprinting) this.stance = 'stand';

    const sdef = STANCES[this.stance];
    this.targetEye = sdef.eye;
    this.eyeHeight = damp(this.eyeHeight, this.targetEye, 10, dt);
    this.height = this.stance === 'prone' ? 0.85 : this.stance === 'crouch' ? 1.35 : 1.8;

    // world collision
    const wasGrounded = this.grounded;
    this.world.resolveCollisions(this.position, this.radius, this.height);

    // ground support (terrain + climbable props)
    const support = this.world.supportHeight(this.position.x, this.position.z, this.position.y + 0.62);
    const climbing = support > this.position.y && support - this.position.y <= 0.62;
    if (this.position.y <= support + 0.001 || climbing) {
      if (!wasGrounded && this.velocity.y < -6) {
        const impact = -this.velocity.y;
        if (this.audio) this.audio.land(clamp(impact / 16, 0, 1));
        this.landDip = -clamp(impact * 0.012, 0, 0.16);
        if (impact > 12.5) {
          const dmg = (impact - 12.5) * 6.4;
          this.damage(dmg, { fall: true, direction: null });
        }
        if (ctx.onLand) ctx.onLand(impact);
      }
      this.position.y = support;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // stepped up onto something: let the camera follow smoothly
    void prevY;

    // speed + footsteps
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = horizontal;
    if (this.grounded && horizontal > 0.6) {
      const stride = this.sprinting ? 1.05 : this.stance === 'prone' ? 1.4 : 0.82;
      this.stepAccum += horizontal * dt;
      if (this.stepAccum >= stride) {
        this.stepAccum = 0;
        this.footstepSurface = this.world.surfaceAt(this.position.x, this.position.z);
        if (this.audio) {
          this.audio.footstep(this.footstepSurface, { position: this.position, gain: this.stance === 'crouch' ? 0.12 : 0.24 });
        }
        if (ctx.onFootstep) ctx.onFootstep(this.footstepSurface);
      }
    } else {
      this.stepAccum = Math.min(this.stepAccum, 0.7);
    }

    // view bob
    if (this.grounded && horizontal > 0.3) {
      this.bobPhase += dt * (this.sprinting ? 11.5 : 7.4) * clamp(horizontal / 4.4, 0.35, 1.8);
    } else {
      this.bobPhase += dt * 1.5;
      this.bobOffset.y = damp(this.bobOffset.y, 0, 6, dt);
    }
    const bobAmp = clamp(horizontal / 6.6, 0, 1) * (this.stance === 'prone' ? 0.1 : 1) * 0.032;
    this.bobOffset.y = damp(this.bobOffset.y, Math.abs(Math.sin(this.bobPhase)) * -bobAmp, 14, dt);
    const bobX = Math.sin(this.bobPhase) * bobAmp * 0.6;

    // strafe roll
    const strafe = (cmd.moveX ?? 0);
    const rollTarget = -strafe * 0.016 - (this.sprinting ? Math.sin(this.bobPhase) * 0.004 : 0);
    this.roll = damp(this.roll, rollTarget, 8, dt);

    // landing dip recovery
    this.landDip = damp(this.landDip, 0, 9, dt);

    // suppression + damage shake decay
    this.suppression = Math.max(0, this.suppression - dt * 1.4);
    this.damageShake = Math.max(0, this.damageShake - dt * 2.2);

    // health regeneration
    this.regenDelay = Math.max(0, this.regenDelay - dt);
    if (this.regenDelay <= 0 && this.health < this.maxHealth) {
      this.health = clamp(this.health + dt * 11, 0, this.maxHealth);
    }

    // rig animation (also drives shadows for the local player)
    if (this.rig) {
      this.rig.group.position.set(this.position.x, this.position.y, this.position.z);
      this.rig.group.rotation.y = this.yaw;
      this.rig.animate(dt, {
        speed: horizontal,
        sprinting: this.sprinting,
        crouch: this.stance === 'crouch',
        prone: this.stance === 'prone',
        aimYaw: 0,
        aimPitch: this.pitch,
        aiming: false,
        showWeapon: true,
        firing: ctx.firing,
        reloading: ctx.reloading,
      });
    }
    void bobX;
    void sin;
    void rand;
  }

  /** Bob/roll offsets for the camera. */
  cameraOffsets() {
    return {
      x: Math.sin(this.bobPhase) * clamp(this.speed / 6.6, 0, 1) * 0.02,
      y: this.bobOffset.y + this.landDip,
      roll: this.roll,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Damage / life cycle                                                 */
  /* ------------------------------------------------------------------ */

  damage(amount, info = {}) {
    if (!this.alive) return false;
    this.health -= amount;
    this.regenDelay = 4.2;
    this.damageShake = clamp(this.damageShake + amount * 0.02, 0, 1);
    if (info.direction) {
      this.lastDamageDir = { ...info.direction };
      this.suppression = clamp(this.suppression + amount * 0.03, 0, 1);
    }
    if (this.audio && !info.silent) {
      this.audio.hurt(clamp(amount / 60, 0.2, 1));
    }
    if (this.rig && amount > 1) {
      this.rig.hitReact = 1;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deathTime = 0;
      this.deaths++;
      return true;
    }
    return false;
  }

  respawn(spawn) {
    this.position.set(spawn.x, spawn.y + 0.05, spawn.z);
    this.velocity.set(0, 0, 0);
    this.yaw = spawn.yaw ?? this.yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.stance = 'stand';
    this.eyeHeight = STANCES.stand.eye;
    this.stamina = 1;
    this.deathTime = 0;
    this.suppression = 0;
    this.damageShake = 0;
    this.lastDamageDir = null;
    this.stepAccum = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Network                                                             */
  /* ------------------------------------------------------------------ */

  serializeState() {
    return {
      id: this.id,
      n: this.name,
      t: this.team,
      p: [+this.position.x.toFixed(2), +this.position.y.toFixed(2), +this.position.z.toFixed(2)],
      y: +this.yaw.toFixed(2),
      pi: +this.pitch.toFixed(2),
      st: this.stance,
      hp: Math.round(this.health),
      a: this.alive ? 1 : 0,
      w: this.weaponId,
      sp: +(this.speed > 0.4 ? clamp(this.speed / 6.6, 0, 1) : 0).toFixed(2),
    };
  }

  applyNetworkState(state, snapDt) {
    const [x, y, z] = state.p;
    this.targetPosition = this.targetPosition || new THREE.Vector3();
    this.targetPosition.set(x, y, z);
    this.yawTarget = state.y;
    this.pitchTarget = state.pi;
    this.stance = state.st ?? this.stance;
    this.health = state.hp ?? this.health;
    this.alive = !!state.a;
    this.weaponId = state.w ?? this.weaponId;
    this.remoteSpeed = state.sp ?? 0;
    if (!this._snapStarted) {
      this._snapStarted = true;
      this.position.copy(this.targetPosition);
      this.yaw = state.y;
      this.pitch = state.pi;
    } else {
      const k = clamp(12 * (snapDt ?? 0.05), 0, 1);
      this.position.lerp(this.targetPosition, k);
      this.yaw = dampAngleLocal(this.yaw, state.y, 12, snapDt ?? 0.05);
      this.pitch = damp(this.pitch, state.pi, 12, snapDt ?? 0.05);
    }
    if (!this.alive) {
      this.deathTime += snapDt ?? 0.05;
    }
    if (this.rig) {
      this.rig.group.position.set(this.position.x, this.position.y, this.position.z);
      this.rig.group.rotation.y = this.yaw;
      this.rig.animate(snapDt ?? 0.05, {
        speed: this.remoteSpeed * 6.6,
        sprinting: this.remoteSpeed > 0.85,
        crouch: this.stance === 'crouch',
        prone: this.stance === 'prone',
        aimYaw: 0,
        aimPitch: this.pitch,
        aiming: true,
        showWeapon: true,
        dead: !this.alive,
        firing: !!this.remoteFiring,
      });
    }
  }
}

function dampAngleLocal(a, b, lambda, dt) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export { smoothstep as _smoothstep, vlenXZ as _vlenXZ };

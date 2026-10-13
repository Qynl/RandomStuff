// The player character: camera-relative movement, a three-hit combo with timed
// damage windows, dodge roll with invulnerability frames, block with stamina,
// and hit reactions. All tuning is in config.js.

import * as THREE from 'three';
import { createHumanoid, Rig } from './rig.js';
import { damp, clamp, angleDiff } from '../engine/math.js';
import { PLAYER, COMBO } from './config.js';

const FACE_DOT = 0.3; // how "in front" an attacker must be for a block to count

export class Player {
  constructor(game) {
    this.game = game;
    const human = createHumanoid({
      body: 0x233244, armor: 0x7fb8c9, skin: 0xc99a74, accent: 0x7df9ff, bladeLength: 0.9,
    });
    this.human = human;
    this.rig = new Rig(human);
    game.scene.add(human.root);
    this.root = human.root;
    this.radius = PLAYER.radius;
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(0, 0, 14);
    this.vel = new THREE.Vector2(0, 0);
    this.yaw = Math.PI; // facing the arena centre
    this.hp = PLAYER.hp;
    this.stamina = PLAYER.stamina;
    this.state = 'free';   // free | attack | dodge | block | hurt | dead
    this.attackIndex = 0;
    this.attackT = 0;
    this.lastCombo = -1;
    this.comboT = 0;
    this.queued = false;
    this.hitSet = new Set();
    this.dodgeT = 0;
    this.dodgeDir = new THREE.Vector2();
    this.hurtT = 0;
    this.invulnT = 0;
    this.guardBroken = false;
    this.stepT = 0;
    this.speed01 = 0;
    this.iframesVisual = 0;
    this.kills = 0;
    this.damageTaken = 0;
    this.rig.clip = null;
    this.rig.setHold(null);
    this.root.visible = true;
    this.root.rotation.set(0, this.yaw, 0);
    this.root.position.copy(this.pos);
    this.rig.update(0, 0);
  }

  get alive() {
    return this.state !== 'dead';
  }

  get forward() {
    return new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw));
  }

  // Camera-relative planar move vector from input.
  _wish(input, camYaw) {
    const a = input.axis();
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw);
    const rz = Math.sin(camYaw);
    const x = rx * a.x - fx * a.y;
    const z = rz * a.x - fz * a.y;
    return { x, z, moving: a.moving };
  }

  update(dt, input, camYaw) {
    const g = this.game;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT === 0) this.lastCombo = -1;

    if (this.state === 'dead') {
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
      this.rig.update(dt, 0);
      return;
    }

    if (this.guardBroken && this.stamina >= 25) this.guardBroken = false;
    const blockHeld = input.isDown('Mouse2');
    const wish = this._wish(input, camYaw);
    let targetVx = 0;
    let targetVz = 0;
    let turnTo = null;
    let speed = 0;

    // Stamina regenerates unless it's being spent.
    if (this.state !== 'attack' && this.state !== 'block') {
      this.stamina = Math.min(PLAYER.stamina, this.stamina + PLAYER.staminaRegen * dt);
    }

    switch (this.state) {
      case 'free':
      case 'block': {
        const wantBlock = blockHeld && !this.guardBroken && this.stamina > 0;
        if (input.wasPressed('Mouse0') && !wantBlock) {
          // A strike needs its stamina up front; otherwise the swing is refused.
          const next = this.comboT > 0 ? (this.lastCombo + 1) % COMBO.length : 0;
          if (this.stamina >= COMBO[next].stamina) {
            this._startAttack(next);
            break;
          }
        }
        if (input.wasPressed('Space') && this.stamina >= PLAYER.dodgeCost) {
          this._startDodge(wish);
          break;
        }
        if (wantBlock) {
          if (this.state !== 'block') {
            this.state = 'block';
            this.rig.setHold('block');
          }
          this.stamina -= PLAYER.blockDrain * dt;
          if (this.stamina <= 0) {
            this.stamina = 0;
            this.guardBroken = true;
            this._leaveBlock();
          }
          // Face where the camera looks while guarding.
          turnTo = camYaw;
          speed = 1.9;
        } else {
          if (this.state === 'block') this._leaveBlock();
          const run = input.isDown('ShiftLeft', 'ShiftRight') && this.stamina > 4 && wish.moving;
          speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
          if (run) this.stamina = Math.max(0, this.stamina - 9 * dt);
          if (wish.moving) {
            targetVx = wish.x * speed;
            targetVz = wish.z * speed;
            turnTo = Math.atan2(wish.x, wish.z);
          }
        }
        break;
      }
      case 'attack': {
        this.attackT += dt;
        const cfg = COMBO[this.attackIndex];
        if (input.wasPressed('Mouse0')) this.queued = true;
        if (this.attackT >= cfg.win[0] && this.attackT <= cfg.win[1]) this._hitCheck(cfg);
        // Attacks lock you in place mostly, with a little lunge.
        targetVx = Math.sin(this.yaw) * (cfg.lunge * (this.attackT < cfg.dur * 0.4 ? 1 : 0.2));
        targetVz = Math.cos(this.yaw) * (cfg.lunge * (this.attackT < cfg.dur * 0.4 ? 1 : 0.2));
        if (this.attackT >= cfg.dur) this._endAttack();
        break;
      }
      case 'dodge': {
        this.dodgeT += dt;
        const dur = PLAYER.dodgeTime;
        const k = clamp(this.dodgeT / dur, 0, 1);
        const sp = PLAYER.dodgeSpeed * (1 - 0.6 * k);
        targetVx = this.dodgeDir.x * sp;
        targetVz = this.dodgeDir.y * sp;
        if (this.dodgeT >= dur) this._endDodge();
        break;
      }
      case 'hurt': {
        this.hurtT -= dt;
        if (this.hurtT <= 0) this.state = 'free';
        break;
      }
      default:
        break;
    }

    // Smooth velocity toward target and integrate.
    const accel = this.state === 'dodge' ? 40 : PLAYER.accel;
    this.vel.x = damp(this.vel.x, targetVx, accel, dt);
    this.vel.y = damp(this.vel.y, targetVz, accel, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    g.arena.resolve(this.pos, this.radius);

    if (turnTo !== null) {
      this.yaw += angleDiff(this.yaw, turnTo) * Math.min(1, dt * PLAYER.turnRate);
    }

    const planar = Math.hypot(this.vel.x, this.vel.y);
    this.speed01 = clamp(planar / PLAYER.runSpeed, 0, 1);
    this.rig.update(dt, this.state === 'block' ? this.speed01 * 0.6 : this.speed01);

    // Footsteps and dust while moving on the ground.
    this.stepT -= dt;
    if (planar > 1.2 && this.stepT <= 0 && this.state !== 'dodge') {
      this.stepT = 0.42 / (0.5 + this.speed01);
      g.sound.play('step');
      g.sparks.emit(this.pos.x, 0.05, this.pos.z, { count: 2, speed: 0.6, life: 0.4, size: 0.12, color: 0xb9a88c, gravity: 0.2 });
    }

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + this.rig.spin;

    // Blink while invulnerable, so the player can read "I'm safe right now".
    const blink = this.invulnT > 0 || (this.state === 'dodge' && this.dodgeT < PLAYER.dodgeIframes);
    this.root.visible = !blink || Math.floor(g.time * 24) % 2 === 0;

    // Passive stamina for other states handled above; clamp for safety.
    this.stamina = clamp(this.stamina, 0, PLAYER.stamina);
  }

  _leaveBlock() {
    this.state = 'free';
    this.rig.setHold(null);
  }

  // Melee aim assist: a swing turns toward the nearest enemy within reach, so
  // swings connect even when the player is not perfectly lined up.
  _snapToNearestEnemy() {
    let best = null;
    let bestD = 3.6;
    for (const e of this.game.enemies) {
      if (!e.targetable) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) this.yaw = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
  }

  _startAttack(i) {
    const cfg = COMBO[i];
    this._snapToNearestEnemy();
    this.state = 'attack';
    this.attackIndex = i;
    this.lastCombo = i;
    this.attackT = 0;
    this.queued = false;
    this.hitSet.clear();
    this.comboT = 0;
    this.stamina = Math.max(0, this.stamina - cfg.stamina);
    this.rig.play(cfg.clip);
    this.game.sound.play(i === 2 ? 'swingHeavy' : 'swing');
  }

  _endAttack() {
    // Chain the next hit only if the player can pay for it.
    const next = this.attackIndex < COMBO.length - 1 ? this.attackIndex + 1 : 0;
    if (this.queued && this.stamina >= COMBO[next].stamina) {
      this._startAttack(next);
      return;
    }
    this.state = 'free';
    this.comboT = PLAYER.comboWindow;
  }

  _hitCheck(cfg) {
    const g = this.game;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (const e of g.enemies) {
      if (!e.targetable || this.hitSet.has(e)) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > cfg.range + e.radius) continue;
      const cos = d > 1e-4 ? (dx * fx + dz * fz) / d : 1;
      if (Math.acos(clamp(cos, -1, 1)) > cfg.arc / 2) continue;
      this.hitSet.add(e);
      g.onPlayerHitEnemy(e, cfg, this);
    }
  }

  _startDodge(wish) {
    this.state = 'dodge';
    this.dodgeT = 0;
    this.stamina -= PLAYER.dodgeCost;
    if (wish.moving) {
      const l = Math.hypot(wish.x, wish.z) || 1;
      this.dodgeDir.set(wish.x / l, wish.z / l);
      this.yaw = Math.atan2(wish.x, wish.z);
    } else {
      this.dodgeDir.set(-Math.sin(this.yaw), -Math.cos(this.yaw)); // roll backwards
    }
    this.rig.play('dodge');
    this.game.sound.play('dodge');
  }

  _endDodge() {
    this.state = 'free';
  }

  // Returns 'dodge' | 'block' | 'hit' | 'ignored' | 'dead'.
  takeHit(dmg, sx, sz, { heavy = false } = {}) {
    if (this.state === 'dead') return 'dead';
    if (this.state === 'dodge' && this.dodgeT < PLAYER.dodgeIframes) return 'dodge';
    if (this.invulnT > 0) return 'ignored';

    const dx = sx - this.pos.x;
    const dz = sz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const fwd = this.forward;
    const frontal = (fwd.x * dx + fwd.y * dz) / d > FACE_DOT;

    if (this.state === 'block' && frontal && !this.guardBroken) {
      this.stamina -= dmg * 1.1;
      this.game.onPlayerBlocked(this.pos);
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.guardBroken = true;
        this._leaveBlock();
        this._stagger(dx, dz, 0.9);
        this._damage(dmg * 0.8);
        return 'hit';
      }
      this._damage(dmg * PLAYER.blockDamage);
      return 'block';
    }

    this._damage(dmg);
    this._stagger(-dx / d, -dz / d, heavy ? 3.2 : 2.0);
    return 'hit';
  }

  _damage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.damageTaken += n;
    this.game.onPlayerDamaged(n, this.pos);
    if (this.hp <= 0) this._die();
  }

  _stagger(nx, nz, force) {
    this.invulnT = PLAYER.hurtInvuln;
    this.comboT = 0;
    this.queued = false;
    this.state = 'hurt';
    this.hurtT = 0.3;
    this.rig.clip = null;
    this.rig.play('hurt');
    this.vel.set(nx * force * 4, nz * force * 4);
  }

  _die() {
    this.state = 'dead';
    this.rig.setHold(null);
    this.rig.play('death');
    this.game.onPlayerDied();
  }
}

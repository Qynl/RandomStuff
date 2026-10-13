// Enemy AI: a readable state machine.
//
//   spawn   rises out of the ground (invulnerable, shows where it will be)
//   chase   walks toward the player
//   windup  stops, raises its weapon, and draws a red telegraph circle
//   strike  swings; the hit lands once, at strikeAt, if the player is in the zone
//   recover vulnerable pause after a swing
//   stagger knocked back when poise breaks
//   dead    falls and sinks away
//
// Enemies never attack without a telegraph, so every hit is avoidable with skill.

import * as THREE from 'three';
import { createHumanoid, Rig } from './rig.js';
import { Telegraph } from './telegraph.js';
import { ENEMY } from './config.js';
import { clamp, damp, angleDiff, easeOutCubic } from '../engine/math.js';

let nextId = 1;

export class Enemy {
  constructor(game, typeId, x, z, cfg = ENEMY[typeId]) {
    this.game = game;
    this.id = nextId++;
    this.type = typeId;
    this.cfg = cfg;
    const c = this.cfg;
    const human = createHumanoid({
      body: c.color, armor: 0x6d6a72, skin: 0x8c6a55, accent: c.accent, scale: c.scale,
      bladeLength: typeId === 'brute' || c.scale > 1.5 ? 1.1 : 0.85,
    });
    this.human = human;
    this.rig = new Rig(human);
    game.scene.add(human.root);
    this.root = human.root;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = Math.atan2(-x, -z);
    this.vel = new THREE.Vector2();
    this.hp = c.hp;
    this.maxHp = c.hp;
    this.radius = 0.5 * c.scale;
    this.reach = c.reach;
    this.dmg = c.dmg;
    this.speed = c.speed;
    this.state = 'spawn';
    this.t = 0;
    this.cooldown = 0.3;
    this.flash = 0;
    this.poise = 0;
    this.targetable = false;
    this.hasHit = false;
    this.telegraph = new Telegraph(game.scene, c.accent);
    this.root.position.set(x, -1.6, z);
    this.root.rotation.y = this.yaw;
    this.spawnT = 1.1;
    this.dead = false;
    this.deadT = 0;
    this.sinkY = 0;
  }

  get dist() {
    const p = this.game.player.pos;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  _faceToPlayer(dt, rate = 6) {
    const p = this.game.player.pos;
    const target = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw += angleDiff(this.yaw, target) * Math.min(1, dt * rate);
  }

  _moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = Math.min(d, speed);
    this.vel.x = damp(this.vel.x, (dx / d) * want, 8, dt);
    this.vel.y = damp(this.vel.y, (dz / d) * want, 8, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.game.arena.resolve(this.pos, this.radius);
    // Soft separation so packs don't stack into one blob.
    for (const o of this.game.enemies) {
      if (o === this || o.dead) continue;
      const sx = this.pos.x - o.pos.x;
      const sz = this.pos.z - o.pos.z;
      const sd = Math.hypot(sx, sz);
      const min = this.radius + o.radius + 0.6;
      if (sd < min && sd > 1e-4) {
        const push = (min - sd) * 0.5;
        this.pos.x += (sx / sd) * push * Math.min(1, dt * 8);
        this.pos.z += (sz / sd) * push * Math.min(1, dt * 8);
      }
    }
  }

  _enterState(s) {
    this.state = s;
    this.t = 0;
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.poise = Math.max(0, this.poise - dt * 18);
    this.t += dt;

    if (this.dead) {
      this.deadT += dt;
      this.sinkY = Math.min(2.2, this.deadT * 0.8);
      this.root.position.set(this.pos.x, -this.sinkY, this.pos.z);
      this.rig.update(dt, 0);
      this.root.rotation.y = this.yaw;
      if (this.deadT > 2.2) this._removeVisual();
      return;
    }

    let speed01 = 0;
    switch (this.state) {
      case 'spawn': {
        this.spawnT -= dt;
        const k = clamp(1 - this.spawnT / 1.1, 0, 1);
        this.root.position.set(this.pos.x, -1.6 * (1 - easeOutCubic(k)), this.pos.z);
        if (Math.random() < 0.5) this.game.sparks.emit(this.pos.x, 0.1, this.pos.z, { count: 1, speed: 1.2, up: 1.5, life: 0.6, size: 0.2, color: 0x9a8b7a, gravity: 1 });
        if (this.spawnT <= 0) {
          this.targetable = true;
          this.root.position.y = 0;
          this._enterState('chase');
        }
        break;
      }
      case 'chase': {
        const p = this.game.player.pos;
        this._moveToward(p.x, p.z, this.speed, dt);
        speed01 = clamp(Math.hypot(this.vel.x, this.vel.y) / this.speed, 0, 1);
        this._faceToPlayer(dt, 5);
        this.cooldown -= dt;
        if (this.dist <= this.reach && this.cooldown <= 0 && this.game.player.alive) this._enterState('windup');
        break;
      }
      case 'windup': {
        this._faceToPlayer(dt, 4);
        this.rig.setHold('windup');
        const u = clamp(this.t / this.cfg.windup, 0, 1);
        this.telegraph.show(this.pos.x, this.pos.z, this.reach, u);
        this.vel.set(0, 0);
        if (this.t >= this.cfg.windup) {
          this.telegraph.hide();
          this.rig.setHold(null);
          this.hasHit = false;
          this.rig.play('strike');
          this._enterState('strike');
          this.game.sound.play('swingHeavy', { n: 0 });
        }
        break;
      }
      case 'strike': {
        if (!this.hasHit && this.t >= this.cfg.strikeAt) {
          this.hasHit = true;
          this._tryHitPlayer();
        }
        // A short forward lunge gives the swing weight.
        if (this.t < 0.25) {
          this.pos.x += Math.sin(this.yaw) * 2.2 * dt;
          this.pos.z += Math.cos(this.yaw) * 2.2 * dt;
          this.game.arena.resolve(this.pos, this.radius);
        }
        if (this.t >= 0.45) this._enterState('recover');
        break;
      }
      case 'recover': {
        if (this.t >= this.cfg.recover) {
          this.cooldown = 0.35 + Math.random() * 0.5;
          this._enterState('chase');
        }
        break;
      }
      case 'stagger': {
        if (this.t >= 0.45) {
          this.cooldown = 0.2;
          this._enterState('chase');
        }
        break;
      }
      default:
        break;
    }

    this.rig.update(dt, speed01);
    this.root.position.set(this.pos.x, this.root.position.y, this.pos.z);
    this.root.rotation.y = this.yaw + this.rig.spin;
    this.root.visible = true;
    this._applyFlash();
  }

  _applyFlash() {
    const hit = this.flash > 0;
    for (const m of this.human.meshes) {
      if (m.material.emissive) {
        m.material.emissive.setHex(hit ? 0xffffff : 0x000000);
        m.material.emissiveIntensity = hit ? 1.4 : 0;
      }
    }
  }

  _tryHitPlayer() {
    const p = this.game.player;
    if (!p.alive) return;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > this.reach + p.radius) return;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    if (d > 1e-4 && (dx * fx + dz * fz) / d < 0.2) return;
    this.game.onEnemyHitPlayer(this, this.dmg);
  }

  // Called by the game when the player's attack lands.
  takeHit(dmg, dirX, dirZ, knock, heavy) {
    if (this.dead || !this.targetable) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 0.08;
    this.poise += dmg;
    this.vel.x += dirX * knock * 0.6;
    this.vel.y += dirZ * knock * 0.6;
    if (this.hp <= 0) {
      this._die(dirX, dirZ);
      return true;
    }
    const breakPoise = this.poise >= this.cfg.poise * 14 || (heavy && this.cfg.poise <= 1);
    if (breakPoise && this.state !== 'stagger') {
      this.poise = 0;
      this.telegraph.hide();
      this.rig.setHold(null);
      this.rig.play('hurt');
      this.pos.x += dirX * 0.35;
      this.pos.z += dirZ * 0.35;
      this._enterState('stagger');
    }
    return false;
  }

  _die(dirX, dirZ) {
    this.dead = true;
    this.targetable = false;
    this.telegraph.hide();
    this.rig.setHold(null);
    this.rig.play('death');
    this.pos.x += dirX * 0.6;
    this.pos.z += dirZ * 0.6;
    this.game.onEnemyDied(this);
  }

  _removeVisual() {
    this.game.scene.remove(this.root);
    this.game.scene.remove(this.telegraph.group);
    this.root.visible = false;
  }

  // Remove from the game's list once the death animation has played out.
  get removable() {
    return this.dead && this.deadT > 2.2;
  }
}


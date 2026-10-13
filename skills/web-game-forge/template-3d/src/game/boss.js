// The Warden: a boss with four telegraphed patterns.
//
//   slam     marks a spot on the ground, then smashes it (dodge out of the circle)
//   charge   winds up, then dashes; crashing into a pillar leaves it stunned and open
//   combo    three quick swings
//   shock    (phase 2) ground pound that sends an expanding ring across the arena
//
// At half health it roars and gets faster. Every pattern is announced first.

import { Enemy } from './enemy.js';
import { Telegraph } from './telegraph.js';
import { BOSS } from './config.js';
import { clamp } from '../engine/math.js';

export class Boss extends Enemy {
  constructor(game, x, z) {
    super(game, 'boss', x, z, BOSS);
    this.targetable = false;
    this.phase2 = false;
    this.lastPattern = null;
    this.comboLeft = 0;
    this.marker = new Telegraph(game.scene, 0xff3d3d);
    this.slam = { x: 0, z: 0 };
    this.spawnT = 1.6;
  }

  update(dt) {
    if (this.dead || this.state === 'spawn') return super.update(dt);

    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    const p = this.game.player;
    const mult = this.phase2 ? 1.25 : 1;
    let speed01 = 0;

    // Enter phase 2 once, at half health, with a roar that interrupts whatever it was doing.
    if (!this.phase2 && this.hp <= BOSS.phase2At * this.maxHp) {
      this.phase2 = true;
      this.telegraph.hide();
      this.marker.hide();
      this.rig.setHold(null);
      this._enterState('roar');
      this.game.onBossPhase2();
    }

    switch (this.state) {
      case 'chase': {
        this._moveToward(p.pos.x, p.pos.z, this.speed * mult, dt);
        speed01 = clamp(Math.hypot(this.vel.x, this.vel.y) / this.speed, 0, 1);
        this._faceToPlayer(dt, 4);
        this.cooldown -= dt;
        if (this.cooldown <= 0 && this.dist < 9 && p.alive) this._choosePattern();
        break;
      }
      case 'roar': {
        this.rig.setHold('roar');
        this.vel.set(0, 0);
        if (this.t >= 1.4) {
          this.rig.setHold(null);
          this.cooldown = 0.6;
          this._enterState('chase');
        }
        break;
      }
      case 'slamWindup': {
        this._faceToPlayer(dt, 6);
        this.rig.setHold('slamUp');
        this.vel.set(0, 0);
        this.marker.show(this.slam.x, this.slam.z, BOSS.slamRadius, Math.min(1, this.t / 1.1));
        if (this.t >= 1.1) {
          this.marker.hide();
          this.rig.setHold(null);
          this.rig.play('slam');
          this.hasHit = false;
          this._enterState('slam');
        }
        break;
      }
      case 'slam': {
        if (!this.hasHit && this.t >= 0.3) {
          this.hasHit = true;
          this.game.onBossSlam(this.slam.x, this.slam.z, BOSS.slamRadius, BOSS.slamDmg);
        }
        if (this.t >= 0.7) this._enterState('recover');
        break;
      }
      case 'chargeWindup': {
        this._faceToPlayer(dt, 5);
        this.rig.setHold('charge');
        this.vel.set(0, 0);
        this.telegraph.show(this.pos.x, this.pos.z, 2.6, Math.min(1, this.t / BOSS.windup));
        if (this.t >= 0.75) {
          this.telegraph.hide();
          this.rig.setHold(null);
          this.chargeDir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
          this.hasHit = false;
          this._enterState('charge');
        }
        break;
      }
      case 'charge': {
        const step = BOSS.chargeSpeed * mult * dt;
        const before = { x: this.pos.x, z: this.pos.z };
        this.pos.x += this.chargeDir.x * step;
        this.pos.z += this.chargeDir.z * step;
        this.game.arena.resolve(this.pos, this.radius);
        const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
        speed01 = 1;
        if (!this.hasHit && this.dist < this.reach + p.radius) {
          this.hasHit = true;
          this.game.onEnemyHitPlayer(this, BOSS.dmg * 1.1, true);
        }
        if (moved < step * 0.4 && this.t > 0.1) {
          this.game.onBossWallCrash(this.pos);
          this.rig.play('hurt');
          this._enterState('stun');
          break;
        }
        if (this.t >= BOSS.chargeTime) this._enterState('recover');
        break;
      }
      case 'stun': {
        // Open to attack: damage is multiplied while the Warden is stunned.
        this.targetable = true;
        this.vel.set(0, 0);
        if (this.t >= BOSS.stunTime) {
          this.targetable = false;
          this.cooldown = 0.5;
          this._enterState('chase');
        }
        break;
      }
      case 'cWindup': {
        this._faceToPlayer(dt, 8);
        this.rig.setHold('windup');
        this.vel.set(0, 0);
        this.telegraph.show(this.pos.x, this.pos.z, this.reach, Math.min(1, this.t / 0.45));
        if (this.t >= 0.45) {
          this.telegraph.hide();
          this.rig.setHold(null);
          this.hasHit = false;
          this.rig.play('strike');
          this._enterState('cStrike');
        }
        break;
      }
      case 'cStrike': {
        if (!this.hasHit && this.t >= 0.2) {
          this.hasHit = true;
          this._tryHitPlayer();
        }
        if (this.t >= 0.4) {
          this.comboLeft -= 1;
          this._enterState(this.comboLeft > 0 ? 'cWindup' : 'recover');
        }
        break;
      }
      case 'shockWindup': {
        this._faceToPlayer(dt, 6);
        this.rig.setHold('slamUp');
        this.vel.set(0, 0);
        this.marker.show(this.pos.x, this.pos.z, 3, Math.min(1, this.t / 0.9));
        if (this.t >= 0.9) {
          this.marker.hide();
          this.rig.setHold(null);
          this.rig.play('slam');
          this.hasHit = false;
          this._enterState('shock');
        }
        break;
      }
      case 'shock': {
        if (!this.hasHit && this.t >= 0.3) {
          this.hasHit = true;
          this.game.onBossShockwave(this.pos.x, this.pos.z);
        }
        if (this.t >= 0.7) this._enterState('recover');
        break;
      }
      case 'recover': {
        if (this.t >= BOSS.recover) {
          this.cooldown = (this.phase2 ? 0.25 : 0.45) + Math.random() * 0.3;
          this._enterState('chase');
        }
        break;
      }
      default:
        break;
    }

    this.rig.update(dt, speed01);
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw + this.rig.spin;
    this._applyFlash();
  }

  _choosePattern() {
    const pool = ['slam', 'charge', 'combo'];
    if (this.phase2) pool.push('shock', 'shock');
    let pick;
    do {
      pick = pool[(Math.random() * pool.length) | 0];
    } while (pick === this.lastPattern && pool.length > 1);
    this.lastPattern = pick;

    const p = this.game.player;
    if (pick === 'slam') {
      this.slam.x = p.pos.x;
      this.slam.z = p.pos.z;
      this._enterState('slamWindup');
      this.game.sound.play('telegraph');
    } else if (pick === 'charge') {
      this._enterState('chargeWindup');
      this.game.sound.play('telegraph');
    } else if (pick === 'shock') {
      this._enterState('shockWindup');
      this.game.sound.play('telegraph');
    } else {
      this.comboLeft = 3;
      this._enterState('cWindup');
    }
  }

  // The base class handles spawn/stagger/death; the boss only overrides patterns.
  takeHit(dmg, dirX, dirZ, knock, heavy) {
    if (this.state === 'stun') dmg *= 1.6;
    return super.takeHit(dmg, dirX, dirZ, knock, heavy);
  }

}

/**
 * IRONWOOD - bot soldiers.
 *
 * Bots use the same world queries as the player: nav grid A* for routes, line
 * of sight for vision, damage spheres for shooting. On top of that they have a
 * simple tactical brain - advance, take cover, suppress, flank, throw frags,
 * reload behind cover, and shout about it on the radio.
 *
 * Difficulty only changes reaction time, aim error and aggression, never
 * anything the player could call cheating (they see exactly what you see).
 */

import * as THREE from 'three';
import {
  TAU, clamp, lerp, saturate, damp, dampAngle, rand, randInt, choice, vdist, vlenXZ, smoothstep,
} from '../core/math.js';
import { WEAPONS } from './weapon.js';

export const DIFFICULTIES = {
  recruit: { name: 'Recruit', reaction: 0.62, error: 0.055, errorMove: 0.085, burst: [2, 4], pause: [0.55, 1.1], range: 30, aggression: 0.45, grenadeChance: 0.15, lookSpeed: 5.2, hp: 100, sprintBias: 0.5 },
  regular: { name: 'Regular', reaction: 0.42, error: 0.034, errorMove: 0.06, burst: [3, 6], pause: [0.35, 0.8], range: 40, aggression: 0.65, grenadeChance: 0.3, lookSpeed: 7.0, hp: 100, sprintBias: 0.7 },
  hardened: { name: 'Hardened', reaction: 0.29, error: 0.022, errorMove: 0.042, burst: [4, 8], pause: [0.25, 0.6], range: 50, aggression: 0.8, grenadeChance: 0.42, lookSpeed: 9.0, hp: 100, sprintBias: 0.85 },
  veteran: { name: 'Veteran', reaction: 0.19, error: 0.014, errorMove: 0.028, burst: [5, 10], pause: [0.18, 0.45], range: 58, aggression: 0.92, grenadeChance: 0.55, lookSpeed: 12.0, hp: 100, sprintBias: 1.0 },
};

const STATE = {
  IDLE: 'idle',
  ADVANCE: 'advance',
  ENGAGE: 'engage',
  COVER: 'cover',
  RELOAD: 'reload',
  INVESTIGATE: 'investigate',
  RETREAT: 'retreat',
  DEAD: 'dead',
};

export class Bot {
  constructor(world, opts = {}) {
    this.world = world;
    this.id = opts.id ?? `b${Math.floor(Math.random() * 1e6)}`;
    this.name = opts.name ?? 'Bot';
    this.team = opts.team ?? 'opfor';
    this.isBot = true;
    this.isLocal = false;
    this.isRemote = false;
    this.difficultyKey = opts.difficulty ?? 'regular';
    this.diff = DIFFICULTIES[this.difficultyKey] ?? DIFFICULTIES.regular;
    this.audio = opts.audio ?? null;
    this.fx = opts.fx ?? null;
    this.rig = opts.rig ?? null;
    this.radius = 0.4;
    this.height = 1.8;

    this.position = new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    this.velocity = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.pitch = 0;
    this.aimYaw = this.yaw;
    this.stance = 'stand';
    this.health = this.diff.hp;
    this.maxHealth = this.diff.hp;
    this.alive = true;
    this.deathTime = 0;
    this.kills = 0;
    this.deaths = 0;
    this.weaponId = opts.weapon ?? 'm4a1';
    this.ammo = { mag: WEAPONS[this.weaponId]?.magSize ?? 30, reserve: 300 };
    this.reloadTimer = 0;
    this.fireTimer = 0;
    this.burstLeft = 0;
    this.pauseTimer = 0;
    this.reactionTimer = 0;
    this.grenadeCooldown = rand(12, 30);
    this.calloutCooldown = rand(3, 9);
    this.state = STATE.ADVANCE;
    this.stateTime = 0;
    this.path = null;
    this.pathIndex = 0;
    this.pathTimer = 0;
    this.goal = null;
    this.coverTarget = null;
    this.coverTimer = 0;
    this.lastKnown = new Map();
    this.perceptionTimer = Math.random() * 0.2;
    this.stuckTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = rand(0.4, 1.4);
    this.aimError = new THREE.Vector3();
    this.aimErrorTimer = 0;
    this.tunnel = null;
    this.speed = 0;
    this.sprinting = false;
    this.crouching = false;
    this.firing = false;
    this.reloading = false;
    this.flashBlind = 0;
    this._hitSpheres = [];
    this.waypointReached = 0.9;
    this.squadTarget = null;
    this.aggression = this.diff.aggression * rand(0.85, 1.15);
    this.personality = {
      reaction: this.diff.reaction * rand(0.85, 1.2),
      error: this.diff.error * rand(0.8, 1.25),
      preferredRange: rand(12, 30),
    };
    this.stats = { shots: 0, hits: 0 };
  }

  attachRig(rig) {
    this.rig = rig;
    rig.group.position.copy(this.position);
    rig.group.rotation.y = this.yaw;
  }

  hitSpheres() {
    if (this.rig) return this.rig.hitSpheres(this._hitSpheres);
    const out = this._hitSpheres;
    out.length = 0;
    const h = this.stance === 'prone' ? 0.4 : this.stance === 'crouch' ? 0.95 : 1.62;
    out.push({ name: 'head', part: 'head', x: this.position.x, y: this.position.y + h, z: this.position.z, r: 0.16, mult: 3.4 });
    out.push({ name: 'chest', part: 'chest', x: this.position.x, y: this.position.y + h * 0.76, z: this.position.z, r: 0.3, mult: 1.0 });
    out.push({ name: 'abdomen', part: 'abdomen', x: this.position.x, y: this.position.y + h * 0.55, z: this.position.z, r: 0.28, mult: 0.95 });
    return out;
  }

  aimPoint() {
    return {
      x: this.position.x,
      y: this.position.y + (this.stance === 'crouch' ? 0.95 : 1.35),
      z: this.position.z,
    };
  }

  lookDirection(out = new THREE.Vector3()) {
    out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return out;
  }

  eyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + (this.stance === 'crouch' ? 1.0 : 1.6), this.position.z);
  }

  /* ------------------------------------------------------------------ */
  /* Damage                                                              */
  /* ------------------------------------------------------------------ */

  damage(amount, info = {}) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.rig) this.rig.hitReact = 1;
    if (info.direction) {
      // getting shot from an unseen direction makes bots turn and react
      this.lastKnown.set(info.attacker?.id ?? 'unknown', {
        x: info.attacker?.position?.x ?? this.position.x + info.direction.x * 8,
        y: info.attacker?.position?.y ?? this.position.y,
        z: info.attacker?.position?.z ?? this.position.z + info.direction.z * 8,
        time: 0,
      });
      if (this.state !== STATE.ENGAGE && this.state !== STATE.COVER) {
        this.state = STATE.INVESTIGATE;
        this.stateTime = 0;
      }
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.state = STATE.DEAD;
      this.deathTime = 0;
      this.deaths++;
      this.path = null;
      return true;
    }
    // low health: fall back and find cover
    if (this.health < 32 && this.state !== STATE.RETREAT && Math.random() < 0.7) {
      this.state = STATE.RETREAT;
      this.stateTime = 0;
    }
    return false;
  }

  respawn(spawn) {
    this.position.set(spawn.x, spawn.y + 0.05, spawn.z);
    this.velocity.set(0, 0, 0);
    this.yaw = spawn.yaw ?? 0;
    this.aimYaw = this.yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.state = STATE.ADVANCE;
    this.stateTime = 0;
    this.path = null;
    this.deathTime = 0;
    this.reloadTimer = 0;
    this.ammo.mag = WEAPONS[this.weaponId]?.magSize ?? 30;
    this.ammo.reserve = 300;
    this.flashBlind = 0;
    this.lastKnown.clear();
  }

  /* ------------------------------------------------------------------ */
  /* Perception                                                          */
  /* ------------------------------------------------------------------ */

  perceive(dt, ctx) {
    const targets = ctx.targets || [];
    const eye = this.eyePosition(new THREE.Vector3());
    const forward = this.lookDirection(new THREE.Vector3());
    const fovCos = Math.cos(0.62 + (this.sprinting ? -0.1 : 0));

    for (const target of targets) {
      if (!target.alive || target.team === this.team) continue;
      const aim = target.aimPoint ? target.aimPoint() : { x: target.position.x, y: target.position.y + 1.3, z: target.position.z };
      const dx = aim.x - eye.x;
      const dy = aim.y - eye.y;
      const dz = aim.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 75) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      const dot = nx * forward.x + ny * forward.y + nz * forward.z;
      // close targets are noticed even outside the cone (peripheral awareness)
      const inCone = dot > fovCos || dist < 6;
      if (!inCone) continue;
      const clear = this.world.lineOfSight(eye, aim, { through: ['leaf', 'cloth'] });
      if (!clear) continue;
      const memory = this.lastKnown.get(target.id) || { seen: 0 };
      memory.x = target.position.x;
      memory.y = target.position.y;
      memory.z = target.position.z;
      memory.time = 0;
      memory.seen = (memory.seen ?? 0) + 1;
      memory.target = target;
      this.lastKnown.set(target.id, memory);
      if (this.state !== STATE.ENGAGE && this.state !== STATE.COVER && this.state !== STATE.RELOAD) {
        this.state = STATE.ENGAGE;
        this.stateTime = 0;
        this.reactionTimer = this.personality.reaction * rand(0.85, 1.15);
        this._callout('contact', ctx);
      }
    }

    // decay memory
    for (const [id, mem] of this.lastKnown) {
      mem.time += dt;
      if (mem.time > 14) this.lastKnown.delete(id);
    }
    void ctx;
  }

  bestTarget() {
    let best = null;
    let bestScore = -Infinity;
    for (const [, mem] of this.lastKnown) {
      if (mem.time > 6) continue;
      const target = mem.target;
      if (!target || !target.alive) continue;
      const dist = vdist(this.position, target.position);
      const score = -dist + (mem.time < 0.5 ? 30 : 0) + (target.isLocal ? 6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { target, mem, dist };
      }
    }
    return best;
  }

  _callout(kind, ctx) {
    if (this.calloutCooldown > 0) return;
    this.calloutCooldown = rand(4, 11);
    ctx.onCallout?.(this, kind);
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    this.stateTime += dt;
    this.calloutCooldown = Math.max(0, this.calloutCooldown - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    if (this.flashBlind > 0) this.flashBlind = Math.max(0, this.flashBlind - dt);

    if (!this.alive) {
      this.deathTime += dt;
      this.firing = false;
      if (this.rig) this.rig.animate(dt, { dead: true });
      return;
    }

    this.perceptionTimer -= dt;
    if (this.perceptionTimer <= 0) {
      this.perceptionTimer = 0.13 + Math.random() * 0.12;
      this.perceive(0.25, ctx);
    }

    const hasTarget = this.bestTarget();
    const canSee = hasTarget && hasTarget.mem.time < 0.35;

    // --- state transitions ---------------------------------------
    this._think(dt, ctx, hasTarget, canSee);

    // --- actions --------------------------------------------------
    const move = this._movement(dt, ctx, hasTarget, canSee);
    this._combat(dt, ctx, hasTarget, canSee);

    // --- physics --------------------------------------------------
    const wasGrounded = this.grounded;
    if (this.grounded) {
      const limited = this.world.clampGroundMove(this.position.x, this.position.z, this.velocity.x, this.velocity.z);
      this.velocity.x = limited.x;
      this.velocity.z = limited.z;
    }
    this.velocity.y -= 22 * dt;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;
    this.world.resolveCollisions(this.position, this.radius, this.height);
    const support = this.world.supportHeight(this.position.x, this.position.z, this.position.y + 0.6);
    if (this.position.y <= support + 0.01) {
      if (!wasGrounded && this.velocity.y < -7) this.fell = true;
      this.position.y = support;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // stuck detection
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = hSpeed;
    if (move && hSpeed < 0.35) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.7) {
        this.stuckTimer = 0;
        this._repath(ctx, true);
      }
    } else {
      this.stuckTimer = 0;
    }

    // --- animation ------------------------------------------------
    if (this.rig) {
      this.rig.group.position.set(this.position.x, this.position.y, this.position.z);
      this.rig.group.rotation.y = this.yaw;
      this.rig.animate(dt, {
        speed: hSpeed,
        sprinting: this.sprinting,
        crouch: this.stance === 'crouch',
        prone: this.stance === 'prone',
        aimYaw: shortestLocal(this.yaw, this.aimYaw),
        aimPitch: this.pitch,
        aiming: !!hasTarget,
        showWeapon: true,
        firing: this.firing,
        reloading: this.reloading,
        dead: !this.alive,
      });
    }
    this.firing = false;
  }

  _think(dt, ctx, hasTarget, canSee) {
    const dist = hasTarget?.dist ?? 999;
    switch (this.state) {
      case STATE.ADVANCE:
        if (canSee) {
          this.state = STATE.ENGAGE;
          this.stateTime = 0;
        }
        break;
      case STATE.ENGAGE:
        if (!hasTarget) {
          this.state = STATE.INVESTIGATE;
          this.stateTime = 0;
          this._repath(ctx, true);
          break;
        }
        if (!canSee) {
          // move up on the last known position
          this.state = STATE.INVESTIGATE;
          this.stateTime = 0;
          break;
        }
        if (this.health < 30 && this.stateTime > 1.2) {
          this.state = STATE.COVER;
          this.stateTime = 0;
          this.coverTimer = 0;
          break;
        }
        // duck behind cover when we take sustained fire at range
        if (dist > 22 && Math.random() < dt * 0.35 * (1 - this.aggression)) {
          this.state = STATE.COVER;
          this.stateTime = 0;
          this.coverTimer = 0;
        }
        break;
      case STATE.COVER:
        this.coverTimer += dt;
        if (this.coverTimer > rand(1.6, 3.2) && (!hasTarget || this.health > 45)) {
          this.state = STATE.ENGAGE;
          this.stateTime = 0;
        }
        break;
      case STATE.RELOAD:
        if (!this.reloading) {
          this.state = hasTarget ? STATE.ENGAGE : STATE.ADVANCE;
          this.stateTime = 0;
        }
        break;
      case STATE.INVESTIGATE:
        if (canSee) {
          this.state = STATE.ENGAGE;
          this.stateTime = 0;
        } else if (this.stateTime > 12 || !hasTarget) {
          this.state = STATE.ADVANCE;
          this.stateTime = 0;
          this.goal = null;
        }
        break;
      case STATE.RETREAT:
        if (this.health > 55 || this.stateTime > 8) {
          this.state = STATE.ENGAGE;
          this.stateTime = 0;
        }
        break;
      default:
        this.state = STATE.ADVANCE;
    }
    void dt;
  }

  /* ---------------- movement ---------------- */

  _pickGoal(ctx) {
    const objective = ctx.match?.objectiveFor?.(this.team);
    if (objective && Math.random() < 0.65) {
      const jitter = 12;
      return { x: objective.x + rand(-jitter, jitter), z: objective.z + rand(-jitter, jitter) };
    }
    // otherwise push toward the enemy half of the map
    const enemySpawn = ctx.match?.spawnAreaFor ? ctx.match.spawnAreaFor(this.team === 'us' ? 'opfor' : 'us') : null;
    if (enemySpawn) {
      return { x: enemySpawn.x + rand(-24, 24), z: enemySpawn.z + rand(-24, 24) };
    }
    const p = ctx.world.nav.randomWalkable(Math.random, this.position.x, this.position.z, 70);
    return p || { x: this.position.x, z: this.position.z };
  }

  _repath(ctx, force = false) {
    this.pathTimer = rand(0.9, 1.7);
    let dest = null;
    const target = this.bestTarget();
    if (this.state === STATE.ENGAGE || this.state === STATE.COVER || this.state === STATE.INVESTIGATE) {
      const mem = target?.mem || [...this.lastKnown.values()].sort((a, b) => a.time - b.time)[0];
      if (mem) {
        if (this.state === STATE.COVER || this.state === STATE.RELOAD) {
          const cover = this._findCover(ctx, mem);
          if (cover) {
            this.coverTarget = cover;
            dest = { x: cover.x, z: cover.z };
          }
        }
        if (!dest) dest = { x: mem.x + rand(-2.5, 2.5), z: mem.z + rand(-2.5, 2.5) };
      }
    }
    if (!dest) {
      if (!this.goal || force || vdist(this.position, { x: this.goal.x, y: this.position.y, z: this.goal.z }) < 3) {
        this.goal = this._pickGoal(ctx);
      }
      dest = this.goal;
    }
    if (!dest) return;
    this.dest = dest;
    const path = ctx.world.nav.findPath(this.position.x, this.position.z, dest.x, dest.z);
    if (path && path.length) {
      this.path = ctx.world.nav.smoothPath(path);
      this.pathIndex = 0;
      // a partial path means the goal is unreachable: walk it, then re-plan
      if (path[path.length - 1].partial) this.pathTimer = rand(0.5, 0.9);
    } else {
      this.path = null;
      this.pathIndex = 0;
    }
  }

  _findCover(ctx, mem) {
    const covers = ctx.world.coverPoints;
    if (!covers || !covers.length) return null;
    let best = null;
    let bestScore = -Infinity;
    const threat = { x: mem.x, z: mem.z };
    // sample a subset for speed
    const start = Math.floor(Math.random() * Math.max(1, covers.length - 60));
    for (let i = start; i < Math.min(covers.length, start + 60); i++) {
      const c = covers[i];
      const distToMe = Math.hypot(c.x - this.position.x, c.z - this.position.z);
      if (distToMe > 26) continue;
      const distToThreat = Math.hypot(c.x - threat.x, c.z - threat.z);
      if (distToThreat < 5) continue;
      const blocked = !this.world.lineOfSight(
        { x: c.x, y: c.y + 0.9, z: c.z },
        { x: threat.x, y: this.position.y + 1.2, z: threat.z }
      );
      const score = (blocked ? 40 : 0) - distToMe * 1.2 - Math.abs(distToThreat - 16) * 0.6 + Math.random() * 6;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  _movement(dt, ctx, hasTarget, canSee) {
    let desiredX = 0;
    let desiredZ = 0;
    let wantSpeed = 4.2;

    const engaging = this.state === STATE.ENGAGE || this.state === STATE.COVER || this.state === STATE.RELOAD;

    if (this.state === STATE.COVER && this.coverTarget) {
      const d = Math.hypot(this.coverTarget.x - this.position.x, this.coverTarget.z - this.position.z);
      if (d > 1.2) {
        desiredX = (this.coverTarget.x - this.position.x) / d;
        desiredZ = (this.coverTarget.z - this.position.z) / d;
        wantSpeed = 4.6;
      } else {
        this.crouching = true;
      }
    } else if (this.path && this.path.length && this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      const d = Math.hypot(wp.x - this.position.x, wp.z - this.position.z);
      if (d < this.waypointReached) {
        this.pathIndex++;
      } else {
        desiredX = (wp.x - this.position.x) / d;
        desiredZ = (wp.z - this.position.z) / d;
        const far = this.pathIndex < this.path.length - 1;
        wantSpeed = far ? (this.sprinting ? 6.4 : 4.6) : 3.4;
      }
    } else if (this.dest) {
      // no route (or a bot standing on a ledge): push straight at the goal so
      // nobody ever freezes in place, the stuck timer will re-plan from there
      const dx = this.dest.x - this.position.x;
      const dz = this.dest.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.1) {
        desiredX = dx / d;
        desiredZ = dz / d;
        wantSpeed = this.sprinting ? 6.4 : 4.6;
      }
    }

    // when engaging at range, strafe to be a harder target
    if (engaging && hasTarget && canSee) {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.5, 1.6);
        this.strafeDir *= -1;
      }
      const dist = hasTarget.dist;
      if (dist > this.personality.preferredRange + 6) {
        desiredX += Math.cos(this.yaw) * 0.8;
        desiredZ += -Math.sin(this.yaw) * 0.8;
        wantSpeed = 3.6;
      } else if (dist < 6) {
        desiredX -= Math.cos(this.yaw) * 0.7;
        desiredZ -= -Math.sin(this.yaw) * 0.7;
      } else {
        desiredX += Math.cos(this.yaw + Math.PI / 2) * 0.55 * this.strafeDir;
        desiredZ += -Math.sin(this.yaw + Math.PI / 2) * 0.55 * this.strafeDir;
      }
      if (dist < 26 && Math.random() < dt * 0.5) this.crouching = true;
    }

    if (this.state === STATE.RETREAT) {
      const away = hasTarget
        ? { x: this.position.x - hasTarget.target.position.x, z: this.position.z - hasTarget.target.position.z }
        : { x: Math.cos(this.yaw + Math.PI), z: Math.sin(this.yaw + Math.PI) };
      const l = Math.hypot(away.x, away.z) || 1;
      desiredX = away.x / l;
      desiredZ = away.z / l;
      wantSpeed = 5.4;
    }

    // path following cadence
    this.pathTimer -= dt;
    if (this.pathTimer <= 0 || !this.path || this.pathIndex >= (this.path?.length ?? 0)) {
      this._repath(ctx);
    }

    // stance control
    const crouchOk = this.crouching || this.state === STATE.COVER || (!canSee && Math.random() < 0.02);
    if (crouchOk && this.state !== STATE.RETREAT && this.speed < 4.2) {
      this.stance = 'crouch';
    } else if (this.speed > 2.6 || this.state === STATE.ADVANCE || this.state === STATE.RETREAT) {
      this.stance = 'stand';
    }
    this.crouching = false;

    // sprint when advancing far without contact
    this.sprinting = this.state === STATE.ADVANCE && !hasTarget && Math.random() < this.diff.sprintBias * dt * 2.2
      ? true
      : this.sprinting && !hasTarget && this.state === STATE.ADVANCE;
    if (hasTarget && hasTarget.dist < 30) this.sprinting = false;

    if (this.flashBlind > 0) {
      // blinded: stumble backwards, stop shooting
      desiredX = Math.cos(this.yaw + Math.PI) * 0.6;
      desiredZ = Math.sin(this.yaw + Math.PI) * 0.6;
      wantSpeed = 2.4;
    }

    const speedMult = this.stance === 'crouch' ? 0.55 : 1;
    const targetSpeed = wantSpeed * speedMult * (this.sprinting ? 1.35 : 1);
    const len = Math.hypot(desiredX, desiredZ);
    if (len > 0.01) {
      desiredX /= len;
      desiredZ /= len;
      const accel = 26;
      this.velocity.x += (desiredX * targetSpeed - this.velocity.x) * clamp(accel * dt / Math.max(targetSpeed, 0.01), 0, 1);
      this.velocity.z += (desiredZ * targetSpeed - this.velocity.z) * clamp(accel * dt / Math.max(targetSpeed, 0.01), 0, 1);
      this.height = this.stance === 'crouch' ? 1.35 : 1.8;
      return true;
    }
    const friction = Math.exp(-9 * dt);
    this.velocity.x *= friction;
    this.velocity.z *= friction;
    return false;
  }

  /* ---------------- combat ---------------- */

  _combat(dt, ctx, hasTarget, canSee) {
    this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    this.pauseTimer = Math.max(0, this.pauseTimer - dt);

    // reloading
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        const def = WEAPONS[this.weaponId];
        const need = (def.magSize ?? 30) - this.ammo.mag;
        const take = Math.min(need, this.ammo.reserve);
        this.ammo.mag += take;
        this.ammo.reserve -= take;
        this._callout('reloading', ctx);
      }
    }
    if (this.ammo.mag <= 0 && !this.reloading) {
      this.reloading = true;
      this.reloadTimer = WEAPONS[this.weaponId]?.reloadTime ?? 2.2;
      if (this.state === STATE.ENGAGE) {
        this.state = STATE.RELOAD;
        this.stateTime = 0;
        if (Math.random() < 0.5) this.state = STATE.COVER;
      }
    }

    // look at the target
    if (hasTarget) {
      const aim = hasTarget.target.aimPoint ? hasTarget.target.aimPoint() : { x: hasTarget.mem.x, y: hasTarget.mem.y + 1.3, z: hasTarget.mem.z };
      const eye = this.eyePosition(new THREE.Vector3());
      const dx = aim.x - eye.x;
      const dy = aim.y - eye.y;
      const dz = aim.z - eye.z;
      const targetYaw = Math.atan2(-dx, -dz);
      const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const speed = this.diff.lookSpeed * (canSee ? 1 : 0.6);
      const blend = clamp(speed * dt, 0, 1);
      this.aimYaw += shortestLocal(this.aimYaw, targetYaw) * blend;
      this.pitch = damp(this.pitch, targetPitch, speed * 0.7, dt);
      if (!canSee) {
        this.yaw = dampAngle(this.yaw, targetYaw, 4, dt);
      } else {
        this.yaw = dampAngle(this.yaw, this.aimYaw, 9, dt);
      }
    } else if (this.path && this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      const targetYaw = Math.atan2(-(wp.x - this.position.x), -(wp.z - this.position.z));
      this.yaw = dampAngle(this.yaw, targetYaw, 3.4, dt);
      this.pitch = damp(this.pitch, 0, 3, dt);
    }

    // grenades
    if (hasTarget && this.grenadeCooldown <= 0 && hasTarget.dist > 10 && hasTarget.dist < 34) {
      const hidden = !canSee;
      const clustered = hidden || Math.random() < 0.35;
      if (clustered && Math.random() < this.diff.grenadeChance * 0.35) {
        this._throwGrenade(ctx, hasTarget.mem);
      }
    }

    // shooting
    const def = WEAPONS[this.weaponId];
    if (!canSee || this.reloading || this.reactionTimer > 0 || this.flashBlind > 0 || this.ammo.mag <= 0) {
      return;
    }
    const dist = hasTarget.dist;
    if (dist > this.diff.range * 1.35) return;

    if (this.pauseTimer > 0) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = randInt(this.diff.burst[0], this.diff.burst[1]);
    }
    const fireInterval = 60 / (def.rpm ?? 600);
    if (this.fireTimer > 0) {
      this.fireTimer -= dt;
      return;
    }
    this.fireTimer = fireInterval;
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      this.pauseTimer = rand(this.diff.pause[0], this.diff.pause[1]);
    }
    this._shoot(ctx, hasTarget, def);
  }

  _shoot(ctx, hasTarget, def) {
    this.ammo.mag--;
    this.firing = true;
    this.stats.shots++;

    const eye = this.eyePosition(new THREE.Vector3());
    const muzzle = { x: eye.x, y: eye.y - 0.16, z: eye.z };
    const target = hasTarget.target;
    const aim = target.aimPoint ? target.aimPoint() : { x: hasTarget.mem.x, y: hasTarget.mem.y + 1.3, z: hasTarget.mem.z };

    // aim error model: moving/long range/blind fire all add error
    const moveFactor = 1 + Math.min(1.4, this.speed / 4.5);
    const distFactor = 1 + Math.max(0, hasTarget.dist - 18) / 42;
    const err = this.personality.error * moveFactor * distFactor + (this.stance === 'crouch' ? -0.004 : 0);
    const dx = (aim.x - eye.x) / hasTarget.dist + rand(-err, err);
    const dy = (aim.y - eye.y) / hasTarget.dist + rand(-err, err) * 0.7;
    const dz = (aim.z - eye.z) / hasTarget.dist + rand(-err, err);
    const len = Math.hypot(dx, dy, dz) || 1;
    const dir = { x: dx / len, y: dy / len, z: dz / len };

    const worldHit = this.world.raycast(eye, dir, 320, { bounds: false });
    let bestT = worldHit ? worldHit.distance : 320;
    let hitTarget = null;
    let hitSphere = null;
    for (const other of ctx.targets || []) {
      if (!other.alive || other.team === this.team) continue;
      const spheres = other.hitSpheres ? other.hitSpheres() : other.spheres;
      if (!spheres) continue;
      for (const sphere of spheres) {
        const fxo = eye.x - sphere.x;
        const fyo = eye.y - sphere.y;
        const fzo = eye.z - sphere.z;
        const b = 2 * (fxo * dir.x + fyo * dir.y + fzo * dir.z);
        const c = fxo * fxo + fyo * fyo + fzo * fzo - sphere.r * sphere.r;
        const disc = b * b - 4 * c;
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        let t = (-b - sq) / 2;
        if (t < 0) t = (-b + sq) / 2;
        if (t >= 0 && t < bestT) {
          bestT = t;
          hitTarget = other;
          hitSphere = sphere;
        }
      }
    }

    const point = { x: eye.x + dir.x * bestT, y: eye.y + dir.y * bestT, z: eye.z + dir.z * bestT };
    if (this.fx) {
      this.fx.muzzleFlash(muzzle, dir, def.kind === 'sniper' ? 1.6 : 1.0, {});
      this.fx.tracer(muzzle, point, {});
    }
    if (this.audio) {
      this.audio.gunshot(def.audio, { position: this.position, distance: 6 });
    }
    // hosts forward bot gunfire to guests so their screens show it too
    ctx.onShotFx?.(this, muzzle, point, def);

    if (hitTarget) {
      this.stats.hits++;
      const falloff = def.range ? lerp(1, def.range.minMult, smoothstep(def.range.falloffStart, def.range.falloffEnd, bestT)) : 1;
      const rawDamage = (def.damage ?? 20) * (hitSphere?.mult ?? 1) * falloff * (this.difficultyKey === 'recruit' ? 0.8 : 1);
      ctx.onDamage?.(hitTarget, rawDamage, {
        weapon: this.weaponId,
        headshot: hitSphere?.name === 'head',
        point,
        direction: dir,
        attacker: this,
      });
      if (this.fx) this.fx.bloodBurst(point, { x: -dir.x, y: -dir.y, z: -dir.z }, 1);
    } else if (worldHit && this.fx) {
      this.fx.impact(point, worldHit.normal, worldHit.surface, { distance: bestT });
    }
    void ctx;
  }

  _throwGrenade(ctx, mem) {
    this.grenadeCooldown = rand(18, 34);
    this._callout('grenade', ctx);
    const eye = this.eyePosition(new THREE.Vector3());
    const dx = mem.x - eye.x;
    const dz = mem.z - eye.z;
    const dist = Math.hypot(dx, dz) || 1;
    const aimY = Math.atan2(mem.y + 1.0 - eye.y, dist);
    const speed = 16;
    const dir = {
      x: (dx / dist) * Math.cos(aimY) + rand(-0.06, 0.06),
      y: Math.sin(aimY) + 0.32,
      z: (dz / dist) * Math.cos(aimY) + rand(-0.06, 0.06),
    };
    const direction = { x: dir.x, y: dir.y, z: dir.z };
    ctx.onGrenade?.({ position: { x: eye.x + dir.x, y: eye.y, z: eye.z + dir.z }, direction, owner: this, speed });
    void speed;
  }

  serializeState() {
    return {
      id: this.id,
      n: this.name,
      t: this.team,
      p: [+this.position.x.toFixed(1), +this.position.y.toFixed(1), +this.position.z.toFixed(1)],
      y: +this.yaw.toFixed(2),
      st: this.stance,
      a: this.alive ? 1 : 0,
      hp: Math.round(this.health),
      w: this.weaponId,
      sp: +clamp(this.speed / 6.0, 0, 1).toFixed(2),
      f: this.firing ? 1 : 0,
    };
  }

  applySnapshot(state, dt) {
    const [x, y, z] = state.p;
    this.targetPosition = this.targetPosition || new THREE.Vector3();
    this.targetPosition.set(x, y, z);
    if (!this._snapStarted) {
      this._snapStarted = true;
      this.position.copy(this.targetPosition);
    } else {
      this.position.lerp(this.targetPosition, clamp(9 * dt, 0, 1));
    }
    this.yaw = dampAngleLocalSoft(this.yaw, state.y, 9, dt);
    this.stance = state.st ?? this.stance;
    this.alive = !!state.a;
    this.health = state.hp ?? this.health;
    this.weaponId = state.w ?? this.weaponId;
    this.speed = (state.sp ?? 0) * 6;
    this.firing = !!state.f;
    if (!this.alive) this.deathTime += dt;
    if (this.rig) {
      this.rig.group.position.copy(this.position);
      this.rig.group.rotation.y = this.yaw;
      this.rig.animate(dt, {
        speed: this.speed,
        sprinting: this.speed > 5.2,
        crouch: this.stance === 'crouch',
        prone: this.stance === 'prone',
        aimYaw: 0,
        aimPitch: 0,
        aiming: this.speed < 1.5,
        showWeapon: true,
        firing: this.firing,
        dead: !this.alive,
      });
    }
  }
}

function shortestLocal(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function dampAngleLocalSoft(a, b, lambda, dt) {
  return a + shortestLocal(a, b) * (1 - Math.exp(-lambda * dt));
}

export const BOT_NAMES = {
  us: ['Sgt. Reyes', 'Cpl. Whitfield', 'Pvt. Kowalski', 'Spc. Delgado', 'Sgt. Boone', 'Cpl. Nkemdi', 'Pvt. Larsen', 'Spc. Alvarez', 'Sgt. Whitaker', 'Cpl. Ishida', 'Pvt. Okonkwo', 'Spc. Brandt'],
  opfor: ['Volkov', 'Aslanov', 'Dmitriev', 'Petrov', 'Kravets', 'Yilmaz', 'Sokolov', 'Baranov', 'Zelenko', 'Ahmadi', 'Novak', 'Rusakov'],
};

export function makeBotName(team, index = 0) {
  const pool = BOT_NAMES[team] || BOT_NAMES.opfor;
  const base = pool[index % pool.length];
  const suffix = index >= pool.length ? ` ${Math.floor(index / pool.length) + 1}` : '';
  return `${base}${suffix}`;
}

export { choice as _choice, vlenXZ as _vlenXZ, saturate as _saturate };

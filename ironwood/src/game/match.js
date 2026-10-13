/**
 * IRONWOOD - match rules and entity ownership.
 *
 * Team Deathmatch with respawns, killfeed, score streaks (UAV), a 10 minute
 * clock and a 75 kill limit. The host owns every simulation decision; guests
 * own their own soldier's movement and report hits back to the host.
 */

import * as THREE from 'three';
import { lerp, saturate, rand, choice, vdist, shuffle } from '../core/math.js';
import { Player } from './player.js';
import { Bot, DIFFICULTIES, makeBotName } from './ai.js';
import { SoldierRig } from './soldier.js';
import { MSG } from '../core/net.js';

export const TEAM_ORDER = ['us', 'opfor'];
export const MATCH_RULES = {
  scoreLimit: 75,
  timeLimit: 600,          // seconds
  playerRespawn: 4.5,
  botRespawn: 6.0,
  uavKills: 5,
  uavDuration: 18,
};

export class Match {
  constructor({ world, textures, audio, fx, net = null, settings = {}, hooks = {} }) {
    this.world = world;
    this.textures = textures;
    this.audio = audio;
    this.fx = fx;
    this.net = net;
    this.settings = settings;
    this.hooks = hooks;

    this.entities = new Map();
    this.remotePlayers = new Map();
    this.bots = new Map();
    this.local = null;
    this.factory = new (class {
      constructor(textures) {
        this.textures = textures;
      }
      create(team, opts) {
        return new SoldierRig(this.textures, team, opts);
      }
    })(textures);

    this.scores = { us: 0, opfor: 0 };
    this.timeLeft = MATCH_RULES.timeLimit;
    this.state = 'lobby';
    this.killfeed = [];
    this.events = [];
    this.pendingNetEvents = [];
    this.streaks = new Map();
    this.uav = { us: 0, opfor: 0 };
    this.snapshotTimer = 0;
    this.inputTimer = 0;
    this.respawnQueue = [];
    this.killCount = 0;
    this.matchSummary = null;
    this.lastSnapshotTime = 0;
    this._v = new THREE.Vector3();
  }

  /* ------------------------------------------------------------------ */
  /* Setup                                                               */
  /* ------------------------------------------------------------------ */

  addLocalPlayer({ name, team, weapon, id = 'local' }) {
    const spawn = this.spawnPointFor(team);
    const player = new Player(this.world, {
      id,
      name: name || 'Operator',
      team,
      isLocal: true,
      audio: this.audio,
      fx: this.fx,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      yaw: spawn.yaw,
      weapon,
    });
    this.local = player;
    this.entities.set(player.id, player);
    const rig = this.factory.create(team, { radio: false });
    player.attachRig(rig);
    this.world.scene.add(rig.group);
    return player;
  }

  addBot({ team, difficulty = 'regular', weapon = 'm4a1', index = 0 }) {
    const spawn = this.spawnPointFor(team);
    const id = `bot_${team}_${index}_${Math.floor(Math.random() * 9999)}`;
    const bot = new Bot(this.world, {
      id,
      name: makeBotName(team, index),
      team,
      difficulty,
      weapon: choice(['m4a1', 'mp5', 'm4a1', 'intervention']),
      audio: this.audio,
      fx: this.fx,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      yaw: spawn.yaw,
    });
    const rig = this.factory.create(team, { radio: Math.random() < 0.4, scope: bot.weaponId === 'intervention' });
    bot.attachRig(rig);
    this.world.scene.add(rig.group);
    this.entities.set(id, bot);
    this.bots.set(id, bot);
    return bot;
  }

  addRemotePlayer(info) {
    const id = info.id;
    if (this.entities.has(id)) return this.entities.get(id);
    const player = new Player(this.world, {
      id,
      name: info.name || 'Operator',
      team: info.team || 'opfor',
      isRemote: true,
      x: info.x ?? 0,
      y: info.y ?? 0,
      z: info.z ?? 0,
    });
    const rig = this.factory.create(player.team, { radio: false });
    player.attachRig(rig);
    this.world.scene.add(rig.group);
    this.entities.set(id, player);
    this.remotePlayers.set(id, player);
    return player;
  }

  removeEntity(id) {
    const entity = this.entities.get(id);
    if (!entity) return;
    if (entity.rig) {
      this.world.scene.remove(entity.rig.group);
    }
    this.entities.delete(id);
    this.remotePlayers.delete(id);
    this.bots.delete(id);
  }

  populateBots({ total = 8, difficulty = 'regular' } = {}) {
    // keep teams even given the humans already present
    const counts = { us: 0, opfor: 0 };
    for (const e of this.entities.values()) {
      if (e.isBot || e.isLocal || e.isRemote) counts[e.team]++;
    }
    const perTeam = Math.max(counts.us, counts.opfor, Math.round(total / 2));
    let index = 0;
    for (const team of TEAM_ORDER) {
      const wanted = perTeam - counts[team];
      for (let i = 0; i < wanted; i++) {
        this.addBot({ team, difficulty, index: index++ });
      }
    }
  }

  start({ difficulty = 'regular', bots = 8, mode = 'tdm' } = {}) {
    this.mode = mode;
    this.state = 'live';
    this.timeLeft = MATCH_RULES.timeLimit;
    this.scores = { us: 0, opfor: 0 };
    this.killfeed.length = 0;
    this.populateBots({ total: bots, difficulty });
    for (const e of this.entities.values()) {
      if (e.isBot) e.difficultyKey = difficulty;
    }
    this.emitEvent({ type: 'match_start', mode, difficulty });
  }

  /* ------------------------------------------------------------------ */
  /* Spawning                                                            */
  /* ------------------------------------------------------------------ */

  spawnPointFor(team) {
    const list = this.world.spawns[team] || [];
    if (!list.length) return { x: 0, y: 0, z: 0, yaw: 0 };
    const enemies = [...this.entities.values()].filter((e) => e.alive && e.team !== team);
    let best = list[0];
    let bestScore = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const spawn = list[(i + Math.floor(Math.random() * list.length)) % list.length];
      let score = Math.random() * 12;
      for (const enemy of enemies) {
        score += Math.min(60, vdist(spawn, enemy.position)) * 0.8;
      }
      // avoid spawning right on top of a live teammate as well
      for (const mate of this.entities.values()) {
        if (!mate.alive || mate.team !== team) continue;
        const d = vdist(spawn, mate.position);
        if (d < 3) score -= 25;
      }
      if (score > bestScore) {
        bestScore = score;
        best = spawn;
      }
    }
    return best;
  }

  spawnAreaFor(team) {
    const clearing = this.world.minimap?.clearings?.find((c) => c.label === `${team}_spawn`);
    return clearing || { x: team === 'us' ? -86 : 88, z: team === 'us' ? 78 : -80 };
  }

  objectiveFor(team) {
    const objectives = this.world.objectives || [];
    if (!objectives.length) return null;
    const enemyArea = this.spawnAreaFor(team === 'us' ? 'opfor' : 'us');
    // pick an objective, biased toward the enemy side and toward where fights happen
    let best = null;
    let bestScore = -Infinity;
    for (const obj of objectives) {
      const distEnemy = vdist({ x: obj.x, y: 0, z: obj.z }, { x: enemyArea.x, y: 0, z: enemyArea.z });
      const distMine = vdist({ x: obj.x, y: 0, z: obj.z }, this.spawnAreaFor(team));
      const score = -distEnemy * 1.2 - distMine * 0.4 + Math.random() * 30;
      if (score > bestScore) {
        bestScore = score;
        best = obj;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* Damage / death                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * The single authority for damage. Returns the kill info when the hit killed.
   */
  damage(victim, amount, info = {}) {
    if (!victim || !victim.alive || this.state === 'ended') return null;
    if (info.attacker && info.attacker.team === victim.team && info.attacker !== victim) return null;
    const died = victim.damage(amount, info);
    if (this.local === victim && this.hooks.onLocalDamage) {
      this.hooks.onLocalDamage(amount, info);
    }
    if (!died) {
      if (info.attacker && info.attacker.id === 'local') this.hooks.onHitMarker?.(info.headshot, true);
      return null;
    }
    return this.registerKill(victim, info);
  }

  registerKill(victim, info) {
    const attacker = info.attacker || null;
    const weapon = info.weapon || 'unknown';
    const headshot = !!info.headshot;
    if (attacker && attacker !== victim) {
      attacker.kills = (attacker.kills ?? 0) + 1;
      this.scores[attacker.team] = (this.scores[attacker.team] ?? 0) + 1;
      // killstreaks
      const streak = (this.streaks.get(attacker.id) ?? 0) + 1;
      this.streaks.set(attacker.id, streak);
      if (streak > 0 && streak % MATCH_RULES.uavKills === 0) {
        this.uav[attacker.team] = MATCH_RULES.uavDuration;
        const ev = { type: 'uav', team: attacker.team, by: attacker.name };
        this.emitEvent(ev);
        if (attacker === this.local) this.hooks.onStreak?.('uav');
      }
    } else {
      this.scores[victim.team === 'us' ? 'opfor' : 'us'] += 1;
    }
    if (victim.isBot || victim.isRemote || victim.isLocal) {
      this.streaks.set(victim.id, 0);
    }

    const entry = {
      victim: victim.name,
      victimTeam: victim.team,
      attacker: attacker ? attacker.name : 'World',
      attackerTeam: attacker ? attacker.team : null,
      weapon,
      headshot,
      suicide: !attacker || attacker === victim,
      time: performance.now(),
    };
    this.killfeed.push(entry);
    if (this.killfeed.length > 6) this.killfeed.shift();
    this.hooks.onKillfeed?.(entry);
    if (attacker === this.local) this.hooks.onKill?.({ victim, weapon, headshot });
    if (victim === this.local) this.hooks.onDeath?.({ attacker, weapon, headshot });

    // respawn scheduling
    const delay = victim.isBot ? MATCH_RULES.botRespawn : MATCH_RULES.playerRespawn;
    this.respawnQueue.push({ id: victim.id, at: performance.now() / 1000 + delay });
    this.killCount++;

    this.emitEvent({ type: 'kill', victim: victim.id, attacker: attacker?.id ?? null, weapon, headshot });

    if (this.hostAuthoritative()) {
      // nothing else: the snapshot carries the score
    }
    if (this.scores.us >= MATCH_RULES.scoreLimit || this.scores.opfor >= MATCH_RULES.scoreLimit) {
      this.endMatch('score');
    }
    return entry;
  }

  hostAuthoritative() {
    return !this.net || this.net.isHost;
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    if (this.state === 'lobby') return;
    if (this.state === 'live') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.endMatch('time');
    }
    this.uav.us = Math.max(0, this.uav.us - dt);
    this.uav.opfor = Math.max(0, this.uav.opfor - dt);

    // respawns
    const now = performance.now() / 1000;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const item = this.respawnQueue[i];
      if (now < item.at) continue;
      const entity = this.entities.get(item.id);
      this.respawnQueue.splice(i, 1);
      if (!entity) continue;
      const spawn = this.spawnPointFor(entity.team);
      entity.respawn(spawn);
      if (entity.isRemote) {
        // the guest owns its own movement; tell it where it came back
        this.emitEvent({ type: 'respawn', id: entity.id, p: [spawn.x, spawn.y, spawn.z], yaw: spawn.yaw });
        continue;
      }
      if (entity.isLocal) {
        entity.resetWeapons?.();
        this.hooks.onRespawn?.(entity);
      }
      this.emitEvent({ type: 'respawn', id: entity.id });
    }

    // host: drive bots, broadcast snapshots
    if (this.hostAuthoritative()) {
      for (const bot of this.bots.values()) {
        bot.update(dt, ctx);
      }
      this.snapshotTimer -= dt;
      if (this.net && this.snapshotTimer <= 0) {
        this.snapshotTimer = 1 / 15;
        this.broadcastSnapshot();
      }
    } else {
      // client: interpolate bots from snapshots
      for (const bot of this.bots.values()) {
        bot.applySnapshot(bot.lastSnapshot || { p: [bot.position.x, bot.position.y, bot.position.z], y: bot.yaw, a: 1 }, dt);
      }
      this.inputTimer -= dt;
      if (this.inputTimer <= 0 && this.local) {
        this.inputTimer = 1 / 30;
        this.sendLocalState();
      }
    }
  }

  endMatch(reason) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    const winner = this.scores.us === this.scores.opfor ? 'draw' : this.scores.us > this.scores.opfor ? 'us' : 'opfor';
    this.matchSummary = { winner, reason, scores: { ...this.scores }, killCount: this.killCount };
    this.emitEvent({ type: 'match_end', winner, reason, scores: { ...this.scores } });
    this.hooks.onMatchEnd?.(this.matchSummary);
  }

  emitEvent(event) {
    this.events.push(event);
    if (this.events.length > 60) this.events.shift();
    this.hooks.onEvent?.(event);
  }

  /* ------------------------------------------------------------------ */
  /* Networking                                                          */
  /* ------------------------------------------------------------------ */

  broadcastSnapshot() {
    if (!this.net) return;
    const players = [];
    for (const entity of this.entities.values()) {
      if (entity.isBot) continue;
      players.push(entity.serializeState());
    }
    const bots = [...this.bots.values()].map((b) => b.serializeState());
    this.net.broadcast({
      t: MSG.SNAPSHOT,
      time: +this.timeLeft.toFixed(1),
      s: { ...this.scores },
      st: this.state,
      p: players,
      b: bots,
      uav: { ...this.uav },
      ev: this.takeEvents(),
    });
  }

  takeEvents() {
    const out = this.pendingNetEvents.splice(0, this.pendingNetEvents.length);
    return out;
  }

  sendLocalState() {
    if (!this.net || !this.local) return;
    this.net.send({
      t: MSG.INPUT,
      state: this.local.serializeState(),
      firing: this.local.rig?.recoil > 0.5,
    });
  }

  handleMessage(msg, fromId) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case MSG.SNAPSHOT: {
        if (this.hostAuthoritative()) return;
        this.timeLeft = msg.time ?? this.timeLeft;
        this.scores = msg.s ?? this.scores;
        this.uav = msg.uav ?? this.uav;
        this.state = msg.st ?? this.state;
        for (const state of msg.p || []) {
          if (state.id === this.local?.id) {
            // our own soldier: we own movement, the host owns damage
            if (this.local) {
              if (state.hp < this.local.health - 1) {
                this.local.damage(this.local.health - state.hp, { silent: true });
              }
              if (!state.a && this.local.alive) {
                this.local.alive = false;
                this.local.health = 0;
                this.local.deathTime = 0;
              }
            }
            continue;
          }
          let entity = this.entities.get(state.id);
          if (!entity) {
            entity = this.addRemotePlayer({ id: state.id, name: state.n, team: state.t });
          }
          if (entity && !entity.isLocal) entity.applyNetworkState(state, 1 / 15);
        }
        for (const state of msg.b || []) {
          let bot = this.bots.get(state.id);
          if (!bot) {
            // the host knows about a bot we have not seen yet
            bot = new Bot(this.world, { id: state.id, name: state.n, team: state.t, x: state.p[0], y: state.p[1], z: state.p[2] });
            const rig = this.factory.create(state.t, {});
            bot.attachRig(rig);
            this.world.scene.add(rig.group);
            this.bots.set(state.id, bot);
            this.entities.set(state.id, bot);
          }
          bot.lastSnapshot = state;
        }
        for (const ev of msg.ev || []) this.handleNetEvent(ev);
        break;
      }
      case MSG.INPUT: {
        if (!this.hostAuthoritative()) return;
        const state = msg.state;
        if (!state) return;
        let entity = this.entities.get(state.id);
        if (!entity) {
          entity = this.addRemotePlayer({ id: state.id, name: state.n, team: state.t });
        }
        entity.applyNetworkState(state, 1 / 30);
        // host applies hits reported by the guest
        break;
      }
      case MSG.EVENT:
        this.handleNetEvent(msg.event, fromId);
        break;
      case MSG.CHAT:
        this.hooks.onChat?.(msg.from ?? fromId, msg.text);
        break;
      case MSG.START:
        this.hooks.onRemoteStart?.(msg);
        break;
      default:
        break;
    }
  }

  handleNetEvent(ev, fromId) {
    if (!ev) return;
    switch (ev.type) {
      case 'hit': {
        if (!this.hostAuthoritative()) return;
        const target = this.entities.get(ev.target);
        const attacker = this.entities.get(ev.attacker);
        if (!target || !target.alive) return;
        // sanity: attacker must be reasonably close to the target
        if (attacker && vdist(attacker.position, target.position) > 420) return;
        this.damage(target, Math.min(ev.damage, 200), {
          weapon: ev.weapon,
          headshot: ev.headshot,
          attacker: attacker || null,
          point: ev.point,
        });
        break;
      }
      case 'explosion': {
        if (!this.hostAuthoritative()) return;
        const owner = this.entities.get(ev.owner);
        const p = ev.position;
        const radius = ev.radius ?? 7.5;
        for (const entity of this.entities.values()) {
          if (!entity.alive || entity.isRemote) continue;
          const d = vdist({ x: p[0], y: p[1], z: p[2] }, { x: entity.position.x, y: entity.position.y + 0.9, z: entity.position.z });
          if (d > radius) continue;
          this.damage(entity, (ev.damage ?? 130) * Math.pow(1 - d / radius, 1.5), {
            weapon: ev.kind === 'flash' ? 'flash' : 'frag',
            grenade: true,
            attacker: owner || null,
          });
        }
        break;
      }
      case 'kill':
        this.hooks.onRemoteKill?.(ev);
        break;
      case 'match_end':
        this.matchSummary = { winner: ev.winner, reason: ev.reason, scores: ev.scores };
        this.state = 'ended';
        this.hooks.onMatchEnd?.(this.matchSummary);
        break;
      case 'uav':
        this.uav[ev.team] = MATCH_RULES.uavDuration;
        this.hooks.onUav?.(ev.team);
        break;
      case 'respawn': {
        if (!ev.p) break;
        const entity = this.entities.get(ev.id);
        if (!entity) break;
        entity.position.set(ev.p[0], ev.p[1], ev.p[2]);
        entity.velocity?.set?.(0, 0, 0);
        entity.yaw = ev.yaw ?? entity.yaw;
        this.hooks.onRespawn?.(entity);
        break;
      }
      case 'shotfx': {
        // guests see the host's bots muzzle flashes / tracers
        const from = { x: ev.f[0], y: ev.f[1], z: ev.f[2] };
        const to = { x: ev.t[0], y: ev.t[1], z: ev.t[2] };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const dir = { x: dx / len, y: dy / len, z: dz / len };
        this.fx?.muzzleFlash(from, dir, ev.kind === 'sniper' ? 1.6 : 1.0, {});
        this.fx?.tracer(from, to, {});
        this.audio?.gunshot(ev.audio ?? 'rifle', { position: from, distance: 10 });
        break;
      }
      case 'explosive': {
        const p = { x: ev.p[0], y: ev.p[1], z: ev.p[2] };
        if (ev.kind === 'flash') {
          this.fx?.flashLight(p.x, p.y, p.z, 26);
          this.audio?.flashbang({ position: p, distance: 6 });
        } else {
          this.fx?.explosion(p, { radius: ev.radius ?? 7.5 });
        }
        break;
      }
      default:
        break;
    }
    void fromId;
  }

  /** Guests report hits so the host can apply damage. */
  reportHit({ targetId, damage, weapon, headshot, point }) {
    if (!this.net || this.hostAuthoritative()) return;
    this.net.send({
      t: MSG.EVENT,
      event: {
        type: 'hit',
        target: targetId,
        attacker: this.local?.id ?? 'local',
        damage,
        weapon,
        headshot,
        point: point ? [point.x, point.y, point.z] : null,
      },
    });
  }

  /** Grenades: the blast is broadcast so both machines apply it identically. */
  reportExplosion({ kind, position, radius, damage, owner }) {
    if (!this.net) return;
    const payload = {
      type: 'explosion',
      kind,
      position: [position.x, position.y, position.z],
      radius,
      damage,
      owner: owner ?? this.local?.id ?? 'local',
    };
    if (this.hostAuthoritative()) {
      this.pendingNetEvents.push(payload);
      // apply to our own entities right away (bots and remote players)
      this.handleNetEvent(payload);
    } else {
      this.net.send({ t: MSG.EVENT, event: payload });
    }
  }

  /** Host: batch bot gunfire for the next snapshot. */
  queueShotFx(from, to, def) {
    if (!this.net || !this.hostAuthoritative()) return;
    this.pendingNetEvents.push({
      type: 'shotfx',
      f: [+from.x.toFixed(1), +from.y.toFixed(1), +from.z.toFixed(1)],
      t: [+to.x.toFixed(1), +to.y.toFixed(1), +to.z.toFixed(1)],
      audio: def?.audio ?? 'rifle',
      kind: def?.kind ?? 'rifle',
    });
    if (this.pendingNetEvents.length > 40) this.pendingNetEvents.splice(0, this.pendingNetEvents.length - 40);
  }

  /* ------------------------------------------------------------------ */
  /* Scoreboard                                                          */
  /* ------------------------------------------------------------------ */

  scoreboard() {
    const rows = [];
    for (const entity of this.entities.values()) {
      rows.push({
        id: entity.id,
        name: entity.name,
        team: entity.team,
        kills: entity.kills ?? 0,
        deaths: entity.deaths ?? 0,
        isBot: !!entity.isBot,
        isLocal: !!entity.isLocal,
        ping: this.net?.peers?.get(entity.id)?.ping ?? 0,
        alive: entity.alive,
      });
    }
    rows.sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths) || b.kills - a.kills);
    return rows;
  }

  /** Enemies visible to a team thanks to UAV or line of sight. */
  radarBlips(team) {
    const out = [];
    const uavActive = (this.uav[this.local?.team ?? team] ?? 0) > 0;
    for (const entity of this.entities.values()) {
      if (!entity.alive || entity.team === this.local?.team) continue;
      const isEnemyOfLocal = entity.team !== (this.local?.team ?? team);
      if (!isEnemyOfLocal) continue;
      let visible = uavActive;
      if (!visible && this.local) {
        const eye = this.local.eyePosition(this._v.clone());
        visible = this.world.lineOfSight(
          { x: eye.x, y: eye.y, z: eye.z },
          { x: entity.position.x, y: entity.position.y + 1.3, z: entity.position.z },
          { through: ['leaf', 'cloth'] }
        );
        if (visible) {
          const dx = entity.position.x - this.local.position.x;
          const dz = entity.position.z - this.local.position.z;
          const dist = Math.hypot(dx, dz) || 1;
          void dist;
        }
      }
      if (visible) out.push({ x: entity.position.x, z: entity.position.z, kind: 'enemy' });
    }
    return out;
  }

  teamSummary() {
    const counts = { us: { alive: 0, total: 0 }, opfor: { alive: 0, total: 0 } };
    for (const e of this.entities.values()) {
      if (!counts[e.team]) continue;
      counts[e.team].total++;
      if (e.alive) counts[e.team].alive++;
    }
    return counts;
  }

  reset() {
    for (const entity of [...this.entities.values()]) this.removeEntity(entity.id);
    this.respawnQueue.length = 0;
    this.killfeed.length = 0;
    this.scores = { us: 0, opfor: 0 };
    this.timeLeft = MATCH_RULES.timeLimit;
    this.state = 'lobby';
    this.matchSummary = null;
    this.streaks.clear();
    this.uav = { us: 0, opfor: 0 };
    this.local = null;
  }
}

export { DIFFICULTIES, shuffle as _shuffle, lerp as _lerp, saturate as _saturate, rand as _rand };

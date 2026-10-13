// Game orchestrator: encounter flow, combat resolution, feedback (hit-stop, shake,
// sparks, sound, UI), and the win/lose states.
//
// Feedback rules this file enforces:
//   * every hit: sparks + sound + shake + a short hit-stop; bigger hits get more
//   * hit-stop freezes the simulation (not the camera or the UI) for a few frames
//   * danger is always telegraphed first (see enemy.js / boss.js)

import * as THREE from 'three';
import { Arena } from './arena.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Boss } from './boss.js';
import { ThirdPersonCamera } from './camera.js';
import { WAVES, BOSS, ARENA_RADIUS } from './config.js';
import { Trauma } from '../engine/shake.js';
import { damp, rand } from '../engine/math.js';
import { getNumber, setNumber } from '../engine/storage.js';

const BEST_KEY = 'warden.bestTime';

export class Game {
  constructor({ scene, camera, input, sound, music, sparks, ui }) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.sound = sound;
    this.music = music;
    this.sparks = sparks;
    this.ui = ui;
    this.arena = new Arena(scene);
    this.player = new Player(this);
    this.cam = new ThirdPersonCamera(camera);
    this.trauma = new Trauma();
    this.best = getNumber(BEST_KEY, 0);

    this.enemies = [];
    this.shockwaves = [];
    this.state = 'menu';   // menu | play | dying | won | dead | paused
    this.time = 0;         // game seconds (affected by slow motion and hit-stop)
    this.realT = 0;
    this.timeScale = 1;
    this.targetScale = 1;
    this.hitStop = 0;
    this.endT = 0;
    this.waveIndex = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveTimer = 0;
    this.kills = 0;
  }

  // ------------------------------------------------------------ flow

  start() {
    for (const e of this.enemies) this._removeEnemyVisual(e);
    this.enemies = [];
    for (const s of this.shockwaves) this._removeShock(s);
    this.shockwaves = [];
    this.player.reset();
    this.cam.reset(Math.PI);
    this.time = 0;
    this.timeScale = 1;
    this.targetScale = 1;
    this.hitStop = 0;
    this.waveIndex = 0;
    this.kills = 0;
    this.waveTimer = 0;
    this.state = 'play';
    this.sound.play('start');
    this.music.start();
    this.startWave();
  }

  pause() {
    if (this.state === 'play') {
      this.state = 'paused';
      this.music.stop?.();
      this.ui.overlay('pause');
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'play';
      this.music.start();
      this.ui.overlay(null);
    }
  }

  startWave() {
    const list = WAVES[this.waveIndex];
    if (list[0] === 'boss') {
      this.ui.banner('THE WARDEN', 'Read the ground. Dodge the shadows.', 2600);
      this.ui.setWave('FINAL');
      this.spawnEnemy('boss');
      this.sound.play('roar');
      this.trauma.add(0.5);
    } else {
      this.ui.setWave(`WAVE ${this.waveIndex + 1} / ${WAVES.length - 1}`);
      this.ui.banner(`WAVE ${this.waveIndex + 1}`, `${list.length} foes approach`, 1600);
      this.spawnQueue = [...list];
      this.spawnTimer = 0.9;
    }
    this.waveTimer = 0;
  }

  _spawnPos() {
    // Spawn on the rim, roughly opposite the player so nothing appears on top of them.
    const p = this.player.pos;
    const base = Math.atan2(p.x, p.z) + Math.PI;
    const a = base + rand(-1.1, 1.1);
    const r = ARENA_RADIUS - 4.5;
    return { x: Math.sin(a) * r, z: Math.cos(a) * r };
  }

  spawnEnemy(type) {
    const { x, z } = this._spawnPos();
    const e = type === 'boss' ? new Boss(this, x, z) : new Enemy(this, type, x, z);
    this.enemies.push(e);
    this.sparks.emit(x, 0.2, z, { count: 18, speed: 3, up: 1.5, life: 0.7, size: 0.22, color: 0xb9a88c, gravity: 2 });
    this.sound.play('telegraph');
    return e;
  }

  // ------------------------------------------------------------ update

  update(dt) {
    this.realT += dt;
    this.trauma.update(dt);

    if (this.state === 'play' || this.state === 'dying' || this.state === 'won') {
      if (this.hitStop > 0) this.hitStop -= dt;
      const simDt = this.hitStop > 0 ? 0 : dt * this.timeScale;
      this.timeScale = damp(this.timeScale, this.targetScale, 5, dt);
      this._simulate(simDt, dt);
    }

    if (this.state === 'dying') {
      this.endT -= dt;
      if (this.endT <= 0) this._finish('dead');
    } else if (this.state === 'won') {
      this.endT -= dt;
      if (this.endT <= 0) this._finish('won');
    }

    const sprint = this.input.isDown('ShiftLeft', 'ShiftRight') && this.player.speed01 > 0.7;
    this.cam.update(dt, this.input, this.player.pos, this.arena, this.trauma, sprint);
    this.arena.update(this.realT);
    this.ui.update(this, dt);
  }

  _simulate(dt, realDt) {
    this.time += dt;
    this.player.update(dt, this.input, this.cam.yaw);
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter((e) => {
      if (e.removable) {
        this._removeEnemyVisual(e);
        return false;
      }
      return true;
    });
    this._updateShockwaves(dt);
    this.sparks.update(dt);
    this._checkWaves(dt);
    this.ui.setPlayer(this.player, this.kills);
  }

  _checkWaves(dt) {
    if (this.state !== 'play') return;
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy(this.spawnQueue.shift());
        this.spawnTimer = 0.5;
      }
      return;
    }
    if (this.waveTimer > 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveIndex += 1;
        this.startWave();
      }
      return;
    }
    if (this.enemies.length === 0) {
      this.waveTimer = 2.2;
      this.ui.banner('WAVE CLEARED', 'Catch your breath.', 1800);
      this.sound.play('ui');
    }
  }

  // ------------------------------------------------------------ combat events

  onPlayerHitEnemy(e, cfg, player) {
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;
    const heavy = cfg.dmg >= 18;
    const dealt = e.state === 'stun' ? Math.round(cfg.dmg * 1.6) : cfg.dmg;
    const killed = e.takeHit(cfg.dmg, nx, nz, cfg.knock, heavy);

    const hx = e.pos.x - nx * e.radius;
    const hz = e.pos.z - nz * e.radius;
    this.sparks.emit(hx, 1.2, hz, {
      count: heavy ? 30 : 16, speed: heavy ? 6 : 4, up: 0.6, life: 0.35, size: 0.16,
      color: heavy ? 0xffe2a0 : 0xfff1d6, gravity: 5,
    });
    this.sound.play(heavy ? 'hitHeavy' : 'hit');
    this.trauma.add(heavy ? 0.35 : 0.14);
    this.hitStop = Math.max(this.hitStop, heavy ? 0.075 : 0.035);
    this.ui.popWorld(new THREE.Vector3(e.pos.x, 2.1 * e.cfg.scale, e.pos.z), `${dealt}`, heavy ? '#ffd27a' : '#ffffff', heavy ? 1.3 : 1);

    if (killed) this.kills += 1;
  }

  onEnemyHitPlayer(enemy, dmg, heavy = false) {
    const res = this.player.takeHit(dmg, enemy.pos.x, enemy.pos.z, { heavy });
    if (res === 'dodge') {
      this.ui.popWorld(new THREE.Vector3(this.player.pos.x, 2, this.player.pos.z), 'DODGE', '#7df9ff', 0.9);
    }
  }

  onPlayerDamaged(n, pos) {
    this.sparks.emit(pos.x, 1.1, pos.z, { count: 26, speed: 5, life: 0.4, size: 0.18, color: 0xff3d7f, gravity: 4 });
    this.sound.play('hurt');
    this.trauma.add(0.5);
    this.hitStop = Math.max(this.hitStop, 0.07);
    this.ui.flash(Math.min(1, n / 20));
    this.ui.popWorld(new THREE.Vector3(pos.x, 2.1, pos.z), `-${Math.round(n)}`, '#ff5c8a', 1.2);
  }

  onPlayerBlocked(pos) {
    this.sparks.emit(pos.x, 1.2, pos.z, { count: 14, speed: 4, life: 0.25, size: 0.14, color: 0xcfe9ff, gravity: 3 });
    this.sound.play('block');
    this.trauma.add(0.15);
    this.hitStop = Math.max(this.hitStop, 0.02);
  }

  onPlayerDied() {
    this.state = 'dying';
    this.endT = 1.8;
    this.targetScale = 0.3;
    this.trauma.add(1);
    this.sound.play('death');
    this.sparks.emit(this.player.pos.x, 1.0, this.player.pos.z, { count: 80, speed: 6, life: 1.0, size: 0.22, color: 0x7df9ff, gravity: 3 });
    this.music.stop?.();
  }

  onEnemyDied(e) {
    const heavy = e.type !== 'grunt';
    this.sparks.emit(e.pos.x, 1.0, e.pos.z, {
      count: heavy ? 70 : 36, speed: heavy ? 7 : 5, life: 0.8, size: heavy ? 0.26 : 0.18, color: e.cfg.accent, gravity: 4,
    });
    this.sound.play('kill');
    this.trauma.add(e.type === 'boss' ? 0.9 : heavy ? 0.5 : 0.25);
    this.hitStop = Math.max(this.hitStop, heavy ? 0.09 : 0.05);
    if (e.type === 'boss') this._onBossDefeated();
  }

  onBossPhase2() {
    this.ui.banner('PHASE II', 'It is enraged.', 2000);
    this.sound.play('roar');
    this.trauma.add(0.9);
    this.hitStop = Math.max(this.hitStop, 0.1);
  }

  onBossSlam(x, z, radius, dmg) {
    this.sound.play('slam');
    this.trauma.add(0.9);
    this.hitStop = Math.max(this.hitStop, 0.08);
    this.sparks.emit(x, 0.3, z, { count: 70, speed: 7, up: 0.4, life: 0.7, size: 0.26, color: 0xffb347, gravity: 4 });
    const p = this.player;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d <= radius + p.radius) {
      p.takeHit(dmg, x, z, { heavy: true });
    }
  }

  onBossShockwave(x, z) {
    this.sound.play('shockwave');
    this.trauma.add(0.6);
    const geo = new THREE.RingGeometry(0.94, 1, 96);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.12, z);
    mesh.scale.setScalar(0.5);
    this.scene.add(mesh);
    this.shockwaves.push({ x, z, r: 0.5, hit: false, mesh, mat });
  }

  onBossWallCrash(pos) {
    this.sound.play('hitHeavy');
    this.trauma.add(0.5);
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.sparks.emit(pos.x, 1.3, pos.z, { count: 40, speed: 6, life: 0.6, size: 0.2, color: 0xd8cfc0, gravity: 9 });
  }

  _updateShockwaves(dt) {
    const p = this.player;
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.r += BOSS.shockwaveSpeed * dt;
      s.mesh.scale.setScalar(s.r);
      s.mat.opacity = Math.max(0, 0.9 * (1 - s.r / BOSS.shockwaveMax));
      if (!s.hit) {
        const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
        if (Math.abs(d - s.r) < 1.0) {
          s.hit = true;
          p.takeHit(BOSS.shockwaveDmg, s.x, s.z, { heavy: true });
        }
      }
      if (s.r >= BOSS.shockwaveMax) {
        this._removeShock(s);
        this.shockwaves.splice(i, 1);
      }
    }
  }

  _removeShock(s) {
    this.scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    s.mat.dispose();
  }

  _removeEnemyVisual(e) {
    this.scene.remove(e.root);
    this.scene.remove(e.telegraph.group);
    if (e.marker) this.scene.remove(e.marker.group);
  }

  _onBossDefeated() {
    this.state = 'won';
    this.endT = 2.6;
    this.targetScale = 0.25;
    this.sound.play('win');
    this.ui.banner('THE WARDEN FALLS', '', 3000);
    this.music.stop?.();
  }

  _finish(kind) {
    if (kind === 'won') {
      const t = this.time;
      if (this.best === 0 || t < this.best) {
        this.best = t;
        setNumber(BEST_KEY, t);
      }
    }
    this.state = kind;
    this.timeScale = 1;
    this.targetScale = 1;
    this.ui.overlay(kind, { time: this.time, kills: this.kills, best: this.best });
  }

  // Read-only snapshot for tests and devtools.
  debug() {
    const boss = this.enemies.find((e) => e.type === 'boss');
    return {
      state: this.state,
      wave: this.waveIndex + 1,
      time: Number(this.time.toFixed(2)),
      hp: Math.round(this.player.hp),
      stamina: Math.round(this.player.stamina),
      playerState: this.player.state,
      enemies: this.enemies.filter((e) => !e.dead).length,
      kills: this.kills,
      bossHp: boss ? Math.round(boss.hp) : null,
      bossState: boss ? boss.state : null,
      best: this.best,
    };
  }
}


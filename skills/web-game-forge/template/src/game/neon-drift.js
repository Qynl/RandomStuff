// NEON DRIFT - a complete example game built on the engine in ../engine.
// It is intentionally small, but it demonstrates the "game feel" techniques the
// skill recommends: telegraphed spawns, hit-stop, screen shake, additive particles,
// combo multipliers with rising pitch, tweened score pops, and a slow-mo death.

import { clamp, damp, lerp, rand, TAU, angleDiff, easeOutBack, easeOutCubic } from '../engine/math.js';
import { Particles } from '../engine/particles.js';
import { Shake } from '../engine/camera.js';
import { Popups, drawText } from '../engine/hud.js';
import { getNumber, setNumber } from '../engine/storage.js';
import { tween } from '../engine/tween.js';

// One palette, used consistently: cyan = you, pink/orange = danger, green = reward.
const C = {
  bg: '#05060f',
  grid: 'rgba(96,140,255,0.12)',
  player: '#7df9ff',
  bullet: '#fff27a',
  chaser: '#ff3d7f',
  tank: '#ff9a3d',
  gem: '#6dff9e',
  text: '#eef4ff',
  dim: '#7f8fbf',
};

const COMBO_TIME = 2.2;     // seconds before a combo expires
const BEST_KEY = 'neon-drift.best';
const GRID = 56;

// Cheap glow: a large translucent disc drawn additively. Much faster than shadowBlur.
function glow(ctx, x, y, r, color, alpha = 0.22) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export class NeonDrift {
  constructor({ input, sound, music, width, height }) {
    this.input = input;
    this.sound = sound;
    this.music = music;
    this.w = width;
    this.h = height;
    this.fx = new Particles(2000);
    this.shake = new Shake({ maxOffset: 14 });
    this.popups = new Popups();
    this.best = getNumber(BEST_KEY, 0);
    this.t = 0;              // real time, used for idle animation
    this.menuT = 0;
    this.scoreScale = 1;
    this.hurt = 0;           // red flash strength, tweened back to 0
    this.newBest = false;
    this.state = 'menu';     // 'menu' | 'play' | 'dying' | 'over'
    this.reset();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
  }

  reset() {
    this.player = {
      x: this.w / 2, y: this.h / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
      hp: 3, iframes: 0, fireCd: 0, trailCd: 0, dead: false,
    };
    this.bullets = [];
    this.enemies = [];
    this.gems = [];
    this.warnings = [];
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.mult = 1;
    this.spawnCd = 1.2;
    this.time = 0;           // gameplay seconds (slows with time scale)
    this.dyingT = 0;
    this.overT = 0;
    this.paused = false;
    this.timeScale = 1;
    this.hitStop = 0;
  }

  start() {
    this.reset();
    this.state = 'play';
    this.newBest = false;
    this.sound.play('start');
    this.music.start();
  }

  pause() {
    if (this.state === 'play') this.paused = true;
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    this.t += dt;
    this.shake.update(dt);          // shake uses real time so hit-stop still shakes
    const input = this.input;

    if (this.state === 'menu') {
      this.menuT += dt;
      this.fx.update(dt);
      if (Math.random() < 0.4) {
        this.fx.emit(rand(0, this.w), rand(0, this.h), { count: 1, speed: 25, life: 1.6, size: 2, color: C.dim });
      }
      if (input.wasPressed('Enter', 'Space', 'pointer')) {
        this.sound.play('ui');
        this.start();
      }
    } else if (this.state === 'over') {
      this.overT += dt;
      this.fx.update(dt);
      if (this.overT > 0.7 && input.wasPressed('Enter', 'Space', 'KeyR', 'pointer')) {
        this.sound.play('ui');
        this.start();
      }
    } else {
      if (input.wasPressed('Escape', 'KeyP') && this.state === 'play') this.paused = !this.paused;

      if (this.state === 'dying') {
        // Slow-motion death beat before the game-over screen.
        this.timeScale = lerp(this.timeScale, 0.25, 0.15);
        this.dyingT -= dt;
        if (this.dyingT <= 0) this.finish();
      }

      if (!this.paused) {
        if (this.hitStop > 0) this.hitStop -= dt; // freeze the world for a few frames
        else this.simulate(dt * this.timeScale, dt);
      }
    }

    input.endTick();
  }

  simulate(sdt, dt) {
    this.time += sdt;
    this.fx.update(sdt);
    this.popups.update(sdt);
    if (!this.player.dead) this.control(sdt, dt);
    this.spawnTick(sdt);
    this.updateEnemies(sdt);
    this.updateBullets(sdt);
    this.updateGems(sdt);
    this.collide(sdt);
    this.updateCombo(sdt);
  }

  control(dt, realDt) {
    const p = this.player;
    const input = this.input;
    const pt = input.pointer;
    const a = input.axis();
    let ax = a.x;
    let ay = a.y;

    // Touch: drag anywhere to steer toward your finger, with analog strength.
    const touchDrag = pt.down && pt.type === 'touch';
    if (touchDrag) {
      const dx = pt.x - p.x;
      const dy = pt.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / 60);
      ax = (dx / d) * m;
      ay = (dy / d) * m;
    }

    // Acceleration + drag. Input gives a snappy feel; releasing brakes harder.
    const moving = ax !== 0 || ay !== 0;
    p.vx += ax * 2600 * dt;
    p.vy += ay * 2600 * dt;
    const drag = moving ? 2.5 : 9;
    p.vx = damp(p.vx, 0, drag, dt);
    p.vy = damp(p.vy, 0, drag, dt);
    const speed = Math.hypot(p.vx, p.vy);
    const max = 430;
    if (speed > max) {
      p.vx *= max / speed;
      p.vy *= max / speed;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Soft walls: clamp and bounce a little so the edge feels physical.
    const m = 18;
    if (p.x < m) { p.x = m; p.vx = Math.abs(p.vx) * 0.4; }
    if (p.x > this.w - m) { p.x = this.w - m; p.vx = -Math.abs(p.vx) * 0.4; }
    if (p.y < m) { p.y = m; p.vy = Math.abs(p.vy) * 0.4; }
    if (p.y > this.h - m) { p.y = this.h - m; p.vy = -Math.abs(p.vy) * 0.4; }

    // Ship turns toward its velocity smoothly (no snapping).
    if (speed > 30) {
      const target = Math.atan2(p.vy, p.vx);
      p.angle += angleDiff(p.angle, target) * Math.min(1, realDt * 12);
    }

    // Engine trail while moving fast.
    p.trailCd -= dt;
    if (p.trailCd <= 0 && speed > 60) {
      p.trailCd = 0.02;
      this.fx.emit(p.x, p.y, { count: 1, speed: 30, life: 0.35, size: 5, color: C.player, drag: 0.9 });
    }

    // Firing: hold Space, or hold the mouse / touch. Aim at the pointer when we have one.
    p.fireCd -= dt;
    p.iframes = Math.max(0, p.iframes - dt);
    const wantFire = input.isDown('Space') || pt.down;
    if (wantFire && p.fireCd <= 0) {
      p.fireCd = 0.11;
      const aim = pt.active ? Math.atan2(pt.y - p.y, pt.x - p.x) : p.angle;
      const cos = Math.cos(aim);
      const sin = Math.sin(aim);
      const sx = p.x + cos * 16;
      const sy = p.y + sin * 16;
      this.bullets.push({ x: sx, y: sy, vx: cos * 950, vy: sin * 950, life: 1.0 });
      p.vx -= cos * 70;   // recoil: firing feels weighty
      p.vy -= sin * 70;
      this.fx.emit(sx, sy, { count: 3, speed: 120, spread: 0.6, angle: aim, life: 0.15, size: 2, color: C.bullet });
      this.sound.play('shoot');
    }
  }

  spawnTick(dt) {
    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      // Spawns accelerate over time: the difficulty ramp.
      this.spawnCd = Math.max(0.35, 1.5 - this.time * 0.018) * (0.8 + Math.random() * 0.4);
      this.queueSpawn();
    }

    // Warnings are telegraphed: a ring shrinks in for 0.7s before the enemy appears.
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const wn = this.warnings[i];
      wn.t += dt;
      if (wn.t >= wn.delay) {
        this.enemies.push(makeEnemy(wn.kind, wn.x, wn.y, this.time));
        this.fx.emit(wn.x, wn.y, { count: 14, speed: 240, life: 0.35, size: 3, color: C.chaser, glow: true });
        this.sound.play('warp');
        this.warnings.splice(i, 1);
      }
    }
  }

  queueSpawn() {
    const side = (Math.random() * 4) | 0;
    const m = 30;
    let x;
    let y;
    if (side === 0) { x = rand(m, this.w - m); y = m; }
    else if (side === 1) { x = this.w - m; y = rand(m, this.h - m); }
    else if (side === 2) { x = rand(m, this.w - m); y = this.h - m; }
    else { x = m; y = rand(m, this.h - m); }
    const tankChance = Math.min(0.3, this.time * 0.004);
    this.warnings.push({ x, y, t: 0, delay: 0.7, kind: Math.random() < tankChance ? 'tank' : 'chaser' });
  }

  updateEnemies(dt) {
    const p = this.player;
    const ramp = Math.min(70, this.time * 0.6);
    for (const e of this.enemies) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = e.speed + ramp * (e.kind === 'tank' ? 0.3 : 1);
      // Velocity eases toward "chase the player": enemies have weight, not sticky lines.
      e.vx = damp(e.vx, (dx / d) * sp, e.kind === 'tank' ? 1.2 : 3.5, dt);
      e.vy = damp(e.vy, (dy / d) * sp, e.kind === 'tank' ? 1.2 : 3.5, dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.spin += dt * (e.kind === 'tank' ? 0.8 : 4);
      e.flash = Math.max(0, e.flash - dt);
    }
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > this.w + 20 || b.y > this.h + 20) {
        this.bullets.splice(i, 1);
        continue;
      }
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 3) {
          this.hitEnemy(e, j, b);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  hitEnemy(e, j, b) {
    e.hp -= 1;
    e.flash = 0.07;
    e.vx += b.vx * 0.15;
    e.vy += b.vy * 0.15;
    this.fx.emit(b.x, b.y, {
      count: 6, speed: 260, spread: 1.4, angle: Math.atan2(-b.vy, -b.vx), life: 0.25, size: 2.5, color: C.bullet,
    });
    this.sound.play('hit');
    if (e.hp <= 0) this.killEnemy(e, j);
  }

  killEnemy(e, j) {
    this.enemies.splice(j, 1);
    const tank = e.kind === 'tank';
    const col = tank ? C.tank : C.chaser;
    // Layered explosion: a fast burst, a slow ember shower, and a white flash ring.
    this.fx.emit(e.x, e.y, { count: tank ? 50 : 26, speed: tank ? 380 : 300, life: 0.7, size: tank ? 5 : 3.5, color: col, glow: true });
    this.fx.emit(e.x, e.y, { count: 10, speed: 140, life: 0.3, size: 3, color: col, gravity: 60 });
    this.fx.emit(e.x, e.y, { count: 1, speed: 0, life: 0.25, size: tank ? 60 : 30, color: '#ffffff', shrink: false });
    this.shake.add(tank ? 0.55 : 0.2);
    this.hitStop = Math.max(this.hitStop, tank ? 0.07 : 0.03);
    this.sound.play('enemyDie');

    this.combo++;
    this.comboT = COMBO_TIME;
    const oldMult = this.mult;
    this.mult = Math.min(8, 1 + Math.floor(this.combo / 5));
    if (this.mult > oldMult) {
      this.popups.add(`x${this.mult}!`, e.x, e.y - 30, C.gem, 26);
      this.sound.play('pickup', { n: 20 });
    }

    const pts = e.points * this.mult;
    this.addScore(pts);
    this.popups.add(`+${pts}`, e.x, e.y - e.r - 6, col, tank ? 26 : 18);

    const gems = tank ? 8 : 2;
    for (let g = 0; g < gems; g++) {
      this.gems.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: rand(-220, 220), vy: rand(-220, 220), life: 10 });
    }
  }

  addScore(n) {
    this.score += n;
    // Tween the HUD number up and let it settle with an overshoot.
    this.scoreScale = 1.35;
    tween(this, { scoreScale: 1 }, 0.3, easeOutBack);
  }

  updateGems(dt) {
    const p = this.player;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.life -= dt;
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      // Magnet: gems within reach get pulled in, accelerating as they approach.
      if (d < 150) {
        g.vx += (dx / d) * 1600 * dt;
        g.vy += (dy / d) * 1600 * dt;
      }
      const sp = Math.hypot(g.vx, g.vy);
      if (sp > 800) { g.vx *= 800 / sp; g.vy *= 800 / sp; }
      g.vx *= Math.pow(0.4, dt);
      g.vy *= Math.pow(0.4, dt);
      g.x += g.vx * dt;
      g.y += g.vy * dt;

      if (d < 22) {
        this.gems.splice(i, 1);
        this.addScore(2 * this.mult);
        this.sound.play('pickup', { n: Math.min(this.combo, 20) });
        this.fx.emit(g.x, g.y, { count: 5, speed: 140, life: 0.3, size: 2.5, color: C.gem, glow: true });
      } else if (g.life <= 0) {
        this.gems.splice(i, 1);
      }
    }
  }

  collide(dt) {
    const p = this.player;
    if (p.dead) return;
    let consumed = false;
    for (const e of this.enemies) {
      if (p.iframes > 0) break;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + 12) {
        this.takeHit(e);
        if (e.kind === 'chaser') {
          e.consumed = true;
          consumed = true;
        }
      }
    }
    if (consumed) this.enemies = this.enemies.filter((e) => !e.consumed);
  }

  takeHit(e) {
    const p = this.player;
    p.hp -= 1;
    p.iframes = 1.1;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    p.vx = Math.cos(a) * 620;
    p.vy = Math.sin(a) * 620;
    this.shake.add(0.8);
    this.hitStop = Math.max(this.hitStop, 0.08);
    this.hurt = 0.35;
    tween(this, { hurt: 0 }, 0.45);
    this.fx.emit(p.x, p.y, { count: 30, speed: 340, life: 0.6, size: 4, color: C.chaser, glow: true });
    this.popups.add('-1', p.x, p.y - 26, C.chaser, 22);
    this.sound.play('hurt');
    if (p.hp <= 0) this.die();
  }

  updateCombo(dt) {
    if (this.combo === 0) return;
    this.comboT -= dt;
    if (this.comboT <= 0) {
      if (this.combo >= 5) this.popups.add('COMBO LOST', this.player.x, this.player.y - 34, C.dim, 16);
      this.combo = 0;
      this.mult = 1;
    }
  }

  die() {
    const p = this.player;
    p.dead = true;
    this.state = 'dying';
    this.dyingT = 0.9;
    this.hitStop = 0.12;
    this.shake.add(1);
    this.fx.emit(p.x, p.y, { count: 70, speed: 460, life: 1.0, size: 5, color: C.player, glow: true });
    this.fx.emit(p.x, p.y, { count: 40, speed: 300, life: 0.9, size: 4, color: C.chaser, glow: true });
    this.sound.play('hurt');
  }

  finish() {
    this.state = 'over';
    this.overT = 0;
    this.timeScale = 1;
    this.music.stop();
    this.sound.play('over');
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      setNumber(BEST_KEY, this.best);
    }
  }

  // ---------------------------------------------------------------- draw

  draw(ctx) {
    const { w, h } = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    this.shake.apply(ctx);
    this.drawGrid(ctx);
    if (this.state !== 'menu') this.drawWorld(ctx);
    this.fx.draw(ctx);
    this.popups.draw(ctx);
    ctx.restore();

    this.drawVignette(ctx);
    if (this.hurt > 0) {
      ctx.fillStyle = `rgba(255,61,127,${this.hurt * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.state === 'menu') {
      this.drawMenu(ctx);
    } else {
      this.drawHud(ctx);
      if (this.state === 'over') this.drawOver(ctx);
      if (this.paused) this.drawPaused(ctx);
    }
  }

  drawGrid(ctx) {
    const ox = (((-this.player.x * 0.12 - this.t * 12) % GRID) + GRID) % GRID;
    const oy = (((-this.player.y * 0.12) % GRID) + GRID) % GRID;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox - GRID; x < this.w + GRID; x += GRID) {
      ctx.moveTo(x, -GRID);
      ctx.lineTo(x, this.h + GRID);
    }
    for (let y = oy - GRID; y < this.h + GRID; y += GRID) {
      ctx.moveTo(-GRID, y);
      ctx.lineTo(this.w + GRID, y);
    }
    ctx.stroke();
  }

  drawWorld(ctx) {
    const p = this.player;
    ctx.globalCompositeOperation = 'lighter';

    for (const g of this.gems) {
      const pulse = 1 + Math.sin((this.t + g.x * 0.01) * 8) * 0.15;
      glow(ctx, g.x, g.y, 10 * pulse, C.gem, 0.25);
      ctx.fillStyle = C.gem;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - 5);
      ctx.lineTo(g.x + 4, g.y);
      ctx.lineTo(g.x, g.y + 5);
      ctx.lineTo(g.x - 4, g.y);
      ctx.fill();
    }

    // Warnings: a ring that shrinks onto the spawn point.
    for (const wn of this.warnings) {
      const k = wn.t / wn.delay;
      const r = lerp(60, 14, easeOutCubic(k));
      ctx.globalAlpha = 0.25 + 0.75 * k;
      ctx.strokeStyle = wn.kind === 'tank' ? C.tank : C.chaser;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wn.x, wn.y, r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const e of this.enemies) {
      const col = e.flash > 0 ? '#ffffff' : e.kind === 'tank' ? C.tank : C.chaser;
      glow(ctx, e.x, e.y, e.r * 2.2, col, 0.18);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.spin);
      ctx.fillStyle = col;
      ctx.beginPath();
      if (e.kind === 'tank') {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const px = Math.cos(a) * e.r;
          const py = Math.sin(a) * e.r;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      } else {
        ctx.moveTo(0, -e.r);
        ctx.lineTo(e.r * 0.8, 0);
        ctx.lineTo(0, e.r);
        ctx.lineTo(-e.r * 0.8, 0);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (e.kind === 'tank' && e.hp < e.maxHp) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 6, -Math.PI / 2, -Math.PI / 2 + (TAU * e.hp) / e.maxHp);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = C.bullet;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of this.bullets) {
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
    }
    ctx.stroke();
    for (const b of this.bullets) glow(ctx, b.x, b.y, 6, C.bullet, 0.3);

    // Player ship. Blinks while invulnerable so the player can read "I'm safe".
    const blink = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
    if (!p.dead && !blink) {
      glow(ctx, p.x, p.y, 30, C.player, 0.18);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = C.player;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-11, -10);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-11, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawVignette(ctx) {
    const { w, h } = this;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  drawHud(ctx) {
    const { w, h } = this;
    const p = this.player;

    ctx.save();
    ctx.translate(24, 46);
    ctx.scale(this.scoreScale, this.scoreScale);
    drawText(ctx, String(this.score).padStart(6, '0'), 0, 0, { size: 34, color: C.text, weight: '800' });
    ctx.restore();

    drawText(ctx, formatTime(this.time), w / 2, 40, { size: 18, color: C.dim, align: 'center' });
    drawText(ctx, `BEST ${this.best}`, w - 24, 40, { size: 16, color: C.dim, align: 'right' });

    // Multiplier and the combo timer bar underneath it.
    drawText(ctx, `x${this.mult}`, 24, 76, { size: 18, color: this.mult > 1 ? C.gem : C.dim });
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(24, 84, 140, 6);
    ctx.fillStyle = this.mult > 1 ? C.gem : C.dim;
    ctx.fillRect(24, 84, 140 * clamp(this.comboT / COMBO_TIME, 0, 1), 6);

    // Health pips.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < p.hp ? C.chaser : 'rgba(255,255,255,0.15)';
      ctx.fillRect(24 + i * 22, h - 34, 16, 10);
    }
    drawText(ctx, 'ESC pause', w - 24, h - 24, { size: 13, color: C.dim, align: 'right' });
  }

  drawMenu(ctx) {
    const { w, h, t } = this;
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = 'rgba(5,6,15,0.45)';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    const cols = [C.player, C.chaser, C.gem];
    for (let i = 0; i < 3; i++) {
      ctx.rotate(t * 0.25 * (i % 2 ? 1 : -1));
      ctx.strokeStyle = cols[i];
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 120 + i * 40, 50 + i * 18, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    const pulse = 1 + Math.sin(t * 2) * 0.02;
    ctx.save();
    ctx.translate(cx, cy - 20);
    ctx.scale(pulse, pulse);
    drawText(ctx, 'NEON DRIFT', 0, 0, {
      size: Math.min(96, w * 0.12), weight: '900', color: C.text, align: 'center', baseline: 'middle',
      shadow: 'rgba(125,249,255,0.7)',
    });
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
    drawText(ctx, 'Click or press ENTER to start', cx, cy + 60, { size: 20, color: C.dim, align: 'center', baseline: 'middle' });
    ctx.restore();

    drawText(ctx, 'WASD / ARROWS move   ·   MOUSE / SPACE fire   ·   ESC pause', cx, cy + 100, {
      size: 15, color: C.dim, align: 'center', baseline: 'middle', shadow: null,
    });
    if (this.best > 0) {
      drawText(ctx, `BEST ${this.best}`, cx, cy + 135, { size: 18, color: C.gem, align: 'center', baseline: 'middle' });
    }
  }

  drawOver(ctx) {
    const { w, h } = this;
    const k = clamp(this.overT / 0.4, 0, 1);
    ctx.fillStyle = `rgba(5,6,15,${0.6 * k})`;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.globalAlpha = k;
    drawText(ctx, 'GAME OVER', cx, cy - 50, { size: 64, weight: '900', color: C.chaser, align: 'center', baseline: 'middle' });
    drawText(ctx, String(this.score).padStart(6, '0'), cx, cy + 10, { size: 44, color: C.text, align: 'center', baseline: 'middle', weight: '800' });
    if (this.newBest) drawText(ctx, 'NEW BEST!', cx, cy + 58, { size: 22, color: C.gem, align: 'center', baseline: 'middle' });
    ctx.restore();
    if (this.overT > 0.7) {
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 4);
      drawText(ctx, 'ENTER / click to retry', cx, cy + 110, { size: 18, color: C.dim, align: 'center', baseline: 'middle' });
      ctx.restore();
    }
  }

  drawPaused(ctx) {
    const { w, h } = this;
    ctx.fillStyle = 'rgba(5,6,15,0.6)';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'PAUSED', w / 2, h / 2 - 10, { size: 56, weight: '900', color: C.text, align: 'center', baseline: 'middle' });
    drawText(ctx, 'ESC or P to resume', w / 2, h / 2 + 40, { size: 18, color: C.dim, align: 'center', baseline: 'middle' });
  }
}

function makeEnemy(kind, x, y, time) {
  const tank = kind === 'tank';
  return {
    kind, x, y, vx: 0, vy: 0,
    r: tank ? 26 : 13,
    hp: tank ? 4 : 1,
    maxHp: tank ? 4 : 1,
    speed: tank ? 70 : 130 + Math.random() * 40 + Math.min(20, time * 0.2),
    points: tank ? 30 : 10,
    flash: 0,
    spin: Math.random() * TAU,
    consumed: false,
  };
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

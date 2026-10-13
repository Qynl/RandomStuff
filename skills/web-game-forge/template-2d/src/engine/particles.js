// Particle system with a fixed object pool (no garbage collection spikes during play)
// and additive blending, which makes sparks and explosions glow.

import { TAU } from './math.js';

export class Particles {
  constructor(max = 2000) {
    this.pool = Array.from({ length: max }, () => ({
      alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1,
      size: 3, color: '#fff', drag: 0.9, g: 0, glow: false, shrink: true,
    }));
    this.cursor = 0;
  }

  _spawn() {
    const n = this.pool.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      if (!this.pool[idx].alive) {
        this.cursor = (idx + 1) % n;
        return this.pool[idx];
      }
    }
    return null; // pool full: silently drop, never allocate
  }

  // emit(x, y, { count, speed, spread, angle, life, size, color, drag, gravity, glow, shrink })
  emit(x, y, o = {}) {
    const count = o.count ?? 12;
    const speed = o.speed ?? 200;
    const spread = o.spread ?? TAU;
    const angle = o.angle ?? 0;
    for (let i = 0; i < count; i++) {
      const p = this._spawn();
      if (!p) return;
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.max = (o.life ?? 0.5) * (0.7 + Math.random() * 0.6);
      p.size = o.size ?? 3;
      p.color = o.color ?? '#fff';
      p.drag = o.drag ?? 0.9;
      p.g = o.gravity ?? 0;
      p.glow = !!o.glow;
      p.shrink = o.shrink ?? true;
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      // Drag expressed per 60Hz frame so it's consistent at any step size.
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.alive) continue;
      const k = p.life / p.max;
      const r = Math.max(0.5, p.shrink ? p.size * k : p.size);
      ctx.fillStyle = p.color;
      if (p.glow) {
        ctx.globalAlpha = k * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  clear() {
    for (const p of this.pool) p.alive = false;
  }
}

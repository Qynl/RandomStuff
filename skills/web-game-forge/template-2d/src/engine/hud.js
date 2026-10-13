// Text helpers and floating popups ("+50", "COMBO!") for HUD and feedback.

import { easeOutBack, easeOutCubic } from './math.js';

const POP_LIFE = 0.9;

export function drawText(ctx, str, x, y, {
  size = 20,
  color = '#fff',
  align = 'left',
  weight = '700',
  font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  shadow = 'rgba(0,0,0,0.55)',
  baseline = 'alphabetic',
} = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.shadowColor = shadow;
    ctx.shadowBlur = size * 0.4;
    ctx.shadowOffsetY = 2;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export class Popups {
  constructor() {
    this.items = [];
  }

  add(str, x, y, color = '#fff', size = 18) {
    if (this.items.length > 60) this.items.shift();
    this.items.push({ str, x, y, color, size, t: 0 });
  }

  // Iterate backwards and splice in place: no per-frame array allocation.
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.t += dt;
      if (p.t >= POP_LIFE) this.items.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.items) {
      const k = p.t / POP_LIFE;
      const pop = easeOutBack(Math.min(1, p.t / 0.12));   // quick overshoot "pop" on spawn
      const y = p.y - 36 * easeOutCubic(k);                 // float upwards
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(p.x, y);
      ctx.scale(pop, pop);
      drawText(ctx, p.str, 0, 0, { size: p.size, color: p.color, align: 'center', baseline: 'middle' });
      ctx.restore();
    }
  }
}

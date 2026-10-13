// Screen shake using the "trauma" model (Squirrel Eiserloh, GDC 2016).
// Shake strength is trauma squared, so small hits give a nudge and big hits rattle.
// Trauma decays linearly over time. Respects prefers-reduced-motion.

export class Shake {
  constructor({ maxOffset = 16 } = {}) {
    this.trauma = 0;
    this.maxOffset = maxOffset;
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.x = 0;
    this.y = 0;
  }

  add(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma * (this.reduced ? 0.25 : 1);
    this.x = this.maxOffset * s * (Math.random() * 2 - 1);
    this.y = this.maxOffset * s * (Math.random() * 2 - 1);
  }

  // Call between ctx.save() and ctx.restore() so only the world is shaken, not the HUD.
  apply(ctx) {
    ctx.translate(this.x, this.y);
  }
}

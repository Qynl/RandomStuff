// Trauma-based shake (Squirrel Eiserloh, GDC 2016). Works for any 3D offset:
// call update(dt) once per frame, then read `value` (0..1, already squared) and
// the random offsets `ox`, `oy`, `oz` scaled by your own max distances.

export class Trauma {
  constructor() {
    this.trauma = 0;
    this.value = 0;
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ox = 0;
    this.oy = 0;
    this.oz = 0;
  }

  add(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    this.value = this.trauma * this.trauma * (this.reduced ? 0.25 : 1);
    const r = () => Math.random() * 2 - 1;
    this.ox = r() * this.value;
    this.oy = r() * this.value;
    this.oz = r() * this.value;
  }
}

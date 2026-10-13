// Unified keyboard + mouse + touch input.
//
// Two kinds of queries:
//   isDown(...)      -> true while held
//   wasPressed(...)  -> true only on the tick the key went down (edge-triggered)
//
// The game must call `endTick()` once per fixed update so "pressed" events are
// consumed exactly once, no matter how many render frames happened in between.
// Pointer (mouse / touch / pen) presses are reported as the pseudo-key 'pointer'.

const PREVENT_DEFAULT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.justPressed = new Set();
    this.pointer = { x: 0, y: 0, down: false, active: false, type: 'mouse' };

    addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => {
      this.down.clear();
      this.pointer.down = false;
    });

    canvas.addEventListener('pointermove', (e) => this._updatePos(e));
    canvas.addEventListener('pointerdown', (e) => {
      this._updatePos(e);
      this.pointer.down = true;
      this.justPressed.add('pointer');
      canvas.setPointerCapture?.(e.pointerId);
    });
    addEventListener('pointerup', () => { this.pointer.down = false; });
    addEventListener('pointercancel', () => { this.pointer.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _updatePos(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
    this.pointer.type = e.pointerType || 'mouse';
    this.pointer.active = true;
  }

  isDown(...codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(...codes) {
    for (const c of codes) if (this.justPressed.has(c)) return true;
    return false;
  }

  // Normalised movement vector from WASD / arrow keys. Diagonals are not faster.
  axis() {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, moving: x !== 0 || y !== 0 };
  }

  // Call once at the end of each fixed update step.
  endTick() {
    this.justPressed.clear();
  }
}

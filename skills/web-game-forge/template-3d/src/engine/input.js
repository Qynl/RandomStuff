// Keyboard + mouse input with pointer-lock mouse-look.
//
//   isDown(code)      held
//   wasPressed(code)  pressed this tick (edge)
//   axis()            WASD normalised, { x, y, moving } (x: right, y: forward is negative)
//   mouse.dx/dy       look delta accumulated since the last endTick (only while locked)
//
// Mouse buttons are named 'Mouse0' (left), 'Mouse1' (middle), 'Mouse2' (right).

const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0 };
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('mousedown', (e) => {
      const k = `Mouse${e.button}`;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    addEventListener('mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.down.clear();
    });
  }

  requestLock() {
    this.canvas.requestPointerLock?.();
  }

  isDown(...codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  axis() {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, moving: x !== 0 || y !== 0 };
  }

  endTick() {
    this.pressed.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }
}

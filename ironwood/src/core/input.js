/**
 * IRONWOOD - input handling.
 * Mouse + keyboard with pointer lock, plus a touch layer that the on-screen
 * HUD sticks write into (so mobile works without extra plumbing).
 */

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlLeft'],
  prone: ['KeyZ'],
  sprint: ['ShiftLeft'],
  reload: ['KeyR'],
  use: ['KeyF'],
  melee: ['KeyV'],
  frag: ['KeyG'],
  flash: ['KeyQ'],
  swap: ['KeyE'],
  inspect: ['KeyI'],
  holdBreath: ['ShiftRight'],
  scoreboard: ['Tab'],
  chat: ['KeyY'],
};

const GAME_KEYS = new Set([
  'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ControlLeft', 'ShiftLeft', 'ShiftRight', 'KeyZ', 'KeyQ', 'KeyE',
]);

export class Input {
  constructor(opts = {}) {
    this.dom = opts.dom || window;
    this.sensitivity = opts.sensitivity ?? 0.0022;
    this.invertY = !!opts.invertY;
    this.bindings = { ...DEFAULT_BINDINGS, ...(opts.bindings || {}) };

    this.down = new Set();
    this.pressedCodes = new Set();
    this.releasedCodes = new Set();

    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mouseDown = new Set();
    this.mousePressed = new Set();
    this.mouseReleased = new Set();

    this.pointerLocked = false;
    this.enabled = true;
    this.wantLock = false;
    this.lockElement = opts.lockElement || null;
    this.onLockChange = opts.onLockChange || null;

    /** Touch state, written by HUD virtual sticks. */
    this.touch = {
      active: false,
      moveX: 0,
      moveY: 0,
      lookDX: 0,
      lookDY: 0,
      fire: false,
      ads: false,
      jump: false,
      crouch: false,
      reload: false,
      sprint: false,
    };

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onContextMenu = (e) => {
      if (this.pointerLocked || this.enabled) e.preventDefault();
    };
    this._onBlur = () => this.releaseAll();

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('contextmenu', this._onContextMenu);
  }

  /* -------------------- lifecycle -------------------- */

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('contextmenu', this._onContextMenu);
  }

  releaseAll() {
    this.down.clear();
    this.mouseDown.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touch.moveX = 0;
    this.touch.moveY = 0;
    this.touch.fire = false;
    this.touch.ads = false;
  }

  requestPointerLock(el = this.lockElement) {
    const target = el || document.body;
    this.wantLock = true;
    if (target.requestPointerLock) {
      const p = target.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => target.requestPointerLock());
    }
  }

  exitPointerLock() {
    this.wantLock = false;
    if (document.exitPointerLock) document.exitPointerLock();
  }

  _onLockChange() {
    this.pointerLocked = document.pointerLockElement === (this.lockElement || this.dom);
    if (!this.pointerLocked && this.wantLock && this.onLockChange) this.onLockChange(false);
    if (this.pointerLocked && this.onLockChange) this.onLockChange(true);
    this.releaseAll();
  }

  /* -------------------- listeners -------------------- */

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (!this.down.has(e.code)) this.pressedCodes.add(e.code);
    this.down.add(e.code);
  }

  _onKeyUp(e) {
    this.down.delete(e.code);
    this.releasedCodes.add(e.code);
  }

  _onMouseMove(e) {
    if (!this.enabled) return;
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX || 0;
    this.mouseDY += e.movementY || 0;
  }

  _onMouseDown(e) {
    if (!this.enabled) return;
    if (this.pointerLocked || e.target === (this.lockElement || this.dom)) {
      this.mouseDown.add(e.button);
      this.mousePressed.add(e.button);
    }
  }

  _onMouseUp(e) {
    this.mouseDown.delete(e.button);
    this.mouseReleased.add(e.button);
  }

  _onWheel(e) {
    if (!this.enabled || !this.pointerLocked) return;
    e.preventDefault();
    this.wheel += e.deltaY;
  }

  /* -------------------- queries -------------------- */

  isDown(action) {
    if (this.touch.active) {
      if (action === 'forward' && this.touch.moveY < -0.25) return true;
      if (action === 'back' && this.touch.moveY > 0.25) return true;
      if (action === 'left' && this.touch.moveX < -0.25) return true;
      if (action === 'right' && this.touch.moveX > 0.25) return true;
      if (action === 'jump' && this.touch.jump) return true;
      if (action === 'crouch' && this.touch.crouch) return true;
      if (action === 'reload' && this.touch.reload) return true;
      if (action === 'sprint' && this.touch.sprint) return true;
    }
    const codes = this.bindings[action];
    if (!codes) return false;
    if (typeof codes === 'string') return this.down.has(codes);
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(action) {
    const codes = this.bindings[action];
    if (!codes) return false;
    if (typeof codes === 'string') return this.pressedCodes.has(codes);
    for (const c of codes) if (this.pressedCodes.has(c)) return true;
    return false;
  }

  wasReleased(action) {
    const codes = this.bindings[action];
    if (!codes) return false;
    if (typeof codes === 'string') return this.releasedCodes.has(codes);
    for (const c of codes) if (this.releasedCodes.has(c)) return true;
    return false;
  }

  /** Mouse look delta in radians for this frame. */
  lookDelta() {
    let dx = this.mouseDX;
    let dy = this.mouseDY;
    if (this.touch.active) {
      dx += this.touch.lookDX;
      dy += this.touch.lookDY;
      this.touch.lookDX = 0;
      this.touch.lookDY = 0;
    }
    const s = this.sensitivity * (this.adsScale || 1);
    return { yaw: -dx * s, pitch: (this.invertY ? dy : -dy) * s };
  }

  fireDown() {
    return this.mouseDown.has(0) || this.touch.fire;
  }
  firePressed() {
    return this.mousePressed.has(0);
  }
  adsDown() {
    return this.mouseDown.has(2) || this.touch.ads;
  }
  meleePressed() {
    return this.mousePressed.has(1) || this.wasPressed('melee');
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
  }
}

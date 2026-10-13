# Engine API (template-2d/src/engine, 2D tier)

All modules are plain ES modules. Import them with relative paths.

## loop.js
```js
startLoop({ update(dt), render(alpha, frameDt), step = 1/120, maxFrame = 0.25 }) -> { stop() }
```
Fixed-timestep loop. `update` always receives `step` seconds. `render` runs once per animation frame. `maxFrame` clamps long gaps so the game doesn't "catch up" after a stall.

## input.js
```js
const input = new Input(canvas);
input.isDown('KeyW', 'ArrowUp')      // held
input.wasPressed('Space', 'pointer') // pressed this tick (edge)
input.axis()                         // { x, y, moving } normalised WASD/arrows
input.pointer                        // { x, y, down, active, type }
input.endTick()                      // call once per update step
```
Key names are `KeyboardEvent.code` values (for example `KeyW`, `Space`, `Enter`, `Escape`). The pseudo-key `'pointer'` is a mouse, touch, or pen press.

## audio.js
```js
const sound = new Sound();
sound.unlock();                  // call from a user gesture
sound.play('shoot' | 'hit' | 'enemyDie' | 'pickup' | 'hurt' | 'warp' | 'ui' | 'start' | 'over', { n })
sound.tone({ freq, to, dur, type, vol, attack, at })   // low-level synth tone
sound.noise({ dur, vol, at, filter, filterTo })         // low-level noise burst
sound.setMuted(true)

const music = new Music(sound);  // look-ahead sequencer, placeholder track
music.start(); music.stop();
```
Add new named sounds by adding an entry to the `SFX` object in `audio.js`. Pass `{ n }` to use a value like a combo count (the pickup preset uses it for pitch).

## particles.js
```js
const fx = new Particles(2000);  // fixed pool
fx.emit(x, y, { count, speed, spread, angle, life, size, color, drag, gravity, glow, shrink });
fx.update(dt); fx.draw(ctx); fx.clear();
```
`spread` is the full cone in radians (default a full circle). `angle` is the centre direction. Pass `shrink: false` for a flat flash ring of a fixed size.

## camera.js
```js
const shake = new Shake({ maxOffset: 16 });
shake.add(0.5);          // trauma 0..1
shake.update(dt);        // real dt, not the game time scale
ctx.save(); shake.apply(ctx); /* draw world */ ctx.restore();
```

## tween.js
```js
tween(obj, { prop: target }, seconds, easeFn = easeOutCubic, onDone?)
updateTweens(dt);        // call once per frame from main.js
cancelTweens(obj);
```
Tweens start from the property's current value when created.

## math.js
`clamp`, `lerp`, `damp(a, b, rate, dt)` (frame-rate independent smoothing), `angleDiff`, `rand(a, b)`, `pick(arr)`, `TAU`, easings (`easeOutCubic`, `easeInCubic`, `easeInOutQuad`, `easeOutBack`, `easeOutElastic`), and `createRng(seed)` for deterministic randomness.

## hud.js
```js
drawText(ctx, str, x, y, { size, color, align, weight, font, shadow, baseline })
const popups = new Popups();
popups.add('+50', x, y, color, size);  popups.update(dt);  popups.draw(ctx);
```

## storage.js
`getNumber(key, fallback)` and `setNumber(key, value)`. Both are safe when storage is unavailable.

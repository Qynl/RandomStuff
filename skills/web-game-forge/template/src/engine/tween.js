// Minimal tweening. `tween(obj, { prop: target }, seconds, easeFn, onDone)` animates
// numeric properties. Tweens run in real time, so they keep animating during hit-stop
// and slow motion unless you choose otherwise.

import { easeOutCubic } from './math.js';

const active = new Set();

export function tween(target, props, duration, ease = easeOutCubic, onDone = null) {
  const from = {};
  for (const k in props) from[k] = target[k];
  const t = { target, from, to: props, duration: Math.max(1e-4, duration), ease, time: 0, onDone };
  active.add(t);
  return t;
}

export function updateTweens(dt) {
  for (const t of active) {
    t.time += dt;
    const k = Math.min(1, t.time / t.duration);
    const e = t.ease(k);
    for (const key in t.to) t.target[key] = t.from[key] + (t.to[key] - t.from[key]) * e;
    if (k >= 1) {
      active.delete(t);
      if (t.onDone) t.onDone();
    }
  }
}

export function cancelTweens(target) {
  for (const t of active) if (t.target === target) active.delete(t);
}

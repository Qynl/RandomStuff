// Entry point: wires the engine together and starts the game loop.
// Keep this file boring. Game logic belongs in src/game/.

import { startLoop } from './engine/loop.js';
import { Input } from './engine/input.js';
import { Sound, Music } from './engine/audio.js';
import { updateTweens } from './engine/tween.js';
import { NeonDrift } from './game/neon-drift.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const input = new Input(canvas);
const sound = new Sound();
const music = new Music(sound);
const game = new NeonDrift({ input, sound, music, width: innerWidth, height: innerHeight });

// Crisp rendering on high-DPI screens. Drawing code always works in CSS pixels.
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.resize(w, h);
}
addEventListener('resize', resize);
resize();

// Browsers block audio until the first user gesture.
const unlock = () => sound.unlock();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// Never let the player die to a tab switch.
document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
addEventListener('blur', () => game.pause());

startLoop({
  step: 1 / 120,
  update: (dt) => {
    updateTweens(dt);
    game.update(dt);
  },
  render: () => game.draw(ctx),
});

// Read-only state hook: handy for automated playtests and for poking at the game
// from the devtools console.
window.__neonDrift = () => ({
  state: game.state,
  score: game.score,
  hp: game.player.hp,
  paused: game.paused,
  combo: game.combo,
  mult: game.mult,
  enemies: game.enemies.length,
  time: Number(game.time.toFixed(2)),
});

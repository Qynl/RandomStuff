// Entry point: sets up renderer, scene, post-processing, the game, and the loop.
// Keep this file boring. Game rules belong in src/game/.

import * as THREE from 'three';
import { startLoop } from './engine/loop.js';
import { Input } from './engine/input.js';
import { Sound, Music } from './engine/audio.js';
import { updateTweens } from './engine/tween.js';
import { Sparks } from './engine/fx.js';
import { createRenderer, createPipeline, makeSky } from './engine/render.js';
import { Game } from './game/game.js';
import { UI } from './game/ui.js';
import { CAMERA } from './game/config.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x2a221e, 0.016);
makeSky(scene, { top: 0x070b1c, horizon: 0x3a2d28 });

const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.1, 400);
const { composer, bloom } = createPipeline(renderer, scene, camera);

const input = new Input(canvas);
const sound = new Sound();
const music = new Music(sound);
const sparks = new Sparks(scene, 3000);
const ui = new UI(camera);
const game = new Game({ scene, camera, input, sound, music, sparks, ui });

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  sparks.setViewport(h * renderer.getPixelRatio(), camera.fov);
}
addEventListener('resize', resize);
resize();

// Audio can only start after a user gesture.
addEventListener('pointerdown', () => sound.unlock());
addEventListener('keydown', () => sound.unlock());

// ----- Menus and pause -----
const $ = (id) => document.getElementById(id);
function begin() {
  sound.unlock();
  game.start();
  ui.overlay(null);
  input.requestLock();
}
$('start').addEventListener('click', begin);
$('retry-dead').addEventListener('click', begin);
$('retry-won').addEventListener('click', begin);
$('resume').addEventListener('click', () => input.requestLock());

// Pointer lock is released by the Escape key, so exiting lock acts as pause.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    game.resume();
  } else if (game.state === 'play') {
    game.pause();
  }
});

addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && (game.state === 'dead' || game.state === 'won')) begin();
  if (e.code === 'Escape' && game.state === 'play') {
    document.exitPointerLock?.();
    game.pause();
  }
});

addEventListener('blur', () => { if (game.state === 'play') game.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.pause(); });

// ----- Loop -----
startLoop({
  step: 1 / 120,
  update: (dt) => {
    updateTweens(dt);
    game.update(dt);
    input.endTick();
  },
  render: () => composer.render(),
});

// Read-only hook for automated playtests and the devtools console.
window.__warden = () => game.debug();

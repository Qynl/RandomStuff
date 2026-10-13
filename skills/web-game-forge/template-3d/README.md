# {{TITLE}}

A 3D action game (WebGL via Three.js) built on the web-game-forge engine template.
Procedural art and sound, so there are no asset downloads.

## Run it

Dependencies are installed by the scaffolder (`npm install`). ES modules need a real server:

    python3 -m http.server 8080 --bind 0.0.0.0

Then open http://localhost:8080 and click **Enter the courtyard**.

## Layout

- `src/main.js`: renderer, post-processing, loop, menus, pointer lock
- `src/engine/`: reusable systems (fixed-step loop, input, audio, GPU sparks, bloom pipeline, shake, tweens)
- `src/game/config.js`: every tuning number (player, combo, enemies, boss, waves, camera)
- `src/game/rig.js`: humanoid rig plus the animation system (holds, keyframed clips, blending)
- `src/game/player.js`, `enemy.js`, `boss.js`: character and AI state machines
- `src/game/arena.js`, `camera.js`, `telegraph.js`, `game.js`, `ui.js`

## Controls

- Move: WASD. Look: mouse (pointer lock). Sprint: Shift (hold)
- Strike: left mouse (3-hit combo, the third is a spin). Guard: right mouse (hold)
- Dodge: Space (invulnerable at the start of the roll). Pause: Esc

## Debugging

`window.__warden()` returns a read-only snapshot of the game state.

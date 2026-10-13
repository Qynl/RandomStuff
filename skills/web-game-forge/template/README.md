# {{TITLE}}

A browser game built on the web-game-forge engine template. No build step, no dependencies.

## Run it

ES modules need a real server (opening `index.html` directly from disk will not load them):

    python3 -m http.server 8080 --bind 0.0.0.0

Then open http://localhost:8080.

## Layout

- `src/main.js` - bootstraps the engine and starts the loop
- `src/engine/` - reusable: fixed-step loop, input, audio, particles, shake, tweens, HUD
- `src/game/` - the game itself (state, rules, drawing)

## Controls (default)

- Move: WASD / arrow keys (touch: drag)
- Fire: hold Space or mouse button (touch: hold)
- Pause: Esc or P

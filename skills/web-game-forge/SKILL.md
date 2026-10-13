---
name: web-game-forge
description: Build polished, high-feel browser games (Canvas 2D, Web Audio, no build step) from a short prompt. Use when the user asks for a game that runs in a browser, wants it to feel "AAA", "juicy", or "addictive", or wants a playable prototype fast. Starts from a tested engine template with fixed-step loop, input, procedural audio, particles, screen shake, tweens, HUD popups, and a complete sample game.
---

# Web Game Forge

Make browser games that feel good to play. Game feel comes from many small details, not one big feature, so this skill ships a working engine with those details already in it, plus a checklist to tune them.

Be honest with the user about scope. A skill can't make a game "AAA" alone. The skill gets you a fast, polished vertical slice with the feel techniques built in. Real quality comes from playtesting and tuning the numbers, which you should do.

## When to use

- The user wants a game for the browser (arcade, shooter, platformer, puzzle, idle, runner, etc.).
- The user asks for something "polished", "juicy", "AAA", "addictive", or "like a real game".
- The user wants a quick playable prototype to iterate on.

If the request is a 3D open world or a large multiplayer game, say what's realistic in a browser first (see "Scope" below), then build the best slice you can.

## Workflow

1. **Pick the concept fast.** Don't ask a long questionnaire. Decide the core verb (shoot, dodge, collect, jump, stack), the one-sentence hook, the win/lose loop, and the controls. Briefly state your choices, then build. Ask only if the genre or platform is truly unclear.
2. **Scaffold from the template.**
   ```
   node skills/web-game-forge/scripts/scaffold.mjs <game-dir> "Game Title"
   ```
   This copies `template/` (a complete, playable engine plus sample game). Reuse the engine, and replace `src/game/` with the new game. Keep the engine's shape; the sample game shows the patterns.
3. **Build the vertical slice first.** Get the core loop playable: input, one enemy or obstacle type, scoring, death, restart. Run it before adding anything else. A fun 60-second loop beats ten half-built features.
4. **Add juice in one pass** (see `references/quality-bar.md`). For every player action and every outcome, add visual feedback (particles, shake, flash, pop-up), audio, and a short hit-stop where it matters.
5. **Tune the feel numbers.** Speed, acceleration, drag, spawn rate, and durations decide how a game feels. Change them deliberately, one at a time, and re-test.
6. **Verify before you hand it back.**
   - `node skills/web-game-forge/scripts/check.mjs <game-dir>` must pass (imports resolve, syntax is valid, no template tokens left).
   - Serve it (`cd <game-dir> && python3 -m http.server 8080 --bind 0.0.0.0`) and load it in a real browser if you can. If you have Playwright or another headless browser, drive it: press Enter, hold keys, take screenshots, and read state through `window.__<game>()` (see the hook pattern below). Check the console for errors.
   - Look at at least one screenshot and sanity-check readability: can you tell the player, enemies, pickups, and HUD apart at a glance?
7. **Deliver clearly.** Tell the user how to run it, the controls, what's in it, and what you'd tune next. Point out any limits you didn't get to test (for example, audio on a real device, or touch on a phone).

## Engine rules (non-negotiable)

These are what separate a game that feels good from one that feels off:

- **Fixed timestep.** Simulate in constant steps (`startLoop` in `engine/loop.js`). Never move things by a raw frame delta. Use `damp()` for smoothing, not `a += (b-a)*0.1`.
- **Input is edge-triggered where it should be.** Use `wasPressed()` for actions (jump, menu select, fire-once). Use `isDown()` for held controls. Call `input.endTick()` once per simulation step.
- **Every action gets feedback.** Visual + sound + (where it matters) shake/hit-stop. A shot with no sparks or sound feels dead.
- **Telegraph danger.** Enemies and hazards should warn before they hurt (the warning ring in the sample). Unavoidable damage feels unfair and hurts retention.
- **Invulnerability frames after damage.** Blink the player and give 1 to 1.5 seconds. Without them, one hit can chain into death.
- **Never allocate in the hot loop.** Pool particles (`engine/particles.js` does this). Avoid creating arrays, closures, or objects per frame in update/draw. Remove items by splicing backwards or swap-removing, not by filtering into a new array every frame.
- **Glow is cheap only when faked.** Use additive blending (`globalCompositeOperation = 'lighter'`) with a translucent disc. Don't put `shadowBlur` on hundreds of objects.
- **Crisp on every screen.** Size the canvas by devicePixelRatio (capped at 2) and draw in CSS pixels. `main.js` already does this.
- **Responsive and touch-aware.** Resize on window resize. Make the game playable with touch (drag to move, hold to fire, or equivalent) and set `touch-action: none` on the canvas.
- **Pause on blur and hidden tab.** Never let the player die while the tab is in the background.
- **Fast restart.** Game over to playing again in one or two inputs, with a short lockout so people don't skip the screen by accident.
- **Audio after a gesture.** Unlock `AudioContext` on the first input (`main.js` does this). Keep sound procedural so the game has no asset downloads.
- **Persist the score that matters.** High score in `localStorage`, guarded with try/catch (`engine/storage.js`).
- **Respect reduced motion.** `engine/camera.js` tones shake down when the user prefers reduced motion.

## Scope: what the browser can do well

Good targets: 2D arcade shooters, dodgers, runners, platformers, puzzle games, idle or clicker games, card games, tower defense, small top-down adventures. With WebGL (Three.js) you can do small 3D games too. Don't build a large open-world or competitive online game in one pass without asking. Say so and propose a slice.

Use Canvas 2D by default. It's simpler, fast enough for thousands of sprites, and needs no build or CDN. Only switch to WebGL/Three.js when the game needs real 3D. If you do, load it from npm into a local `vendor/` folder rather than a CDN, so it works offline and in the preview.

## Structure of a generated game

```
<game>/
  index.html            canvas + module entry
  package.json          "type": "module", start script
  README.md             how to run, controls
  src/
    main.js             wires engine + game, debug hook
    engine/             reusable: loop, input, audio, particles, camera, tween, math, hud, storage
    game/               the game: state, rules, update, draw
```

Keep `engine/` generic. Put anything specific to this game (enemy types, tuning constants, colors) in `game/`. Put numbers that affect feel in named constants at the top of the file so they're easy to tune.

## Debug and test hook

Expose a small read-only state function on `window` (the sample exposes `window.__neonDrift()`). It lets you (and automated tests) check that the game reached a state, without scraping pixels. Keep it read-only, and keep it tiny.

## Reference

- `references/quality-bar.md`: the checklist and the feel numbers to start from. Read this before you tune.
- `references/engine-api.md`: the engine modules and how to use them.

---
name: web-game-forge
description: Build polished browser games, in 3D (WebGL/Three.js, the default) or 2D (Canvas), from a short prompt. Use when the user asks for a game that runs in a browser, wants it to feel "AAA", "juicy", or "addictive", or wants a playable prototype fast. Starts from tested engine templates with a fixed-step loop, input, procedural audio, GPU particles, camera shake, a rigged character with combat and enemy AI (3D), and a complete sample game.
---

# Web Game Forge

Make browser games that feel good to play. Game feel comes from many small details, not one big feature, so this skill ships a working engine with those details already in it, plus a checklist to tune them.

Be honest with the user about scope. A skill can't make a game "AAA" alone. The skill gets you a fast, polished vertical slice with the feel techniques built in. Real quality comes from playtesting and tuning the numbers, which you should do.

## When to use

- The user wants a game for the browser (arcade, shooter, platformer, puzzle, idle, runner, etc.).
- The user asks for something "polished", "juicy", "AAA", "addictive", or "like a real game".
- The user wants a quick playable prototype to iterate on.

If the request is a 3D open world or a large multiplayer game, say what's realistic in a browser first (see "Scope" below), then build the best slice you can.

## Choose a tier

- **3D (default, `--3d`)**: a WebGL/Three.js game with bloom, shadows, a rigged character, combat, enemy AI, and a boss. Use it for anything that should look like a modern game. Read `references/3d-tier.md` first.
- **2D (`--2d`)**: a Canvas arcade game with no dependencies. Use it for quick arcade prototypes or when the user asks for 2D.

Be honest about the ceiling. The 3D tier gets you a polished, stylised action game built from primitives. It isn't a studio-quality AAA game, which needs large art, animation and audio budgets. Say so, and say what the next upgrade is (real character models, physics, and playtesting).

## Workflow

1. **Pick the concept fast.** Don't ask a long questionnaire. Decide the core verb, the one-sentence hook, the win/lose loop, and the controls. Briefly state your choices, then build. Ask only if the genre or platform is truly unclear.
2. **Scaffold from the template.**
   ```
   node skills/web-game-forge/scripts/scaffold.mjs <game-dir> "Game Title"          # 3D, installs three
   node skills/web-game-forge/scripts/scaffold.mjs <game-dir> "Game Title" --2d     # 2D, no deps
   ```
   This copies `template-3d/` or `template-2d/`, a complete playable engine plus sample game. Reuse the engine, and replace the contents of `src/game/` for the new game. `src/game/config.js` (3D) holds every tuning number.
3. **Build the vertical slice first.** Get the core loop playable: input, one enemy or obstacle type, scoring, death, restart. Run it before adding anything else. A fun 60-second loop beats ten half-built features.
4. **Add juice in one pass** (see `references/quality-bar.md`). For every player action and every outcome, add visual feedback (particles, shake, flash, pop-up), audio, and a short hit-stop where it matters.
5. **Tune the feel numbers.** Speed, acceleration, drag, spawn rate, and durations decide how a game feels. Change them deliberately, one at a time, and re-test.
6. **Verify before you hand it back.**
   - `node skills/web-game-forge/scripts/check.mjs <game-dir>` must pass (imports resolve, bare packages are installed, syntax is valid, no template tokens left).
   - Serve it (`cd <game-dir> && python3 -m http.server 8080 --bind 0.0.0.0`) and load it in a real browser if you can. If you have Playwright or another headless browser, drive it: click through the menu, play for a while, take screenshots, and read state through `window.__<game>()` (see the hook pattern below). Check the console for errors. For 3D, confirm WebGL2 is available, and look at screenshots for camera and lighting problems.
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
- **Responsive and touch-aware.** Resize on window resize. The 2D template supports touch (drag to move, hold to fire). The 3D template is keyboard and mouse only, so say so if the user needs phones.
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
  index.html            canvas, HUD and menu markup, import map (3D)
  package.json          "type": "module", start script, three (3D)
  README.md             how to run, controls
  src/
    main.js             wires engine + game, debug hook
    engine/             reusable: loop, input, audio, particles/sparks, render, shake, tween, math
    game/               the game: config, rig, player, enemy, boss, arena, camera, ui
```

Keep `engine/` generic. Put anything specific to this game (enemy types, tuning constants, colors) in `game/`. Put numbers that affect feel in `config.js` (3D) or named constants at the top of the file (2D) so they're easy to tune.

## Debug and test hook

Expose a small read-only state function on `window` (the sample exposes `window.__neonDrift()`). It lets you (and automated tests) check that the game reached a state, without scraping pixels. Keep it read-only, and keep it tiny.

## Reference

- `references/quality-bar.md`: the checklist and the feel numbers to start from. Read this before you tune.
- `references/engine-api.md`: the engine modules and how to use them (2D template).
- `references/3d-tier.md`: how the 3D tier works, its rules, and its honest limits.

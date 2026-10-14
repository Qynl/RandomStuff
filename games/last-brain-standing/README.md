# LAST BRAIN STANDING

A small, fast top-down arena combat game built around one idea: opponents should feel different because they make different decisions, not just because they have different colors.

## Current foundation

- React + TypeScript + Vite application.
- Responsive Canvas arena with a restrained neon/industrial visual identity.
- Keyboard movement, mouse aiming, click/Space firing, Shift dash, Esc pause, and R restart.
- Three readable bot profiles:
  - **The Hunter** pressures directly and leads moving targets.
  - **The Flanker** controls angles and circles around the player.
  - **The Mirror** watches recent movement and counters repeated directional habits.
- Health, dash cooldown, eliminations, threat waves, local best score, combat feed, hit flashes, particles, and screen shake.
- Deterministic, separately testable AI decision helpers.
- No backend, account, external asset, or runtime service required. Google Fonts are optional; the game falls back to system fonts.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To verify the code:

```bash
npm test
npm run build
```

## Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Move |
| Mouse | Aim |
| Left click / Space | Fire |
| Shift | Dash with brief invulnerability |
| Esc | Pause / resume |
| R | Restart |

## Architecture

- `src/App.tsx`: React UI shell and canvas engine lifecycle.
- `src/arena.ts`: world bounds, obstacles, collision helpers.
- `src/ai.ts`: bot profiles and movement / firing decisions.
- `src/game.ts`: simulation, input, combat, rendering, effects, and existing HUD DOM updates.
- `src/types.ts`: shared game data contracts.
- `src/main.tsx`: React browser entry point.
- `tests/ai.test.ts`: regression suite for AI decision primitives.
- `tests/arena.test.ts`: regression suite for arena geometry and swept projectile hit checks.
- `NEXT_AI_TASK.md`: mandatory handoff and next implementation task.

## Known limitations

- The layout adapts to narrow screens, but full touch controls (movement stick, aim/fire, dash) are not implemented yet. Desktop keyboard + mouse remains the supported control scheme.
- The React lifecycle cleanup and swept projectile collision changes are on this branch; verify them with the test/build commands above before treating them as validated.

## Quality rule

Do not add a new bot, weapon, or mode until the current combat loop feels good. For every gameplay change: define expected behavior, implement the smallest change, run tests and build, play it in the browser, then keep or revert the change based on actual feel. Never claim a test or playtest was run unless it really was.

# NEXT AI TASK: Make Last Brain Standing feel exceptional

You are continuing an existing browser game, not starting a new generic template.

## Read first
1. Read this file fully.
2. Read `README.md`, then inspect `src/game.ts`, `src/ai.ts`, `src/arena.ts`, `src/types.ts`, `src/App.tsx`, `src/style.css`, and `tests/ai.test.ts`.
3. Work only on branch `game/last-brain-standing`. Do not change or merge into `main`.

## Game identity
**Last Brain Standing** is a tight top-down arena combat game. The core hook is that three opponents make meaningfully different decisions:
- **Hunter:** applies direct pressure and leads moving targets.
- **Flanker:** circles and tries to create attack angles.
- **Mirror:** observes recent player movement and punishes repetitive habits.

The goal is to make a small game feel polished, readable, fair, responsive, and replayable. Do not inflate scope with shops, inventories, online multiplayer, accounts, huge maps, or filler progression.

## Stack and boundaries
- React + TypeScript + Vite.
- Existing combat simulation/rendering stays in the Canvas engine in `src/game.ts`; React owns the surrounding interface and app lifecycle.
- Keep the simulation independent from React rendering. Do not call React state updates every animation frame.
- Keep AI decision helpers pure and testable in `src/ai.ts`.
- No backend and no mandatory external assets/services. Preserve graceful font fallbacks.
- Keep the existing dark industrial/neon art direction unless a deliberate, cohesive improvement is justified.

## Your first milestone
Do **not** add new game modes or lots of content. First make the current combat loop demonstrably better:
1. Run `npm install`, `npm test`, and `npm run build`. Fix real failures before adding features.
2. Inspect the code and identify the three highest-impact gameplay problems. Do not guess: trace the implementation and, if browser tooling is available, play a run.
3. Improve one problem at a time. Prioritize responsive controls, fair readable damage, satisfying hit feedback, sensible enemy pressure, and a Mirror that adapts noticeably but not magically.
4. Add/adjust deterministic unit tests for each AI or gameplay rule that can be tested without a browser.
5. Verify desktop and narrow-screen layouts; make sure the arena and controls remain usable.
6. If browser automation is available, launch the game and test start, movement, aim/fire, dash, pause/resume, death/restart, and console errors. If it is not available, say so clearly instead of claiming browser playtesting happened.

## Required workflow for every change
1. State the player-facing problem and the expected observable behavior.
2. Make the smallest coherent change.
3. Add or update a regression test.
4. Run `npm test` and `npm run build`.
5. Playtest the changed behavior if browser tooling is available.
6. Review the diff for accidental scope creep, unused code, unfair AI, accessibility issues, and performance regressions.
7. Commit a focused change with a clear message. Keep work on this branch.

## Quality bar
- No fake polish: don't claim tests, builds, screenshots, or playtests passed unless you actually ran them.
- No giant rewrites just to make the code look different.
- Avoid magic omniscient enemies. Bots must obey line-of-sight, cooldown, range, and readable telegraphs where relevant.
- Controls should feel immediate. Avoid input lag, surprise movement, and unavoidable damage.
- Keep the UI coherent, responsive, legible, and keyboard-accessible.
- Prefer fewer excellent mechanics over many shallow ones.
- Do not ask the user to choose among obvious implementation details. Make sound engineering decisions and report trade-offs.
- Finish by reporting files changed, commands actually run and their outcomes, remaining issues, and the exact next best step.

## Immediate task
Start by verifying this React/Vite conversion, then do a short code audit of the existing combat loop and propose/implement only the single highest-impact, testable improvement. Do not implement a second feature until the first passes its tests and build.

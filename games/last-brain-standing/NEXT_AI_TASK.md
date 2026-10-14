# NEXT AI TASK: Make Last Brain Standing feel exceptional

You are continuing an existing browser game, not starting a new generic template.

## Read first
1. Read this file fully.
2. Read `README.md`, then inspect `src/sim.ts`, `src/game.ts`, `src/ai.ts`, `src/arena.ts`, `src/types.ts`, `src/App.tsx`, `src/style.css`, and the `tests/` folder.
3. Work on the branch you were given for the session. Never commit directly to `main` and never merge into it.

## Game identity
**Last Brain Standing** is a tight top-down arena combat game. The core hook is that three opponents make meaningfully different decisions:
- **Hunter:** applies direct pressure and leads moving targets.
- **Flanker:** circles and tries to create attack angles.
- **Mirror:** observes recent player movement and punishes repetitive habits.

The goal is to make a small game feel polished, readable, fair, responsive, and replayable. Do not inflate scope with shops, inventories, online multiplayer, accounts, huge maps, or filler progression.

## Stack and boundaries
- React + TypeScript + Vite. Tests run on vitest (node by default, jsdom for the runtime and shell tests).
- The deterministic simulation lives in `src/sim.ts` and is pure: no DOM, no timers, no `Math.random`. `src/game.ts` is the presentation shell (loop, input, canvas, audio, HUD snapshots) and `src/App.tsx` is the React UI.
- Keep AI decision helpers pure and testable in `src/ai.ts`.
- No backend and no mandatory external assets/services. Preserve graceful font fallbacks.
- Keep the existing dark industrial/neon art direction unless a deliberate, cohesive improvement is justified.

## Milestones already done
1. Simulation split from the renderer, seeded RNG, telegraphed combat with cancelled wind-ups, fairness rules (no untelegraphed shots, no shots through walls, no spawns on top of the player, no unexplained damage), body-check knockback, aim assist, and touch controls.
2. A balance sweep (`tests/balance.test.ts`) with a scripted autoplay policy, runtime and React-shell test suites (jsdom harness in `tests/helpers/fake-dom.ts`), an adversarial input sweep (`tests/fuzz.test.ts`), and a fake-WebAudio suite for the sound engine. `npm test` currently runs 266 tests; `npm run coverage` reports 97% of statements / 89% of branches over `src/`.
3. Replayable, shareable runs: seeds are canonicalised to six hex characters, so the seed label the HUD shows restores the exact fight; run codes (`#seed=1A2B3C&level=veteran`) are written to the URL and can be copied from the result screen.

## Quality bar
- No fake polish: don't claim tests, builds, screenshots, or playtests passed unless you actually ran them. There is no browser automation in this environment - say so instead of implying a playtest.
- No giant rewrites just to make the code look different.
- Avoid magic omniscient enemies. Bots must obey line-of-sight, cooldown, range, and readable telegraphs where relevant.
- Controls should feel immediate. Avoid input lag, surprise movement, and unavoidable damage.
- Keep the UI coherent, responsive, legible, and keyboard-accessible.
- Prefer fewer excellent mechanics over many shallow ones.
- Do not ask the user to choose among obvious implementation details. Make sound engineering decisions and report trade-offs.

## Required workflow for every change
1. State the player-facing problem and the expected observable behavior.
2. Make the smallest coherent change.
3. Add or update a regression test.
4. Run `npm test` and `npm run build` (CI runs the same two commands, but only for pushes to `game/last-brain-standing`, so run them locally).
5. Playtest the changed behavior if browser tooling is available; otherwise verify with the autoplay policy and the jsdom harness.
6. Review the diff for accidental scope creep, unused code, unfair AI, accessibility issues, and performance regressions.
7. Commit a focused change with a clear message.

## Where to go next
Pick one, verify it with measurements, and keep the diff focused:
1. **Accessibility and readability pass.** Live-region wording, focus order, contrast, the telegraph legend and `aria-keyshortcuts` are in place; the open item is auditing colour contrast against WCAG AA for the denser panel text (the muted greys around `#5f7492` on `#0e1420` are the likely failures).
2. **Balance with more samples.** The 12-seed sweep in `tests/balance.test.ts` is a smoke test, not proof: standard sits near a 50% win rate for the scripted policy. Widen the sample before changing any tuning constant, and never weaken the policy or the win band to make a number look better.
3. **Deeper Mirror counterplay.** The Mirror now publishes its read and the HUD turns it into advice; the open question is whether the read should decay faster or be visible in the arena itself, not just in the panel.
4. **Touch polish.** Verify the virtual stick, FIRE and DASH on a narrow viewport, including cancellation paths and safe-area insets.
5. **Performance.** The simulation runs at 0.001-0.003 ms per step in tests; keep an eye on render cost as effects grow, and keep the offscreen background cache.
6. **Arena variety is done, not finished.** Four hand-placed layouts (`ARENA_LAYOUTS` in `src/arena.ts`) are picked by seed, carried on the world as `world.obstacles`/`world.arenaName`, and each carries an `openness` value that hostiles scale their preferred ring by (`rangeScaleForOpenness`). If you add or resize blocks, keep the guarantees in `tests/layout.test.ts` (in bounds, non-overlapping, start free, no sealed pockets, block-wide cover) and re-run the balance sweep - the envelope table in the README is regenerated by hand from that run.
7. **Invariant fuzzing.** `tests/fuzz.test.ts` feeds deliberately awkward input and checks the world stays sane; extend it whenever a new system is added (new projectile types, status effects, pickups) so the net keeps up with the game.

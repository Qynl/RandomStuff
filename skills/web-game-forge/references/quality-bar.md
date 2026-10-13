# Quality bar: what makes a browser game feel good

Work through this list after the core loop is playable. Each item is cheap on its own. Together they are most of what separates "a demo" from "a game people replay".

## 1. Core loop first

- [ ] One verb the player does constantly, and it's satisfying by itself.
- [ ] A clear risk/reward decision every few seconds.
- [ ] Death or failure takes under 2 seconds to see and restart from.
- [ ] A reason to play "one more time": a score to beat, a streak, an unlock, or a new thing to see.

## 2. Responsiveness (input to screen)

- [ ] Input reacts within the same frame. No menus or animations block play.
- [ ] Movement has acceleration and deceleration, not instant snap or endless slide. Starting values: accel 2000 to 3000 px/s², drag 2 to 3 while input is held, 8 to 10 when released.
- [ ] Fire/attack has a short cooldown (0.08 to 0.2 s) and a small recoil or kick.
- [ ] Turning and aiming are smooth (rotate toward the target, don't snap), unless the game is meant to be snappy.

## 3. Game feel ("juice")

Use each of these where it fits. Don't stack every one on every event, or the screen gets noisy.

| Technique | Starting values | Use for |
|---|---|---|
| Screen shake (trauma model) | add 0.2 for a small hit, 0.5 to 0.8 for a big hit, 1.0 for death; max offset 10 to 16 px; decay 1.4/s | hits, explosions, landings |
| Hit-stop (freeze frames) | 30 to 50 ms for normal hits, 70 to 100 ms for big hits or player damage | impacts, kills |
| Slow motion | time scale 0.25 to 0.4 for 0.5 to 1 s | player death, big moments |
| Squash and stretch | scale 1.2x on one axis, 0.8x on the other, tween back in 0.15 s | jumps, landings, pickups |
| Anticipation | 0.3 to 0.8 s telegraph before enemy spawns or attacks | everything dangerous |
| Pop-up numbers | easeOutBack pop, float up 30 to 40 px, fade over 0.9 s | score, damage, combo |
| Particles | 6 to 12 for small effects, 25 to 60 for big ones; life 0.2 to 0.7 s; additive blend | every impact and pickup |
| Flash | white flash 0.05 to 0.08 s on the target; red screen tint 0.3 s on damage | hit confirmation |
| Trails | emit 1 particle every 20 ms while moving fast | movement |
| Invulnerability blink | blink at 10 Hz for 1 to 1.5 s | after taking damage |
| Combo and multiplier | multiplier steps every 5 hits, decays after 2 s without a hit | rewarding streaks |

Rules of thumb:
- Hits get more juice than misses. Big events get more than small ones. Keep the scale consistent.
- Shake and hit-stop are the most powerful, so use them least. Save them for the moments you want the player to remember.
- Don't shake the HUD. Apply shake only to the world inside `ctx.save()` / `ctx.restore()`.

## 4. Audio

- [ ] Every player action has a sound (even a quiet tick), and every hit, pickup, and death has a distinct one.
- [ ] Pitch jitter of about ±5% on repeated sounds, so they don't sound mechanical.
- [ ] Pitch or tone rises with a streak. This is free excitement. (The sample raises the pickup pitch with combo.)
- [ ] Music loops with a look-ahead scheduler, not `setInterval` triggering notes directly. Music stops on game over.
- [ ] Music and SFX mix at sensible levels. Compress the bus so stacked explosions don't clip.
- [ ] A mute toggle is available, and the volume default is comfortable. Assume players will have the tab open with sound on at night.

## 5. Visuals and readability

- [ ] One palette, with 3 to 4 accent hues plus neutrals. Give each hue a meaning: player, danger, reward, UI. Keep it consistent.
- [ ] The player is the most distinct thing on screen (color, brightness, shape).
- [ ] Enemies have different silhouettes, not just different colors. Shapes read at a glance, even colorblind.
- [ ] Dark background, bright foreground, and subtle grid or vignette for depth. The sample uses a grid, a vignette, and additive glow.
- [ ] Text is large, has a shadow or outline, and sits on a contrasting background. Test it at the smallest common screen (phone portrait).
- [ ] Idle animation on menus and empty space (drifting particles, rotating rings). Dead screens look unfinished.

## 6. Structure and screens

- [ ] Title screen with the game name, one line of controls, and "press to start".
- [ ] Pause screen (Esc / P, plus pausing on blur).
- [ ] Game over screen with score, best score, and a clear "retry" action. Use a short delay before accepting input.
- [ ] Best score stored in `localStorage`.
- [ ] Settings for mute and (optionally) shake strength. Respect `prefers-reduced-motion`.

## 7. Difficulty and pacing

- [ ] Start with an easy first 15 to 30 seconds. Introduce one new thing every 30 to 60 seconds.
- [ ] Spawn rate and enemy speed ramp over time, with a floor and a cap. The sample uses `max(0.35, 1.5 - t*0.018)` for the spawn interval.
- [ ] No unavoidable damage. Every hazard has a visible way to avoid it.
- [ ] Give the player something to chase (combo, multiplier, bonus), so even a "lost" run rewards play.

## 8. Performance

- [ ] Holds 60 fps on a mid-range laptop with a few hundred entities. Test with many particles on screen.
- [ ] Particles and entities are pooled or removed in place. No per-frame allocation in the loop.
- [ ] Gradients created once or cheap per frame. No `shadowBlur` on lots of shapes. Prefer additive glow discs.
- [ ] DPR capped at 2. Canvas is sized to the window, not a fixed resolution.
- [ ] Use `performance.now()`-based timing only for display. Gameplay time should come from the fixed step.
- [ ] Watch for memory growth over a long session (use the browser's performance tab if you can).

## 9. Input and platform

- [ ] Keyboard (WASD and arrows, Space to act, Esc to pause), mouse (aim and fire), and touch (drag to move, hold to fire) all work.
- [ ] `touch-action: none` on the canvas. No text selection or scroll.
- [ ] Prevent default on game keys (Space, arrows) so the page doesn't scroll.
- [ ] Resize handled. Works in both orientations.
- [ ] Doesn't break when the tab is backgrounded, the window loses focus, or the audio context is suspended.

## 10. Polish pass (the last 10%)

- [ ] Every screen transition has a tween (ease in or out), not a hard cut.
- [ ] Score and counters animate to their new value.
- [ ] A short "new best" celebration on game over when relevant.
- [ ] Friendly copy: short, specific, with a bit of personality.
- [ ] No console errors. Check the browser console on every run.

## Tuning method

1. Change one number at a time, play for 60 seconds, and write down what you felt.
2. Tune movement until the ship feels right with no enemies, then add enemies.
3. Tune the first 30 seconds until a new player survives long enough to get hooked.
4. Tune the midgame ramp, then check the late game still has a chance to beat the high score.
5. Tune feel last. Juice amplifies a good loop, but it can't rescue a bad one.

## Common failures to avoid

- Shake or hit-stop on everything, so nothing feels big.
- Damage with no warning and no invulnerability.
- Enemy spawns off-screen with no telegraph, so death feels random.
- Frame-rate-dependent movement (`x += 5` per frame) that breaks on 144 Hz screens.
- Audio that starts before the user gesture (it silently fails in most browsers).
- A game-over screen that takes 5 seconds to get back into the game.
- Lots of visual noise that makes hazards hard to see.
- Forgetting pause on blur, so the player dies while switching tabs.

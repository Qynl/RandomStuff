# LAST BRAIN STANDING

A small, fast top-down arena combat game built around one idea: opponents should feel different because they make different decisions, not just because they have different colors.

Three hostile profiles hunt you across five escalating threat levels. Every hostile shot is telegraphed before it happens, so damage is always something you could have read and dodged. A run is fully determined by a seed, which you can replay, share, and use to compare scores with someone else.

## Play

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Verify the code:

```bash
npm test           # full regression suite
npm run verify     # strict type check + the full suite (what CI runs)
npm run coverage   # the same run with a v8 coverage report
npm run build      # tsc -b && vite build
```

Coverage of `src/` is 97% of statements and 89% of branches; the sound engine, entry point and every rules module are covered by fakes rather than skipped.

## Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Move |
| Mouse (or drag the arena) | Aim |
| Left click / Space / FIRE button | Fire (hold to keep firing) |
| Shift / DASH button | Dash — 118 units with brief invulnerability |
| Esc | Pause / resume |
| R | Restart with a new seed |
| Shift + R | Restart the *same* seed |
| M | Mute |
| F3 | Telemetry: side-panel read-outs and an arena overlay (bot state, line of sight, intercept crosshairs, preferred range circles, arena openness and the hostile range multiplier it implies) |
| Enter (in the seed field) | Start the run |

Touch controls (virtual stick, FIRE, DASH) appear on touch devices and can be forced on from **Settings → Touch Controls**. **Settings → Aiming** switches between raw mouse aiming and assisted aiming, which slowly tracks the nearest visible hostile in front of you — for keyboard-only and touch play.

## The three profiles

Each profile owns a different *axis* of behaviour, not just a different stat line. The rules live in `src/signatures.ts` as data plus pure functions, so what the game tells you and what it does cannot drift apart.

| Profile | Owns | Signature behaviour | Counterplay |
|---|---|---|---|
| **The Hunter** | *Timing* | Fires a **two-round salvo** from one telegraph (a tight round and a sloppy one, 55/45 of its damage). Its barrel **commits halfway through the wind-up**: it stops tracking, so a late sidestep beats it while an early panic does not. **Front plating** soaks 22 % of any hit landing within ~65° of its facing, and it **plants its feet** while telegraphing (24 % speed, against the Flanker's 72 %). | Break the lane early, or sidestep *late*. Shoot it from the side or while it is holding and turning; a frontal duel pays the plating tax. |
| **The Flanker** | *Space* | **Pincer discipline**: it holds fire while another Flanker is crowding the same ~100° arc around you, and keeps moving for the envelop instead, so the pair rarely shoots from one angle at once. It **dives** (1.8× speed for 0.42 s, 2.4 s cooldown) to close a gap rather than jogging, and it **keeps skirmishing while it telegraphs**. | Keep both flankers on one side of you and one of them will stay silent; when they split you get hit from two directions. |
| **The Mirror** | *Your own kit* | It **fires a copy of the weapon you brought**: a single rifle round, a three-pellet scattergun fan with the shorter falloff, or a faster, heavier railgun slug with a longer telegraph. It still reads your movement and firing habits, and slides out of the lane you are aiming down. | Change direction and firing lane. Your loadout choice literally arms it, so the counter changes with the weapon you pick. |

The sim's own behaviour rules also gained two things that apply to all profiles because a fight should never freeze:

- **Hostiles that lose sight for more than 0.35 s stop holding a ring and come straight for you**, instead of orbiting a crate they cannot shoot through.
- **Wall-slide detours.** A bot that grinds against geometry for ~0.26 s commits to sliding around it for a beat; per-frame avoidance alone makes a blocked bot vibrate in place, which is exactly what an uninterruptible stalemate looked like.
- **Arena pressure.** Bots are slower than you on purpose, so a patient player could kite forever and a wave would never resolve. After 12 s of a stalemate with no kills, the remaining hostiles ramp to +62 % speed (enough to catch a fleeing player) and +32 % fire rate, announced in the feed as *THE ARENA IS TIGHTENING*. Any kill puts it straight back to zero, so it only exists to close out a fight that has already stopped being a fight.

Those counter lines are the same ones the game shows: as tooltips and signature lines on the profile list, in the Mirror read advice (which also names the weapon the Mirror is echoing), and on the defeat card above the profile that ended the run. Hitting plating prints **PLATED** where the round lands, a dive leaves a streak, and a salvo puts two tracers in the air at once, so every one of these rules is visible while you play rather than only in this table. Each wave banner also carries a one-line tactical tip for the fight that is starting - the wave that first fields a profile is the one that teaches it (`getWaveHint` in `src/progression.ts`), so wave 1 explains the rings, wave 2 explains breaking line of sight, and wave 3 explains that the Mirror reads patterns.

Every hostile shot is preceded by a visible wind-up ring in the profile's color; the side panel documents that language under the profile list. The same panel shows the live profile counts, the wave composition, the inbound countdown while a wave is telegraphing, your best three finished runs on this device (each with a REPLAY button that restarts that exact fight on its recorded difficulty), and a **Mirror read** meter with plain-language advice: the meter tracks whichever habit the Mirror can currently exploit (your movement line or your firing lane) and tells you what breaks it.

## Arenas

There are four hand-placed arena layouts, and the seed decides which one a run plays in:

| Layout | Shape | What it changes |
|---|---|---|
| **QUADRANT** | Four corner blocks with a block in the middle | Balanced: cover in the corners, a contested centre |
| **LANES** | Four long walls with offset gaps plus a centre slab | Continuous cover; rewards route planning over open-field strafing |
| **PILLARS** | Six small pillars spread over the arena | Short sight lines everywhere; hurts the long-range flanker |
| **DIAMOND** | A stepped diamond around the middle | The centre is strong but every long diagonal is broken |

Each layout also carries an `openness` value, and hostiles scale the ring they try to hold by it (62%-100% of their profile range): in a room full of cover a wide orbit is impossible, so the Flanker tightens up instead of walking into blocks trying to regain a range the arena cannot give it.

Layouts are never generated randomly: each one is hand-placed and carries its own guarantees, so the pool cannot produce an unfair arena. They keep the middle connected, leave a clear starting area and block-wide cover that a hostile body actually fits behind, and `tests/layout.test.ts` proves all of that with a flood fill over the free space in every layout. The current arena is named in the run feed, the side panel and the F3 overlay, and its cover is tinted with a layout accent so the arena you are in reads at a glance. Because the choice comes from the seed, it is part of what a run code replays.

## Difficulty

| Level | Wind-up | Fire rate | Damage | Tracking | Wave size |
|---|---|---|---|---|---|
| RECRUIT | 1.5× longer | 0.82× | 0.7× | 0.6× | −1 hostile |
| STANDARD | 1× | 1× | 1× | 1× | — |
| VETERAN | 0.86× shorter | 1.25× | 1.15× | 1.25× | — |

Measured with the scripted autoplay policy over 24 seeds per difficulty (`tests/balance.test.ts`, which prints the envelope on every run):

| Level | Wins | Avg kills | Avg waves | Avg damage taken | Wind-up cuts (24 runs) | Fairness issues |
|---|---|---|---|---|---|---|
| RECRUIT | 19/24 | 15.7 | 4.1 | 26 | 180 | 0 |
| STANDARD | 8/24 | 17.7 | 3.5 | 114 | 148 | 0 |
| VETERAN | 0/24 | 12.5 | 2.7 | 123 | 99 | 0 |

The policy reacts to telegraphs perfectly, so it is a much stronger player than a first-timer: treat these as ordering and sanity figures, not a human win rate. Best score and best eliminations are stored per difficulty.

## Look

Grounded industrial test chamber, not a neon vector demo: poured concrete with slab seams, coarser speckle, worn paint and stencilled sector marks; extruded steel crates with lit top plates, ribs, rust streaks and a worn hazard strip; three work lamps laying pools of light on the floor; dust motes drifting through the room; units with contact shadows; tracers instead of glowing bolts; scorch marks that appear where rounds land and fade out over the next half minute.

Every hostile has its own model rather than its own colour: the Hunter is a squat siege mech with skirt plates and a cannon that lights as it charges, the Flanker a light interceptor with swept prongs, a fluttering wing and thruster burn that tracks its speed, and the Mirror a faceted prism with a narrowing eye and three orbiting shards. The player is an armoured operative with an amber visor, a rifle that recoils on every shot and a walk cycle.

There is no bloom anywhere (a test rejects any non-zero `shadowBlur`), and a second test rejects any colour that is both vivid and bright, so neon cannot creep back in without deleting a test that says why it is there.

## Loadouts

You pick a primary weapon before a run, and it changes how the fight is played:

| Weapon | Rounds | Damage | Interval | Unlocks at |
|---|---|---|---|---|
| **SERVICE RIFLE** | 1 | 12 | 0.155 s | Standard issue |
| **BREACH SCATTERGUN** | 6 (0.42 rad fan) | 5 each | 0.46 s | 4,500 career score |
| **RAILGUN** | 1 | 34 | 0.68 s | 11,000 career score |

Career score is the sum of your best score on each threat level, so improving any level moves the unlock ladder. Each weapon also names its own counterplay in the picker; every pellet counts as a shot, so accuracy stays honest whichever you carry. A stored value that names a locked or unknown weapon resolves back to the rifle rather than skipping the unlock.

## Operator profile

**OPERATOR PROFILE** (on the start screen and on the result card) opens the account view:

- **Rank** — insignia and name, RECRUIT → OPERATOR → SPECIALIST → VETERAN → INSTRUCTOR by career score.
- **Career totals** — score, runs, kills, wins and best chain.
- **Unlock ladder** — each weapon, what it costs, and a progress bar toward the next one.
- **Service record** — nine badges with an explicit requirement each. Locked ones hide their name and show what it takes plus how far along you are: FIRST CONTACT, MARKSMAN (80 % accuracy), CHAIN REACTION (5 eliminations in a row), WIND-UP CUTTER, ARENA TOUR (win in three arenas), FULL SWEEP (win every threat level), UNTOUCHABLE (win without damage), GUNSMITH, CENTURION.
- **Weapon records** — runs, kills, clears and best score for each of the three weapons separately, so the railgun's row is its own history.
- **Best run per threat level**, so recruit and veteran progress do not overwrite each other.

Everything lives in `localStorage` and nothing leaves the device. The badge rules live in `src/account.ts` as data (requirement text plus a progress function), so the same code decides whether a badge is earned and explains what is missing.

## Scoring

Score rewards pressure, progress and precision, and it pays for the two skills the combat rules ask for:

| Component | Value |
|---|---|
| Elimination | 120 |
| Threat level cleared | 250 |
| Accuracy | 4 per percent |
| Pace | 5 per second remaining of a two-minute bonus window |
| **Wind-up cut** (killing a hostile mid-telegraph) | **60** |

A wind-up cut also cancels the shot that was coming, so interrupting a telegraph is both the safest and the most profitable answer to it.

Clearing all five threat levels without taking a single point of damage earns the **CLEAN SWEEP** badge on the result card - the only way to get it is to read and dodge every telegraph in the run. The result screen itemises the breakdown (including perfect dodges and wind-up cuts when they happened, plus the arena the run was played in) and the telemetry panel tracks both counters live.

## Seeds, replay and sharing

- A run is a pure function of `(seed, difficulty)`: same seed + same inputs = same fight, frame for frame.
- The seed is shown in the top bar, the pause card and the run summary.
- The start screen shows the arena a typed seed will play in and the weapon picker, and **RANDOM** rolls a fresh seed for you.
- Starting a run writes a run code into the URL (`#seed=1A2B3C&level=veteran`), so the address bar is always a replayable link.
- Opening such a link (or pasting it into the seed field) starts that exact fight; **COPY SEED LINK** on the result screen copies it.
- Seed labels are six hex characters and are *lossless*: `normalizeSeed` keeps every seed inside 24 bits, so `REPLAY SEED 1A2B3C` restores the fight that label names. Text seeds (`mirror`, `boss-rush`) are hashed, case-insensitively, into the same space.

## Saved on this device

Everything the browser stores lives in `localStorage` under `lbs-*` keys, and nothing is ever sent anywhere (there is no backend):

| Key | Holds |
|---|---|
| `lbs-best-score` / `lbs-best-kills` / `lbs-best-by-difficulty` | Personal bests, overall and per threat level |
| `lbs-run-history` | The last twelve finished runs (seed, level, arena, score, kills, outcome) feeding the best-runs list |
| `lbs-difficulty` | Last threat level played |
| `lbs-aim` | Aiming mode (mouse or assisted) |
| `lbs-muted` | Sound on/off |
| `lbs-shake` | Screen shake and damage flash (calm mode when off) |
| `lbs-touch` | Whether the touch controls were forced on |

Every read is validated: a corrupt or hand-edited value falls back to the default rather than breaking the panel, and the shell renders the restored settings on a fresh load.

## Architecture

The simulation is completely separate from React and from rendering, which is what makes the balance sweeps and jsdom runtime tests possible.

| File | Responsibility |
|---|---|
| `src/sim.ts` | The whole game: `stepWorld(world, input, dt)` advances players, bots, bullets, spawns and waves and returns the frame's events. Pure and deterministic — no DOM, no timers, no `Math.random`. |
| `src/ai.ts` | Pure bot decision functions: profiles, movement intent, wind-up duration/turn rate/aim point, intercept solving, habit detection, separation, and the HUD wording for the Mirror's read. |
| `src/arena.ts` | World bounds, obstacles, swept collision and clearance helpers, spawn placement. |
| `src/progression.ts` | Wave plans: composition, telegraph, spawn interval, durability/speed/awareness scaling. |
| `src/rng.ts` | Seeded generator (mulberry32) plus seed normalization and labels. |
| `src/constants.ts` | Difficulty presets and every shared tuning constant. |
| `src/scoring.ts` | Score breakdown, grades, and the rows shown on the result screen. |
| `src/input.ts` | Pure input helpers: deadzone, stick vector, screen→world mapping, keyboard vector, dash charge. |
| `src/share.ts` | Run codes: parse/build share links, seed labels, copy confirmation text. |
| `src/game.ts` | Presentation shell (`ArenaGame`): 120 Hz fixed-step loop, input handling, canvas rendering, effects, audio, HUD snapshots, `localStorage`. Degrades to a no-op renderer when the canvas has no 2D context, so the simulation, input and HUD keep working. |
| `src/App.tsx` | React UI shell: overlays, side panel, settings, touch controls, share link. |
| `src/audio.ts` | WebAudio synthesis (no asset files). |

Data flow: `App` owns the React state and mounts `ArenaGame` on the canvas. The engine runs a fixed-step accumulator (the world always advances in 1/120 s steps regardless of the render frame rate) and pushes a throttled JSON snapshot to React at 10 Hz, plus event-driven feed lines. React never re-renders per animation frame.

## Tests

| File | Covers |
|---|---|
| `tests/sim.test.ts` | Determinism, seed replay, telegraphed combat, fairness, movement, waves, crowd behavior, aim assist, Mirror read. |
| `tests/ai.test.ts` | Bot profiles and every decision primitive. |
| `tests/arena.test.ts` | Collision geometry, swept movement, spawn placement (including the defensive fallback that guarantees a wave can never spawn short). |
| `tests/progression.test.ts` | Wave composition and difficulty scaling. |
| `tests/balance.test.ts` | 24-seed sweep per difficulty: win band, difficulty ordering, fairness counters, run length, performance, scoring. |
| `tests/game.test.ts` | jsdom runtime: input, firing, dash, dodge feedback, pause, touch, run end, run history, calm mode, telemetry overlay, persistence, fixed-step invariance. |
| `tests/app.test.tsx` | jsdom React shell: overlay flow, settings, seed link, counterplay hints, focus management, console cleanliness. |
| `tests/rng.test.ts`, `tests/share.test.ts`, `tests/input.test.ts`, `tests/scoring.test.ts` | The pure helper modules. |
| `tests/loadouts.test.ts` | Weapon catalogue (each weapon distinct, the balance promise each one makes, burst-damage band), the career-score ladder, unlock progress and rank thresholds, and in-sim firing per weapon (pellet fan, life, damage, cooldown, shot counting, locked/unknown resolution). |
| `tests/account.test.ts` | Service records per weapon (accumulate, keep the best, ignore junk input, never pool across weapons) and the badge shelf: nine badges each earned by its own condition, partial progress for locked ones, and progress clamped even for absurd career state. |
| `tests/archetypes.test.ts` | The behavioural divergence itself: volley geometry per profile, the Hunter's front plating and mid-wind-up aim lock, the Flanker's arc-based hold-fire and dive, the Mirror copying each of the three weapons, the detour thresholds, stall pressure, and a twelve-seed sweep proving each signature fires in real fights and none of them bleeds into another profile. |
| `tests/artdirection.test.ts` | Every source file is scanned for neon (a colour that is both saturated and bright, with an explicit allow-list) and for any non-zero `shadowBlur`; the detector self-checks against the retired palette so a broken classifier cannot pass the guard. |
| `tests/layout.test.ts` | Arena layouts: blocks in bounds and non-overlapping, the player's start is free, a flood fill proves no layout seals off a pocket, cover is worth hiding behind, every layout carries a distinct accent and a sane openness, and the seed always picks the same layout (including through a seed-label round trip). |
| `tests/fuzz.test.ts` | Adversarial input sweep: 12 long runs of deliberately awkward input (zero-length aim vectors, dash spam, hard reversals, nonsensical aim points) asserting that vectors stay finite, nobody ends a frame inside geometry, lists stay bounded, and the same input still replays identically. |
| `tests/audio.test.ts` | Sound engine against a fake `AudioContext`: no graph before a gesture, silent no-op without WebAudio, a broken graph reported once, mute and volume honoured, polyphony capped and voices recycled. |
| `tests/main.test.ts` | The browser entry point mounts into `#root` and logs nothing on the way up. |
| `tests/contrast.test.ts` | Walks every text colour in `src/style.css` and requires WCAG AA (4.5:1) against the panel surfaces, including the dark ink on the light buttons. |
| `tests/helpers/` | Fake canvas + manual animation-frame clock, scripted autoplay policy. |

`npm test` runs everything in one command; the balance sweep doubles as the playtest substitute (there is no browser automation in this environment). The sweep also measures the worst-case step cost: a full six-hostile wave with the player firing runs at ~0.002 ms per 1/120 s step, i.e. roughly three orders of magnitude inside the frame budget.

## Design rules kept by the code

- **No omniscient enemies.** Bots obey range, cooldown, line of sight and readable telegraphs; a shot is never fired without a wind-up first, and a wind-up is cancelled when the lane closes.
- **Coordination is positional, not shared knowledge.** Orbiting profiles only know where their nearest ally is standing, pick the far side, and commit to that side for 0.7s so a wave pincers instead of trailing in a queue.
- **No surprise damage.** Every hit has a visible cause: a telegraph ring, a body check, or an explained feed line with the shooter named.
- **Readable at the smallest sizes.** Every text colour in the panel palette clears WCAG AA (4.5:1) against the panel surfaces, and a test enforces it so the muted greys cannot drift back down.
- **Failures stay contained.** A drawing fault skips the rest of that frame (reported once in the feed and the console) while the simulation keeps running, and a canvas without a 2D context is replaced by a no-op renderer instead of throwing.
- **No spawning on top of the player.** Spawn markers relocate and re-telegraph if the player walks onto them.
- **Determinism.** All randomness flows through the seeded generator, so runs replay exactly and balance can be measured.
- **No unavoidable pressure.** Dash carries real invulnerability frames and rounds pass through the player during them. A round that passes through is reported once, with floating feedback, so the skill is taught rather than hidden.

## Known limitations

- The sandboxed preview environment has no network access, so the optional Google Fonts import degrades to system fonts (by design).
- No headless browser is available here: runtime behavior is verified with the jsdom harness and the scripted autoplay policy rather than real-device playtests.
- Veteran is intentionally a wall: the scripted policy never clears it, though it consistently reaches the later waves.

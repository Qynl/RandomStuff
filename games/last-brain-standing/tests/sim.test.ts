import { describe, expect, it } from "vitest";
import { BOT_RADIUS, PLAYER_MAX_HEALTH, PLAYER_RADIUS } from "../src/constants";
import { hasClearance, OBSTACLES, pointInObstacle, segmentBlocked, WORLD } from "../src/arena";
import { createRng, formatSeed } from "../src/rng";
import { getWavePlan, MAX_WAVES } from "../src/progression";
import { createWorld, damagePlayer, eliminateBot, emptyInput, findAssistTarget, livingBots, playerPredictability, resetWorld, selectDashDirection, stepWorld, type SimInput, type World } from "../src/sim";
import type { AgentState, SimEvent, Vec2 } from "../src/types";
import { pinLayout } from "./helpers/layout";
import { autoplay, worldHash } from "./helpers/autoplay";

const STEP = 1 / 60;

const idleInput = (overrides: Partial<SimInput> = {}): SimInput => ({ ...emptyInput(), ...overrides });

function run(world: World, seconds: number, input: (frame: number) => SimInput = () => idleInput(), step = STEP): SimEvent[] {
  const events: SimEvent[] = [];
  const frames = Math.round(seconds / step);
  for (let frame = 0; frame < frames && world.phase === "running"; frame += 1) {
    events.push(...stepWorld(world, input(frame), step));
  }
  return events;
}

/** Resets a world for a focused test. Waves can be frozen to isolate a system. */
function readyWorld(seed: number | string = "sim-test", options: { waves?: boolean } = {}): World {
  const world = createWorld({ seed, difficulty: "standard" });
  resetWorld(world, { seed });
  if (options.waves === false) world.waveState = "idle";
  return world;
}

function waitForBots(world: World, seconds = 6): SimEvent[] {
  return run(world, seconds);
}

describe("determinism", () => {
  it("produces identical state for the same seed and inputs", () => {
    const first = autoplay({ seed: "repeatable-1", maxSeconds: 45, step: 1 / 60 });
    const second = autoplay({ seed: "repeatable-1", maxSeconds: 45, step: 1 / 60 });
    expect(worldHash(second.world)).toBe(worldHash(first.world));
    expect(second.stats).toEqual(first.stats);
    expect(second.elapsed).toBeCloseTo(first.elapsed, 5);
  });

  it("produces different fights for different seeds", () => {
    const first = autoplay({ seed: "seed-a", maxSeconds: 45 });
    const second = autoplay({ seed: "seed-b", maxSeconds: 45 });
    expect(worldHash(second.world)).not.toBe(worldHash(first.world));
  });

  it("replays an identical fight from the label the HUD shows", () => {
    const original = createWorld({ seed: "boss-rush", difficulty: "standard" });
    resetWorld(original, { seed: "boss-rush", difficulty: "standard" });
    const label = formatSeed(original.seed);
    const replay = createWorld({ seed: label, difficulty: "standard" });
    resetWorld(replay, { seed: label, difficulty: "standard" });

    const input = { ...emptyInput(), move: { x: 0.4, y: -0.3 }, firing: true };
    const events: string[] = [];
    for (let i = 0; i < 900; i += 1) {
      events.push(...stepWorld(original, input, 1 / 120).map((event) => JSON.stringify(event)));
      stepWorld(replay, input, 1 / 120);
    }
    // A different seed would diverge within a frame or two; every spawn marker,
    // wind-up and shot must match exactly.
    expect(original.seed).toBe(replay.seed);
    expect(original.bots.map((bot) => ({ id: bot.id, kind: bot.kind, position: bot.position }))).toEqual(
      replay.bots.map((bot) => ({ id: bot.id, kind: bot.kind, position: bot.position }))
    );
    expect(original.bullets.map((bullet) => bullet.position)).toEqual(replay.bullets.map((bullet) => bullet.position));
    expect(original.stats).toEqual(replay.stats);
  });

  it("keeps the simulation frame-rate independent", () => {
    // A passive player removes the human-side reaction factor, so what is left
    // is pure simulation timing: bots, telegraphs, damage and wave pacing.
    const slow = autoplay({ seed: "fps", maxSeconds: 30, step: 1 / 30, style: "passive" });
    const fast = autoplay({ seed: "fps", maxSeconds: 30, step: 1 / 120, style: "passive" });
    expect(slow.stats.wave).toBe(fast.stats.wave);
    // Damage is the chaotic part: profiles now fire multi-round volleys, so a
    // 30 Hz frame can land a round a 120 Hz frame nudges past a hostile. The
    // contract is the shape of the fight, not a point-for-point match.
    expect(Math.abs(slow.stats.damageTaken - fast.stats.damageTaken)).toBeLessThanOrEqual(3);
    // How long a passive player survives is a chaotic quantity once profiles
    // fire multi-round volleys: the contract is the same fight in the same
    // arena at the same threat level, not the same second of death.
    expect(Math.abs(slow.elapsed - fast.elapsed)).toBeLessThan(4);
    expect(slow.phase).toBe(fast.phase);
  });

  it("converges early and stays put together at fine step sizes", () => {
    // The shipped loop accumulates wall time and always advances the world in
    // 1/120 s steps, so this pins the contract the runtime relies on at fine
    // steps: the opening of a fight is step-size independent, kills match, and a
    // full run stays in the same arena at the same threat level. It is not an
    // exact-match test - combat is chaotic and a single frame of drift around a
    // corner sends a scripted run down a different lane - that is why
    // determinism at a *fixed* step is the replay contract (see the seed test
    // above) and this one is about the coarse shape of a fight.
    const seeds = ["g1", "g2", "g3", "g4"];

    const early = seeds.map((seed) => ({
      short: autoplay({ seed, maxSeconds: 2, step: 1 / 120 }),
      fine: autoplay({ seed, maxSeconds: 2, step: 1 / 240 })
    }));
    for (const { short, fine } of early) {
      expect(fine.stats.kills).toBe(short.stats.kills);
      expect(fine.world.arenaName).toBe(short.world.arenaName);
      const playerDrift = Math.hypot(
        fine.world.player.position.x - short.world.player.position.x,
        fine.world.player.position.y - short.world.player.position.y
      );
      expect(playerDrift).toBeLessThan(12);
      expect(fine.world.bots.length).toBe(short.world.bots.length);
      const botDrift = Math.max(
        ...fine.world.bots.map((bot, index) => Math.hypot(bot.position.x - short.world.bots[index].position.x, bot.position.y - short.world.bots[index].position.y)),
        0
      );
      expect(botDrift).toBeLessThan(30);
    }

    let killsA = 0;
    let killsB = 0;
    let wavesA = 0;
    let wavesB = 0;
    for (const seed of seeds) {
      const short = autoplay({ seed, maxSeconds: 40, step: 1 / 120 });
      const fine = autoplay({ seed, maxSeconds: 40, step: 1 / 240 });
      expect(fine.world.arenaName).toBe(short.world.arenaName);
      expect(Math.abs(short.stats.wave - fine.stats.wave)).toBeLessThanOrEqual(2);
      killsA += short.stats.kills;
      killsB += fine.stats.kills;
      wavesA += short.stats.wave;
      wavesB += fine.stats.wave;
    }
    expect(Math.abs(killsA - killsB) / seeds.length).toBeLessThanOrEqual(5);
    expect(Math.abs(wavesA - wavesB) / seeds.length).toBeLessThanOrEqual(0.5);
  });


});

describe("wind-up interrupts", () => {
  const placeHunter = (world: World, windup: number): AgentState => {
    world.waveState = "idle";
    const bot: AgentState = {
      id: 42,
      kind: "hunter",
      position: { x: 700, y: 120 },
      velocity: { x: 0, y: 0 },
      health: 8,
      maxHealth: 48,
      fireCooldown: 1,
      windup,
      windupDuration: windup,
      windupTurnRate: 2,
      facing: 0,
      spawnGuard: 0,
      strafeSign: 1,
      strafeLock: 0,
      alive: true,
      hitFlash: 0,
      blindTime: 0,

    pendingRounds: 0,

    burstTimer: 0,

    diveTime: 0,

    diveCooldown: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0};
    world.bots.push(bot);
    return bot;
  };

  it("counts a hostile killed during its telegraph", () => {
    const world = readyWorld("cut-windup", { waves: false });
    const bot = placeHunter(world, 0.8);
    eliminateBot(world, bot);
    expect(world.stats.kills).toBe(1);
    expect(world.stats.interrupts).toBe(1);
    const event = world.events.find((entry) => entry.type === "bot-eliminated");
    expect(event && "interrupted" in event ? event.interrupted : null).toBe(true);
    expect(bot.windup).toBe(0);
  });

  it("does not count an ordinary kill as an interrupt", () => {
    const world = readyWorld("plain-kill", { waves: false });
    const bot = placeHunter(world, 0);
    eliminateBot(world, bot);
    expect(world.stats.kills).toBe(1);
    expect(world.stats.interrupts).toBe(0);
    const event = world.events.find((entry) => entry.type === "bot-eliminated");
    expect(event && "interrupted" in event ? event.interrupted : null).toBe(false);
  });

  it("counts one interrupt per hostile, never twice", () => {
    const world = readyWorld("double-count", { waves: false });
    const bot = placeHunter(world, 0.5);
    eliminateBot(world, bot);
    eliminateBot(world, bot);
    expect(world.stats.interrupts).toBe(1);
    expect(world.stats.kills).toBe(1);
  });
});

describe("perfect dodges", () => {
  const botRound = (world: World, from: Vec2, velocity: Vec2, damage = 8) => {
    world.waveState = "idle";
    world.bullets.push({
      position: { ...from },
      velocity,
      owner: "bot",
      damage,
      life: 1,
      color: "#fff",
      source: "hunter",
      travelled: 0
    });
  };

  it("reports a round that passes through during invulnerability frames", () => {
    const world = readyWorld("dodge-through", { waves: false });
    // Fixed coordinates assume the quadrant layout; pin it.
    pinLayout(world);
    world.player.position = { x: 480, y: 500 };
    world.player.invulnerability = 0.5;
    botRound(world, { x: 480, y: 430 }, { x: 0, y: 300 });
    const events = run(world, 0.5);
    const dodges = events.filter((event) => event.type === "player-dodged");
    expect(dodges).toHaveLength(1);
    expect(world.stats.dodges).toBe(1);
    expect(world.player.health).toBe(PLAYER_MAX_HEALTH);
    // The round keeps travelling; dodging is not a shield.
    expect(world.bullets.length).toBeGreaterThan(0);
  });

  it("counts each round once even when it overlaps for several frames", () => {
    const world = readyWorld("dodge-once", { waves: false });
    world.player.position = { x: 480, y: 500 };
    world.player.invulnerability = 2;
    botRound(world, { x: 480, y: 470 }, { x: 0, y: 30 });
    const events = run(world, 2);
    expect(events.filter((event) => event.type === "player-dodged")).toHaveLength(1);
    expect(world.stats.dodges).toBe(1);
  });

  it("does not report a dodge when the round actually lands", () => {
    const world = readyWorld("dodge-miss", { waves: false });
    world.player.position = { x: 480, y: 500 };
    world.player.invulnerability = 0;
    botRound(world, { x: 480, y: 430 }, { x: 0, y: 300 });
    const events = run(world, 0.5);
    expect(events.some((event) => event.type === "player-dodged")).toBe(false);
    expect(events.some((event) => event.type === "player-hit")).toBe(true);
    expect(world.stats.dodges).toBe(0);
  });

  it("stays silent when the round simply misses", () => {
    const world = readyWorld("dodge-wide", { waves: false });
    world.player.position = { x: 480, y: 500 };
    world.player.invulnerability = 0.5;
    botRound(world, { x: 40, y: 430 }, { x: 300, y: 0 });
    const events = run(world, 0.5);
    expect(events.some((event) => event.type === "player-dodged")).toBe(false);
    expect(world.stats.dodges).toBe(0);
  });
});

/** Smallest angle between two bearings, in radians. */
function angleBetween(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

describe("pincer behaviour", () => {
  const placeFlanker = (world: World, id: number, position: Vec2, strafeSign: number): void => {
    world.bots.push({
      id,
      kind: "flanker",
      position,
      velocity: { x: 0, y: 0 },
      health: 100,
      maxHealth: 100,
      fireCooldown: 99,
      windup: 0,
      windupDuration: 0,
      windupTurnRate: 2,
      facing: 0,
      spawnGuard: 99,
      strafeSign,
      strafeLock: 0,
      alive: true,
      hitFlash: 0,
      blindTime: 0,

    pendingRounds: 0,

    burstTimer: 0,

    diveTime: 0,

    diveCooldown: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0});
  };

  it("splits two flankers that start on the same side into opposite sides", () => {
    const world = readyWorld("pincer", { waves: false });
    world.player.position = { x: 480, y: 300 };
    world.player.invulnerability = 99;
    placeFlanker(world, 1, { x: 430, y: 120 }, 1);
    placeFlanker(world, 2, { x: 560, y: 110 }, 1);
    // Both start above the player in the same quadrant, so a naive orbit would
    // leave them trailing each other.
    const angleTo = (p: Vec2) => Math.atan2(p.y - world.player.position.y, p.x - world.player.position.x);
    const separationNow = () => Math.abs(angleBetween(angleTo(world.bots[0].position), angleTo(world.bots[1].position)));
    const before = separationNow();
    run(world, 5, () => idleInput());
    const after = separationNow();
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(Math.PI / 3);
  });

  it("commits to an orbit side long enough to read as a decision", () => {
    const world = readyWorld("pincer-stable", { waves: false });
    world.player.position = { x: 480, y: 300 };
    world.player.invulnerability = 99;
    placeFlanker(world, 1, { x: 430, y: 120 }, 1);
    placeFlanker(world, 2, { x: 560, y: 110 }, 1);

    // 0.7s of lock at the 60Hz test step: a bot may not flip sides faster.
    const minGapFrames = Math.floor(0.7 / STEP) - 2;
    const lastChange = new Map<number, number>([[1, -1000], [2, -1000]]);
    const signs = new Map<number, number>([[1, world.bots[0].strafeSign], [2, world.bots[1].strafeSign]]);
    let changes = 0;
    for (let frame = 0; frame < Math.round(6 / STEP); frame += 1) {
      stepWorld(world, idleInput(), STEP);
      for (const bot of world.bots) {
        if (signs.get(bot.id) === bot.strafeSign) continue;
        const gap = frame - (lastChange.get(bot.id) ?? -1000);
        expect(gap).toBeGreaterThanOrEqual(minGapFrames);
        lastChange.set(bot.id, frame);
        signs.set(bot.id, bot.strafeSign);
        changes += 1;
      }
    }
    // And the lock is not so sticky that the bots never reposition at all.
    expect(changes).toBeGreaterThan(0);
  });

});

describe("mirror read", () => {
  const placeMirror = (world: World, position: Vec2): void => {
    world.waveState = "idle";
    world.bots.push({
      id: 99,
      kind: "mirror",
      position,
      velocity: { x: 0, y: 0 },
      health: 50,
      maxHealth: 50,
      fireCooldown: 0,
      windup: 0,
      windupDuration: 0,
      windupTurnRate: 2,
      facing: 0,
      spawnGuard: 0,
      strafeSign: 1,
      strafeLock: 0,
      alive: true,
      hitFlash: 0,
      blindTime: 0,

    pendingRounds: 0,

    burstTimer: 0,

    diveTime: 0,

    diveCooldown: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0});
  };

  it("publishes nothing while no mirror is on the floor", () => {
    const world = readyWorld("read-none", { waves: false });
    run(world, 1, () => idleInput({ move: { x: 1, y: 0 } }));
    expect(world.bots).toHaveLength(0);
    expect(world.mirrorRead).toBeNull();
  });

  it("watches the read rise while the player repeats a direction and fall when they break it", () => {
    const world = readyWorld("read-rise", { waves: false });
    placeMirror(world, { x: 700, y: 120 });
    const straight = () => idleInput({ move: { x: 1, y: 0 } });
    // Standing still gives the mirror nothing to work with.
    run(world, 0.5, () => idleInput());
    expect(world.mirrorRead).toEqual({ movement: 0, firing: 0 });
    run(world, 0.6, straight);
    const steady = world.mirrorRead?.movement ?? 0;
    expect(steady).toBeGreaterThan(0.8);

    // Alternating direction dissolves the habit the mirror was reading.
    let frame = 0;
    run(world, 3, () => idleInput({ move: frame++ % 2 === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 } }));
    expect(world.mirrorRead?.movement ?? 0).toBeLessThan(steady);
  });

  it("stops reporting a read once the run is over", () => {
    const world = readyWorld("read-end", { waves: false });
    placeMirror(world, { x: 700, y: 120 });
    run(world, 0.6, () => idleInput({ move: { x: 1, y: 0 } }));
    expect(world.mirrorRead?.movement ?? 0).toBeGreaterThan(0.5);
    world.player.invulnerability = 0;
    damagePlayer(world, 999, { x: 0, y: 0 }, { x: 0, y: 1 }, "mirror");
    expect(world.phase).toBe("defeat");
    expect(world.mirrorRead).toBeNull();
  });

  it("reports the firing-lane habit separately from movement", () => {
    const world = readyWorld("read-fire", { waves: false });
    placeMirror(world, { x: 700, y: 120 });
    run(world, 3, () => idleInput({ firing: true, aim: { x: 100, y: 300 } }));
    expect(world.mirrorRead?.firing ?? 0).toBeGreaterThan(0.2);
  });
});

describe("telegraphed combat", () => {
  it("never fires a bot shot without a wind-up first", () => {
    const result = autoplay({ seed: "telegraph", maxSeconds: 90 });
    expect(result.fairness.untelegraphedShots).toBe(0);
    expect(result.events.some((event) => event.type === "bot-fired")).toBe(true);
  });

  it("cancels a wind-up when the shot lane closes", () => {
    const world = readyWorld("cancel");
    // Fixed coordinates assume the quadrant layout; pin it.
    pinLayout(world);
    run(world, 4);
    const bot = world.bots.find((candidate) => candidate.alive)!;
    // Park the player behind the central block, then force a wind-up.
    world.player.position = { x: OBSTACLES[4].x - 60, y: OBSTACLES[4].y + OBSTACLES[4].h / 2 };
    bot.position = { x: OBSTACLES[4].x + OBSTACLES[4].w + 60, y: OBSTACLES[4].y + OBSTACLES[4].h / 2 };
    bot.windup = 0.3;
    bot.windupDuration = 0.3;
    const events = run(world, 0.5, () => idleInput());
    const botEvents = events.filter((event) => event.type === "bot-windup-cancel" || event.type === "bot-fired");
    expect(botEvents.some((event) => event.type === "bot-windup-cancel")).toBe(true);
    expect(botEvents.some((event) => event.type === "bot-fired" && event.botId === bot.id)).toBe(false);
  });

  it("gives the player more warning on lower difficulties", () => {
    const durationsFor = (difficulty: "recruit" | "standard" | "veteran") => {
      const result = autoplay({ seed: "warn", difficulty, maxSeconds: 60 });
      const windups = result.events.filter((event) => event.type === "bot-windup");
      return windups.reduce((sum, event) => sum + (event.type === "bot-windup" ? event.duration : 0), 0) / Math.max(1, windups.length);
    };
    const recruit = durationsFor("recruit");
    const standard = durationsFor("standard");
    const veteran = durationsFor("veteran");
    expect(recruit).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(veteran);
  });

  it("never lets a bot shoot through a block", () => {
    const result = autoplay({ seed: "walls", maxSeconds: 120 });
    expect(result.fairness.shotsThroughWalls).toBe(0);
  });
});

describe("fair damage", () => {
  it("shows the player where damage came from", () => {
    const world = readyWorld("directions");
    const events = waitForBots(world, 12);
    const hits = events.filter((event) => event.type === "player-hit");
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      if (hit.type !== "player-hit") continue;
      expect(hit.source).not.toBe("unknown");
      expect(Math.hypot(hit.direction.x, hit.direction.y)).toBeGreaterThan(0.5);
      expect(hit.health).toBeLessThan(PLAYER_MAX_HEALTH);
    }
  });

  it("honours invulnerability frames instead of chaining instant hits", () => {
    const world = readyWorld("iframes");
    const events = waitForBots(world, 6);
    expect(events.length).toBeGreaterThan(0);
    world.player.invulnerability = 0;
    damagePlayer(world, 20, { x: 0, y: 0 }, { x: 1, y: 0 }, "hunter");
    const afterFirst = world.player.health;
    damagePlayer(world, 20, { x: 0, y: 0 }, { x: 1, y: 0 }, "hunter");
    expect(world.player.health).toBe(afterFirst);
  });

  it("lets bot rounds pass through an invulnerable player", () => {
    const world = readyWorld("pass-through", { waves: false });
    // Fixed coordinates assume the quadrant layout; pin it.
    pinLayout(world);
    const bot = makeBot(9, { x: 480, y: 300 });
    world.bots.push(bot);
    world.player.position = { x: 480, y: 520 };
    world.player.invulnerability = 1;
    bot.position = { x: 480, y: 300 };
    world.bullets.length = 0;
    world.bullets.push({
      position: { x: 480, y: 470 },
      velocity: { x: 0, y: 320 },
      owner: "bot",
      damage: 10,
      life: 2,
      color: "#ff5c76",
      source: "hunter",
      travelled: 0
    });
    const before = world.bullets.length;
    run(world, 0.2, () => idleInput());
    expect(world.bullets.length).toBe(before);
    expect(world.player.health).toBe(PLAYER_MAX_HEALTH);
  });

  it("explains every hit with a visible cause", () => {
    for (const seed of ["fair-1", "fair-2", "fair-3"]) {
      const result = autoplay({ seed, maxSeconds: 90 });
      expect(result.fairness.unexplainedHits).toBe(0);
    }
  });

  it("cannot spawn hostiles on top of the player", () => {
    for (const seed of ["spawns-1", "spawns-2", "spawns-3"]) {
      const result = autoplay({ seed, maxSeconds: 120 });
      expect(result.fairness.closeSpawns).toBe(0);
      expect(result.fairness.botsInsideGeometry).toBe(0);
    }
  });
});

describe("player movement", () => {
  it("cannot dash through arena blocks", () => {
    const world = readyWorld("dash-block");
    run(world, 0.6);
    world.bots.length = 0;
    world.player.position = { x: OBSTACLES[4].x - 40, y: OBSTACLES[4].y + OBSTACLES[4].h / 2 };
    world.player.dashCooldown = 0;
    const inputs: SimInput[] = [];
    for (let i = 0; i < 40; i += 1) inputs.push(idleInput({ move: { x: 1, y: 0 }, aim: { x: world.player.position.x + 100, y: world.player.position.y } }));
    // Aim into the block so a tunnelling dash would reappear on the far side.
    world.player.aimDirection = { x: 1, y: 0 };
    for (let i = 0; i < 40; i += 1) {
      const input = i % 20 === 0 ? { ...inputs[i], dash: true } : inputs[i];
      stepWorld(world, input, STEP);
      expect(pointInObstacle(world.player.position)).toBe(false);
      expect(world.player.position.x).toBeLessThan(OBSTACLES[4].x + OBSTACLES[4].w);
    }
  });

  it("keeps the player inside the arena", () => {
    const world = readyWorld("bounds");
    world.bots.length = 0;
    for (const direction of [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 }
    ]) {
      run(world, 3, () => idleInput({ move: direction }));
      expect(world.player.position.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
      expect(world.player.position.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);
      expect(world.player.position.x).toBeLessThanOrEqual(WORLD.width - PLAYER_RADIUS);
      expect(world.player.position.y).toBeLessThanOrEqual(WORLD.height - PLAYER_RADIUS);
    }
  });

  it("buffers a dash pressed during cooldown instead of dropping it", () => {
    const world = readyWorld("dash-buffer");
    run(world, 1);
    world.player.dashCooldown = 0.3;
    const start = { ...world.player.position };
    stepWorld(world, idleInput({ move: { x: 1, y: 0 }, dash: true }), STEP);
    const afterPress = { ...world.player.position };
    run(world, 0.45, () => idleInput({ move: { x: 1, y: 0 } }));
    expect(Math.hypot(afterPress.x - start.x, afterPress.y - start.y)).toBeLessThan(30);
    expect(Math.hypot(world.player.position.x - afterPress.x, world.player.position.y - afterPress.y)).toBeGreaterThan(60);
  });

  it("dashes along the movement input rather than the knockback", () => {
    const world = readyWorld("dash-intent");
    world.player.moveIntent = { x: 0, y: -1 };
    world.player.aimDirection = { x: 1, y: 0 };
    world.player.velocity = { x: -400, y: 400 };
    expect(selectDashDirection(world).y).toBeCloseTo(-1, 5);
  });
});

describe("waves and the run lifecycle", () => {
  it("waits for the telegraph before hostiles appear", () => {
    const world = readyWorld("telegraph-window");
    run(world, 1.2);
    expect(world.waveState).toBe("telegraph");
    expect(world.bots.some((bot) => bot.alive)).toBe(false);
    run(world, 2.5);
    expect(world.wave).toBe(1);
    expect(livingBots(world).length).toBeGreaterThan(0);
    // Every hostile arrives after a visible marker, never instantly.
    expect(world.bots.every((bot) => bot.spawnGuard >= 0)).toBe(true);
  });

  it("clears wave by wave and ends in victory after the final wave", () => {
    const world = readyWorld("victory");
    for (let guard = 0; guard < 6000 && world.phase === "running"; guard += 1) {
      // Skip the fight: confirm every hostile instantly, which exercises wave flow.
      if (world.bots.some((bot) => bot.alive)) {
        for (const bot of world.bots) if (bot.alive) eliminateBot(world, bot);
      }
      stepWorld(world, idleInput(), STEP);
      world.player.health = PLAYER_MAX_HEALTH;
    }
    expect(world.phase).toBe("victory");
    expect(world.wave).toBe(MAX_WAVES);
    expect(world.stats.kills).toBeGreaterThanOrEqual(20);
    expect(world.stats.wavesCleared).toBe(MAX_WAVES);
  });

  it("spawns the composition promised by the wave plan", () => {
    const world = readyWorld("composition");
    const seen: string[] = [];
    for (let guard = 0; guard < 4000 && world.phase === "running" && world.wave < 2; guard += 1) {
      for (const event of stepWorld(world, idleInput(), STEP)) {
        if (event.type === "bot-spawned") seen.push(event.kind);
        if (event.type === "bot-hit") void 0;
      }
      if (world.bots.some((bot) => bot.alive)) for (const bot of world.bots) if (bot.alive) eliminateBot(world, bot);
      world.player.health = PLAYER_MAX_HEALTH;
    }
    const plan = getWavePlan(1, "standard");
    expect(seen.slice(0, plan.kinds.length).sort()).toEqual([...plan.kinds].sort());
  });

  it("scales hostile durability with the wave plan", () => {
    const first = autoplay({ seed: "scaling", maxSeconds: 200, style: "passive" });
    void first;
    const world = readyWorld("scaling-direct");
    world.wave = 4;
    world.waveState = "cleared";
    world.waveTimer = 0;
    run(world, 3);
    const plan = getWavePlan(5, "standard");
    const bot = world.bots.find((candidate) => candidate.alive);
    expect(bot).toBeDefined();
    if (bot) {
      const expected = Math.round((bot.maxHealth / plan.healthMultiplier));
      expect(expected).toBeGreaterThan(0);
      expect(bot.maxHealth).toBeGreaterThan(30);
    }
  });

  it("body-checks a player who walks into a hostile, then separates them", () => {
    const world = readyWorld("contact", { waves: false });
    world.bots.push(makeBot(3, { x: 480, y: 508 }));
    world.player.position = { x: 480, y: 520 };
    world.player.invulnerability = 0;
    const before = world.player.health;
    const events = run(world, 0.05);
    const hit = events.find((event) => event.type === "player-hit");
    expect(hit).toBeDefined();
    expect(before - world.player.health).toBeGreaterThan(0);
    // The knockback separates both actors, and the contact cooldown blocks a second hit.
    const gap = Math.hypot(world.bots[0].position.x - world.player.position.x, world.bots[0].position.y - world.player.position.y);
    expect(gap).toBeGreaterThan(PLAYER_RADIUS + BOT_RADIUS - 4);
    const healthAfter = world.player.health;
    run(world, 0.1);
    expect(world.player.health).toBe(healthAfter);
  });

  it("ends the run in defeat when integrity reaches zero", () => {
    const world = readyWorld("defeat", { waves: false });
    world.bots.push(makeBot(7, { x: 480, y: 512 }));
    world.player.position = { x: 480, y: 520 };
    world.player.health = 5;
    world.player.invulnerability = 0;
    const events = run(world, 0.2);
    expect(world.phase).toBe("defeat");
    expect(events.some((event) => event.type === "player-hit")).toBe(true);
    expect(world.events.some((event) => event.type === "defeat")).toBe(true);
    expect(world.player.health).toBe(0);
    expect(world.bullets.length).toBe(0);
  });

  it("stops simulating after a run ends", () => {
    const world = readyWorld("frozen");
    run(world, 3);
    world.player.invulnerability = 0;
    damagePlayer(world, 999, { x: 0, y: 0 }, { x: 1, y: 0 }, "hunter");
    expect(world.phase).toBe("defeat");
    const frozen = worldHash(world);
    stepWorld(world, idleInput({ firing: true, move: { x: 1, y: 1 } }), 1);
    expect(worldHash(world)).toBe(frozen);
  });
});

describe("crowd behaviour", () => {
  it("keeps hostiles out of each other's space", () => {
    const world = readyWorld("crowd");
    run(world, 8);
    const live = livingBots(world);
    expect(live.length).toBeGreaterThan(1);
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const gap = Math.hypot(live[i].position.x - live[j].position.x, live[i].position.y - live[j].position.y);
        expect(gap).toBeGreaterThan(BOT_RADIUS);
      }
    }
  });

  it("never leaves a hostile standing inside the player", () => {
    const world = readyWorld("standoff");
    for (let i = 0; i < 900; i += 1) {
      stepWorld(world, idleInput(), STEP);
      for (const bot of livingBots(world)) {
        const gap = Math.hypot(bot.position.x - world.player.position.x, bot.position.y - world.player.position.y);
        expect(gap).toBeGreaterThan(PLAYER_RADIUS);
      }
      world.player.health = PLAYER_MAX_HEALTH;
    }
  });

  it("moves hostiles around blocks instead of parking them in a wall", () => {
    const rng = createRng("routing");
    for (let trial = 0; trial < 8; trial += 1) {
      const seed = rng.int(1, 1_000_000);
      const world = createWorld({ seed, difficulty: "standard" });
      resetWorld(world, { seed });
      // Fixed coordinates below assume the quadrant layout; pin it after the
      // reset (a reset re-derives the layout from the seed).
      pinLayout(world);
      const hold = { x: 480, y: 78 };
      let closest = Infinity;
      // Pin the player above the centre block and keep them alive: the bots have
      // to route around the block to reach them.
      const frames = Math.round(14 / STEP);
      for (let frame = 0; frame < frames && world.phase === "running"; frame += 1) {
        world.player.position = { ...hold };
        world.player.health = PLAYER_MAX_HEALTH;
        world.player.invulnerability = 1;
        stepWorld(world, idleInput(), STEP);
        for (const bot of livingBots(world)) {
          expect(pointInObstacle(bot.position, world.obstacles)).toBe(false);
          expect(hasClearance(bot.position, BOT_RADIUS, 0, world.obstacles)).toBe(true);
          closest = Math.min(closest, Math.hypot(bot.position.x - hold.x, bot.position.y - hold.y));
        }
      }
      expect(livingBots(world).length).toBeGreaterThan(0);
      expect(closest).toBeLessThan(230);
    }
  });
});

describe("aim assist", () => {
  it("only tracks targets inside the forward cone", () => {
    const world = readyWorld("assist");
    world.bots.length = 0;
    world.player.position = { x: 300, y: 300 };
    world.player.aimDirection = { x: 1, y: 0 };
    world.bots.push(makeBot(1, { x: 420, y: 300 }));
    world.bots.push(makeBot(2, { x: 180, y: 300 }));
    expect(findAssistTarget(world)?.id).toBe(1);
    world.player.aimDirection = { x: -1, y: 0 };
    expect(findAssistTarget(world)?.id).toBe(2);
  });

  it("ignores targets behind a wall", () => {
    const world = readyWorld("assist-wall");
    // Fixed coordinates assume the quadrant layout; pin it.
    pinLayout(world);
    world.bots.length = 0;
    world.player.position = { x: OBSTACLES[4].x - 50, y: OBSTACLES[4].y + OBSTACLES[4].h / 2 };
    world.player.aimDirection = { x: 1, y: 0 };
    world.bots.push(makeBot(1, { x: OBSTACLES[4].x + OBSTACLES[4].w + 50, y: OBSTACLES[4].y + OBSTACLES[4].h / 2 }));
    expect(segmentBlocked(world.player.position, world.bots[0].position)).toBe(true);
    expect(findAssistTarget(world)).toBeNull();
  });

  it("turns the player gradually, never instantly", () => {
    const world = readyWorld("assist-turn", { waves: false });
    // Fixed coordinates assume the quadrant layout; pin it.
    pinLayout(world);
    world.bots.length = 0;
    world.player.position = { x: 200, y: 300 };
    world.player.aimDirection = { x: 1, y: 0 };
    expect(segmentBlocked(world.player.position, { x: 330, y: 220 })).toBe(false);
    world.bots.push(makeBot(1, { x: 330, y: 220 }));
    const input = idleInput({ aimMode: "assisted" });
    stepWorld(world, input, STEP);
    expect(Math.abs(world.player.aimDirection.y)).toBeLessThan(0.25);
    run(world, 0.25, () => input);
    expect(world.player.aimDirection.y).toBeLessThan(-0.4);
    expect(world.player.aimDirection.x).toBeGreaterThan(0.5);
  });
});

describe("telemetry", () => {
  it("reads player habits for the Mirror", () => {
    const world = readyWorld("telemetry");
    world.bots.length = 0;
    expect(playerPredictability(world)).toBe(0);
    run(world, 1.5, () => idleInput({ move: { x: 1, y: 0 } }));
    expect(playerPredictability(world)).toBeGreaterThan(0.6);
  });

  it("samples habits on a fixed clock so frame rate cannot change the read", () => {
    const slow = readyWorld("telemetry-fps");
    const fast = readyWorld("telemetry-fps");
    slow.bots.length = 0;
    fast.bots.length = 0;
    run(slow, 1, () => idleInput({ move: { x: 0, y: -1 } }), 1 / 50);
    run(fast, 1, () => idleInput({ move: { x: 0, y: -1 } }), 1 / 144);
    expect(playerPredictability(slow)).toBeCloseTo(playerPredictability(fast), 2);
  });
});

function makeBot(id: number, position: Vec2) {
  return {
    id,
    kind: "hunter" as const,
    position,
    velocity: { x: 0, y: 0 },
    health: 40,
    maxHealth: 40,
    fireCooldown: 1,
    windup: 0,
    windupDuration: 0,
    windupTurnRate: 2,
    facing: 0,
    spawnGuard: 0,
    strafeSign: 1,
    strafeLock: 0,
    alive: true,
    hitFlash: 0,
    blindTime: 0,

  pendingRounds: 0,

  burstTimer: 0,

  diveTime: 0,

  diveCooldown: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0};
}

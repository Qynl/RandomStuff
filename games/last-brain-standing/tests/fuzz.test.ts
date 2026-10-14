import { describe, expect, it } from "vitest";
import { OBSTACLES, pointInObstacle, WORLD } from "../src/arena";
import { BOT_RADIUS, DIFFICULTY_ORDER, PLAYER_MAX_HEALTH, PLAYER_RADIUS } from "../src/constants";
import { createRng } from "../src/rng";
import { createWorld, resetWorld, stepWorld, type SimInput, type World } from "../src/sim";
import type { Vec2 } from "../src/types";

/**
 * Adversarial input sweep.
 *
 * The balance sweep plays the game well; this one plays it badly on purpose.
 * Every frame is fed deliberately awkward input - aim exactly on the player
 * (which normalizes to a zero vector), dash into walls, directions with huge
 * magnitudes, teleporting aim points - and the invariants below have to hold for
 * thousands of frames across several seeds. It is the net that catches NaN
 * leaks, agents stuck inside geometry and runaway state growth that a scripted
 * playtest would never produce.
 */

interface FuzzStats {
  frames: number;
  maxEventsInAFrame: number;
  maxBullets: number;
  maxBots: number;
  dashAttempts: number;
  zeroAimFrames: number;
  maxAbsVelocity: number;
  /** Human readable invariant breaks, capped so a systematic failure stays readable. */
  violations: string[];
}

const MAX_VIOLATIONS = 12;

/** Collects invariant breaks instead of throwing per frame: a fuzz loop must stay fast. */
function checkInvariants(world: World, frame: number, stats: FuzzStats): void {
  if (stats.violations.length >= MAX_VIOLATIONS) return;
  const note = (message: string) => {
    if (stats.violations.length < MAX_VIOLATIONS) stats.violations.push(`frame ${frame}: ${message}`);
  };

  const player = world.player;
  if (!isFiniteVec(player.position) || !isFiniteVec(player.velocity) || !isFiniteVec(player.aimDirection)) note("player vectors are not finite");
  if (!Number.isFinite(player.health) || player.health < 0 || player.health > PLAYER_MAX_HEALTH) note(`player health ${player.health}`);
  if (world.phase === "running") {
    if (pointInObstacle(player.position, world.obstacles)) note(`player inside a block at ${JSON.stringify(player.position)}`);
    if (!insideWorld(player.position, PLAYER_RADIUS - 2)) note(`player outside the arena at ${JSON.stringify(player.position)}`);
  }

  for (const bot of world.bots) {
    if (!bot.alive) continue;
    if (!isFiniteVec(bot.position) || !isFiniteVec(bot.velocity)) note(`bot ${bot.id} vectors are not finite`);
    if (bot.health > bot.maxHealth) note(`bot ${bot.id} health ${bot.health} > ${bot.maxHealth}`);
    if (!Number.isFinite(bot.windup) || bot.windup < 0) note(`bot ${bot.id} windup ${bot.windup}`);
    if (bot.fireCooldown < 0) note(`bot ${bot.id} cooldown ${bot.fireCooldown}`);
    if (bot.spawnGuard <= 0) {
      if (pointInObstacle(bot.position, world.obstacles)) note(`bot ${bot.id} (${bot.kind}) inside a block`);
      if (!insideWorld(bot.position, BOT_RADIUS - 2)) note(`bot ${bot.id} (${bot.kind}) outside the arena`);
    }
  }

  for (const bullet of world.bullets) {
    if (!isFiniteVec(bullet.position) || !Number.isFinite(bullet.life) || bullet.life <= 0) note("bullet with invalid state");
  }
}

const isFiniteVec = (point: Vec2): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);

const insideWorld = (point: Vec2, radius: number): boolean =>
  point.x >= radius - 1 && point.y >= radius - 1 && point.x <= WORLD.width - radius + 1 && point.y <= WORLD.height - radius + 1;

/** Copies a point into an obstacle to produce a nonsense aim target. */
function fuzzedInput(rng: ReturnType<typeof createRng>, world: World, frame: number): SimInput {
  const roll = rng.next();
  const player = world.player.position;
  let aim: Vec2 = { x: player.x, y: player.y }; // zero-length aim: normalize must survive it
  if (roll > 0.25) {
    const obstacle = OBSTACLES[rng.int(0, OBSTACLES.length - 1)];
    aim = { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2 };
  }
  if (rng.chance(0.1)) {
    aim = { x: rng.range(-5000, 5000), y: rng.range(-5000, 5000) };
  }
  const magnitude = rng.next() < 0.1 ? 40 : 1;
  const angle = rng.range(0, Math.PI * 2);
  return {
    // Deliberately oversized movement vectors and hard reversals.
    move: frame % 7 < 3 ? { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude } : { x: -Math.cos(angle) * magnitude, y: -Math.sin(angle) * magnitude },
    aim,
    firing: rng.chance(0.75),
    dash: rng.chance(0.12),
    aimMode: rng.chance(0.5) ? "assisted" : "mouse"
  };
}

function fuzzRun(seed: string, seconds: number, difficultyDifficulty: (typeof DIFFICULTY_ORDER)[number]): FuzzStats {
  const world = createWorld({ seed, difficulty: difficultyDifficulty });
  resetWorld(world, { seed, difficulty: difficultyDifficulty });
  const rng = createRng(`${seed}-inputs`);
  const stats: FuzzStats = {
    frames: 0,
    maxEventsInAFrame: 0,
    maxBullets: 0,
    maxBots: 0,
    dashAttempts: 0,
    zeroAimFrames: 0,
    maxAbsVelocity: 0,
    violations: []
  };

  const steps = Math.round(seconds * 60);
  for (let frame = 0; frame < steps; frame += 1) {
    const input = fuzzedInput(rng, world, frame);
    if (input.dash) stats.dashAttempts += 1;
    if (input.aim.x === world.player.position.x && input.aim.y === world.player.position.y) stats.zeroAimFrames += 1;

    const events = stepWorld(world, input, 1 / 60);
    stats.frames += 1;
    stats.maxEventsInAFrame = Math.max(stats.maxEventsInAFrame, events.length);
    stats.maxBullets = Math.max(stats.maxBullets, world.bullets.length);
    stats.maxBots = Math.max(stats.maxBots, world.bots.filter((bot) => bot.alive).length);

    checkInvariants(world, frame, stats);
    stats.maxAbsVelocity = Math.max(stats.maxAbsVelocity, Math.hypot(world.player.velocity.x, world.player.velocity.y));

    if (world.phase !== "running") break;
  }

  // No leaks: nothing grows without bound during a long adversarial run.
  if (world.bullets.length >= 240) stats.violations.push(`bullet list grew to ${world.bullets.length}`);
  if (world.bots.length >= 64) stats.violations.push(`bot list grew to ${world.bots.length}`);
  if (world.events.length >= 64) stats.violations.push(`event list grew to ${world.events.length}`);
  return stats;
}

describe("adversarial input sweep", () => {
  const seeds = ["fuzz-1", "fuzz-2", "fuzz-3", "fuzz-4"];

  it("survives hostile input on every difficulty without breaking an invariant", () => {
    const report: string[] = [];
    let sawHostiles = 0;
    for (const difficulty of DIFFICULTY_ORDER) {
      for (const seed of seeds) {
        const stats = fuzzRun(seed, 22, difficulty);
        expect(stats.frames).toBeGreaterThan(60);
        expect(stats.maxEventsInAFrame).toBeLessThan(40);
        expect(stats.maxBots).toBeLessThanOrEqual(8);
        expect(stats.maxAbsVelocity).toBeLessThan(5000);
        if (stats.maxBots >= 3) sawHostiles += 1;
        for (const violation of stats.violations) report.push(`${difficulty}/${seed} ${violation}`);
      }
    }
    expect(report).toEqual([]);
    // The sweep has to reach actual combat, not just the opening seconds. The
    // chaotic input usually dies early, so this only has to prove that most runs
    // got far enough to be interesting.
    expect(sawHostiles).toBeGreaterThanOrEqual(8);
  }, 30000);

  it("actually exercises the awkward paths it claims to cover", () => {
    let dashAttempts = 0;
    let zeroAimFrames = 0;
    let maxBullets = 0;
    for (const seed of seeds) {
      const stats = fuzzRun(seed, 22, "standard");
      dashAttempts += stats.dashAttempts;
      zeroAimFrames += stats.zeroAimFrames;
      maxBullets = Math.max(maxBullets, stats.maxBullets);
    }
    // Guards against the generator quietly degenerating into a no-op.
    expect(dashAttempts).toBeGreaterThan(20);
    expect(zeroAimFrames).toBeGreaterThan(20);
    expect(maxBullets).toBeGreaterThan(0);
  }, 30000);

  it("stays deterministic under fuzzed input as well", () => {
    const first = createWorld({ seed: "fuzz-det" });
    const second = createWorld({ seed: "fuzz-det" });
    resetWorld(first, { seed: "fuzz-det" });
    resetWorld(second, { seed: "fuzz-det" });
    const rng = createRng("fuzz-det-inputs");
    for (let frame = 0; frame < 900; frame += 1) {
      const input = fuzzedInput(rng, first, frame);
      const a = stepWorld(first, input, 1 / 60);
      const b = stepWorld(second, input, 1 / 60);
      expect(b.map((event) => JSON.stringify(event))).toEqual(a.map((event) => JSON.stringify(event)));
    }
    expect(second.player.health).toBe(first.player.health);
    expect(second.stats).toEqual(first.stats);
    expect(second.bots.map((bot) => bot.position)).toEqual(first.bots.map((bot) => bot.position));
  });
});

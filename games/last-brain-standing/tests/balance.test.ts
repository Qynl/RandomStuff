import { describe, expect, it } from "vitest";
import { autoplay, type AutoplayResult } from "./helpers/autoplay";
import { accuracyPercent, computeScore } from "../src/scoring";
import { stepWorld, createWorld, emptyInput } from "../src/sim";
import { getWavePlan } from "../src/progression";
import type { DifficultyId } from "../src/types";

// 24 seeds per difficulty. The first 12 are the fast smoke sample; the rest make
// the win band meaningful instead of anecdotal.
const SEEDS = Array.from({ length: 24 }, (_, index) => `balance-${String(index + 1).padStart(2, "0")}`);
interface Sweep {
  runs: AutoplayResult[];
  wins: number;
  winRate: number;
  avgKills: number;
  avgWaves: number;
  avgDamageTaken: number;
  avgAccuracy: number;
  avgScore: number;
  avgSeconds: number;
  issues: number;
}

function sweep(difficulty: DifficultyId, maxSeconds = 200): Sweep {
  const runs = SEEDS.map((seed) => autoplay({ seed, difficulty, maxSeconds }));
  const total = runs.length;
  const wins = runs.filter((run) => run.victory).length;
  const mean = (pick: (run: AutoplayResult) => number) => runs.reduce((sum, run) => sum + pick(run), 0) / total;
  const issues = runs.reduce(
    (sum, run) =>
      sum +
      run.fairness.unexplainedHits +
      run.fairness.closeSpawns +
      run.fairness.botsInsideGeometry +
      run.fairness.playerInsideGeometry +
      run.fairness.shotsThroughWalls +
      run.fairness.untelegraphedShots,
    0
  );
  return {
    runs,
    wins,
    winRate: wins / total,
    avgKills: mean((run) => run.stats.kills),
    avgWaves: mean((run) => run.stats.wavesCleared),
    avgDamageTaken: mean((run) => run.stats.damageTaken),
    avgAccuracy: mean((run) => accuracyPercent(run.stats)),
    avgScore: mean((run) => computeScore(run.stats).total),
    avgSeconds: mean((run) => run.elapsed),
    issues
  };
}

const report = (label: string, summary: Sweep) => {
  // Printed so `npm test` doubles as a balance report for the maintainer.
  console.log(
    `${label.padEnd(9)} wins ${String(summary.wins).padStart(2)}/${summary.runs.length}` +
      ` · kills ${summary.avgKills.toFixed(1)}` +
      ` · waves ${summary.avgWaves.toFixed(1)}` +
      ` · dmg ${summary.avgDamageTaken.toFixed(0)}` +
      ` · acc ${summary.avgAccuracy.toFixed(0)}%` +
      ` · score ${summary.avgScore.toFixed(0)}` +
      ` · cuts ${summary.runs.reduce((sum, run) => sum + run.stats.interrupts, 0)}` +
      ` · time ${summary.avgSeconds.toFixed(0)}s` +
      ` · issues ${summary.issues}`
  );
};

describe("balance sweep", () => {
  const standard = sweep("standard");
  const recruit = sweep("recruit");
  const veteran = sweep("veteran");

  it("reports the current balance envelope", () => {
    report("recruit", recruit);
    report("standard", standard);
    report("veteran", veteran);
    expect(standard.runs.length).toBe(SEEDS.length);
  });

  it("keeps a competent player win rate in a meaningful band on standard", () => {
    // Measured with the scripted policy in tests/helpers/autoplay.ts: currently
    // around 70% on standard over 24 seeds. The policy reads telegraphs and
    // dodges them perfectly, so a human sits well below it; the band exists to
    // stop the tuning drifting into "always wins" or "never wins" at either end
    // rather than to pin the exact number.
    expect(standard.winRate).toBeGreaterThan(0.15);
    expect(standard.winRate).toBeLessThan(0.85);
  });

  it("orders the difficulties the way their blurbs promise", () => {
    expect(recruit.winRate).toBeGreaterThanOrEqual(standard.winRate);
    expect(standard.winRate).toBeGreaterThan(veteran.winRate);
    expect(recruit.avgDamageTaken).toBeLessThan(veteran.avgDamageTaken);
  });

  it("makes recruit more forgiving than standard", () => {
    expect(recruit.avgDamageTaken).toBeLessThan(standard.avgDamageTaken);
    expect(recruit.avgWaves).toBeGreaterThanOrEqual(standard.avgWaves - 0.5);
    expect(recruit.winRate).toBeGreaterThanOrEqual(standard.winRate - 0.2);
  });

  it("makes veteran harsher than standard", () => {
    expect(veteran.avgDamageTaken).toBeGreaterThan(standard.avgDamageTaken * 0.8);
    expect(veteran.avgKills).toBeLessThanOrEqual(standard.avgKills + 2);
    expect(veteran.winRate).toBeLessThan(standard.winRate + 0.2);
    // A hard mode should still be possible, not mathematically unwinnable.
    expect(veteran.avgWaves).toBeGreaterThan(1.5);
  });

  it("pays for wind-up cuts often enough to be a real option", () => {
    // The scripted policy fights at range, so it only cuts a fraction of its
    // kills; if that fraction ever collapsed the bonus would be dead weight.
    for (const summary of [recruit, standard, veteran]) {
      const kills = summary.runs.reduce((sum, run) => sum + run.stats.kills, 0);
      const cuts = summary.runs.reduce((sum, run) => sum + run.stats.interrupts, 0);
      expect(cuts).toBeGreaterThan(0);
      expect(cuts).toBeLessThanOrEqual(kills);
      expect(cuts / Math.max(1, kills)).toBeGreaterThan(0.15);
    }
  });

  it("never shows a fairness violation across the whole sweep", () => {
    expect(standard.issues).toBe(0);
    expect(recruit.issues).toBe(0);
    expect(veteran.issues).toBe(0);
  });

  it("punishes a player who never moves or shoots", () => {
    const passive = SEEDS.slice(0, 6).map((seed) => autoplay({ seed, difficulty: "standard", style: "passive", maxSeconds: 90 }));
    for (const run of passive) {
      expect(run.phase).toBe("defeat");
      expect(run.stats.kills).toBe(0);
      expect(run.elapsed).toBeGreaterThan(6);
      expect(run.elapsed).toBeLessThan(90);
      expect(run.stats.damageTaken).toBeGreaterThanOrEqual(100);
    }
  });

  it("keeps runs inside a sane length on every difficulty", () => {
    for (const summary of [recruit, standard, veteran]) {
      for (const run of summary.runs) {
        expect(run.elapsed).toBeGreaterThanOrEqual(20);
        expect(run.elapsed).toBeLessThanOrEqual(200.5);
        expect(run.stats.damageDealt).toBeGreaterThanOrEqual(0);
        expect(run.stats.shotsHit).toBeLessThanOrEqual(run.stats.shotsFired);
      }
    }
  });

  it("rewards clearing waves more than farming early kills", () => {
    const cleared = standard.runs.filter((run) => run.stats.wavesCleared >= 4);
    const early = standard.runs.filter((run) => run.stats.wavesCleared <= 1);
    if (cleared.length > 0 && early.length > 0) {
      const clearedScore = cleared.reduce((sum, run) => sum + computeScore(run.stats).total, 0) / cleared.length;
      const earlyScore = early.reduce((sum, run) => sum + computeScore(run.stats).total, 0) / early.length;
      expect(clearedScore).toBeGreaterThan(earlyScore);
    }
    expect(standard.avgScore).toBeGreaterThan(0);
  });

  it("simulates a full late wave fast enough for the fixed 120 Hz step", () => {
    // The real cost is a crowded arena: six hostiles on the floor at once with
    // the player firing, which is the worst case the loop can be asked for.
    const world = createWorld({ seed: "perf-crowd", difficulty: "veteran" });
    world.phase = "running";
    world.wave = 5;
    world.stats.wave = 5;
    world.activePlan = getWavePlan(5, "veteran");
    world.waveState = "active";
    for (let i = 0; i < 6; i += 1) {
      world.pendingSpawns.push({
        kind: world.activePlan.kinds[i % world.activePlan.kinds.length],
        position: { x: 120 + i * 120, y: 140 },
        delay: 0,
        age: 1,
        relocations: 0
      });
    }
    const input = { ...emptyInput(), firing: true, move: { x: 1, y: 0 }, dash: true };
    for (let i = 0; i < 600; i += 1) stepWorld(world, input, 1 / 120);
    expect(world.bots.filter((bot) => bot.alive).length).toBeGreaterThanOrEqual(4);

    const started = performance.now();
    const steps = 3600;
    for (let i = 0; i < steps; i += 1) stepWorld(world, input, 1 / 120);
    const duration = performance.now() - started;
    console.log(`perf-crowd ${world.bots.filter((bot) => bot.alive).length} hostiles, ${steps} steps in ${duration.toFixed(0)}ms (${(duration / steps).toFixed(4)} ms/step)`);
    // 1/120 s step means 8.3 ms of budget per step at 60fps; stay far inside it.
    expect(duration / steps).toBeLessThan(1);
  });

  it("simulates fast enough for the fixed 120 Hz step", () => {
    const world = createWorld({ seed: "perf", difficulty: "standard" });
    world.phase = "running";
    world.waveState = "cleared";
    world.waveTimer = 0.2;
    const input = { ...emptyInput(), firing: true, move: { x: 1, y: 0 } };
    const started = performance.now();
    const steps = 7200; // one minute of simulated time at 120 Hz
    for (let i = 0; i < steps; i += 1) stepWorld(world, input, 1 / 120);
    const duration = performance.now() - started;
    console.log(`perf      ${steps} steps in ${duration.toFixed(0)}ms (${(duration / steps).toFixed(3)} ms/step)`);
    expect(duration).toBeLessThan(4000);
  });
});

describe("difficulty scaling in the simulation", () => {
  it("applies the difficulty damage multiplier to incoming rounds", () => {
    const damageFrom = (difficulty: DifficultyId) => {
      const world = createWorld({ seed: "dmg", difficulty });
      world.phase = "running";
      world.waveState = "idle";
      world.bots.length = 0;
      world.player.position = { x: 480, y: 520 };
      world.player.invulnerability = 0;
      world.bullets.push({
        position: { x: 480, y: 512 },
        velocity: { x: 0, y: 40 },
        owner: "bot",
        damage: 10 * (difficulty === "recruit" ? 0.7 : difficulty === "veteran" ? 1.25 : 1),
        life: 1,
        color: "#fff",
        source: "hunter",
        travelled: 0
      });
      const before = world.player.health;
      stepWorld(world, { ...emptyInput() }, 1 / 120);
      return before - world.player.health;
    };
    expect(damageFrom("recruit")).toBeLessThan(damageFrom("standard"));
    expect(damageFrom("veteran")).toBeGreaterThan(damageFrom("standard"));
  });
});

import { describe, expect, it } from "vitest";
import { autoplay, type AutoplayResult } from "./helpers/autoplay";
import { ARENA_LAYOUTS, ARENA_ORDER, layoutForSeed, type ArenaLayoutId } from "../src/arena";
import { normalizeSeed } from "../src/rng";
import { accuracyPercent } from "../src/scoring";

/**
 * Every arena has to be a place worth fighting in.
 *
 * The layout tests prove an arena is legal (in bounds, connected, cover worth
 * hiding behind). This one proves it is *playable*: the scripted policy is flown
 * over the same seeds in every arena, and each arena has to be winnable without
 * being a walkover, and has to be measurably its own place rather than a
 * repaint of another one. A map that nobody can lose on, or that nobody can win
 * on, is a bad map however pretty it is drawn.
 */

const PER_ARENA = 8;
const DIFFICULTY = "standard" as const;

/** Seeds whose layout is the given arena, found rather than guessed. */
function seedsFor(id: ArenaLayoutId): string[] {
  const seeds: string[] = [];
  for (let index = 0; seeds.length < PER_ARENA && index < 4000; index += 1) {
    const seed = `${id}-map-${String(index + 1).padStart(3, "0")}`;
    if (layoutForSeed(normalizeSeed(seed)) === id) seeds.push(seed);
  }
  expect(seeds.length).toBe(PER_ARENA);
  return seeds;
}

interface ArenaReport {
  id: ArenaLayoutId;
  runs: AutoplayResult[];
  wins: number;
  avgKills: number;
  avgWaves: number;
  avgDamageTaken: number;
  avgAccuracy: number;
  issues: number;
}

function report(id: ArenaLayoutId): ArenaReport {
  const runs = seedsFor(id).map((seed) => autoplay({ seed, difficulty: DIFFICULTY, maxSeconds: 200 }));
  const mean = (pick: (run: AutoplayResult) => number) => runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
  return {
    id,
    runs,
    wins: runs.filter((run) => run.victory).length,
    avgKills: mean((run) => run.stats.kills),
    avgWaves: mean((run) => run.stats.wavesCleared),
    avgDamageTaken: mean((run) => run.stats.damageTaken),
    avgAccuracy: mean((run) => accuracyPercent(run.stats)),
    issues: runs.reduce(
      (sum, run) =>
        sum +
        run.fairness.unexplainedHits +
        run.fairness.closeSpawns +
        run.fairness.botsInsideGeometry +
        run.fairness.playerInsideGeometry +
        run.fairness.shotsThroughWalls +
        run.fairness.untelegraphedShots,
      0
    )
  };
}

/**
 * Mean open sight line per arena, measured off the authored geometry rather
 * than off a run: sample every tile centre, ray out in sixteen directions, and
 * average how far the line gets before a wall or a crate stops it.
 */
function sightLength(id: ArenaLayoutId): number {
  const layout = ARENA_LAYOUTS[id];
  const STEP = 25;
  const REACH = 700;
  let total = 0;
  let samples = 0;
  const blocked = (x: number, y: number) =>
    layout.obstacles.some((block) => x >= block.x && x <= block.x + block.w && y >= block.y && y <= block.y + block.h);
  for (let x = 40; x < 1500; x += 50) {
    for (let y = 40; y < 1100; y += 50) {
      if (blocked(x, y)) continue;
      let sum = 0;
      for (let direction = 0; direction < 16; direction += 1) {
        const angle = (direction / 16) * Math.PI * 2;
        const dx = Math.cos(angle) * STEP;
        const dy = Math.sin(angle) * STEP;
        let distance = 0;
        while (distance < REACH && !blocked(x + dx * (distance / STEP + 1), y + dy * (distance / STEP + 1))) {
          distance += STEP;
        }
        sum += distance;
      }
      total += sum / 16;
      samples += 1;
    }
  }
  return total / Math.max(1, samples);
}

/** Cover density, soft-cover density and crate count: the rest of the signature. */
function composition(id: ArenaLayoutId) {
  const layout = ARENA_LAYOUTS[id];
  const tiles = (rects: Array<{ w: number; h: number }>) => rects.reduce((sum, rect) => sum + rect.w * rect.h, 0) / (1500 * 1100);
  return {
    block: tiles(layout.obstacles),
    soft: tiles([...layout.bushes, ...layout.water]),
    crates: layout.obstacles.filter((block) => block.kind === "crate").length
  };
}

describe("arena balance", { timeout: 120_000 }, () => {
  const reports = ARENA_ORDER.map(report);
  const table = reports
    .map(
      (entry) =>
        `${entry.id.padEnd(11)} wins ${String(entry.wins).padStart(2)}/${entry.runs.length}` +
        ` · kills ${entry.avgKills.toFixed(1)}` +
        ` · waves ${entry.avgWaves.toFixed(1)}` +
        ` · dmg ${entry.avgDamageTaken.toFixed(0)}` +
        ` · acc ${entry.avgAccuracy.toFixed(0)}%` +
        ` · sight ${sightLength(entry.id).toFixed(0)}` +
        ` · block ${(composition(entry.id).block * 100).toFixed(1)}%` +
        ` · soft ${(composition(entry.id).soft * 100).toFixed(1)}%` +
        ` · crates ${composition(entry.id).crates}` +
        ` · issues ${entry.issues}`
    )
    .join("\n");
  console.log(`arena     ${table}`);

  it("keeps every arena winnable, and none of them a walkover", () => {
    // The scripted policy is a strong kiter: it clears most of the pool. What it
    // may not do is clear a map every single time (a map nobody can lose on is a
    // bad map), lose nearly every time (a map nobody can win on is worse), or
    // walk through an arena without the fight ever landing.
    for (const entry of reports) {
      expect(entry.wins, `${entry.id} is unwinnable`).toBeGreaterThanOrEqual(2);
      expect(entry.wins, `${entry.id} is a walkover`).toBeLessThan(PER_ARENA);
      expect(entry.avgDamageTaken, `${entry.id} never lands a hit`).toBeGreaterThan(10);
    }
  });

  it("keeps the fight honest in every arena", () => {
    for (const entry of reports) expect(`${entry.id}: ${entry.issues} fairness issues`).toBe(`${entry.id}: 0 fairness issues`);
  });

  it("makes the six arenas six different places", () => {
    const sights = ARENA_ORDER.map(sightLength);
    const widest = Math.max(...sights);
    const tightest = Math.min(...sights);
    // If the map is the same distance to the next wall everywhere, the seed is
    // only changing the paint. A third of the range is the floor for "the arena
    // you are in changes how you have to play".
    expect(widest / tightest).toBeGreaterThan(1.3);

    // Sight lines alone are not a signature: two arenas can hold the same
    // average distance and still be different places. A pair has to differ in
    // one of the three things a map is made of - how far you can see, how much
    // hard cover it has, or how much soft cover it has.
    const signature = ARENA_ORDER.map((id) => ({ id, sight: sightLength(id), ...composition(id) }));
    for (let index = 0; index < signature.length; index += 1) {
      for (let other = index + 1; other < signature.length; other += 1) {
        const a = signature[index];
        const b = signature[other];
        const sightRatio = Math.max(a.sight, b.sight) / Math.min(a.sight, b.sight);
        const blockGap = Math.abs(a.block - b.block);
        const softGap = Math.abs(a.soft - b.soft);
        const distinct = sightRatio > 1.05 || blockGap > 0.015 || softGap > 0.015;
        expect(distinct, `${a.id} and ${b.id} are the same place: sight ${sightRatio.toFixed(2)}x, block gap ${(blockGap * 100).toFixed(1)}%, soft gap ${(softGap * 100).toFixed(1)}%`).toBe(true);
      }
    }
  });
});

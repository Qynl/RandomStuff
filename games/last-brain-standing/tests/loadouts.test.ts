import { describe, expect, it } from "vitest";
import {
  CAREER_RANKS,
  careerScore,
  DEFAULT_LOADOUT,
  isLoadoutId,
  isUnlocked,
  LOADOUTS,
  LOADOUT_ORDER,
  nextLockedLoadout,
  nextRank,
  rankFor,
  resolveLoadout,
  unlockProgress,
  unlockedLoadouts
} from "../src/loadouts";
import { emptyInput, resetWorld, setWorldLoadout, stepWorld, createWorld } from "../src/sim";
import { PLAYER_BULLET_DAMAGE, PLAYER_FIRE_INTERVAL } from "../src/constants";

/**
 * Loadouts are the player's side of the difficulty curve: three weapons with
 * genuinely different play patterns, gated behind career score.
 */
describe("loadout catalogue", () => {
  it("keeps every weapon complete and distinct", () => {
    const signatures = new Set<string>();
    for (const id of LOADOUT_ORDER) {
      const weapon = LOADOUTS[id];
      expect(weapon.id).toBe(id);
      expect(weapon.name.length).toBeGreaterThan(4);
      expect(weapon.tagline.length).toBeGreaterThan(10);
      expect(weapon.counter.length).toBeGreaterThan(10);
      expect(weapon.shots).toBeGreaterThanOrEqual(1);
      expect(weapon.damage).toBeGreaterThan(0);
      expect(weapon.fireInterval).toBeGreaterThan(0.05);
      expect(weapon.bulletSpeed).toBeGreaterThan(300);
      expect(weapon.bulletLife).toBeGreaterThan(0.2);
      expect(weapon.recoil).toBeGreaterThan(0);
      signatures.add(`${weapon.shots}:${weapon.damage}:${weapon.fireInterval}`);
    }
    // No two weapons may be a reskin of each other.
    expect(signatures.size).toBe(LOADOUT_ORDER.length);
    expect(LOADOUT_ORDER.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the balance promise each weapon makes", () => {
    const rifle = LOADOUTS.rifle;
    const scatter = LOADOUTS.scatter;
    const rail = LOADOUTS.rail;
    // Shot-for-shot: the rail hits hardest and fires slowest, the scattergun
    // trades per-pellet damage for pellet count and a wide spread.
    expect(rail.damage).toBeGreaterThan(rifle.damage);
    expect(rail.fireInterval).toBeGreaterThan(rifle.fireInterval);
    expect(scatter.shots).toBeGreaterThan(1);
    expect(scatter.spread).toBeGreaterThan(0);
    expect(scatter.damage).toBeLessThan(rifle.damage);
    // Burst damage stays in the same ballpark so no weapon trivialises a wave.
    for (const id of LOADOUT_ORDER) {
      const weapon = LOADOUTS[id];
      const burst = (weapon.shots * weapon.damage) / weapon.fireInterval;
      expect(burst).toBeGreaterThan(30);
      expect(burst).toBeLessThan(140);
    }
    // The default is the one everyone starts with.
    expect(LOADOUTS[DEFAULT_LOADOUT].unlockScore).toBe(0);
  });

  it("gates the ladder on career score, in order", () => {
    const thresholds = LOADOUT_ORDER.map((id) => LOADOUTS[id].unlockScore);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(new Set(thresholds).size).toBe(thresholds.length);
    expect(unlockedLoadouts(0)).toEqual(["rifle"]);
    expect(unlockedLoadouts(4500)).toContain("scatter");
    expect(unlockedLoadouts(11000)).toEqual(LOADOUT_ORDER);
  });

  it("sums the best score of every threat level into a career score", () => {
    expect(careerScore({})).toBe(0);
    expect(careerScore({ standard: { score: 1000 } })).toBe(1000);
    expect(careerScore({ recruit: { score: 900 }, standard: { score: 1200 }, veteran: { score: 300 } })).toBe(2400);
    // Junk, negatives and non-numbers are ignored rather than poisoning the sum.
    expect(careerScore({ recruit: { score: -50 }, standard: { score: Number.NaN }, veteran: { score: 400 } })).toBe(400);
    expect(careerScore({ bogus: { score: 999 } })).toBe(999);
  });

  it("reports unlock progress honestly", () => {
    expect(unlockProgress("rifle", 0)).toBe(1);
    expect(unlockProgress("scatter", 0)).toBe(0);
    expect(unlockProgress("scatter", 2250)).toBeCloseTo(0.5, 2);
    expect(unlockProgress("scatter", 99999)).toBe(1);
    expect(nextLockedLoadout(0)).toBe("scatter");
    expect(nextLockedLoadout(5000)).toBe("rail");
    expect(nextLockedLoadout(999999)).toBeNull();
  });

  it("ignores unknown ids and refuses to cheat a locked weapon in", () => {
    expect(isLoadoutId("rifle")).toBe(true);
    expect(isLoadoutId("railgun")).toBe(false);
    expect(isLoadoutId(7)).toBe(false);
    expect(resolveLoadout("scatter", 0)).toBe("rifle");
    expect(resolveLoadout("scatter", 4500)).toBe("scatter");
    expect(resolveLoadout("nonsense", 99999)).toBe("rifle");
    expect(resolveLoadout(undefined, 99999)).toBe("rifle");
    expect(isUnlocked("rail", 10999)).toBe(false);
    expect(isUnlocked("rail", 11000)).toBe(true);
  });

  it("ranks the operator by career score, with a next goal", () => {
    expect(rankFor(0).name).toBe("RECRUIT");
    expect(rankFor(2999).name).toBe("RECRUIT");
    expect(rankFor(3000).name).toBe("OPERATOR");
    expect(rankFor(999999).name).toBe(CAREER_RANKS[CAREER_RANKS.length - 1].name);
    // Ranks ascend and the path is walkable.
    for (let index = 1; index < CAREER_RANKS.length; index += 1) {
      expect(CAREER_RANKS[index].threshold).toBeGreaterThan(CAREER_RANKS[index - 1].threshold);
    }
    expect(nextRank(0)?.name).toBe("OPERATOR");
    expect(nextRank(999999)).toBeNull();
  });
});

describe("loadouts in the simulation", () => {
  const fire = (id: "rifle" | "scatter" | "rail") => {
    const world = createWorld({ seed: `loadout-${id}` });
    resetWorld(world, { seed: `loadout-${id}` });
    setWorldLoadout(world, id, Number.POSITIVE_INFINITY);
    world.waveState = "idle";
    world.player.position = { x: 480, y: 520 };
    world.player.aimDirection = { x: 0, y: -1 };
    // Fire a single shot with a clean input, then look at what came out.
    stepWorld(world, { ...emptyInput(), firing: true }, 1 / 120);
    return world;
  };

  it("fires the weapon's own round profile", () => {
    const rifle = fire("rifle");
    expect(rifle.bullets.length).toBe(1);
    expect(rifle.bullets[0].damage).toBe(PLAYER_BULLET_DAMAGE);

    const scatter = fire("scatter");
    expect(scatter.bullets.length).toBe(LOADOUTS.scatter.shots);
    expect(scatter.bullets.every((bullet) => bullet.damage === LOADOUTS.scatter.damage)).toBe(true);
    // A fan, not a stack: the pellets must have different headings.
    const headings = new Set(scatter.bullets.map((bullet) => Math.round(Math.atan2(bullet.velocity.y, bullet.velocity.x) * 1000)));
    expect(headings.size).toBe(LOADOUTS.scatter.shots);
    // And a shotgun's pellets die quickly, which is what makes range matter.
    expect(Math.max(...scatter.bullets.map((bullet) => bullet.life))).toBeLessThan(Math.min(rifle.bullets[0].life, LOADOUTS.scatter.bulletLife + 0.01));

    const rail = fire("rail");
    expect(rail.bullets.length).toBe(1);
    expect(rail.bullets[0].damage).toBeGreaterThan(rifle.bullets[0].damage);
    expect(Math.hypot(rail.bullets[0].velocity.x, rail.bullets[0].velocity.y)).toBeGreaterThan(
      Math.hypot(rifle.bullets[0].velocity.x, rifle.bullets[0].velocity.y)
    );

    // Rate of fire is enforced by the weapon, not the input.
    for (const id of ["rifle", "scatter", "rail"] as const) {
      const world = fire(id);
      expect(world.player.fireCooldown).toBeCloseTo(LOADOUTS[id].fireInterval, 5);
    }
    expect(LOADOUTS.rail.fireInterval).toBeGreaterThan(PLAYER_FIRE_INTERVAL);
  });

  it("counts every pellet as a shot so accuracy stays honest", () => {
    const scatter = fire("scatter");
    expect(scatter.stats.shotsFired).toBe(LOADOUTS.scatter.shots);
    const rifle = fire("rifle");
    expect(rifle.stats.shotsFired).toBe(1);
  });

  it("resolves an unknown or locked choice back to the default", () => {
    const world = createWorld({ seed: "loadout-guard" });
    expect(setWorldLoadout(world, "nonsense", 99999).id).toBe(DEFAULT_LOADOUT);
    expect(setWorldLoadout(world, "rail", 0).id).toBe(DEFAULT_LOADOUT);
    expect(setWorldLoadout(world, "rail", 11000).id).toBe("rail");
  });
});

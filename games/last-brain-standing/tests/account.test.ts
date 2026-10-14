import { describe, expect, it } from "vitest";
import {
  badgeStatuses,
  BADGES,
  EMPTY_BADGE_CONTEXT,
  emptyWeaponRecords,
  recordRun,
  type BadgeContext
} from "../src/account";
import { LOADOUT_ORDER } from "../src/loadouts";

/**
 * The account layer: per-weapon service records and the badge shelf. Both are
 * pure state descriptions, so they are testable without a browser.
 */
describe("weapon records", () => {
  it("starts every weapon at zero, in picker order", () => {
    const records = emptyWeaponRecords();
    expect(Object.keys(records)).toEqual(LOADOUT_ORDER);
    for (const id of LOADOUT_ORDER) {
      expect(records[id]).toEqual({ runs: 0, kills: 0, bestScore: 0, victories: 0 });
    }
  });

  it("accumulates runs, keeps the best score and counts clears", () => {
    const records = emptyWeaponRecords();
    recordRun(records.rifle, { kills: 12, score: 3000, victory: false });
    recordRun(records.rifle, { kills: 15, score: 2500, victory: true });
    expect(records.rifle.runs).toBe(2);
    expect(records.rifle.kills).toBe(27);
    expect(records.rifle.bestScore).toBe(3000);
    expect(records.rifle.victories).toBe(1);
    // A blank run still counts, but cannot lower anything.
    recordRun(records.rifle, { kills: 0, score: 0, victory: false });
    expect(records.rifle.runs).toBe(3);
    expect(records.rifle.bestScore).toBe(3000);
  });

  it("ignores nonsense values instead of corrupting the record", () => {
    const records = emptyWeaponRecords();
    recordRun(records.scatter, { kills: -5, score: Number.NaN, victory: false });
    expect(records.scatter.kills).toBe(0);
    expect(Number.isFinite(records.scatter.bestScore)).toBe(true);
    expect(records.scatter.bestScore).toBe(0);
  });

  it("keeps records per weapon rather than pooling them", () => {
    const records = emptyWeaponRecords();
    recordRun(records.rail, { kills: 9, score: 900, victory: true });
    expect(records.rail.kills).toBe(9);
    expect(records.rifle.kills).toBe(0);
    expect(records.scatter.kills).toBe(0);
  });
});

describe("badges", () => {
  const base: BadgeContext = { ...EMPTY_BADGE_CONTEXT };
  const status = (context: Partial<BadgeContext>) =>
    badgeStatuses({ ...base, ...context });

  it("describes every badge with a requirement and a progress rule", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(6);
    for (const badge of BADGES) {
      expect(badge.id.length).toBeGreaterThan(2);
      expect(badge.name).toBe(badge.name.toUpperCase());
      expect(badge.requirement.length).toBeGreaterThan(10);
      expect(badge.progress(base)).toBeGreaterThanOrEqual(0);
      expect(badge.progress(base)).toBeLessThanOrEqual(1);
    }
    // Ids are unique, so the UI can key on them.
    expect(new Set(BADGES.map((badge) => badge.id)).size).toBe(BADGES.length);
  });

  it("earns nothing on an empty career", () => {
    const statuses = status({});
    expect(statuses.every((entry) => !entry.earned)).toBe(true);
    expect(statuses.every((entry) => entry.progress >= 0 && entry.progress <= 1)).toBe(true);
  });

  it("earns each badge from its own condition, and only its own", () => {
    const earnedIds = (context: Partial<BadgeContext>) => status(context).filter((entry) => entry.earned).map((entry) => entry.id);
    expect(earnedIds({ runs: 1 })).toEqual(["first-run"]);
    expect(earnedIds({ bestAccuracy: 80 })).toEqual(["marksman"]);
    expect(earnedIds({ bestCombo: 5 })).toEqual(["chain"]);
    expect(earnedIds({ interrupts: 5 })).toEqual(["interrupter"]);
    expect(earnedIds({ arenasCleared: ["LANES", "PILLARS", "DIAMOND"] })).toEqual(["tourist"]);
    expect(earnedIds({ levelsCleared: ["recruit", "standard", "veteran"] })).toEqual(["all-levels"]);
    expect(earnedIds({ perfectVictories: 1 })).toEqual(["untouchable"]);
    expect(earnedIds({ unlocks: LOADOUT_ORDER.length })).toEqual(["gun-metal"]);
    expect(earnedIds({ careerScore: 20000 })).toEqual(["centurion"]);
  });

  it("reports partial progress for locked badges", () => {
    const chain = status({ bestCombo: 2 }).find((entry) => entry.id === "chain");
    expect(chain?.earned).toBe(false);
    expect(chain?.progress).toBeCloseTo(0.4, 5);
    const centurion = status({ careerScore: 5000 }).find((entry) => entry.id === "centurion");
    expect(centurion?.progress).toBeCloseTo(0.25, 5);
  });

  it("never reports progress outside 0..1, even for absurd state", () => {
    const absurd = status({
      runs: 999,
      kills: 999999,
      careerScore: 10_000_000,
      bestCombo: 400,
      interrupts: 5000,
      perfectVictories: 99,
      victories: 99,
      unlocks: 99,
      arenasCleared: ["A", "B", "C", "D", "E"],
      levelsCleared: ["a", "b", "c"],
      bestAccuracy: 240
    });
    for (const entry of absurd) {
      expect(entry.earned).toBe(true);
      expect(entry.progress).toBeLessThanOrEqual(1);
    }
  });
});

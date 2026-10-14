import { describe, expect, it } from "vitest";
import {
  accuracyPercent,
  buildRunSummary,
  computeScore,
  describeEnding,
  describeKillBreakdown,
  describeScore,
  formatDuration,
  gradeRun
} from "../src/scoring";
import type { RunStats } from "../src/types";

const stats = (overrides: Partial<RunStats> = {}): RunStats => ({
  kills: 0,
  shotsFired: 0,
  shotsHit: 0,
  damageDealt: 0,
  damageTaken: 0,
  dashes: 0,
  dodges: 0,
  interrupts: 0,
  wavesCleared: 0,
  elapsed: 0,
  wave: 0,
  ...overrides
});

describe("accuracy", () => {
  it("reports zero for a run with no shots", () => {
    expect(accuracyPercent(stats())).toBe(0);
  });

  it("rounds to whole percent and clamps impossible data", () => {
    expect(accuracyPercent(stats({ shotsFired: 3, shotsHit: 1 }))).toBe(33);
    expect(accuracyPercent(stats({ shotsFired: 10, shotsHit: 40 }))).toBe(100);
    expect(accuracyPercent(stats({ shotsFired: 10, shotsHit: -5 }))).toBe(0);
  });
});

describe("score", () => {
  it("rewards kills and cleared waves", () => {
    const small = computeScore(stats({ kills: 1, wavesCleared: 0 }));
    const large = computeScore(stats({ kills: 3, wavesCleared: 2 }));
    expect(large.total).toBeGreaterThan(small.total);
    expect(large.waves).toBeGreaterThan(small.waves);
  });

  it("shrinks the pace bonus as a run drags on", () => {
    const fast = computeScore(stats({ kills: 2, elapsed: 20 }));
    const slow = computeScore(stats({ kills: 2, elapsed: 130 }));
    expect(fast.speed).toBeGreaterThan(slow.speed);
    expect(slow.speed).toBe(0);
  });

  it("values accurate shooting", () => {
    const wild = computeScore(stats({ shotsFired: 100, shotsHit: 10 }));
    const sharp = computeScore(stats({ shotsFired: 100, shotsHit: 80 }));
    expect(sharp.accuracy).toBeGreaterThan(wild.accuracy);
  });

  it("grades increasingly better runs higher", () => {
    const grades = [500, 1200, 1900, 2600, 4000].map(gradeRun);
    expect(grades).toEqual(["D", "C", "B", "A", "S"]);
  });

  it("describes a score in one readable line", () => {
    expect(describeScore(computeScore(stats({ kills: 2 })))).toContain("Score");
  });
});

describe("summary", () => {
  it("formats durations as a mm:ss clock", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(75)).toBe("01:15");
    expect(formatDuration(-4)).toBe("00:00");
  });

  it("builds the rows shown after a run, flagging a new best", () => {
    const runStats = stats({ kills: 5, wavesCleared: 3, shotsFired: 40, shotsHit: 20, damageTaken: 62, dashes: 4, elapsed: 84 });
    const rows = buildRunSummary(runStats, computeScore(runStats), "7F3A2C", true);
    const labels = rows.map((row) => row.label);
    expect(labels).toContain("ELIMINATIONS");
    expect(labels).toContain("ACCURACY");
    expect(labels).toContain("SEED");
    expect(rows.find((row) => row.label === "SEED")?.value).toBe("7F3A2C");
    expect(rows[rows.length - 1].label).toBe("NEW BEST");
    expect(rows[rows.length - 1].emphasis).toBe(true);
    expect(rows.find((row) => row.label === "TIME")?.value).toBe("01:24");
  });

  it("labels the score row as SCORE when it is not a personal best", () => {
    const runStats = stats({ kills: 1 });
    const rows = buildRunSummary(runStats, computeScore(runStats), "AAAAAA", false);
    expect(rows[rows.length - 1].label).toBe("SCORE");
    expect(rows.some((row) => row.label === "NEW BEST")).toBe(false);
  });
});

describe("run summary detail", () => {
  const runStats = stats({ kills: 5, wavesCleared: 3, shotsFired: 40, shotsHit: 20, damageTaken: 62, dashes: 4, elapsed: 84 });

  it("names the profile that ended the run", () => {
    expect(describeEnding("flanker")).toBe("THE FLANKER");
    expect(describeEnding("unknown")).toBe("UNKNOWN FIRE");
    expect(describeEnding(null)).toBe("\u2014");
  });

  it("summarizes the kill breakdown in profile order", () => {
    expect(describeKillBreakdown({ hunter: 3, flanker: 1, mirror: 2 })).toBe("3× HUNTER · 1× FLANKER · 2× MIRROR");
    expect(describeKillBreakdown({ mirror: 2 })).toBe("2× MIRROR");
    expect(describeKillBreakdown({})).toBe("");
  });

  it("adds breakdown, difficulty best and ending rows when the runtime provides them", () => {
    const rows = buildRunSummary(stats(), computeScore(runStats), "7F3A2C", false, {
      endedBy: "hunter",
      killsByKind: { hunter: 4, flanker: 0, mirror: 1 },
      bestScoreOnDifficulty: 4200,
      isDifficultyBest: false
    });
    const labels = rows.map((row) => row.label);
    expect(labels).toContain("TAKEN DOWN");
    expect(labels).toContain("BEST ON THIS LEVEL");
    expect(labels).toContain("ENDED BY");
    expect(rows.find((row) => row.label === "TAKEN DOWN")?.value).toBe("4× HUNTER · 1× MIRROR");
    expect(rows.find((row) => row.label === "ENDED BY")?.value).toBe("THE HUNTER");
    expect(rows.find((row) => row.label === "BEST ON THIS LEVEL")?.value).toBe("4200");
    // The kill breakdown sits directly under eliminations so the two read together.
    expect(labels.indexOf("TAKEN DOWN")).toBe(1);
  });

  it("celebrates a new difficulty best only when the overall best was not beaten", () => {
    const rows = buildRunSummary(stats(), computeScore(runStats), "7F3A2C", false, {
      bestScoreOnDifficulty: 900,
      isDifficultyBest: true
    });
    const best = rows.find((row) => row.label === "NEW DIFFICULTY BEST");
    expect(best?.value).toBe(String(computeScore(runStats).total));
    expect(best?.emphasis).toBe(true);

    const both = buildRunSummary(stats(), computeScore(runStats), "7F3A2C", true, { bestScoreOnDifficulty: 900, isDifficultyBest: true });
    expect(both.some((row) => row.label === "NEW DIFFICULTY BEST")).toBe(false);
    expect(both.some((row) => row.label === "NEW BEST")).toBe(true);
  });

  it("names the arena the run was played in", () => {
    const rows = buildRunSummary(runStats, computeScore(runStats), "7F3A2C", false, { arenaName: "PILLARS", endedBy: "mirror" });
    const arena = rows.find((row) => row.label === "ARENA");
    expect(arena?.value).toBe("PILLARS");
    // The layout sits above the ending, because it describes the whole run.
    expect(rows.findIndex((row) => row.label === "ARENA")).toBeLessThan(rows.findIndex((row) => row.label === "ENDED BY"));
    // A detail without an arena simply has no row.
    expect(buildRunSummary(runStats, computeScore(runStats), "7F3A2C", false, {}).some((row) => row.label === "ARENA")).toBe(false);
  });

  it("awards a clean sweep row only for a perfect victory", () => {
    const clean = buildRunSummary(runStats, computeScore(runStats), "7F3A2C", false, { perfect: true });
    const row = clean.find((entry) => entry.label === "CLEAN SWEEP");
    expect(row?.value).toBe("NO DAMAGE TAKEN");
    expect(row?.emphasis).toBe(true);
    expect(clean.some((entry) => entry.label === "ENDED BY")).toBe(false);

    const ordinary = buildRunSummary(runStats, computeScore(runStats), "7F3A2C", false, { perfect: false });
    expect(ordinary.some((entry) => entry.label === "CLEAN SWEEP")).toBe(false);
  });

  it("keeps the original rows when no detail is supplied", () => {
    const rows = buildRunSummary(stats(), computeScore(runStats), "7F3A2C", false);
    expect(rows.map((row) => row.label)).toEqual([
      "ELIMINATIONS",
      "THREAT LEVEL",
      "ACCURACY",
      "DAMAGE TAKEN",
      "DASHES",
      "TIME",
      "SEED",
      "SCORE"
    ]);
  });
});

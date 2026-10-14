import { describe, expect, it } from "vitest";
import { MAX_WAVES, getNextWave, getWaveBriefing, getWaveHint, getWavePlan, getWaveProgressPercent, getWaveSpawnCount } from "../src/progression";
import { DIFFICULTY_ORDER, DIFFICULTIES } from "../src/constants";
import { BOT_KINDS } from "../src/ai";
import type { BotKind } from "../src/types";

describe("wave progression", () => {
  it("starts at wave one and advances by one", () => {
    expect(getNextWave(0)).toBe(1);
    expect(getNextWave(1)).toBe(2);
    expect(getNextWave(4)).toBe(5);
  });

  it("stops after the final wave instead of looping wave five forever", () => {
    expect(MAX_WAVES).toBe(5);
    expect(getNextWave(5)).toBeNull();
    expect(getNextWave(6)).toBeNull();
  });

  it("maps the threat bar to the current wave, not the kill count", () => {
    expect(getWaveProgressPercent(0)).toBe(0);
    expect(getWaveProgressPercent(1)).toBe(20);
    expect(getWaveProgressPercent(3)).toBe(60);
    expect(getWaveProgressPercent(5)).toBe(100);
    expect(getWaveProgressPercent(6)).toBe(100);
  });

  it("increases the enemy count while capping a wave at six", () => {
    expect([1, 2, 3, 4, 5].map(getWaveSpawnCount)).toEqual([3, 4, 5, 6, 6]);
  });
});

describe("wave plans", () => {
  it("introduces each profile in a deliberate order", () => {
    expect(getWavePlan(1).kinds).toEqual(["hunter", "hunter", "hunter"]);
    // Wave two brings the pincer, and nothing else new.
    expect(getWavePlan(2).kinds).toContain("flanker");
    const waveTwoNew = new Set(getWavePlan(2).kinds.filter((kind) => !getWavePlan(1).kinds.includes(kind)));
    expect(waveTwoNew).toEqual(new Set(["flanker"]));
    // Wave three is the marksman's debut.
    const waveThreeNew = new Set(
      getWavePlan(3).kinds.filter((kind) => !getWavePlan(1).kinds.includes(kind) && !getWavePlan(2).kinds.includes(kind))
    );
    expect(waveThreeNew).toEqual(new Set(["sniper"]));
    // Wave four introduces the brawling trio and the mirror; wave five the
    // indirect fire and the ram.
    const seen = new Set([...getWavePlan(1).kinds, ...getWavePlan(2).kinds, ...getWavePlan(3).kinds]);
    const waveFourNew = new Set(getWavePlan(4).kinds.filter((kind) => !seen.has(kind)));
    expect(waveFourNew).toEqual(new Set(["mirror", "pyro", "shielder", "splitter"]));
    for (const kind of waveFourNew) seen.add(kind);
    const waveFiveNew = new Set(getWavePlan(5).kinds.filter((kind) => !seen.has(kind)));
    expect(waveFiveNew).toEqual(new Set(["mortar", "charger"]));
  });

  it("fields every profile in the campaign", () => {
    const fielded = new Set<BotKind>();
    for (let wave = 1; wave <= MAX_WAVES; wave += 1) {
      for (const kind of getWavePlan(wave).kinds) fielded.add(kind);
    }
    // Every kind a wave may field is used somewhere in the five waves...
    for (const kind of BOT_KINDS) expect(fielded.has(kind)).toBe(true);
    // ...and the shard only ever appears when a swarm cell comes apart.
    expect(fielded.has("shard")).toBe(false);
  });

  it("keeps every wave inside the 2..7 hostile envelope on every difficulty", () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      for (let wave = 1; wave <= MAX_WAVES; wave += 1) {
        const plan = getWavePlan(wave, difficulty);
        expect(plan.kinds.length).toBeGreaterThanOrEqual(2);
        expect(plan.kinds.length).toBeLessThanOrEqual(7);
      }
    }
  });

  it("thins out early waves on recruit while veteran leans on accuracy instead", () => {
    expect(getWavePlan(1, "recruit").kinds.length).toBe(2);
    expect(getWavePlan(1, "standard").kinds.length).toBe(3);
    expect(getWavePlan(1, "veteran").kinds.length).toBe(3);
    expect(DIFFICULTIES.veteran.aimScale).toBeGreaterThan(DIFFICULTIES.standard.aimScale);
    expect(DIFFICULTIES.veteran.fireScale).toBeGreaterThan(DIFFICULTIES.standard.fireScale);
  });

  it("ramps health, speed and awareness across the run", () => {
    const first = getWavePlan(1);
    const last = getWavePlan(5);
    expect(last.healthMultiplier).toBeGreaterThan(first.healthMultiplier);
    expect(last.speedMultiplier).toBeGreaterThan(first.speedMultiplier);
    expect(last.awareness).toBeGreaterThan(first.awareness);
    expect(last.awareness).toBeLessThanOrEqual(1);
    expect(first.awareness).toBeGreaterThan(0);
  });

  it("gives the first wave the longest telegraph and later waves a shorter one", () => {
    expect(getWavePlan(1).telegraph).toBeGreaterThanOrEqual(getWavePlan(5).telegraph);
  });

  it("clamps out-of-range waves instead of producing impossible plans", () => {
    expect(getWavePlan(0).wave).toBe(1);
    expect(getWavePlan(99).wave).toBe(MAX_WAVES);
  });

  it("has a readable composition briefing", () => {
    const briefing = getWaveBriefing(3);
    expect(briefing).toContain("HUNTER");
    expect(briefing).toContain("FLANKER");
    expect(briefing).toContain("SNIPER");
    const finale = getWaveBriefing(5);
    expect(finale).toContain("MORTAR");
    expect(finale).toContain("CHARGER");
    // Names appear in roster order, not in whatever order they spawn.
    expect(finale.indexOf("MORTAR")).toBeLessThan(finale.indexOf("CHARGER"));
    expect(finale.indexOf("PYRO")).toBeLessThan(finale.indexOf("CHARGER"));
    expect(finale.indexOf("SNIPER")).toBeLessThan(finale.indexOf("SHIELDER"));
  });
});

describe("difficulty presets", () => {
  it("exposes every difficulty with sane multipliers", () => {
    for (const id of DIFFICULTY_ORDER) {
      const preset = DIFFICULTIES[id];
      expect(preset.damageScale).toBeGreaterThan(0);
      expect(preset.windupScale).toBeGreaterThan(0);
      expect(preset.dashCooldown).toBeGreaterThan(0);
      expect(preset.playerFireScale).toBeGreaterThan(0);
    }
  });

  it("orders difficulty from forgiving to punishing", () => {
    const [recruit, standard, veteran] = DIFFICULTY_ORDER.map((id) => DIFFICULTIES[id]);
    expect(recruit.damageScale).toBeLessThan(standard.damageScale);
    expect(standard.damageScale).toBeLessThan(veteran.damageScale);
    expect(recruit.windupScale).toBeGreaterThan(standard.windupScale);
    expect(standard.windupScale).toBeGreaterThan(veteran.windupScale);
    expect(recruit.dashCooldown).toBeLessThan(standard.dashCooldown);
  });
});

describe("wave tips", () => {
  it("teaches each profile in the wave that first fields it", () => {
    expect(getWaveHint(1)).toContain("RINGS MARK");
    expect(getWaveHint(2)).toContain("LINE OF SIGHT");
    expect(getWaveHint(3)).toContain("AIM LINE");
    expect(getWaveHint(4)).toContain("STEP BACK");
    expect(getWaveHint(4)).toContain("MIRROR");
    expect(getWaveHint(5)).toContain("READ THE FLOOR");
  });

  it("gives every wave a non-empty tip and clamps nonsense input", () => {
    for (let wave = -3; wave <= 12; wave += 1) {
      const hint = getWaveHint(wave);
      expect(typeof hint).toBe("string");
      expect(hint.length).toBeGreaterThan(8);
      expect(hint).toBe(hint.toUpperCase());
    }
    expect(getWaveHint(0)).toBe(getWaveHint(1));
    expect(getWaveHint(99)).toBe(getWaveHint(MAX_WAVES));
  });
});

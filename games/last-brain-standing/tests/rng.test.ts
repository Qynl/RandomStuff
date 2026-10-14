import { describe, expect, it } from "vitest";
import { createRandomSeed, createRng, formatSeed, hashSeed, looksLikeSeedLabel, normalizeSeed, SEED_SPACE } from "../src/rng";

describe("seeded rng", () => {
  it("replays the same sequence for the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const first = Array.from({ length: 12 }, () => a.next());
    const second = Array.from({ length: 12 }, () => b.next());
    expect(first).toEqual(second);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 6 }, () => a.next())).not.toEqual(Array.from({ length: 6 }, () => b.next()));
  });

  it("accepts text seeds and hashes them stably", () => {
    expect(hashSeed("seed-01")).toBe(hashSeed("seed-01"));
    expect(hashSeed("seed-01")).not.toBe(hashSeed("seed-02"));
    const fromText = createRng("seed-01");
    const fromHash = createRng(hashSeed("seed-01"));
    expect(fromText.next()).toBe(fromHash.next());
  });

  it("keeps values inside the requested ranges", () => {
    const rng = createRng("ranges");
    for (let i = 0; i < 500; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const ranged = rng.range(-4, 6);
      expect(ranged).toBeGreaterThanOrEqual(-4);
      expect(ranged).toBeLessThan(6);
      const int = rng.int(1, 3);
      expect(Number.isInteger(int)).toBe(true);
      expect(int).toBeGreaterThanOrEqual(1);
      expect(int).toBeLessThanOrEqual(3);
    }
  });

  it("tracks its own state so a run can be resumed", () => {
    const rng = createRng("resume");
    rng.next();
    const saved = rng.state;
    const expected = [rng.next(), rng.next()];
    const resumed = createRng(saved);
    expect([resumed.next(), resumed.next()]).toEqual(expected);
  });

  it("handles the chance, pick and direction helpers", () => {
    const rng = createRng("helpers");
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.pick([])).toBeUndefined();
    expect(["a", "b", "c"]).toContain(rng.pick(["a", "b", "c"]));
    for (let i = 0; i < 50; i += 1) {
      const direction = rng.direction();
      expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 6);
      const spread = rng.spreadDirection(0.5, 0.1);
      const angle = Math.atan2(spread.y, spread.x);
      expect(Math.abs(angle - 0.5)).toBeLessThanOrEqual(0.1001);
    }
  });

  it("formats shareable seed labels", () => {
    expect(formatSeed(0x7f3a2c)).toBe("7F3A2C");
    expect(formatSeed(1)).toBe("000001");
    expect(createRandomSeed()).toBeGreaterThan(0);
  });
});

describe("seed identity", () => {
  it("keeps every seed inside the six character label space", () => {
    for (const seed of [0, 1, 0x7f3a2c, 0xffffff, 0xdeadbeef, -5, Number.NaN, 123456789.7]) {
      const normalized = normalizeSeed(seed);
      expect(normalized).toBeGreaterThanOrEqual(1);
      expect(normalized).toBeLessThan(SEED_SPACE);
      expect(formatSeed(normalized)).toHaveLength(6);
    }
    expect(normalizeSeed(0)).toBe(1);
    expect(normalizeSeed(SEED_SPACE)).toBe(1);
    expect(normalizeSeed(0xdeadbeef)).toBe(0xadbeef);
  });

  it("round-trips a displayed label exactly", () => {
    // This is the bug the normalization exists for: `REPLAY SEED 7F3A2C` used to
    // hash the label text instead of restoring the fight it named.
    for (const raw of [1, 0x7f3a2c, 0xff00aa, 0x123456]) {
      const label = formatSeed(raw);
      expect(normalizeSeed(label)).toBe(normalizeSeed(raw));
    }
    expect(looksLikeSeedLabel("7f3a2c")).toBe(true);
    expect(looksLikeSeedLabel("ZZTOP1")).toBe(false); // six characters, but not hex
    expect(looksLikeSeedLabel("ZZTOP12")).toBe(false);
    expect(looksLikeSeedLabel("12345")).toBe(false);
  });

  it("still hashes arbitrary text seeds, case-insensitively and stably", () => {
    expect(normalizeSeed("mirror")).toBe(normalizeSeed("mirror"));
    expect(normalizeSeed("Mirror")).toBe(normalizeSeed("MIRROR"));
    expect(normalizeSeed("mirror")).not.toBe(normalizeSeed("flanker"));
    expect(normalizeSeed("mirror")).toBe(hashSeed("MIRROR") % SEED_SPACE || 1);
  });

  it("produces the same fight whether a seed is given as text or as its label", () => {
    const fromText = createRng(normalizeSeed("boss-rush"));
    const fromLabel = createRng(normalizeSeed(formatSeed(normalizeSeed("boss-rush"))));
    const a = Array.from({ length: 12 }, () => fromText.next());
    const b = Array.from({ length: 12 }, () => fromLabel.next());
    expect(a).toEqual(b);
  });
});

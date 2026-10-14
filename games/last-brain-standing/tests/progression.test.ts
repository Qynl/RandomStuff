import { describe, expect, it } from "vitest";
import { getNextWave, getWaveProgressPercent, getWaveSpawnCount, MAX_WAVES } from "../src/progression";

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

  it("increases the enemy count while capping a wave at six bots", () => {
    expect([1, 2, 3, 4, 5].map(getWaveSpawnCount)).toEqual([3, 4, 5, 6, 6]);
  });
});

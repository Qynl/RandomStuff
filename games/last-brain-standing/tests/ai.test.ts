import { describe, expect, it } from "vitest";
import { chooseBotDirection, distance, normalize, shouldBotFire } from "../src/ai";
import type { PlayerTelemetry } from "../src/types";

const telemetry = (): PlayerTelemetry => ({
  recentDirections: [],
  recentShots: [],
  stationaryTime: 0,
  lastMoveDirection: { x: 1, y: 0 }
});

describe("AI movement primitives", () => {
  it("normalizes vectors without changing their direction", () => {
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  });

  it("returns a zero vector for zero input", () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("measures distance between positions", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("gives each bot a valid movement direction", () => {
    for (const kind of ["hunter", "flanker", "mirror"] as const) {
      const direction = chooseBotDirection({ kind, position: { x: 100, y: 100 }, strafeSign: 1 }, { x: 400, y: 300 }, telemetry(), 1);
      expect(Number.isFinite(direction.x)).toBe(true);
      expect(Number.isFinite(direction.y)).toBe(true);
      expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1);
    }
  });

  it("does not let bots fire through a cooldown or across extreme distances", () => {
    expect(shouldBotFire("hunter", 100, 0.1, telemetry())).toBe(false);
    expect(shouldBotFire("hunter", 900, 0, telemetry())).toBe(false);
  });

  it("makes the Mirror respond to repeated player movement", () => {
    const cautious = telemetry();
    const habitual = telemetry();
    habitual.recentDirections = Array.from({ length: 8 }, () => ({ x: 1, y: 0 }));
    const bot = { kind: "mirror" as const, position: { x: 400, y: 300 }, strafeSign: 1 };
    const cautiousDirection = chooseBotDirection(bot, { x: 500, y: 300 }, cautious, 2);
    const habitualDirection = chooseBotDirection(bot, { x: 500, y: 300 }, habitual, 2);
    expect(habitualDirection.x).not.toBeCloseTo(cautiousDirection.x, 2);
  });
});
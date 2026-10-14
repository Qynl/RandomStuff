import { describe, expect, it } from "vitest";
import { circleHitsRect, distanceToSegment, moveWithCollisions, segmentBlocked, WORLD } from "../src/arena";

describe("arena collision geometry", () => {
  it("measures distance to the closest point on a segment", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });

  it("clamps the closest point to the segment endpoints", () => {
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("handles a zero-length segment without producing NaN", () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it("keeps movement inside the arena bounds", () => {
    expect(moveWithCollisions({ x: 30, y: 30 }, { x: -100, y: -100 }, 12)).toEqual({ x: 12, y: 12 });
    expect(moveWithCollisions({ x: WORLD.width - 30, y: 30 }, { x: 100, y: -100 }, 12)).toEqual({ x: WORLD.width - 12, y: 12 });
  });

  it("detects a clear line blocked by the center obstacle", () => {
    expect(segmentBlocked({ x: 350, y: 300 }, { x: 610, y: 300 })).toBe(true);
    expect(segmentBlocked({ x: 350, y: 220 }, { x: 610, y: 220 })).toBe(false);
  });

  it("detects circle overlap with a rectangle", () => {
    expect(circleHitsRect({ x: 430, y: 300 }, 4, { x: 430, y: 254, w: 100, h: 92 })).toBe(true);
    expect(circleHitsRect({ x: 400, y: 200 }, 4, { x: 430, y: 254, w: 100, h: 92 })).toBe(false);
  });
});

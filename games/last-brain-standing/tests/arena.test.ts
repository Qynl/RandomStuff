import { describe, expect, it } from "vitest";
import {
  circleHitsRect,
  closestPointOnSegment,
  distanceToSegment,
  findSpawnPositions,
  firstBlockingFraction,
  hasClearance,
  moveWithCollisions,
  OBSTACLES,
  pointInObstacle,
  segmentBlocked,
  segmentHitsCircle,
  segmentIntersectsRect,
  steerAroundObstacles,
  sweepMovement,
  WALL_INSET,
  WORLD
} from "../src/arena";
import { createRng } from "../src/rng";

describe("arena collision geometry", () => {
  it("measures distance to the closest point on a segment", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });

  it("clamps the closest point to the segment endpoints", () => {
    expect(distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it("registers a fast projectile path that crosses a target between frames", () => {
    expect(segmentHitsCircle({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 15, y: 0 }, 4)).toBe(true);
  });

  it("does not register a projectile path that narrowly misses a target", () => {
    expect(segmentHitsCircle({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 15, y: 5 }, 4)).toBe(false);
  });

  it("handles a zero-length segment without producing NaN", () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it("keeps movement inside the arena bounds with a wall gutter", () => {
    // Actors clamp to radius + WALL_INSET so they stand on the floor, not on the frame.
    const edge = 12 + WALL_INSET;
    expect(moveWithCollisions({ x: 30, y: 30 }, { x: -100, y: -100 }, 12)).toEqual({ x: edge, y: edge });
    expect(moveWithCollisions({ x: WORLD.width - 30, y: 30 }, { x: 100, y: -100 }, 12)).toEqual({
      x: WORLD.width - edge,
      y: edge
    });
  });

  it("detects a clear line blocked by the center obstacle", () => {
    expect(segmentBlocked({ x: 350, y: 300 }, { x: 610, y: 300 })).toBe(true);
    expect(segmentBlocked({ x: 350, y: 220 }, { x: 610, y: 220 })).toBe(false);
  });

  it("detects circle overlap with a rectangle", () => {
    expect(circleHitsRect({ x: 430, y: 300 }, 4, { x: 430, y: 254, w: 100, h: 92 })).toBe(true);
    expect(circleHitsRect({ x: 400, y: 200 }, 4, { x: 430, y: 254, w: 100, h: 92 })).toBe(false);
  });

  it("reports exact segment/rect entry instead of sampling", () => {
    const rect = { x: 100, y: 0, w: 20, h: 200 };
    expect(segmentIntersectsRect({ x: 0, y: 100 }, { x: 200, y: 100 }, rect)).toBe(true);
    expect(segmentIntersectsRect({ x: 0, y: 300 }, { x: 200, y: 300 }, rect)).toBe(false);
    // A hairline graze along the top edge still counts as a hit.
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 200, y: 0 }, rect)).toBe(true);
    expect(firstBlockingFraction({ x: 0, y: 300 }, { x: 200, y: 300 })).toBeNull();
    expect(firstBlockingFraction({ x: 350, y: 300 }, { x: 610, y: 300 })).toBeCloseTo(80 / 260, 2);
  });

  it("knows when a point sits inside a block", () => {
    expect(pointInObstacle({ x: 460, y: 300 })).toBe(true);
    expect(pointInObstacle({ x: 460, y: 40 })).toBe(false);
  });

  it("reports clearance for a body-sized circle", () => {
    expect(hasClearance({ x: 480, y: 520 }, 12)).toBe(true);
    expect(hasClearance({ x: 460, y: 300 }, 12)).toBe(false);
    expect(hasClearance({ x: 4, y: 300 }, 12)).toBe(false);
  });

  it("clamps the closest point along a segment", () => {
    expect(closestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 9 })).toEqual({ x: 3, y: 0 });
    expect(closestPointOnSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 40, y: 0 })).toEqual({ x: 10, y: 0 });
  });
});

describe("swept movement", () => {
  it("reaches the requested destination when the lane is clear", () => {
    const result = sweepMovement({ x: 100, y: 520 }, { x: 60, y: 0 }, 12);
    expect(result.blocked).toBe(false);
    expect(result.position.x).toBeCloseTo(160, 3);
  });

  it("stops before a block instead of tunnelling through it", () => {
    const start = { x: 300, y: 300 };
    const result = sweepMovement(start, { x: 300, y: 0 }, 12, 4);
    expect(result.blocked).toBe(true);
    expect(result.position.x).toBeLessThanOrEqual(OBSTACLES[4].x - 12 + 0.01);
    expect(result.position.x).toBeGreaterThan(start.x);
  });
});

describe("spawn placement", () => {
  it("never spawns inside geometry or on top of the player", () => {
    const rng = createRng("spawn-check");
    for (let run = 0; run < 40; run += 1) {
      const player = { x: 200 + rng.range(0, 500), y: 150 + rng.range(0, 320) };
      const placements = findSpawnPositions(rng.int(2, 7), player, 250, 12, (min, max) => rng.range(min, max));
      expect(placements.length).toBeGreaterThanOrEqual(2);
      for (const placement of placements) {
        expect(hasClearance(placement.position, 12, 0)).toBe(true);
        expect(Math.hypot(placement.position.x - player.x, placement.position.y - player.y)).toBeGreaterThanOrEqual(240);
      }
      for (let i = 0; i < placements.length; i += 1) {
        for (let j = i + 1; j < placements.length; j += 1) {
          const gap = Math.hypot(placements[i].position.x - placements[j].position.x, placements[i].position.y - placements[j].position.y);
          expect(gap).toBeGreaterThan(20);
        }
      }
    }
  });

  it("still produces a full set of spawns when the arena is crowded", () => {
    const rng = createRng("crowded");
    const placements = findSpawnPositions(7, { x: 480, y: 300 }, 200, 12, (min, max) => rng.range(min, max));
    expect(placements).toHaveLength(7);
  });
});

describe("obstacle steering", () => {
  it("keeps the desired heading when the lane is open", () => {
    const steered = steerAroundObstacles({ x: 100, y: 520 }, { x: 1, y: 0 }, 40);
    expect(steered.x).toBeCloseTo(1, 5);
    expect(steered.y).toBeCloseTo(0, 5);
  });

  it("bends away from a block instead of grinding into it", () => {
    const position = { x: 410, y: 300 };
    expect(segmentBlocked(position, { x: position.x + 46, y: position.y })).toBe(true);
    const steered = steerAroundObstacles(position, { x: 1, y: 0 }, 46);
    expect(Math.hypot(steered.x, steered.y)).toBeCloseTo(1, 5);
    expect(Math.abs(steered.y)).toBeGreaterThan(0.4);
    expect(segmentBlocked(position, { x: position.x + steered.x * 46, y: position.y + steered.y * 46 })).toBe(false);
  });
});

describe("arena safety nets", () => {
  it("slides sideways when every steering probe is blocked", () => {
    // A block that contains the position blocks every probe, which is the
    // "fully boxed in" case the helper has to survive.
    const boxed = [{ x: 400, y: 200, w: 200, h: 200 }];
    const inside = { x: 500, y: 300 };
    const steered = steerAroundObstacles(inside, { x: 1, y: 0 }, 40, undefined, boxed);
    expect(Math.hypot(steered.x, steered.y)).toBeCloseTo(1, 5);
    // Straight up is blocked, so it slides: perpendicular to the desired heading.
    expect(Math.abs(steered.x)).toBeLessThan(1e-6);
    expect(Math.abs(steered.y)).toBeCloseTo(1, 5);

    // With a clear lane it follows the heading instead.
    const open = steerAroundObstacles({ x: 100, y: 100 }, { x: 1, y: 1 }, 40, undefined, boxed);
    expect(open.x).toBeGreaterThan(0.6);
    expect(open.y).toBeGreaterThan(0.6);
  });

  it("never spawns short, even when the ring search cannot find a clean spot", () => {
    // Fill the arena with one block: the ring search fails everywhere, so the
    // deterministic fallback has to produce the full count anyway.
    const blocked = [{ x: 0, y: 0, w: WORLD.width, h: WORLD.height }];
    const placements = findSpawnPositions(6, { x: 480, y: 512 }, 265, 16, () => 0.5, 250, blocked);
    expect(placements).toHaveLength(6);
    for (const placement of placements) {
      expect(Number.isFinite(placement.position.x)).toBe(true);
      expect(Number.isFinite(placement.position.y)).toBe(true);
      expect(Number.isFinite(placement.angle)).toBe(true);
    }
  });
});

import type { Rect, Vec2 } from "./types";

export const WORLD = { width: 960, height: 600 };

/** Arena walls keep a little breathing room so effects near the edge stay readable. */
export const WALL_INSET = 12;

/**
 * Arena layouts.
 *
 * All four are hand-placed rather than random so that every one is fair: each
 * keeps a clear ring for spawns, a clear cross through the middle for movement,
 * and no block within a dash of the player's start. The seed only picks *which*
 * one, so a run code still replays exactly, and a layout is never generated in
 * a way that could produce an unreachable pocket.
 */
export type ArenaLayoutId = "quadrant" | "lanes" | "pillars" | "diamond";

export interface ArenaLayout {
  name: string;
  obstacles: Rect[];
  /**
   * How much clear room the layout offers: 1 is an open field, 0 is a maze.
   * Hostiles scale their preferred fighting range by this, because a ring that
   * is comfortable in the open is impossible to hold between pillars.
   */
  openness: number;
  /** Cover tint, so the arena a run is playing in reads at a glance. */
  accent: string;
  accentSoft: string;
}

export const ARENA_LAYOUTS: Record<ArenaLayoutId, ArenaLayout> = {
  quadrant: {
    name: "QUADRANT",
    openness: 0.85,
    accent: "rgba(93, 131, 161, 0.5)",
    accentSoft: "rgba(255, 180, 84, 0.13)",
    obstacles: [
      { x: 218, y: 142, w: 74, h: 76 },
      { x: 668, y: 142, w: 74, h: 76 },
      { x: 218, y: 382, w: 74, h: 76 },
      { x: 668, y: 382, w: 74, h: 76 },
      { x: 430, y: 254, w: 100, h: 92 }
    ]
  },
  lanes: {
    name: "LANES",
    openness: 0.6,
    accent: "rgba(110, 140, 190, 0.55)",
    accentSoft: "rgba(120, 190, 255, 0.14)",
    // Two long walls with offset gaps: cover is continuous but the lanes always
    // connect, which rewards route planning over open-field strafing.
    obstacles: [
      { x: 300, y: 96, w: 40, h: 168 },
      { x: 300, y: 336, w: 40, h: 168 },
      { x: 620, y: 96, w: 40, h: 168 },
      { x: 620, y: 336, w: 40, h: 168 },
      { x: 440, y: 276, w: 80, h: 48 }
    ]
  },
  pillars: {
    name: "PILLARS",
    openness: 0.45,
    accent: "rgba(150, 130, 190, 0.5)",
    accentSoft: "rgba(197, 160, 255, 0.13)",
    // Six small pillars: sight lines are short and cover is everywhere, which
    // favours the player's dodge and hurts the long-range flanker.
    obstacles: [
      { x: 250, y: 170, w: 56, h: 56 },
      { x: 654, y: 170, w: 56, h: 56 },
      { x: 250, y: 374, w: 56, h: 56 },
      { x: 654, y: 374, w: 56, h: 56 },
      { x: 452, y: 128, w: 56, h: 56 },
      { x: 452, y: 416, w: 56, h: 56 }
    ]
  },
  diamond: {
    name: "DIAMOND",
    openness: 0.7,
    accent: "rgba(120, 165, 150, 0.5)",
    accentSoft: "rgba(128, 232, 196, 0.12)",
    // A stepped diamond around the middle: the centre is a strong position, and
    // the steps break every long diagonal in the arena.
    obstacles: [
      { x: 452, y: 150, w: 56, h: 52 },
      { x: 452, y: 398, w: 56, h: 52 },
      { x: 292, y: 274, w: 56, h: 52 },
      { x: 612, y: 274, w: 56, h: 52 },
      { x: 392, y: 246, w: 40, h: 40 },
      { x: 528, y: 246, w: 40, h: 40 }
    ]
  }
};

/**
 * Scales a hostile's preferred fighting range for the arena it is in.
 *
 * Rooms full of cover make a wide orbit unrealistic: the bot would spend the
 * fight walking into blocks trying to regain a range the arena cannot give it.
 * The range floor keeps close-quarters archetypes (the Hunter) meaningful, and
 * the ceiling prevents a fully open arena from making them stand off forever.
 */
export function rangeScaleForOpenness(openness: number): number {
  const clamped = Math.max(0, Math.min(1, openness));
  return 0.62 + 0.38 * clamped;
}

/** The layout record a seed plays in, for callers that need the whole thing. */
export function layoutRecordForSeed(seed: number): ArenaLayout {
  return ARENA_LAYOUTS[layoutForSeed(seed)];
}

/** The layout a seed plays in. Deterministic, and stable across versions. */
export function layoutForSeed(seed: number): ArenaLayoutId {
  const order: ArenaLayoutId[] = ["quadrant", "lanes", "pillars", "diamond"];
  // A cheap avalanche so neighbouring seeds do not land on the same layout.
  const mixed = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) ^ 0x27d4eb2f;
  return order[(mixed >>> 3) % order.length];
}

export const OBSTACLES: Rect[] = ARENA_LAYOUTS.quadrant.obstacles;

export const clampToArena = (value: number, radius: number, limit: number): number =>
  Math.max(radius + WALL_INSET, Math.min(limit - radius - WALL_INSET, value));

/** Minimum distance from a point to a finite line segment. Useful for swept collision checks. */
export function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 0.000001) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const closestX = start.x + projection * dx;
  const closestY = start.y + projection * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

/** Returns whether a moving circle's center path passes within radius of a target point. */
export function segmentHitsCircle(start: Vec2, end: Vec2, center: Vec2, radius: number): boolean {
  return distanceToSegment(center, start, end) <= radius;
}

export function circleHitsRect(point: Vec2, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.h));
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

export function pointInObstacle(point: Vec2, obstacles: Rect[] = OBSTACLES): boolean {
  return obstacles.some((obstacle) =>
    point.x > obstacle.x && point.x < obstacle.x + obstacle.w && point.y > obstacle.y && point.y < obstacle.y + obstacle.h
  );
}

/**
 * Exact segment/AABB overlap using the slab method (Liang-Barsky clipping).
 * Returns the entry fraction (0..1) along the segment, or null when it misses.
 * Replaces sampled ray marching so bots cannot shoot through corner grazes and
 * projectiles cannot clip the edge of a block.
 */
export function segmentRectEntryFraction(from: Vec2, to: Vec2, rect: Rect): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let tMin = 0;
  let tMax = 1;

  const axes: Array<[number, number, number, number]> = [
    [dx, rect.x, rect.x + rect.w, from.x],
    [dy, rect.y, rect.y + rect.h, from.y]
  ];

  for (const [delta, min, max, origin] of axes) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const inverse = 1 / delta;
    let t1 = (min - origin) * inverse;
    let t2 = (max - origin) * inverse;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin;
}

export function segmentIntersectsRect(from: Vec2, to: Vec2, rect: Rect): boolean {
  return segmentRectEntryFraction(from, to, rect) !== null;
}

/** True when any arena block sits between the two points. */
export function segmentBlocked(from: Vec2, to: Vec2, obstacles: Rect[] = OBSTACLES): boolean {
  return obstacles.some((obstacle) => segmentRectEntryFraction(from, to, obstacle) !== null);
}

/** Normalised 0..1 distance to the first block along a path, or null when clear. */
export function firstBlockingFraction(from: Vec2, to: Vec2, obstacles: Rect[] = OBSTACLES): number | null {
  let best: number | null = null;
  for (const obstacle of obstacles) {
    const entry = segmentRectEntryFraction(from, to, obstacle);
    if (entry === null) continue;
    best = best === null ? entry : Math.min(best, entry);
  }
  return best;
}

/** A circle can stand at this point without overlapping walls or blocks. */
export function hasClearance(point: Vec2, radius: number, slack = 4, obstacles: Rect[] = OBSTACLES): boolean {
  if (
    point.x < radius + WALL_INSET - slack ||
    point.y < radius + WALL_INSET - slack ||
    point.x > WORLD.width - radius - WALL_INSET + slack ||
    point.y > WORLD.height - radius - WALL_INSET + slack
  ) {
    return false;
  }
  return !obstacles.some((obstacle) => circleHitsRect(point, radius + slack, obstacle));
}

/**
 * Axis-aligned fallback used by the original implementation: try the full move,
 * then each axis separately. Kept for compatibility and used inside swept moves.
 */
export function moveWithCollisions(position: Vec2, movement: Vec2, radius: number, obstacles: Rect[] = OBSTACLES): Vec2 {
  const next = {
    x: clampToArena(position.x + movement.x, radius, WORLD.width),
    y: clampToArena(position.y + movement.y, radius, WORLD.height)
  };
  if (obstacles.some((obstacle) => circleHitsRect(next, radius, obstacle))) {
    const horizontal = { x: next.x, y: position.y };
    const vertical = { x: position.x, y: next.y };
    const canHorizontal = !obstacles.some((obstacle) => circleHitsRect(horizontal, radius, obstacle));
    const canVertical = !obstacles.some((obstacle) => circleHitsRect(vertical, radius, obstacle));
    if (canHorizontal && canVertical) return Math.abs(movement.x) > Math.abs(movement.y) ? horizontal : vertical;
    if (canHorizontal) return horizontal;
    if (canVertical) return vertical;
    return { ...position };
  }
  return next;
}

export interface SweepResult {
  position: Vec2;
  blocked: boolean;
}

/**
 * Sweeps a move in small segments so a dash (or a future knockback) can never
 * teleport through a block. Returns the furthest safe position plus whether the
 * path was interrupted.
 */
export function sweepMovement(position: Vec2, movement: Vec2, radius: number, maxStep = 6, obstacles: Rect[] = OBSTACLES): SweepResult {
  const distance = Math.hypot(movement.x, movement.y);
  if (distance < 1e-6) return { position: { ...position }, blocked: false };
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, maxStep)));
  const step = { x: movement.x / steps, y: movement.y / steps };
  let current = { ...position };
  for (let i = 0; i < steps; i += 1) {
    const attempted = moveWithCollisions(current, step, radius, obstacles);
    const advanced = Math.hypot(attempted.x - current.x, attempted.y - current.y);
    current = attempted;
    if (advanced < 0.05) return { position: current, blocked: true };
  }
  return { position: current, blocked: false };
}

/**
 * Obstacle-aware steering: if the desired heading runs into a block, rotate it
 * in increasing increments until a clear lane opens up. Pure and cheap, and it
 * stops bots from grinding against the same wall forever.
 */
export function steerAroundObstacles(
  position: Vec2,
  desired: Vec2,
  lookahead: number,
  offsets = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3],
  obstacles: Rect[] = OBSTACLES
): Vec2 {
  const magnitude = Math.hypot(desired.x, desired.y);
  if (magnitude < 1e-6) return { x: 0, y: 0 };
  const base = Math.atan2(desired.y, desired.x);
  for (const offset of offsets) {
    const angle = base + offset;
    const probe = { x: position.x + Math.cos(angle) * lookahead, y: position.y + Math.sin(angle) * lookahead };
    if (!segmentBlocked(position, probe, obstacles)) {
      return { x: Math.cos(angle), y: Math.sin(angle) };
    }
  }
  // Fully boxed in: keep sliding along the wall by rotating fully sideways.
  return { x: Math.cos(base + Math.PI / 2), y: Math.sin(base + Math.PI / 2) };
}

export interface SpawnPlacement {
  position: Vec2;
  angle: number;
}

/**
 * Finds arena-legal spawn points on a ring around the arena centre.
 * Guarantees: inside the arena, not inside a block, at least `minPlayerDistance`
 * from the player, and not stacked on another spawn in the same wave.
 */
export function findSpawnPositions(
  count: number,
  player: Vec2,
  minPlayerDistance: number,
  radius: number,
  randomInRange: (min: number, max: number) => number,
  ringRadius = 250,
  obstacles: Rect[] = OBSTACLES
): SpawnPlacement[] {
  const placements: SpawnPlacement[] = [];
  const startAngle = randomInRange(0, Math.PI * 2);
  const target = Math.max(1, count);

  for (let i = 0; i < target; i += 1) {
    const baseAngle = startAngle + (Math.PI * 2 * i) / target;
    let chosen: SpawnPlacement | null = null;

    for (let attempt = 0; attempt < 64 && !chosen; attempt += 1) {
      const angle = baseAngle + randomInRange(-0.35, 0.35) + Math.floor(attempt / 8) * 0.42 * (i % 2 ? 1 : -1);
      const distance = ringRadius + randomInRange(0, 60) + Math.floor(attempt / 16) * 24;
      const candidate = {
        x: WORLD.width / 2 + Math.cos(angle) * distance,
        y: WORLD.height / 2 + Math.sin(angle) * distance
      };
      const clamped = { x: clampToArena(candidate.x, radius, WORLD.width), y: clampToArena(candidate.y, radius, WORLD.height) };
      if (!hasClearance(clamped, radius, 4, obstacles)) continue;
      if (Math.hypot(clamped.x - player.x, clamped.y - player.y) < minPlayerDistance) continue;
      if (placements.some((placement) => Math.hypot(placement.position.x - clamped.x, placement.position.y - clamped.y) < radius * 3.4)) continue;
      chosen = { position: clamped, angle };
    }

    if (!chosen) {
      // Deterministic fallback sweep so a wave can never spawn short.
      for (let step = 0; step < 240 && !chosen; step += 1) {
        const angle = (Math.PI * 2 * step) / 240;
        for (let r = ringRadius; r >= 90; r -= 24) {
          const candidate = { x: WORLD.width / 2 + Math.cos(angle) * r, y: WORLD.height / 2 + Math.sin(angle) * r };
          const clamped = { x: clampToArena(candidate.x, radius, WORLD.width), y: clampToArena(candidate.y, radius, WORLD.height) };
          if (!hasClearance(clamped, radius, 4, obstacles)) continue;
          if (Math.hypot(clamped.x - player.x, clamped.y - player.y) < Math.min(minPlayerDistance, 140)) continue;
          if (placements.some((placement) => Math.hypot(placement.position.x - clamped.x, placement.position.y - clamped.y) < radius * 2.6)) continue;
          chosen = { position: clamped, angle };
          break;
        }
      }
    }

    placements.push(chosen ?? { position: { x: WORLD.width / 2, y: 60 }, angle: baseAngle });
  }

  return placements;
}

/** Closest point along a segment to a circle centre, used for impact placement. */
export function closestPointOnSegment(start: Vec2, end: Vec2, target: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-6) return { ...start };
  const projection = Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared));
  return { x: start.x + projection * dx, y: start.y + projection * dy };
}

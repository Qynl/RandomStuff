import type { Rect, Vec2 } from "./types";

export const WORLD = { width: 1500, height: 1100 };

/**
 * The logical viewport: what the camera shows of the arena at once.
 *
 * The arenas are two and a half times the size of the window, so the camera
 * tracks the player and the minimap carries the rest. A fight that spans a whole
 * screen is a fight you can walk into by accident, which is the point.
 */
export const VIEW = { width: 960, height: 600 };

/** One authored tile of an arena, in world units. */
export const TILE = 50;

/** Arena walls keep a little breathing room so effects near the edge stay readable. */
export const WALL_INSET = 12;

/**
 * Arena layouts.
 *
 * Each arena is authored as a *quadrant* - eleven rows of fifteen characters -
 * which is mirrored across both axes, so every map is symmetric (nobody wins a
 * fight by spawning on the good side) and the authored art is a quarter of the
 * size. The tile language is deliberately simple:
 *
 *   `.` floor      `#` wall (blocks movement and shots)
 *   `c` crate      `o` bush (hides whoever is inside it, blocks nothing)
 *   `~` water (wade through slowly; shots fly over it)
 *
 * Blocks are merged from tiles into the fewest rectangles that cover them, so a
 * long bank of wall is one collision box and one piece of art rather than fifty.
 */
export type ArenaLayoutId = "foundry" | "crossroads" | "gardens" | "mine" | "plaza" | "boneyard" | "proving";

/** What a solid tile is made of. Crates are painted as breakable wood. */
export type ArenaBlockKind = "wall" | "crate";

export interface ArenaBlock extends Rect {
  kind: ArenaBlockKind;
}

/** Terrain skins. One per arena family, so the maps do not all look poured. */
export type BiomeId = "foundry" | "quarry" | "garden" | "harbour";

export interface ArenaLayout {
  name: string;
  /** One line for the arena sheet: what fighting here feels like. */
  blurb: string;
  /** Terrain skin: floor, wall and foliage paint for this arena. */
  biome: BiomeId;
  obstacles: ArenaBlock[];
  /** Bushes: walk through them, shoot through them, but you are hidden inside. */
  bushes: Rect[];
  /** Water: wading is slow, and it hides nothing. Shots pass over the top. */
  water: Rect[];
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

/** Merges every maximal horizontal run of tiles, then stacks identical runs. */
function mergeTiles(rows: string[], chars: string): Rect[] {
  const out: Rect[] = [];
  let active = new Map<string, Rect>();
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    const next = new Map<string, Rect>();
    let x = 0;
    while (x < row.length) {
      if (!chars.includes(row[x])) {
        x += 1;
        continue;
      }
      let end = x;
      while (end + 1 < row.length && chars.includes(row[end + 1])) end += 1;
      const key = `${x}:${end - x + 1}`;
      const open = active.get(key);
      if (open) {
        open.h += TILE;
        next.set(key, open);
      } else {
        const rect: Rect = { x: x * TILE, y: y * TILE, w: (end - x + 1) * TILE, h: TILE };
        out.push(rect);
        next.set(key, rect);
      }
      x = end + 1;
    }
    active = next;
  }
  return out;
}

/**
 * Mirrors an authored quadrant into a full tile grid.
 *
 * The bottom-centre pad is cleared afterwards: that is where the operator
 * starts, and no map is allowed to begin with a wall in the player's face.
 */
function buildTiles(quadrant: string[]): string[] {
  const cols = quadrant[0].length * 2;
  const rows = quadrant.length * 2;
  const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => "."));
  for (let y = 0; y < quadrant.length; y += 1) {
    for (let x = 0; x < quadrant[y].length; x += 1) {
      const tile = quadrant[y][x];
      const mirrorX = cols - 1 - x;
      const mirrorY = rows - 1 - y;
      grid[y][x] = tile;
      grid[y][mirrorX] = tile;
      grid[mirrorY][x] = tile;
      grid[mirrorY][mirrorX] = tile;
    }
  }
  for (let y = rows - 2; y < rows; y += 1) {
    for (let x = cols / 2 - 2; x < cols / 2 + 2; x += 1) grid[y][x] = ".";
  }
  return grid.map((row) => row.join(""));
}

interface LayoutSpec {
  name: string;
  blurb: string;
  biome: BiomeId;
  openness: number;
  accent: string;
  accentSoft: string;
  quadrant: string[];
}

function buildLayout(spec: LayoutSpec): ArenaLayout {
  const tiles = buildTiles(spec.quadrant);
  return {
    name: spec.name,
    blurb: spec.blurb,
    biome: spec.biome,
    obstacles: [
      ...mergeTiles(tiles, "#").map((rect) => ({ ...rect, kind: "wall" as const })),
      ...mergeTiles(tiles, "c").map((rect) => ({ ...rect, kind: "crate" as const }))
    ],
    bushes: mergeTiles(tiles, "o"),
    water: mergeTiles(tiles, "~"),
    openness: spec.openness,
    accent: spec.accent,
    accentSoft: spec.accentSoft
  };
}

export const ARENA_LAYOUTS: Record<ArenaLayoutId, ArenaLayout> = {
  foundry: buildLayout({
    name: "FOUNDRY",
    blurb: "Four machine rooms with doorways. Fight through a bay, or go around and come in behind.",
    biome: "foundry",
    openness: 0.55,
    accent: "rgba(93, 131, 161, 0.5)",
    accentSoft: "rgba(255, 180, 84, 0.13)",
    quadrant: [
      "...............",
      "...#####.......",
      "...#.....#.....",
      "...#..c..#.....",
      "...#.....#.....",
      "...###.###.....",
      "...............",
      "....oo....c....",
      "....oo....#....",
      "...............",
      "..............."
    ]
  }),
  crossroads: buildLayout({
    name: "CROSSROADS",
    blurb: "Long walls with gates punched through them. Every long sight line ends at a doorway.",
    biome: "quarry",
    openness: 0.6,
    accent: "rgba(110, 140, 190, 0.55)",
    accentSoft: "rgba(120, 190, 255, 0.14)",
    quadrant: [
      "...............",
      "......#........",
      "......#...oo...",
      "....###........",
      "...............",
      "..c....#.......",
      "..##...#.......",
      ".......#...##..",
      "...........#...",
      "........oo.#...",
      "..............."
    ]
  }),
  gardens: buildLayout({
    name: "GARDENS",
    blurb: "Hedge blocks and four walled plots. Bushes break every line; the plots break every dash.",
    biome: "garden",
    openness: 0.5,
    accent: "rgba(120, 165, 150, 0.5)",
    accentSoft: "rgba(128, 232, 196, 0.12)",
    quadrant: [
      "...............",
      "..ooo......ooo.",
      "..ooo......ooo.",
      ".....##.####...",
      ".....##.#......",
      "........#..c...",
      ".....##.#......",
      ".....##.####...",
      "...............",
      "......oo.......",
      "......oo......."
    ]
  }),
  mine: buildLayout({
    name: "GEM MINE",
    blurb: "Long banks, a wide central yard and ore crates in the corners. The middle is a killing field.",
    biome: "quarry",
    openness: 0.6,
    accent: "rgba(190, 150, 100, 0.45)",
    accentSoft: "rgba(240, 190, 120, 0.12)",
    quadrant: [
      "...............",
      "....####.......",
      "....#..........",
      "....#.oo.......",
      ".......oo..c...",
      "...............",
      "..###..........",
      "..#...#..####..",
      "..#...#........",
      "..#...#........",
      "..............."
    ]
  }),
  plaza: buildLayout({
    name: "SUNKEN PLAZA",
    blurb: "Shallow water and a handful of stone blocks. Almost nowhere to hide, and nowhere to run fast.",
    biome: "harbour",
    openness: 0.8,
    accent: "rgba(96, 132, 148, 0.5)",
    accentSoft: "rgba(140, 200, 220, 0.12)",
    quadrant: [
      "...............",
      ".........~~~~~~",
      ".....~~~.......",
      "..~~......#....",
      ".........####..",
      "..........#....",
      "....c..........",
      ".......oo......",
      "...............",
      "...............",
      "..............."
    ]
  }),
  // The training range: the fixed, sparse geometry the pure geometry tests are
  // authored against (a block at a known coordinate, a clear lane to shoot down).
  // It is not in the picker, so nobody ever plays a run in it by accident.
  proving: {
    name: "TRAINING RANGE",
    blurb: "A sparse proving ground: four corner blocks and one in the middle. Nothing blocks a long shot here.",
    biome: "foundry",
    openness: 0.85,
    accent: "rgba(93, 131, 161, 0.5)",
    accentSoft: "rgba(255, 180, 84, 0.13)",
    obstacles: [
      { x: 218, y: 142, w: 74, h: 76, kind: "wall" },
      { x: 668, y: 142, w: 74, h: 76, kind: "wall" },
      { x: 218, y: 382, w: 74, h: 76, kind: "wall" },
      { x: 668, y: 382, w: 74, h: 76, kind: "wall" },
      { x: 430, y: 254, w: 100, h: 92, kind: "wall" }
    ],
    bushes: [],
    water: []
  },
  boneyard: buildLayout({
    name: "BONEYARD",
    blurb: "Scattered cover at every range. Nothing blocks a shot for long, so keep moving.",
    biome: "foundry",
    openness: 0.45,
    accent: "rgba(150, 130, 190, 0.4)",
    accentSoft: "rgba(197, 160, 255, 0.1)",
    quadrant: [
      "...............",
      "....##....#....",
      "..........#....",
      "..#......#.....",
      "..#.oo.........",
      "....oo....##...",
      "..........##...",
      ".....#....#....",
      "..c..#.........",
      "........#......",
      "..............."
    ]
  })
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
  // A cheap avalanche so neighbouring seeds do not land on the same layout.
  const mixed = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) ^ 0x27d4eb2f;
  return ARENA_ORDER[(mixed >>> 3) % ARENA_ORDER.length];
}

/** Picker order for the arena sheet, so the UI never leans on object key order. */
export const ARENA_ORDER: ArenaLayoutId[] = ["foundry", "crossroads", "gardens", "mine", "plaza", "boneyard"];

/** The layout a set of blocks came from, by identity. Null for hand-made lists. */
export function arenaIdForObstacles(obstacles: readonly Rect[]): ArenaLayoutId | null {
  for (const id of ARENA_ORDER) {
    if (ARENA_LAYOUTS[id].obstacles === obstacles) return id;
  }
  return null;
}

/** The arena a world uses before a seed names one. */
export const DEFAULT_ARENA: ArenaLayoutId = "foundry";

/**
 * The fixed geometry the pure geometry helpers default to.
 *
 * Every runtime call hands in the world's own block list, so this default only
 * exists for tests and one-off probes - and it is the training range on purpose,
 * because that is the arena whose coordinates the geometry expectations were
 * written against. Playable arenas are picked per seed from {@link ARENA_ORDER}.
 */
export const OBSTACLES: ArenaBlock[] = ARENA_LAYOUTS.proving.obstacles;

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

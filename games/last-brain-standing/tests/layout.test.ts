import { describe, expect, it } from "vitest";
import { ARENA_LAYOUTS, layoutForSeed, layoutRecordForSeed, rangeScaleForOpenness, WORLD, type ArenaLayoutId } from "../src/arena";
import { BOT_RADIUS, PLAYER_RADIUS } from "../src/constants";
import { createRng } from "../src/rng";
import { createWorld, resetWorld } from "../src/sim";
import { formatSeed } from "../src/rng";

/**
 * Arena layouts.
 *
 * The layouts are hand-placed and picked by seed, so the job of this file is to
 * prove that (a) every layout is playable - nothing traps the player or a
 * hostile, the middle stays connected, spawn space exists - and (b) the choice
 * is deterministic and survives a seed round trip, which is what "same seed,
 * same fight" means now that geometry is part of the fight.
 */

const ids = Object.keys(ARENA_LAYOUTS) as ArenaLayoutId[];
const START = { x: WORLD.width / 2, y: WORLD.height - 88 };

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("arena layouts", () => {
  it("offers several visually distinct layouts", () => {
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const id of ids) {
      const layout = ARENA_LAYOUTS[id];
      expect(layout.name.length).toBeGreaterThan(2);
      expect(layout.obstacles.length).toBeGreaterThanOrEqual(4);
      expect(new Set(layout.obstacles.map((block) => `${block.x}:${block.y}:${block.w}:${block.h}`)).size).toBe(layout.obstacles.length);
    }
    // The names are used in the HUD, so they must be unique.
    expect(new Set(ids.map((id) => ARENA_LAYOUTS[id].name)).size).toBe(ids.length);
  });

  it("keeps every block inside the walls and clear of the others", () => {
    for (const id of ids) {
      for (const block of ARENA_LAYOUTS[id].obstacles) {
        expect(block.x).toBeGreaterThan(0);
        expect(block.y).toBeGreaterThan(0);
        expect(block.x + block.w).toBeLessThan(WORLD.width);
        expect(block.y + block.h).toBeLessThan(WORLD.height);
      }
      const blocks = ARENA_LAYOUTS[id].obstacles;
      for (let i = 0; i < blocks.length; i += 1) {
        for (let j = i + 1; j < blocks.length; j += 1) {
          expect(overlaps(blocks[i], blocks[j])).toBe(false);
        }
      }
    }
  });

  it("leaves room to stand (and to spawn) in every layout", () => {
    for (const id of ids) {
      const blocks = ARENA_LAYOUTS[id].obstacles;
      // The player's start position has to be free with a margin, otherwise a
      // run could begin already overlapping a block.
      expect(blocks.some((block) => overlaps({ x: START.x - 30, y: START.y - 30, w: 60, h: 60 }, block))).toBe(false);
      // No layout may seal the arena into separate rooms: sample a dense grid
      // and make sure every open cell is reachable from the player's start by
      // stepping between neighbouring cells (a flood fill on the free space).
      const grid = 12;
      const cols = Math.ceil(WORLD.width / grid);
      const rows = Math.ceil(WORLD.height / grid);
      const free = (cx: number, cy: number) => {
        const point = { x: cx * grid + grid / 2, y: cy * grid + grid / 2 };
        if (point.x < PLAYER_RADIUS + 12 || point.y < PLAYER_RADIUS + 12) return false;
        if (point.x > WORLD.width - PLAYER_RADIUS - 12 || point.y > WORLD.height - PLAYER_RADIUS - 12) return false;
        const probe = { x: point.x - PLAYER_RADIUS, y: point.y - PLAYER_RADIUS, w: PLAYER_RADIUS * 2, h: PLAYER_RADIUS * 2 };
        return !blocks.some((block) => overlaps(probe, block));
      };
      const start = { cx: Math.floor(START.x / grid), cy: Math.floor(START.y / grid) };
      const seen = new Set<string>([`${start.cx}:${start.cy}`]);
      const queue = [start];
      while (queue.length > 0) {
        const { cx, cy } = queue.pop() as { cx: number; cy: number };
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const key = `${nx}:${ny}`;
          if (seen.has(key) || !free(nx, ny)) continue;
          seen.add(key);
          queue.push({ cx: nx, cy: ny });
        }
      }
      const openCells: string[] = [];
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (free(cx, cy)) openCells.push(`${cx}:${cy}`);
        }
      }
      // Every free cell must be reachable: no sealed pockets anywhere.
      expect(openCells.filter((cell) => !seen.has(cell))).toEqual([]);
      expect(openCells.length).toBeGreaterThan(200);
    }
  });

  it("leaves cover that a hostile body actually fits behind", () => {
    for (const id of ids) {
      const blocks = ARENA_LAYOUTS[id].obstacles;
      for (const block of blocks) {
        // Blocks are wide enough to hide a bot but none of them is a hairline.
        expect(Math.min(block.w, block.h)).toBeGreaterThanOrEqual(BOT_RADIUS * 2);
      }
      // At least one block sits far enough from the walls that a chase can pass
      // on both sides of it.
      const hasOpenSides = blocks.some((block) => block.x > BOT_RADIUS * 4 && block.x + block.w < WORLD.width - BOT_RADIUS * 4);
      expect(hasOpenSides).toBe(true);
    }
  });

  it("picks a layout from the seed, deterministically", () => {
    const seen = new Set<ArenaLayoutId>();
    const rng = createRng("layout-variety");
    for (let i = 0; i < 200; i += 1) {
      const seed = rng.int(1, 0xffffff);
      const id = layoutForSeed(seed);
      expect(ids).toContain(id);
      // Same seed, same layout, every time.
      expect(layoutForSeed(seed)).toBe(id);
      seen.add(id);
    }
    // And all four show up in a reasonable sample, otherwise the variety is a lie.
    expect(seen.size).toBe(ids.length);
  });

  it("gives a world the layout its seed names, through a reset and a label round trip", () => {
    const world = createWorld({ seed: "layout-world" });
    const id = layoutForSeed(world.seed);
    expect(world.obstacles).toBe(ARENA_LAYOUTS[id].obstacles);
    expect(world.arenaName).toBe(ARENA_LAYOUTS[id].name);

    // Restarting with the same seed keeps the same arena.
    resetWorld(world, { seed: "layout-world" });
    expect(world.arenaName).toBe(ARENA_LAYOUTS[id].name);

    // Replaying from the HUD label restores the same arena, blocks and all.
    const label = formatSeed(world.seed);
    const replay = createWorld({ seed: label });
    expect(replay.seed).toBe(world.seed);
    expect(replay.arenaName).toBe(world.arenaName);
    expect(replay.obstacles).toEqual(world.obstacles);

    // A different seed is free to pick a different layout, and whatever it picks
    // is one of the real ones.
    const other = createWorld({ seed: "some-other-run" });
    expect(ids).toContain(layoutForSeed(other.seed));
    expect(other.obstacles).toBe(ARENA_LAYOUTS[layoutForSeed(other.seed)].obstacles);
  });

  it("describes how open each layout is, and scales hostile ranges sanely", () => {
    for (const id of ids) {
      const openness = ARENA_LAYOUTS[id].openness;
      expect(openness).toBeGreaterThan(0.2);
      expect(openness).toBeLessThanOrEqual(1);
      const scale = rangeScaleForOpenness(openness);
      // Hostiles never lose more than about a third of their preferred range,
      // and never gain one: a tighter arena means a tighter ring.
      expect(scale).toBeGreaterThanOrEqual(0.6);
      expect(scale).toBeLessThanOrEqual(1);
    }
    // More cover means a closer ring, monotonically, and clamped at both ends.
    expect(rangeScaleForOpenness(0.2)).toBeLessThan(rangeScaleForOpenness(0.9));
    expect(rangeScaleForOpenness(-5)).toBe(rangeScaleForOpenness(0));
    expect(rangeScaleForOpenness(5)).toBe(rangeScaleForOpenness(1));
  });

  it("names each layout for the HUD and tints its cover", () => {
    const accents = new Set<string>();
    for (const id of ids) {
      const layout = ARENA_LAYOUTS[id];
      expect(layout.name).toBe(layout.name.toUpperCase());
      expect(layout.accent).toMatch(/^rgba\(/);
      expect(layout.accentSoft).toMatch(/^rgba\(/);
      accents.add(layout.accent);
    }
    // Cover reads differently in each arena, otherwise the variety is invisible.
    expect(accents.size).toBe(ids.length);
    expect(layoutRecordForSeed(1234).name).toBe(ARENA_LAYOUTS[layoutForSeed(1234)].name);
  });
});

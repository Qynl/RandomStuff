import { describe, expect, it } from "vitest";
import { ARENA_LAYOUTS, ARENA_ORDER, CRATE_HEALTH, segmentBlocked, WORLD, type ArenaBlock } from "../src/arena";
import {
  BUSH_HIDE_RANGE,
  CRATE_HEALTH as SIM_CRATE_HEALTH,
  createWorld,
  emptyInput,
  isPlayerHidden,
  MEDKIT_HEAL,
  PICKUP_LIFE,
  PICKUP_RADIUS,
  REVEAL_AFTER_FIRING,
  stepWorld,
  WATER_SPEED_SCALE,
  type SimInput,
  type World
} from "../src/sim";
import { PLAYER_RADIUS } from "../src/constants";
import { pinLayout } from "./helpers/layout";

/**
 * Terrain.
 *
 * An arena is not a picture: hedges hide whoever stands in them, water costs
 * speed, and crates are the one kind of cover that can be taken away and leave
 * something behind. These tests pin the rules the map is drawn to advertise,
 * because every one of them is invisible in a screenshot.
 */

const STEP = 1 / 60;

/** A running world on a hand-built patch of terrain. */
function arena(blocks: ArenaBlock[], extras: { bushes?: World["bushes"]; water?: World["water"] } = {}): World {
  const world = createWorld({ seed: "terrain" });
  pinLayout(world);
  world.phase = "running";
  world.waveState = "cleared";
  world.waveTimer = 999;
  world.pendingSpawns.length = 0;
  world.bots.length = 0;
  // Hand-built geometry: these tests are about one mechanic at a time.
  world.obstacles = blocks.map((block) => ({ ...block }));
  world.brokenCrates = [];
  world.pickups = [];
  world.bushes = extras.bushes ?? [];
  world.water = extras.water ?? [];
  return world;
}

const crate = (x: number, y: number): ArenaBlock => ({ x, y, w: 50, h: 50, kind: "crate", maxHealth: CRATE_HEALTH });
const wallBlock = (x: number, y: number): ArenaBlock => ({ x, y, w: 50, h: 50, kind: "wall" });

/** Hold the trigger down the given lane for a while, through the real firing path. */
function fireAt(world: World, target: { x: number; y: number }, seconds: number) {
  const events: ReturnType<typeof stepWorld> = [];
  const input: SimInput = { ...emptyInput(), aim: { ...target }, firing: true };
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
    events.push(...stepWorld(world, input, STEP));
  }
  return events;
}

describe("hedges", () => {
  it("hides whoever is standing in one from anything far enough away", () => {
    const bush = { x: 400, y: 380, w: 90, h: 90 };
    const world = arena([], { bushes: [bush] });
    world.player.position = { x: bush.x + bush.w / 2, y: bush.y + bush.h / 2 };
    const watcher = (x: number) => ({ x: world.player.position.x + x, y: world.player.position.y });

    // A hostile standing right at the hedge can see into it, which is what stops
    // a bush being an invisibility cap; one further out cannot.
    expect(isPlayerHidden(world, watcher(BUSH_HIDE_RANGE))).toBe(false);
    expect(isPlayerHidden(world, watcher(BUSH_HIDE_RANGE + 1))).toBe(true);

    // And stepping out of the hedge gives the game away at any range.
    world.player.position = { x: bush.x - 40, y: bush.y + bush.h / 2 };
    expect(isPlayerHidden(world, watcher(500))).toBe(false);
  });

  it("gives the operative away when they fire out of cover", () => {
    const bush = { x: 400, y: 380, w: 90, h: 90 };
    const world = arena([], { bushes: [bush] });
    world.player.position = { x: bush.x + bush.w / 2, y: bush.y + bush.h / 2 };
    const watcher = { x: world.player.position.x + BUSH_HIDE_RANGE + 120, y: world.player.position.y };
    expect(isPlayerHidden(world, watcher)).toBe(true);

    // A trigger pull lights the operative up for a moment: the muzzle flash is
    // part of the cost of shooting from a hedge.
    const input: SimInput = { ...emptyInput(), firing: true, aim: { x: world.player.position.x + 200, y: world.player.position.y } };
    stepWorld(world, input, STEP);
    expect(world.player.revealTime).toBeGreaterThan(REVEAL_AFTER_FIRING * 0.8);
    expect(isPlayerHidden(world, watcher)).toBe(false);

    // Stop firing and the hedge closes over them again.
    for (let i = 0; i < Math.round((REVEAL_AFTER_FIRING + 0.2) / STEP); i += 1) stepWorld(world, emptyInput(), STEP);
    expect(world.player.revealTime).toBe(0);
    expect(isPlayerHidden(world, watcher)).toBe(true);
  });

  it("cannot see a phased operative at all, cover or no cover", () => {
    const world = arena([]);
    world.player.position = { x: 700, y: 500 };
    const watcher = { x: 720, y: 500 };
    expect(isPlayerHidden(world, watcher)).toBe(false);
    world.player.phaseTime = 1;
    expect(isPlayerHidden(world, watcher)).toBe(true);
  });

  it("authors hedges and water that sit inside the arena and off the walls", () => {
    for (const id of ARENA_ORDER) {
      const layout = ARENA_LAYOUTS[id];
      for (const bush of layout.bushes) {
        expect(bush.w).toBeGreaterThan(0);
        expect(bush.h).toBeGreaterThan(0);
        expect(bush.x).toBeGreaterThanOrEqual(0);
        expect(bush.y).toBeGreaterThanOrEqual(0);
        expect(bush.x + bush.w).toBeLessThanOrEqual(WORLD.width);
        expect(bush.y + bush.h).toBeLessThanOrEqual(WORLD.height);
        // A hedge drawn over a wall would be cover nobody can walk into.
        expect(
          segmentBlocked(
            { x: bush.x + 2, y: bush.y + 2 },
            { x: bush.x + bush.w - 2, y: bush.y + bush.h - 2 },
            layout.obstacles
          )
        ).toBe(false);
      }
      for (const pool of layout.water) {
        expect(pool.x + pool.w).toBeLessThanOrEqual(WORLD.width);
        expect(pool.y + pool.h).toBeLessThanOrEqual(WORLD.height);
        expect(pool.x).toBeGreaterThanOrEqual(0);
        expect(pool.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("water", () => {
  it("costs speed to wade through", () => {
    const wade = (inWater: boolean) => {
      const world = arena([], { water: inWater ? [{ x: 300, y: 400, w: 400, h: 200 }] : [] });
      world.player.position = { x: 340, y: 500 };
      const start = { ...world.player.position };
      const input: SimInput = { ...emptyInput(), move: { x: 1, y: 0 } };
      for (let i = 0; i < 60; i += 1) stepWorld(world, input, STEP);
      return Math.hypot(world.player.position.x - start.x, world.player.position.y - start.y);
    };
    const dry = wade(false);
    const wet = wade(true);
    expect(dry).toBeGreaterThan(100);
    // Slower by the advertised factor, not by a mysterious amount.
    expect(wet / dry).toBeGreaterThan(WATER_SPEED_SCALE - 0.08);
    expect(wet / dry).toBeLessThan(WATER_SPEED_SCALE + 0.08);
  });
});

describe("crates", () => {
  it("cracks under fire, then opens the lane and leaves a supply", () => {
    const target = crate(500, 460);
    const world = arena([target]);
    const crateBlock = world.obstacles[0];
    world.player.position = { x: 380, y: 485 };
    expect(segmentBlocked(world.player.position, { x: 700, y: 485 }, world.obstacles)).toBe(true);

    const events = fireAt(world, { x: 700, y: 485 }, 3);
    const hits = events.filter((event) => event.type === "crate-hit");
    const broken = events.filter((event) => event.type === "crate-broken");
    expect(hits.length).toBeGreaterThan(0);
    expect(broken).toHaveLength(1);
    // Hit points come off in order, and there are enough rounds in a clip's worth
    // of fire for the crack to be a stage rather than a formality.
    const healths = hits.map((event) => (event.type === "crate-hit" ? event.health : 0));
    expect(healths[0]).toBeLessThan(CRATE_HEALTH);
    expect(healths.at(-1)!).toBeLessThan(healths[0]);
    expect(healths.every((health) => health > 0)).toBe(true);

    // The block is gone from the collision list, and the lane reads as open.
    expect(world.obstacles).not.toContain(crateBlock);
    expect(segmentBlocked(world.player.position, { x: 700, y: 485 }, world.obstacles)).toBe(false);
    expect(world.brokenCrates).toHaveLength(1);
    expect(world.brokenCrates[0].x).toBe(target.x);

    // And it paid out: one supply, of the kind the crate's own position implies.
    expect(world.pickups).toHaveLength(1);
    const drop = broken[0].type === "crate-broken" ? broken[0].drop : null;
    expect(drop).not.toBeNull();
    expect(world.pickups[0].kind).toBe(drop);
    // Still nearly full: a supply ages on the floor from the moment it lands.
    expect(world.pickups[0].life).toBeGreaterThan(PICKUP_LIFE - 3.1);
    expect(world.pickups[0].life).toBeLessThanOrEqual(PICKUP_LIFE);
    expect(world.pickups[0].position.x).toBe(target.x + target.w / 2);
  });

  it("is not dismantled by hostile fire", () => {
    const target = crate(500, 460);
    const world = arena([target]);
    world.player.position = { x: 380, y: 485 };
    // A hostile round, straight at the crate, through the same bullet step.
    world.bullets.push({
      position: { x: target.x - 14, y: target.y + 25 },
      velocity: { x: 600, y: 0 },
      owner: "bot",
      damage: 40,
      life: 1,
      color: "#fff",
      source: "hunter",
      travelled: 0
    });
    // Step with nothing held down: the hostile round is the only thing moving.
    const events: ReturnType<typeof stepWorld> = [];
    for (let i = 0; i < 20; i += 1) events.push(...stepWorld(world, emptyInput(), STEP));
    expect(events.some((event) => event.type === "crate-hit" || event.type === "crate-broken")).toBe(false);
    expect(world.obstacles).toHaveLength(1);
    // Untouched: no damage field written, and the crate is still solid.
    expect((world.obstacles[0] as { health?: number }).health).toBeUndefined();
    expect(segmentBlocked(world.player.position, { x: 700, y: 485 }, world.obstacles)).toBe(true);
  });

  it("leaves walls exactly where they are", () => {
    const world = arena([wallBlock(500, 460)]);
    world.player.position = { x: 380, y: 485 };
    const events = fireAt(world, { x: 700, y: 485 }, 2);
    expect(events.some((event) => event.type === "crate-hit" || event.type === "crate-broken")).toBe(false);
    expect(world.obstacles).toHaveLength(1);
    expect(world.brokenCrates).toHaveLength(0);
    expect(world.pickups).toHaveLength(0);
    expect(segmentBlocked(world.player.position, { x: 700, y: 485 }, world.obstacles)).toBe(true);
  });

  it("never damages the authored layout a run was built from", () => {
    const id = ARENA_ORDER.find((entry) => ARENA_LAYOUTS[entry].obstacles.some((block) => block.kind === "crate"))!;
    const layout = ARENA_LAYOUTS[id];
    const before = layout.obstacles.map((block) => ({ ...block }));
    const world = createWorld({ seed: "terrain" });
    pinLayout(world, id);
    world.phase = "running";
    world.waveState = "cleared";
    world.waveTimer = 999;
    world.pendingSpawns.length = 0;
    world.bots.length = 0;

    // Every crate in an authored arena is a real piece of cover with hit points.
    const crates = world.obstacles.filter((block) => block.kind === "crate");
    expect(crates.length).toBeGreaterThan(0);
    expect(crates.every((block) => block.maxHealth === CRATE_HEALTH)).toBe(true);
    // The world's blocks are copies, so the layout cannot be shot apart.
    expect(world.obstacles).not.toBe(layout.obstacles);

    // Break one: the world loses its block, the layout keeps every one of them.
    const target = crates[0];
    world.obstacles.splice(world.obstacles.indexOf(target), 1);
    expect(world.obstacles).toHaveLength(layout.obstacles.length - 1);
    expect(ARENA_LAYOUTS[id].obstacles).toEqual(before);
    expect(ARENA_LAYOUTS[id].obstacles.every((block) => block.health === undefined)).toBe(true);
  });

  it("keeps the crate hit points the sim uses in step with the authoring layer", () => {
    expect(SIM_CRATE_HEALTH).toBe(CRATE_HEALTH);
  });
});

describe("supplies", () => {
  const drop = (world: World, kind: "medkit" | "charge", at: { x: number; y: number }) => {
    world.pickups.push({ id: 1, kind, position: { ...at }, life: PICKUP_LIFE });
  };

  it("heals the operative who walks over a medkit", () => {
    const world = arena([]);
    world.player.position = { x: 400, y: 400 };
    world.player.health = 40;
    drop(world, "medkit", { x: 405, y: 400 });
    const events = fireAt(world, { x: 900, y: 400 }, 0.1);
    const taken = events.filter((event) => event.type === "pickup-collected");
    expect(taken).toHaveLength(1);
    expect(taken[0].type === "pickup-collected" ? taken[0].heals : 0).toBe(MEDKIT_HEAL);
    expect(world.player.health).toBe(40 + MEDKIT_HEAL);
    expect(world.pickups).toHaveLength(0);
  });

  it("never heals past the operative's maximum", () => {
    const world = arena([]);
    world.player.position = { x: 400, y: 400 };
    world.player.health = world.player.maxHealth - 4;
    drop(world, "medkit", { x: 404, y: 400 });
    const events = fireAt(world, { x: 900, y: 400 }, 0.1);
    expect(events.some((event) => event.type === "pickup-collected")).toBe(true);
    expect(world.player.health).toBe(world.player.maxHealth);
  });

  it("hands the dash straight back", () => {
    const world = arena([]);
    world.player.position = { x: 400, y: 400 };
    world.player.dashCooldown = 3.5;
    drop(world, "charge", { x: 404, y: 400 });
    const events = fireAt(world, { x: 900, y: 400 }, 0.1);
    expect(events.some((event) => event.type === "pickup-collected" && event.kind === "charge")).toBe(true);
    expect(world.player.dashCooldown).toBe(0);
  });

  it("is taken back by the arena when nobody comes for it", () => {
    const world = arena([]);
    world.player.position = { x: 200, y: 200 };
    world.player.health = 50;
    drop(world, "medkit", { x: 900, y: 900 });
    for (let i = 0; i < Math.round((PICKUP_LIFE + 1) / STEP); i += 1) stepWorld(world, emptyInput(), STEP);
    expect(world.pickups).toHaveLength(0);
    expect(world.player.health).toBe(50);
  });

  it("is walked onto, never magnetised: a supply out of reach stays put", () => {
    const world = arena([wallBlock(460, 400)]);
    world.player.position = { x: 400, y: 425 };
    drop(world, "medkit", { x: 460 + 50 + PICKUP_RADIUS + PLAYER_RADIUS + 4, y: 425 });
    fireAt(world, { x: 900, y: 425 }, 0.2);
    expect(world.pickups).toHaveLength(1);
    expect(world.player.health).toBe(world.player.maxHealth);
  });
});

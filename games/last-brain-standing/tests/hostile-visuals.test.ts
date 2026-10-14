// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArenaGame } from "../src/game";
import { hasClearance, segmentBlocked, WORLD } from "../src/arena";
import { BOT_ART, frameOf } from "../src/art";
import { SIGHT_START_RANGE, SIGHT_START_SWEEP, aimFor } from "../src/signatures";
import { shortestAngleDelta } from "../src/sim";
import {
  AIM_HOLD_PATIENCE,
  AIM_HOLD_RATE,
  AIM_SETTLED_ERROR,
  BOT_KINDS,
  holdsFireWhileSlewing,
  TARGET_TRACK_RATE,
  tracksTargetAlways,
  windupDrainRate
} from "../src/ai";
import type { BotKind } from "../src/types";
import { installFrameController, installResizeObserver, type FrameController } from "./helpers/fake-dom";

/**
 * Hostile silhouettes.
 *
 * The roster only reads if the hostiles *look* like different things: a marksman
 * is a long low rail rather than a soldier, a bulwark is a slab stood broadside,
 * a shard is a speck. Size and orientation are the hardest parts of that to keep
 * honest by eye, so this file measures them: it renders one hostile at a time
 * against a canvas that tracks the transform matrix and asserts on the real
 * footprint in world units.
 *
 * It also pins the marksman's aim-in, which is the whole counterplay to it: the
 * sight appears out along the barrel, crawls onto the player, settles - and the
 * shot goes where it came to rest, so a sidestep after the freeze is a miss.
 */

/** A canvas context that applies the transform and records the geometry. */
interface Measured {
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  calls: number;
}

function createMeasuringContext(): {
  context: CanvasRenderingContext2D;
  /** Points the measuring window at the unit under inspection, live. */
  watch: (at: () => { x: number; y: number } | null | undefined) => void;
  reset: () => void;
  box: () => Measured;
} {
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: typeof m[] = [];
  let box: Measured = { width: 0, height: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, calls: 0 };
  /**
   * The unit's own draw pass is the only thing that translates to the unit *and*
   * scales inside that translation, so the window opens on the matching
   * translate and only geometry drawn once a scale has been seen is counted.
   * That is what keeps the floor, the crates, the telegraph lanes and the
   * durability ring out of the measurement.
   */
  let watchTarget: (() => { x: number; y: number } | null | undefined) | null = null;
  let open = false;
  let sawScale = false;
  let openedAt = 0;
  const closeWindow = () => {
    open = false;
  };
  const point = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  const extend = (x: number, y: number) => {
    if (!open || !sawScale) return;
    const p = point(x, y);
    box.minX = Math.min(box.minX, p.x);
    box.maxX = Math.max(box.maxX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxY = Math.max(box.maxY, p.y);
    box.calls += 1;
  };
  const rect = (x: number, y: number, w: number, h: number) => {
    extend(x, y);
    extend(x + w, y + h);
  };
  const ellipse = (x: number, y: number, rx: number, ry: number) => {
    extend(x - rx, y - ry);
    extend(x + rx, y + ry);
  };
  const arc = (x: number, y: number, r: number) => ellipse(x, y, r, r);
  const path: Array<[number, number]> = [];

  const target: Record<string, unknown> = {
    canvas: null,
    // Text is not geometry: the HUD must not inflate a hostile's footprint.
    fillText: () => undefined,
    strokeText: () => undefined,
    measureText: () => ({ width: 0 }),
    setLineDash: () => undefined,
    getLineDash: () => [],
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    save() {
      stack.push({ ...m });
    },
    restore() {
      const previous = stack.pop();
      if (previous) m = previous;
      // The unit's own block is the one that unwinds past where it opened; a
      // nested save/restore inside the model must not close the window.
      if (open && stack.length < openedAt) closeWindow();
    },
    translate(x: number, y: number) {
      // Every unit block translates straight to the unit's own position. The
      // unit is read live, because the simulation replaces the position object
      // as it moves and holding the old one would watch a stale point.
      const watched = watchTarget?.();
      if (!open && watched && Math.abs(x - watched.x) < 0.001 && Math.abs(y - watched.y) < 0.001) {
        open = true;
        sawScale = false;
        openedAt = stack.length;
      }
      m = { ...m, e: m.e + m.a * x + m.c * y, f: m.f + m.b * x + m.d * y };
    },
    scale(x: number, y: number) {
      if (open) sawScale = true;
      m = { ...m, a: m.a * x, b: m.b * x, c: m.c * y, d: m.d * y };
    },
    rotate(angle: number) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      m = {
        a: m.a * cos + m.c * sin,
        b: m.b * cos + m.d * sin,
        c: m.c * cos - m.a * sin,
        d: m.d * cos - m.b * sin,
        e: m.e,
        f: m.f
      };
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rect(x, y, w, h);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      rect(x, y, w, h);
    },
    clearRect: () => undefined,
    beginPath() {
      path.length = 0;
    },
    moveTo(x: number, y: number) {
      path.push([x, y]);
      extend(x, y);
    },
    lineTo(x: number, y: number) {
      path.push([x, y]);
      extend(x, y);
    },
    rect(x: number, y: number, w: number, h: number) {
      rect(x, y, w, h);
    },
    closePath: () => undefined,
    fill() {
      for (const [x, y] of path) extend(x, y);
    },
    stroke() {
      for (const [x, y] of path) extend(x, y);
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      ellipse(x, y, rx, ry);
    },
    arc(x: number, y: number, r: number) {
      arc(x, y, r);
    }
  };

  return {
    context: new Proxy(target, {
      get(object, property: string) {
        if (property in object) return object[property];
        // Unknown 2D calls are harmless for measurement; return a no-op so the
        // renderer keeps running.
        return () => undefined;
      },
      set(object, property: string, value: unknown) {
        object[property] = value;
        return true;
      }
    }) as unknown as CanvasRenderingContext2D,
    watch(at: () => { x: number; y: number } | null | undefined) {
      watchTarget = at;
    },
    reset() {
      box = { width: 0, height: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, calls: 0 };
      stack.length = 0;
      open = false;
      sawScale = false;
      m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    box() {
      return {
        ...box,
        width: box.maxX - box.minX,
        height: box.maxY - box.minY
      };
    }
  };
}

describe("hostile silhouettes", () => {
  let canvas: HTMLCanvasElement;
  let frames: FrameController;
  let restoreResizeObserver: () => void;
  let restoreContext: () => void;
  let measuring: ReturnType<typeof createMeasuringContext>;
  let game: ArenaGame;

  let nextId = 700;

  const area = (box: Measured) => box.width * box.height;
  /** Shortest-path angular error between two headings, in radians. */
  const headingError = (from: number, to: number) => Math.abs(Math.atan2(Math.sin(from - to), Math.cos(from - to)));

  /**
   * A clear lane for the pair to be parked in, chosen per arena layout: the
   * marksman shoots down lines of sight, so measuring it only means something
   * where the line actually exists.
   */
  const openLane = (
    bearing: number,
    reaches: number[] = [470, 380, 320, 260, 210]
  ): { bot: { x: number; y: number }; player: { x: number; y: number } } => {
    const obstacles = game.activeWorld.obstacles;
    // Long shots are preferred - the marksman's whole silhouette is about the
    // long line - but a 960x600 arena cannot hold 470 units of clear ground
    // pointing north, so shorter lanes are acceptable.
    for (const reach of reaches) {
      for (let y = 140; y <= WORLD.height - 140; y += 40) {
        for (let x = 140; x <= WORLD.width - 140; x += 40) {
          const bot = { x, y };
          const player = { x: x + Math.cos(bearing) * reach, y: y + Math.sin(bearing) * reach };
          if (player.x < 100 || player.y < 100 || player.x > WORLD.width - 100 || player.y > WORLD.height - 100) continue;
          if (!hasClearance(bot, 16, 8, obstacles)) continue;
          if (!hasClearance(player, 16, 8, obstacles)) continue;
          if (segmentBlocked(bot, player, obstacles)) continue;
          return { bot, player };
        }
      }
    }
    throw new Error("no clear lane in this arena");
  };

  /** A hostile, placed with everything a real spawn carries. */
  const parkBot = (
    kind: BotKind,
    at: { x: number; y: number },
    facing: number,
    fireCooldown: number,
    extra: Record<string, unknown> = {}
  ) => {
    nextId += 1;
    const world = game.activeWorld;
    world.bots.length = 0;
    world.bots.push({
      id: nextId,
      kind,
      position: { ...at },
      velocity: { x: 0, y: 0 },
      health: 48,
      maxHealth: 48,
      fireCooldown,
      windup: 0,
      windupDuration: 0,
      windupTurnRate: 2,
      facing,
      spawnGuard: 0,
      strafeSign: 1,
      strafeLock: 0,
      alive: true,
      hitFlash: 0,
      blindTime: 0,
      pendingRounds: 0,
      burstTimer: 0,
      diveTime: 0,
      diveCooldown: 0,
      stun: 0,
      chargeTime: 0,
      chargeDirection: { x: 0, y: 0 },
      sprayTime: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0,
      ...extra
    } as unknown as (typeof world.bots)[number]);
    return world.bots[0];
  };

  /**
   * Runs `count` frames with the hostile and the player held where they are.
   *
   * The arena is stopped so a measurement is about the unit and not about where
   * the AI happened to be driving it. Sight is guaranteed by the lane, and
   * re-anchoring the player each frame keeps the geometry the test asked for.
   */
  const holdStill = (
    state: { bot: { x: number; y: number }; player: { x: number; y: number } },
    count: number,
    pinFacing?: number
  ) => {
    const world = game.activeWorld;
    for (let frame = 0; frame < count; frame += 1) {
      const bot = world.bots[0];
      const pinned = { ...bot.position };
      world.player.position = { ...state.player };
      world.player.health = Math.max(world.player.health, 999);
      frames.advance(1);
      bot.position = pinned;
      if (pinFacing !== undefined) bot.facing = pinFacing;
    }
  };

  /**
   * One hostile of the given kind, parked and measured.
   *
   * A stunned hostile keeps its exact heading and position (the simulation bails
   * out of steering for it), which is what makes a footprint a footprint: the
   * unit is drawn looking the way the test asked for, so the box is the profile
   * rather than a rotated guess at it. The lane guarantees the sight lines the
   * tests below need, and the player is placed at the far end of it.
   */
  const footprint = (kind: BotKind, lookAt: "east" | "north" = "east"): Measured => {
    const bearing = lookAt === "east" ? 0 : -Math.PI / 2;
    const lane = openLane(bearing, kind === "shielder" ? [150, 210] : undefined);
    const world = game.activeWorld;
    world.player.position = { ...lane.player };
    parkBot(kind, lane.bot, bearing, 99, { stun: 99 });
    measuring.watch(() => game.activeWorld.bots[0]?.position);
    frames.advance(2);
    measuring.reset();
    frames.advance(1);
    return measuring.box();
  };

  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    canvas = document.createElement("canvas");
    canvas.width = WORLD.width;
    canvas.height = WORLD.height;
    document.body.append(canvas);
    measuring = createMeasuringContext();
    const proto = HTMLCanvasElement.prototype;
    const original = proto.getContext;
    proto.getContext = function patched(this: HTMLCanvasElement, type: string) {
      return type === "2d" ? measuring.context : null;
    } as HTMLCanvasElement["getContext"];
    restoreContext = () => {
      proto.getContext = original;
    };
    frames = installFrameController();
    restoreResizeObserver = installResizeObserver();
    game = new ArenaGame({ canvas });
    game.beginRun("silhouettes");
    frames.advance(2);
  });

  afterEach(() => {
    game.destroy();
    restoreContext();
    frames.restore();
    restoreResizeObserver();
    canvas.remove();
  });

  it("draws ten hostiles at ten different sizes", () => {
    const boxes = new Map<BotKind, Measured>();
    for (const kind of BOT_KINDS) boxes.set(kind, footprint(kind));
    boxes.set("shard", footprint("shard"));

    // Every profile is a different size of thing, so no two read alike.
    const signatures = [...boxes.values()].map((box) => `${Math.round(box.width)}x${Math.round(box.height)}`);
    expect(new Set(signatures).size).toBe(signatures.length);

    const sniper = boxes.get("sniper")!;
    const bulwark = boxes.get("shielder")!;
    const hunter = boxes.get("hunter")!;
    const mortar = boxes.get("mortar")!;
    const shard = boxes.get("shard")!;

    // The marksman is a rail: by far the longest thing on the field, and by far
    // the thinnest thing for its length.
    expect(sniper.width).toBeGreaterThan(hunter.width * 1.7);
    expect(sniper.width / sniper.height).toBeGreaterThan(3);
    expect(sniper.width / sniper.height).toBeGreaterThan((hunter.width / hunter.height) * 2.5);
    // The bulwark is the biggest thing that walks: the largest footprint on the
    // field, and much broader across its path than it is deep down it, which is
    // what makes it read as cover you have to go around rather than a fat unit.
    for (const [kind, box] of boxes) {
      if (kind === "shielder") continue;
      expect(area(bulwark)).toBeGreaterThan(area(box));
    }
    expect(bulwark.height).toBeGreaterThan(bulwark.width * 1.6);
    expect(bulwark.height).toBeGreaterThan(mortar.height * 1.2);
    // The shard is a speck next to both.
    expect(shard.width).toBeLessThan(hunter.width * 0.5);
    expect(shard.height).toBeLessThan(hunter.height * 0.5);

    // And those differences are the declared footprints, not an accident.
    expect(frameOf(BOT_ART.sniper).x).toBeGreaterThan(frameOf(BOT_ART.hunter).x);
    expect(frameOf(BOT_ART.shard).x).toBeLessThan(0.7);
    expect(frameOf(BOT_ART.shielder).y).toBeGreaterThan(frameOf(BOT_ART.sniper).y);
  });

  it("puts a different colour on every hostile body", () => {
    const bodies = [...BOT_KINDS, "shard" as BotKind].map((kind) => BOT_ART[kind].body.toLowerCase());
    expect(new Set(bodies).size).toBe(bodies.length);
    // Plates have to sit clear of the body, or the shape reads as one flat blob.
    for (const kind of [...BOT_KINDS, "shard"] as BotKind[]) {
      const art = BOT_ART[kind];
      expect(art.plate.toLowerCase()).not.toBe(art.body.toLowerCase());
      expect(art.accent.toLowerCase()).not.toBe(art.plate.toLowerCase());
    }
  });

  it("turns its silhouette onto what it is aiming at", () => {
    // The marksman aims at the player, so the rail lies along the target: long
    // when the player is east, tall when the player is north. That is the
    // readability promise - the barrel points at whoever it is about to shoot.
    const east = footprint("sniper", "east");
    const north = footprint("sniper", "north");
    expect(east.width).toBeGreaterThan(east.height * 3);
    expect(north.height).toBeGreaterThan(north.width * 3);
    expect(east.width).toBeGreaterThan(north.width * 2.5);
    // And it is the *same* silhouette either way round: the footprint is applied
    // in the unit's own frame, so a marksman looking north is the marksman
    // looking east, turned - not a rail that goes stubby when it looks up.
    expect(Math.abs(east.width - north.height)).toBeLessThan(1);
    expect(Math.abs(east.height - north.width)).toBeLessThan(1);
    // The bulwark holds its shield across the way it is looking, so it reads the
    // other way round from the marksman: facing east it is a tall slab, facing
    // north a wide one, and either way it is the broad side you must go around.
    const wallEast = footprint("shielder", "east");
    const wallNorth = footprint("shielder", "north");
    expect(wallEast.height).toBeGreaterThan(wallEast.width * 1.6);
    expect(wallNorth.width).toBeGreaterThan(wallNorth.height * 1.6);
  });

  /**
   * The marksman's aim-in, frame by frame.
   *
   * Returns the trail of everything the tell did: where the sight started and
   * ended, how settled it got on the way, the heading the rifle came round to,
   * and (once the trigger is pulled) the line the slug actually left on.
   */
  const aimIn = (reach = 300) => {
    const lane = openLane(0, [reach]);
    const world = game.activeWorld;
    world.player.position = { ...lane.player };
    const bot = parkBot("sniper", lane.bot, Math.PI, 0);
    const startFacing = bot.facing;
    /** Gap from the sight to the player, every frame the sight exists. */
    const gaps: number[] = [];
    const settles: number[] = [];
    /** How far off the target line the sight is pointing, in radians. */
    const swings: number[] = [];
    /** The sight on the last frame before the slug left: the line it fires on. */
    let rested: { x: number; y: number } | null = null;
    let firedFromLock = false;
    /** The moment the sight is frozen and the rifle is committed to it. */
    let lockError = -1;
    let lockGap = -1;
    let bullet: { x: number; y: number } | null = null;
    for (let frame = 0; frame < 600 && !bullet; frame += 1) {
      holdStill(lane, 1);
      const sight = bot.sight;
      if (sight) {
        gaps.push(Math.hypot(sight.x - world.player.position.x, sight.y - world.player.position.y));
        settles.push(bot.aimSettle ?? 0);
        swings.push(
          headingError(
            Math.atan2(sight.y - bot.position.y, sight.x - bot.position.x),
            Math.atan2(world.player.position.y - bot.position.y, world.player.position.x - bot.position.x)
          )
        );
        rested = { ...sight };
        // Once true it stays true: the last frames of a wind-up report a wind-up
        // that is about to end, and the point is that the sight was committed.
        firedFromLock = firedFromLock || bot.windup > 0;
        if (lockError < 0 && bot.windup > 0 && (bot.aimSettle ?? 0) >= 1) {
          // Locked: the sight stops moving and the rifle points down it.
          lockError = headingError(
            bot.facing,
            Math.atan2(sight.y - bot.position.y, sight.x - bot.position.x)
          );
          lockGap = Math.hypot(sight.x - world.player.position.x, sight.y - world.player.position.y);
        }
      }
      const shot = world.bullets.find((round) => round.owner === "bot");
      if (shot) bullet = { ...shot.velocity };
    }
    const heading = bullet ? Math.atan2(bullet.y, bullet.x) : null;
    return { lane, bot, world, startFacing, gaps, swings, settles, rested, firedFromLock, lockError, lockGap, heading };
  };

  it("sights in: the sight crawls, the gauge climbs, the rail comes round", () => {
    const { gaps, swings, settles, firedFromLock, lockError, lockGap } = aimIn(300);
    // It was aiming away from the player to begin with, so everything below is
    // the unit coming round onto the target on its own.
    expect(headingError(aimIn(300).startFacing, 0)).toBeGreaterThan(1.5);
    // The sight opens *beside* the player rather than on them: a swing of a
    // whole arc, and a visible distance across the ground.
    expect(gaps.length).toBeGreaterThan(4);
    expect(swings[0]).toBeGreaterThan(SIGHT_START_SWEEP * 0.5);
    expect(swings[0]).toBeLessThan(SIGHT_START_SWEEP * 1.5);
    expect(gaps[0]).toBeGreaterThan(40);
    expect(settles[0]).toBeLessThan(0.2);
    // And it sweeps across onto them - both measures close together, never one
    // at the other's expense - for as long as the aim-in lasts.
    for (let i = 1; i < gaps.length; i += 1) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1] + 0.001);
    for (let i = 1; i < swings.length; i += 1) expect(swings[i]).toBeLessThanOrEqual(swings[i - 1] + 0.001);
    expect(gaps[0] - gaps[Math.floor(gaps.length / 3)]).toBeGreaterThan(20);
    expect(swings.at(-1)!).toBeLessThan(0.04);
    // The gauge is the tell the player actually reads: it fills across the
    // aim-in rather than jumping to full.
    expect(settles.at(-1)!).toBeCloseTo(1, 1);
    const mid = settles[Math.floor(settles.length / 2)];
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.95);
    // And the rail follows the line: the moment the sight is locked, the body is
    // pointing straight down it, and the sight is on the player.
    expect(firedFromLock).toBe(true);
    expect(lockError).toBeGreaterThanOrEqual(0);
    expect(lockError).toBeLessThan(0.05);
    expect(lockGap).toBeLessThan(12);

    // This is a tell only the marksman has: nothing else sights in, and the
    // sight starts further out than any engagement the player will see it at.
    expect(aimFor("sniper").tell).toBe("sight");
    expect(aimFor("sniper").glint).toBe(true);
    expect(aimFor("sniper").acquire).toBeGreaterThan(0.4);
    for (const kind of BOT_KINDS) {
      if (kind === "sniper") continue;
      expect(aimFor(kind).tell).not.toBe("sight");
    }
    expect(SIGHT_START_RANGE).toBeGreaterThan(300);
  });

  it("fires down the line the sight came to rest on", () => {
    const { lane, rested, heading } = aimIn(300);
    expect(rested).not.toBeNull();
    expect(heading).not.toBeNull();
    const lineAtRest = Math.atan2(rested!.y - lane.bot.y, rested!.x - lane.bot.x);
    // The slug goes where the sight rested, and it rested on the player: a
    // marksman that is left alone to aim does not miss.
    expect(headingError(heading!, lineAtRest)).toBeLessThan(0.05);
    expect(headingError(heading!, 0)).toBeLessThan(0.08);
    expect(Math.hypot(rested!.x - lane.player.x, rested!.y - lane.player.y)).toBeLessThan(12);
  });

  it("misses a player who steps aside once the sight has locked", () => {
    const lane = openLane(0, [300]);
    const world = game.activeWorld;
    world.player.position = { ...lane.player };
    const bot = parkBot("sniper", lane.bot, Math.PI, 0);

    // Run until the shot is committed: the sight has stopped tracking (the
    // wind-up is past the profile's lock point) and the rail has come round onto
    // that frozen line. Until both are true the marksman can still correct, and
    // after both are true it cannot.
    const bearingToSight = () =>
      Math.atan2((bot.sight?.y ?? 0) - bot.position.y, (bot.sight?.x ?? 0) - bot.position.x);
    const railSettled = () => Math.abs(shortestAngleDelta(bot.facing, bearingToSight())) <= AIM_SETTLED_ERROR;
    let frozen: { x: number; y: number } | null = null;
    for (let frame = 0; frame < 400 && !frozen; frame += 1) {
      holdStill(lane, 1);
      if (bot.windup <= 0 || !bot.sight) continue;
      const progress = bot.windupDuration > 0 ? 1 - bot.windup / bot.windupDuration : 1;
      if (progress >= aimFor("sniper").lockAt && railSettled()) frozen = { ...bot.sight };
    }
    expect(frozen).not.toBeNull();
    // The line it committed to, off the platform it is standing on right now.
    const committed = () => Math.atan2(frozen!.y - bot.position.y, frozen!.x - bot.position.x);

    // Step off the line: a short, clear sidestep, so the shot is aimed at where
    // the player was rather than at where they are.
    const aside = { x: lane.player.x, y: lane.player.y - 90 };
    expect(segmentBlocked(lane.bot, aside, world.obstacles)).toBe(false);
    const moved = { bot: lane.bot, player: aside };

    let bullet: { x: number; y: number } | null = null;
    for (let frame = 0; frame < 200 && !bullet; frame += 1) {
      holdStill(moved, 1);
      const shot = world.bullets.find((round) => round.owner === "bot");
      if (shot) bullet = { ...shot.velocity };
    }
    expect(bullet).not.toBeNull();
    const heading = Math.atan2(bullet!.y, bullet!.x);
    const toPlayerNow = Math.atan2(aside.y - bot.position.y, aside.x - bot.position.x);
    // It fired down the line it froze on, and that line is no longer the player.
    expect(headingError(heading, committed())).toBeLessThan(0.05);
    expect(headingError(heading, toPlayerNow)).toBeGreaterThan(0.1);
  });

  it("keeps its glass on you between shots", () => {
    // The live behaviour behind the shape test: the marksman's whole platform
    // comes round onto the player and stays there, so the silhouette is a
    // warning rather than decoration. It is pinned while it does it, because
    // what is under test is the aim and not the kiting.
    const lane = openLane(0, [300]);
    const world = game.activeWorld;
    world.player.position = { ...lane.player };
    const bot = parkBot("sniper", lane.bot, Math.PI, 99);
    const bearing = () => Math.atan2(world.player.position.y - bot.position.y, world.player.position.x - bot.position.x);
    expect(headingError(bot.facing, bearing())).toBeGreaterThan(2);

    let settledAt = -1;
    for (let frame = 0; frame < 240 && settledAt < 0; frame += 1) {
      holdStill(lane, 1);
      // No aim-in and no wind-up: this is the between-shots behaviour on its own.
      expect(bot.acquire ?? 0).toBe(0);
      expect(bot.windup).toBe(0);
      if (headingError(bot.facing, bearing()) < 0.06) settledAt = frame;
    }
    // It has come right round onto a player it is not shooting at yet.
    expect(settledAt).toBeGreaterThan(0);
    // ...and it takes its time about it: a body that swung instantly could not
    // be out-run, and the slow track is the dodge window.
    expect(settledAt).toBeGreaterThan(Math.round(1.57 / (TARGET_TRACK_RATE / 60)) * 0.6);

    // Nothing else does this: every other profile drives where it is looking.
    for (const kind of BOT_KINDS) {
      expect(tracksTargetAlways(kind)).toBe(kind === "sniper");
    }
  });

  /** A clear lane, plus a point off that lane that the player can step to. */
  const openLaneAndAside = (asideAngle: number, asideRange: number) => {
    const obstacles = game.activeWorld.obstacles;
    for (const reach of [300, 260, 220]) {
      for (let y = 140; y <= WORLD.height - 140; y += 30) {
        for (let x = 140; x <= WORLD.width - 140; x += 30) {
          const bot = { x, y };
          const player = { x: x + reach, y };
          const aside = {
            x: x + Math.cos(asideAngle) * asideRange,
            y: y + Math.sin(asideAngle) * asideRange
          };
          if (aside.x < 100 || aside.y < 100 || aside.x > WORLD.width - 100 || aside.y > WORLD.height - 100) continue;
          if (!hasClearance(bot, 16, 8, obstacles)) continue;
          if (!hasClearance(aside, 16, 8, obstacles)) continue;
          if (segmentBlocked(bot, player, obstacles)) continue;
          if (segmentBlocked(bot, aside, obstacles)) continue;
          return { bot, player, aside };
        }
      }
    }
    throw new Error("no clear lane with an aside in this arena");
  };

  it("will not fire wide: it holds the wind-up until the rail has settled", () => {
    // A marksman does not spray: it is committed to the line its sight rests on,
    // and if the player breaks that line late it waits for the barrel rather
    // than firing off the hip. This is the whole reason its telegraph is long.
    const { bot: at, player, aside } = openLaneAndAside(0.75, 220);
    const world = game.activeWorld;
    world.player.position = { ...player };
    const bot = parkBot("sniper", at, 0, 0);
    const asideBearing = Math.atan2(aside.y - at.y, aside.x - at.x);

    let windupFrames = 0;
    let nominal = 0;
    let releaseError = -1;
    let bullet = false;
    let stepped = false;
    for (let frame = 0; frame < 600 && !bullet; frame += 1) {
      holdStill(stepped ? { bot: at, player: aside } : { bot: at, player }, 1);
      if (bot.windup > 0) {
        windupFrames += 1;
        nominal = Math.max(nominal, bot.windupDuration);
        // The player steps off the frozen line mid-telegraph.
        stepped = true;
      }
      const shot = world.bullets.find((round) => round.owner === "bot");
      if (shot) {
        bullet = true;
        releaseError = headingError(Math.atan2(shot.velocity.y, shot.velocity.x), asideBearing);
      }
    }
    expect(bullet).toBe(true);
    expect(nominal).toBeGreaterThan(0.5);
    // It fired down the line the rail had actually come round to, not wide.
    expect(releaseError).toBeLessThan(AIM_SETTLED_ERROR);
    // ...and it held the shot to get there: the telegraph ran longer than the
    // wind-up it was granted.
    expect(windupFrames / 60).toBeGreaterThan(nominal * 1.05);

    // The rule itself, so the behaviour above cannot be broken by accident.
    expect(holdsFireWhileSlewing("sniper")).toBe(true);
    expect(holdsFireWhileSlewing("hunter")).toBe(false);
    expect(windupDrainRate("sniper", AIM_SETTLED_ERROR * 2, 0, 1)).toBe(AIM_HOLD_RATE);
    expect(windupDrainRate("sniper", 0, 0, 1)).toBe(1);
    expect(windupDrainRate("sniper", 2, 1 * AIM_HOLD_PATIENCE, 1)).toBe(1);
    expect(windupDrainRate("hunter", 2, 0, 1)).toBe(1);
  });

  it("scales the smallest hostile down everywhere, shadow included", () => {
    const big = footprint("shielder");
    const small = footprint("shard");
    expect(area(small)).toBeLessThan(area(big) * 0.12);
    // The contact shadow is drawn at the mean of the same frame, so a speck of a
    // unit cannot cast the blob the bulwark casts.
    const mean = (art: (typeof BOT_ART)[BotKind]) => (frameOf(art).x + frameOf(art).y) / 2;
    expect(mean(BOT_ART.shard)).toBeLessThan(mean(BOT_ART.shielder) * 0.5);
  });
});

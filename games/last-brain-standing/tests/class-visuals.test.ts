// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArenaGame } from "../src/game";
import { WORLD } from "../src/arena";
import { BOT_ART, CLASS_ART, PLAYER_ART } from "../src/art";
import { LOADOUTS, LOADOUT_ORDER } from "../src/loadouts";
import { pinLayout } from "./helpers/layout";
import {
  installFakeCanvasPrototype,
  installFrameController,
  installResizeObserver,
  type FakeCanvas,
  type FrameController
} from "./helpers/fake-dom";

/**
 * Class kit visuals.
 *
 * The class system is only readable if the arena *shows* it: which operative is
 * on the floor, what their weapon is, whether a hostile is burning, and whether
 * the marksman's focus is banked. These tests drive the real renderer against a
 * recording canvas and read the frame trace, so a future refactor that quietly
 * drops a kit overlay fails here rather than in a play session.
 */
describe("class kit visuals", () => {
  let canvas: HTMLCanvasElement;
  let fake: FakeCanvas;
  let frames: FrameController;
  let restoreResizeObserver: () => void;
  let canvasProto: ReturnType<typeof installFakeCanvasPrototype>;
  let game: ArenaGame;

  /** Renders exactly one frame of a frozen world and returns the trace. */
  const captureFrame = (): string[] => {
    fake.reset();
    frames.advance(1);
    return [...fake.trace];
  };

  /** A hostile parked where the test wants it, doing nothing. */
  const plantBot = (kind: "hunter" | "pyro" = "hunter", at = { x: 700, y: 300 }) => {
    const bot = {
      id: 901,
      kind,
      position: { ...at },
      velocity: { x: 0, y: 0 },
      health: 40,
      maxHealth: 48,
      fireCooldown: 99,
      windup: 0,
      windupDuration: 0.6,
      windupTurnRate: 2,
      facing: 0,
      spawnGuard: 0,
      strafeSign: 1 as const,
      strafeLock: 0,
      alive: true,
      radius: 10,
      hitFlash: 0,
      burn: 0,
      stun: 0,
      aim: { x: 0, y: 0 },
      chargeTimer: 0,
      chargeVector: { x: 0, y: 0 }
    };
    game.activeWorld.bots.push(bot as unknown as (typeof game.activeWorld.bots)[number]);
    // Freeze it: the AI must not walk out of the frame the test is inspecting.
    game.activeWorld.bots[game.activeWorld.bots.length - 1].spawnGuard = 0;
    return bot;
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
    canvasProto = installFakeCanvasPrototype();
    fake = canvasProto.fakeFor(canvas);
    frames = installFrameController();
    restoreResizeObserver = installResizeObserver();
    game = new ArenaGame({ canvas, onSnapshot: () => undefined, onFeed: () => undefined, onRunEnd: () => undefined });
    game.beginRun("class-visuals");
    // Hand-placed coordinates are written against the quadrant geometry.
    pinLayout(game.activeWorld, "quadrant");
    frames.advance(2);
  });

  afterEach(() => {
    game?.destroy();
    frames.restore();
    restoreResizeObserver();
    canvasProto.restore();
    canvas.remove();
    vi.restoreAllMocks();
  });

  it("gives every class its own armour paint, all of it in the muted palette", () => {
    const classes = LOADOUT_ORDER.map((id) => CLASS_ART[id]);
    expect(classes.filter(Boolean)).toHaveLength(LOADOUT_ORDER.length);
    // Bodies, trims and details are all distinct: no two classes are re-skins.
    expect(new Set(classes.map((art) => art.body)).size).toBe(LOADOUT_ORDER.length);
    expect(new Set(classes.map((art) => art.accent)).size).toBe(LOADOUT_ORDER.length);
    expect(new Set(classes.map((art) => art.detail)).size).toBe(LOADOUT_ORDER.length);
    for (const art of classes) {
      expect(art.silhouette).toBe("trooper");
      expect(art.ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("draws the equipped class weapon rather than one generic rifle", () => {
    // Each class puts its own hardware in the operative's hands: the marksman's
    // receiver is the longest, the sapper's drum is the widest.
    for (const id of LOADOUT_ORDER) {
      game.setLoadout(id);
      frames.advance(2);
      const trace = captureFrame();
      expect(trace.length).toBeGreaterThan(200);
      // Weapon ink and trim are both pushed every frame the operative is drawn.
      expect(trace).toContain(`fillStyle=${CLASS_ART[id].ink}`);
      expect(trace).toContain(`fillStyle=${CLASS_ART[id].accent}`);
    }
  });

  it("marks a burning hostile with embers, and stops when the burn ends", () => {
    const bot = plantBot("pyro");
    bot.burn = 0;
    const plain = captureFrame();
    expect(plain).not.toContain("strokeStyle=#8a6a3f");

    bot.burn = 2.5;
    const burning = captureFrame();
    expect(burning).toContain("strokeStyle=#8a6a3f");
    // Three tongues of flame, plus the scorched floor ring closing on the deck.
    expect(burning.filter((entry) => entry === "quadraticCurveTo()").length).toBeGreaterThanOrEqual(3);

    bot.burn = 0;
    expect(captureFrame()).not.toContain("strokeStyle=#8a6a3f");
  });

  it("hangs a stagger mark on a hostile that has been put on its heels", () => {
    const bot = plantBot();
    bot.stun = 0;
    expect(captureFrame()).not.toContain("strokeStyle=#c9975a");
    bot.stun = 1.2;
    expect(captureFrame()).toContain("strokeStyle=#c9975a");
  });

  it("banks the marksman's focus into a visible gauge and releases it on the shot", () => {
    game.setLoadout("marksman");
    const world = game.activeWorld;
    // No input: the operative stands still and the bank fills.
    frames.advance(60);
    const charged = captureFrame();
    expect(charged).toContain("strokeStyle=#cfa25f");

    // The gauge disappears once the focused round is away and the bank is spent.
    world.player.focusTime = 0;
    const empty = captureFrame();
    expect(empty.filter((entry) => entry === "strokeStyle=#cfa25f").length).toBeLessThan(
      charged.filter((entry) => entry === "strokeStyle=#cfa25f").length
    );
  });

  it("outlines the operative while a ghost is phased through a firing line", () => {
    game.setLoadout("ghost");
    const world = game.activeWorld;
    world.player.invulnerability = 0;
    world.player.phaseTime = 0;
    const solid = captureFrame();
    expect(solid).not.toContain("strokeStyle=#9fb6cc");

    world.player.phaseTime = 0.3;
    const phased = captureFrame();
    expect(phased).toContain("strokeStyle=#9fb6cc");
  });

  it("paints the sapper's own shell in brass and shows the ground it will clear", () => {
    game.setLoadout("sapper");
    const world = game.activeWorld;
    world.shells.length = 0;
    world.shells.push({
      position: { x: 400, y: 300 },
      from: { x: 300, y: 300 },
      target: { x: 640, y: 300 },
      flight: 0.5,
      totalFlight: 0.75,
      radius: 74,
      damage: LOADOUTS.sapper.damage,
      kind: "mortar",
      botId: -1,
      owner: "player"
    });
    // Brass canister, and one more brass ring than a bot shell gets: the burst
    // radius the sapper's round is going to clear.
    const brass = (frame: string[]) => frame.filter((entry) => entry === `strokeStyle=${PLAYER_ART.accent}`).length;
    const player = captureFrame();
    expect(player).toContain(`fillStyle=${PLAYER_ART.accent}`);

    world.shells[0].owner = "bot";
    const enemy = captureFrame();
    expect(enemy).toContain(`fillStyle=${BOT_ART.mortar.plate}`);
    expect(brass(player)).toBeGreaterThan(brass(enemy));
  });
});

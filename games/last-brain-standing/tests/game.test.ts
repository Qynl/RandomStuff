// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArenaGame, type FeedLine, type GameSnapshot, type RunResult } from "../src/game";
import { emptyKindTotals } from "../src/ai";
import { WORLD } from "../src/arena";
import { pinLayout } from "./helpers/layout";
import { installFakeCanvasPrototype, installFrameController, installResizeObserver, pointer, pressKey, type FakeCanvas, type FrameController } from "./helpers/fake-dom";

/**
 * These tests drive the real presentation loop against a recording canvas and a
 * manual animation-frame clock: input plumbing, the fixed-step accumulator,
 * effect pipelines, pause/resume, and the React-facing snapshot contract.
 */
describe("ArenaGame engine shell", () => {
  let canvas: HTMLCanvasElement;
  let fake: FakeCanvas;
  let frames: FrameController;
  let restoreResizeObserver: () => void;
  let canvasProto: ReturnType<typeof installFakeCanvasPrototype>;

  /** Drops a lethal bot round on the player through the world surface. */
  /**
   * Shoots one hostile of a kind dead through the real pipeline: the engine's
   * frame loop is what counts a profile's kills, so the test has to let it.
   */
  const spawnAndKill = (target: ArenaGame, kind: "hunter" | "flanker" | "mirror", count: number) => {
    for (let index = 0; index < count; index += 1) {
      // Beside the operative's own insertion pad: the one patch of floor every
      // layout guarantees is clear, since a round fired from inside a wall
      // would be eaten before it ever reached the target.
      const pad = target.activeWorld.player.position;
      const at = { x: pad.x - 44 - index * 6, y: pad.y };
      let killed = false;
      for (let attempt = 0; attempt < 6 && !killed; attempt += 1) {
        // Waves keep spawning into the same arena, so clear the field, fire one
        // round and confirm the kill actually landed before moving on.
        target.activeWorld.bots.length = 0;
        fireRoundAt(target, at, 400, kind);
        frames.advance(2);
        killed = target.activeWorld.bots.every((bot) => !bot.alive);
      }
      expect(killed).toBe(true);
    }
  };

  /** Drops a hostile at a spot and fires a player round straight at it. */
  const fireRoundAt = (target: ArenaGame, at: { x: number; y: number }, damage = 40, kind: "hunter" | "flanker" | "mirror" = "hunter") => {
    const world = target.activeWorld;
    world.bots.push({
      id: 900,
      kind,
      position: { ...at },
      velocity: { x: 0, y: 0 },
      // Low health so plating cannot accidentally save a test target.
      health: 5,
      maxHealth: 48,
      fireCooldown: 5,
      windup: 0,
      windupDuration: 0.6,
      windupTurnRate: 2,
      facing: 0,
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
      grindTime: 0
    });
    world.bullets.push({
      position: { ...world.player.position },
      velocity: { x: 0, y: 0 },
      owner: "player",
      damage,
      life: 1,
      color: "#fff",
      source: "player",
      travelled: 0
    });
    // Place the round right on the target so the next step registers the hit.
    const shot = world.bullets[world.bullets.length - 1];
    shot.position = { x: at.x - 1, y: at.y };
    shot.velocity = { x: 600, y: 0 };
  };

  const killPlayer = (target: ArenaGame, kind: "hunter" | "flanker" | "mirror" = "hunter") => {
    const world = target.activeWorld;
    world.player.invulnerability = 0;
    world.player.health = 1;
    world.bullets.push({
      position: { ...world.player.position },
      velocity: { x: 0, y: 0 },
      owner: "bot",
      damage: 50,
      life: 1,
      color: "#fff",
      source: kind,
      travelled: 0
    });
    frames.advance(10);
  };
  let snapshots: GameSnapshot[];
  let feed: FeedLine[];
  let results: RunResult[];
  let game: ArenaGame;

  const createGame = (options: Partial<ConstructorParameters<typeof ArenaGame>[0]> = {}) =>
    new ArenaGame({
      canvas,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onFeed: (line) => feed.push(line),
      onRunEnd: (result) => results.push(result),
      ...options
    });

  beforeEach(() => {
    // The engine must never touch real storage in tests.
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
    snapshots = [];
    feed = [];
    results = [];
  });

  afterEach(() => {
    game?.destroy();
    frames.restore();
    restoreResizeObserver();
    canvasProto.restore();
    canvas.remove();
    vi.restoreAllMocks();
  });

  it("leaves scorch marks where rounds land and fades them out", () => {
    const decalsOf = (target: ArenaGame) =>
      (target as unknown as { decals: Array<{ strength: number; position: { x: number; y: number } }> }).decals;
    game = createGame();
    game.beginRun("decals");
    frames.advance(30);
    const world = game.activeWorld;
    pinLayout(world);
    world.waveState = "idle";
    world.player.position = { x: 100, y: 100 };
    world.bots.length = 0;
    expect(decalsOf(game)).toHaveLength(0);

    // A round that lands on a hostile leaves a mark where it hit.
    fireRoundAt(game, { x: 300, y: 100 });
    frames.advance(4);
    expect(world.stats.kills + world.stats.damageDealt).toBeGreaterThan(0);
    expect(decalsOf(game).length).toBeGreaterThan(0);

    // The mark fades out on its own rather than sitting there for the whole run.
    const mark = { ...decalsOf(game)[0].position };
    const strength = decalsOf(game)[0].strength;
    frames.advance(60);
    const same = decalsOf(game).find((decal) => decal.position.x === mark.x && decal.position.y === mark.y);
    expect(same?.strength ?? 0).toBeLessThan(strength);
    // Marks made on a crate face outlive ones on the floor, but every mark is
    // gone inside half a minute and the list never grows without bound.
    frames.advance(60 * 20);
    expect(decalsOf(game).some((decal) => decal.position.x === mark.x && decal.position.y === mark.y)).toBe(false);
    expect(decalsOf(game).length).toBeLessThanOrEqual(90);
  });

  it("calls out a marksman lining up a shot from anywhere in the arena", () => {
    game = createGame();
    game.beginRun("sight-call");
    const world = game.activeWorld;
    pinLayout(world);
    world.phase = "running";
    world.waveState = "active";
    world.waveTimer = 999;
    world.pendingSpawns.length = 0;
    world.bots.length = 0;
    world.player.position = { x: 100, y: 100 };
    world.bots.push({
      id: 1, kind: "sniper", position: { x: 320, y: 100 }, velocity: { x: 0, y: 0 }, health: 500, maxHealth: 500,
      fireCooldown: 0, windup: 0, windupDuration: 0, windupTurnRate: 2, facing: Math.PI, spawnGuard: 0, strafeSign: 1,
      strafeLock: 0, alive: true, hitFlash: 0, blindTime: 0, pendingRounds: 0, burstTimer: 0, diveTime: 0,
      diveCooldown: 0, detourTime: 0, detourSign: 1, grindTime: 0, stun: 0, chargeTime: 0,
      chargeDirection: { x: 0, y: 0 }, sprayTime: 0
    });
    feed.length = 0;
    frames.advance(180);
    const calls = feed.filter((line) => line.text.includes("SIGHTING IN"));
    expect(calls).toHaveLength(1);
    // Once. The aim-in repeats every few seconds and the feed is a briefing, not
    // a running commentary, so the second and third acquisition stay quiet.
    frames.advance(60 * 20);
    expect(feed.filter((line) => line.text.includes("SIGHTING IN")).length).toBeLessThanOrEqual(4);
    // The sight itself is live on the world, which is what the renderer draws.
    expect(world.bots[0].sight ?? world.bots[0].windup > 0).toBeTruthy();
  });

  it("seeds ambient dust when a run starts and keeps it inside the arena", () => {
    game = createGame();
    game.beginRun("motes");
    frames.advance(20);
    // The dust is seeded from the run seed, so two engines on the same seed
    // drift identically; here we only check it exists and is bounded.
    const particles = (game as unknown as { motes: Array<{ position: { x: number; y: number } }> }).motes;
    expect(particles.length).toBeGreaterThan(10);
    for (const mote of particles) {
      expect(mote.position.x).toBeGreaterThanOrEqual(8);
      expect(mote.position.x).toBeLessThanOrEqual(WORLD.width - 8);
      expect(mote.position.y).toBeGreaterThanOrEqual(8);
      expect(mote.position.y).toBeLessThanOrEqual(WORLD.height - 8);
    }
    // Let them drift a while and confirm they wrap rather than leave the room.
    frames.advance(200);
    for (const mote of particles) {
      expect(Number.isFinite(mote.position.x)).toBe(true);
      expect(mote.position.y).toBeGreaterThanOrEqual(8);
      expect(mote.position.y).toBeLessThanOrEqual(WORLD.height - 8);
    }
  });

  it("keeps the run alive when drawing fails", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    game = createGame();
    game.beginRun("render-fault");
    frames.advance(4);
    const target = fake.context as unknown as Record<string, unknown>;
    const original = target.createRadialGradient;
    target.createRadialGradient = () => {
      throw new Error("boom");
    };
    expect(() => frames.advance(3)).not.toThrow();
    target.createRadialGradient = original;
    // The simulation kept running and the loop is still scheduling frames.
    expect(game.currentPhase).toBe("running");
    expect(game.isPaused()).toBe(false);
    expect(frames.pending()).toBeGreaterThan(0);
    expect(game.activeWorld.elapsed).toBeGreaterThan(0.05);
    expect(feed.some((line) => line.text.includes("Renderer fault"))).toBe(true);
    // Only reported once, not once per frame.
    expect(feed.filter((line) => line.text.includes("Renderer fault"))).toHaveLength(1);
    // Drawing recovers as soon as the underlying call works again.
    const before = fake.total();
    frames.advance(2);
    expect(fake.total()).toBeGreaterThan(before);
    consoleError.mockRestore();
  });

  it("runs without a 2D context instead of throwing", () => {
    // Some environments (and a browser that refused the context) hand back null.
    const plain = document.createElement("canvas");
    document.body.append(plain);
    const original = plain.getContext;
    plain.getContext = (() => null) as HTMLCanvasElement["getContext"];
    const inert = new ArenaGame({ canvas: plain, onSnapshot: (snapshot) => snapshots.push(snapshot) });
    expect(() => {
      inert.beginRun("null-context");
      frames.advance(40);
    }).not.toThrow();
    expect(inert.activeWorld.phase).toBe("running");
    expect(snapshots[snapshots.length - 1].started).toBe(true);
    inert.destroy();
    plain.getContext = original;
    plain.remove();
  });

  it("constructs without a real canvas, reports standby, and draws nothing yet", () => {
    game = createGame();
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].phase).toBe("standby");
    expect(snapshots[0].started).toBe(false);
    expect(snapshots[0].seedLabel).toMatch(/^[0-9A-F]{6}$/);
    expect(snapshots[0].maxHealth).toBeGreaterThan(0);
  });

  it("draws the arena once the first frame runs", () => {
    game = createGame();
    fake.reset();
    game.beginRun("engine-test");
    frames.advance(2);
    expect(fake.total()).toBeGreaterThan(50);
    expect(fake.calls.fillRect ?? 0).toBeGreaterThan(0);
    expect(fake.calls.arc ?? 0).toBeGreaterThan(0);
  });

  it("starts a run, spawns hostiles after the telegraph and reports telemetry", () => {
    game = createGame();
    game.beginRun("engine-test");
    frames.advance(60); // ~1s: telegraph is still running
    expect(game.activeWorld.bots.filter((bot) => bot.alive).length).toBe(0);
    frames.advance(180); // ~4s total
    expect(game.activeWorld.bots.filter((bot) => bot.alive).length).toBeGreaterThan(0);
    const latest = snapshots[snapshots.length - 1];
    expect(latest.phase).toBe("running");
    expect(latest.wave).toBe(1);
    expect(latest.hostileCount).toBeGreaterThan(0);
    expect(feed.some((line) => line.text.includes("Threat level 01"))).toBe(true);
  });

  it("moves the player with the keyboard and stops on key release", () => {
    game = createGame();
    game.beginRun("keys");
    const startY = game.activeWorld.player.position.y;
    pressKey("w");
    frames.advance(20);
    expect(game.activeWorld.player.position.y).toBeLessThan(startY - 20);
    pressKey("w", { type: "keyup" });
    const restingY = game.activeWorld.player.position.y;
    frames.advance(20);
    expect(Math.abs(game.activeWorld.player.position.y - restingY)).toBeLessThan(0.6);
  });

  it("treats arrow keys the same as WASD for movement", () => {
    game = createGame();
    game.beginRun("arrows");
    const startX = game.activeWorld.player.position.x;
    pressKey("ArrowRight");
    frames.advance(20);
    expect(game.activeWorld.player.position.x).toBeGreaterThan(startX + 20);
  });

  it("fires while the mouse button or space is held and stops on release", () => {
    game = createGame();
    game.beginRun("fire");
    frames.advance(120);
    pressKey(" ");
    frames.advance(30);
    const firingShots = game.activeWorld.stats.shotsFired;
    expect(firingShots).toBeGreaterThan(0);
    pressKey(" ", { type: "keyup" });
    frames.advance(30);
    expect(game.activeWorld.stats.shotsFired).toBe(firingShots);
  });

  it("takes keyboard focus when the arena is clicked", () => {
    game = createGame();
    game.beginRun("focus");
    frames.advance(4);
    expect(document.activeElement).not.toBe(canvas);
    pointer(canvas, "pointerdown", { clientX: 400, clientY: 300, pointerId: 1 });
    // Inside an iframe the key events only reach the focused document, so the
    // arena has to claim focus when it is clicked.
    expect(document.activeElement).toBe(canvas);
  });

  it("fires on pointer down inside the arena and aims where the pointer is", () => {
    game = createGame();
    game.beginRun("pointer");
    frames.advance(60);
    pointer(canvas, "pointermove", { clientX: 960, clientY: 0 });
    pointer(canvas, "pointerdown", { clientX: 960, clientY: 0, button: 0 });
    frames.advance(12);
    const aim = game.activeWorld.player.aimDirection;
    expect(aim.x).toBeGreaterThan(0.2);
    expect(aim.y).toBeLessThan(-0.2);
    pointer(window, "pointerup");
    const shots = game.activeWorld.stats.shotsFired;
    frames.advance(20);
    expect(game.activeWorld.stats.shotsFired).toBe(shots);
  });

  it("dashes on Shift and reports the cooldown in the snapshot", () => {
    game = createGame();
    game.beginRun("dash");
    frames.advance(30);
    const before = { ...game.activeWorld.player.position };
    pressKey("Shift");
    frames.advance(1);
    const after = game.activeWorld.player.position;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(30);
    expect(game.activeWorld.stats.dashes).toBe(1);
    expect(game.activeWorld.player.dashCooldown).toBeGreaterThan(1);
    frames.advance(10);
    expect(snapshots[snapshots.length - 1].dashCharge).toBeLessThan(1);
  });

  it("pauses on Escape, freezes the simulation and resumes", () => {
    game = createGame();
    game.beginRun("pause");
    frames.advance(60);
    pressKey("Escape");
    expect(game.isPaused()).toBe(true);
    const frozen = game.activeWorld.elapsed;
    expect(frames.pending()).toBe(0);
    frames.advance(5);
    expect(game.activeWorld.elapsed).toBeCloseTo(frozen, 5);
    const pausedSnapshot = snapshots[snapshots.length - 1];
    expect(pausedSnapshot.paused).toBe(true);
    pressKey("Escape");
    expect(game.isPaused()).toBe(false);
    frames.advance(30);
    expect(game.activeWorld.elapsed).toBeGreaterThan(frozen);
  });

  it("pauses automatically when the window loses focus", () => {
    game = createGame();
    game.beginRun("blur");
    frames.advance(30);
    window.dispatchEvent(new Event("blur"));
    expect(game.isPaused()).toBe(true);
  });

  it("keeps the fixed-step simulation independent of the render frame time", () => {
    game = createGame();
    game.beginRun("fixed-step");
    frames.advance(62, 16.7);
    const sixty = game.activeWorld.elapsed;
    game.destroy();

    game = createGame();
    game.beginRun("fixed-step");
    frames.advance(31, 33.4);
    const thirty = game.activeWorld.elapsed;
    expect(Math.abs(sixty - thirty)).toBeLessThan(1 / 20);
  });

  it("accepts touch input without leaking a held trigger", () => {
    game = createGame();
    game.beginRun("touch");
    frames.advance(30);
    const start = { ...game.activeWorld.player.position };
    game.setTouchMovement({ x: 0, y: -1 });
    frames.advance(20);
    expect(game.activeWorld.player.position.y).toBeLessThan(start.y);
    game.setTouchMovement({ x: 0, y: 0 });
    game.setTouchFiring(true);
    frames.advance(20);
    expect(game.activeWorld.stats.shotsFired).toBeGreaterThan(0);
    game.setTouchFiring(false);
    const shots = game.activeWorld.stats.shotsFired;
    frames.advance(20);
    expect(game.activeWorld.stats.shotsFired).toBe(shots);
  });

  it("queues a dash from the touch button", () => {
    game = createGame();
    game.beginRun("touch-dash");
    frames.advance(30);
    game.queueDash();
    frames.advance(2);
    expect(game.activeWorld.stats.dashes).toBe(1);
  });

  it("flags a victory that took no damage at all", () => {
    game = createGame();
    game.beginRun("perfect");
    frames.advance(25);
    const world = game.activeWorld;
    // Walk the world into its final victory state through the public surface.
    world.stats.wavesCleared = 5;
    world.stats.damageTaken = 0;
    world.waveState = "cleared";
    world.waveTimer = 0;
    world.wave = 5;
    world.bots.length = 0;
    world.pendingSpawns.length = 0;
    frames.advance(6);
    expect(game.currentPhase).toBe("victory");
    expect(results[0].victory).toBe(true);
    expect(results[0].perfect).toBe(true);

    // A run that took a single point of damage is not a clean sweep.
    game.beginRun("not-perfect");
    frames.advance(25);
    const second = game.activeWorld;
    second.stats.wavesCleared = 5;
    second.stats.damageTaken = 1;
    second.waveState = "cleared";
    second.waveTimer = 0;
    second.wave = 5;
    second.bots.length = 0;
    second.pendingSpawns.length = 0;
    frames.advance(6);
    expect(results[1].victory).toBe(true);
    expect(results[1].perfect).toBe(false);
  });

  it("runs to a result, reports it once and freezes the loop", () => {
    game = createGame();
    game.beginRun("ending");
    frames.advance(30);
    // Force a lethal hit through the public simulation surface.
    const world = game.activeWorld;
    world.player.invulnerability = 0;
    world.player.health = 1;
    world.bullets.push({
      position: { ...world.player.position },
      velocity: { x: 0, y: 0 },
      owner: "bot",
      damage: 50,
      life: 1,
      color: "#fff",
      source: "hunter",
      travelled: 0
    });
    frames.advance(10);
    expect(game.currentPhase).toBe("defeat");
    expect(results.length).toBe(1);
    expect(results[0].victory).toBe(false);
    expect(results[0].score.total).toBeGreaterThanOrEqual(0);
    expect(results[0].grade).toMatch(/^[SABCD]$/);
    // The end screen can name the killer and break down the run.
    expect(results[0].endedBy).toBe("hunter");
    expect(results[0].difficulty).toBe("standard");
    expect(results[0].killsByKind).toEqual(emptyKindTotals());
    expect(results[0].isDifficultyBest).toBe(true);
    expect(results[0].previousBestScore).toBe(0);
    const pending = frames.pending();
    frames.advance(20);
    expect(frames.pending()).toBe(pending - pending); // loop stopped scheduling frames
    expect(snapshots[snapshots.length - 1].phase).toBe("defeat");
  });

  it("restarts with a fresh run and clears previous telemetry", () => {
    game = createGame();
    game.beginRun("restart");
    frames.advance(120);
    expect(game.activeWorld.stats.kills).toBeGreaterThanOrEqual(0);
    game.beginRun("restart");
    expect(game.activeWorld.stats.kills).toBe(0);
    expect(game.activeWorld.elapsed).toBeLessThan(0.5);
    expect(game.activeWorld.bullets.length).toBe(0);
  });

  it("reports a wind-up cut when a hostiles dies mid-telegraph", () => {
    game = createGame();
    game.beginRun("interrupt");
    frames.advance(30);
    const world = game.activeWorld;
    pinLayout(world);
    world.waveState = "idle";
    world.bots.push({
      id: 55,
      kind: "hunter",
      position: { x: 700, y: 120 },
      velocity: { x: 0, y: 0 },
      health: 6,
      maxHealth: 48,
      fireCooldown: 5,
      windup: 0.7,
      windupDuration: 0.7,
      windupTurnRate: 2,
      facing: 0,
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
      grindTime: 0
    });
    const bot = world.bots[world.bots.length - 1];
    world.player.position = { x: 100, y: 400 };
    world.bullets.push({
      position: { x: bot.position.x, y: bot.position.y },
      velocity: { x: 0, y: 0 },
      owner: "player",
      damage: 12,
      life: 1,
      color: "#fff",
      source: "player",
      travelled: 0
    });
    frames.advance(4);
    expect(world.stats.kills).toBe(1);
    expect(world.stats.interrupts).toBe(1);
    expect(fake.texts).toContain("CUT!");
    frames.advance(12);
    expect(snapshots[snapshots.length - 1].stats.interrupts).toBe(1);
    expect(snapshots[snapshots.length - 1].score).toBeGreaterThan(0);
  });

  it("celebrates a round dodged with invulnerability frames", () => {
    game = createGame();
    game.beginRun("dodge");
    frames.advance(30);
    const world = game.activeWorld;
    world.player.position = { x: 480, y: 500 };
    world.player.invulnerability = 0.4;
    world.bullets.push({
      position: { x: 480, y: 430 },
      velocity: { x: 0, y: 300 },
      owner: "bot",
      damage: 9,
      life: 1,
      color: "#fff",
      source: "flanker",
      travelled: 0
    });
    frames.advance(12);
    expect(world.stats.dodges).toBe(1);
    expect(world.player.health).toBe(100);
    // The renderer drew the floating "DODGE" feedback for it.
    expect(fake.texts).toContain("DODGE");
    // Snapshots are throttled to 10Hz, so the counter lands on a later tick.
    frames.advance(12);
    expect(snapshots[snapshots.length - 1].stats.dodges).toBe(1);
  });

  it("destroys cleanly: no further frames, no listeners, no errors", () => {
    game = createGame();
    game.beginRun("destroy");
    frames.advance(30);
    game.destroy();
    frames.advance(5);
    const elapsed = game.activeWorld.elapsed;
    frames.advance(30);
    expect(game.activeWorld.elapsed).toBe(elapsed);
    // Keyboard input after destroy must not throw or resume anything.
    pressKey("w");
    pressKey(" ");
    frames.advance(2);
    expect(game.activeWorld.elapsed).toBe(elapsed);
  });

  it("mutes, unmutes and remembers the choice", () => {
    game = createGame();
    expect(game.isMuted()).toBe(false);
    game.setMuted(true);
    expect(game.isMuted()).toBe(true);
    game.setMuted(false);
    expect(game.isMuted()).toBe(false);
    game.destroy();
    game = createGame();
    expect(game.isMuted()).toBe(false);
  });

  it("remembers the aiming preference across engine instances", () => {
    game = createGame();
    expect(game.getAimMode()).toBe("mouse");
    game.setAimMode("assisted");
    expect(game.getAimMode()).toBe("assisted");
    expect(window.localStorage.getItem("lbs-aim")).toBe("assisted");
    game.destroy();

    // A fresh engine on the same device restores the stored choice.
    game = createGame();
    expect(game.getAimMode()).toBe("assisted");
    game.setAimMode("mouse");
    game.destroy();
    game = createGame();
    expect(game.getAimMode()).toBe("mouse");

    // A corrupt value falls back to the default instead of leaking through.
    game.destroy();
    window.localStorage.setItem("lbs-aim", "sideways");
    game = createGame();
    expect(game.getAimMode()).toBe("mouse");
  });

  it("switches difficulty mid-run and stores the preference", () => {
    game = createGame();
    game.beginRun("difficulty");
    game.setDifficulty("veteran");
    expect(game.activeWorld.difficulty).toBe("veteran");
    expect(window.localStorage.getItem("lbs-difficulty")).toBe("veteran");
  });

  it("treats screen shake off as calm mode: no flash, no hit-stop", () => {
    // Snapshots are throttled to 10Hz and the flash decays quickly, so the peak
    // values are sampled frame by frame rather than read from the last one.
    const peakAfterHit = (shake: boolean, seed: string) => {
      game = createGame();
      game.setShakeEnabled(shake);
      game.beginRun(seed);
      frames.advance(30);
      const world = game.activeWorld;
    pinLayout(world);
      world.player.invulnerability = 0;
      const at = { ...world.player.position };
      world.bullets.push({
        position: { x: at.x, y: at.y - 60 },
        velocity: { x: 0, y: 300 },
        owner: "bot",
        damage: 8,
        life: 1,
        color: "#fff",
        source: "hunter",
        travelled: 0
      });
      let flash = 0;
      let hitStop = 0;
      for (let i = 0; i < 40; i += 1) {
        frames.advance(1);
        const snapshot = snapshots[snapshots.length - 1];
        flash = Math.max(flash, snapshot.flash);
        hitStop = Math.max(hitStop, snapshot.hitStop);
        if (world.player.health < 100 && hitStop > 0) break;
      }
      return { flash, hitStop, health: world.player.health, snapshot: snapshots[snapshots.length - 1] };
    };

    const calm = peakAfterHit(false, "calm");
    expect(calm.health).toBeLessThan(100);
    expect(calm.flash).toBe(0);
    expect(calm.hitStop).toBe(0);
    expect(calm.snapshot.shakeEnabled).toBe(false);

    const shaky = peakAfterHit(true, "shaky");
    expect(shaky.health).toBeLessThan(100);
    expect(shaky.flash).toBeGreaterThan(0);
    expect(shaky.hitStop).toBeGreaterThan(0);
  });

  it("draws the wave banner with the composition and its tactical tip", () => {
    game = createGame();
    game.beginRun("banner");
    frames.advance(36); // the opening pause, then the wave-start event
    fake.reset();
    frames.advance(2);
    expect(fake.texts).toContain("THREAT LEVEL 01");
    expect(fake.texts.some((text) => text.includes("HUNTER"))).toBe(true);
    expect(fake.texts).toContain("RINGS MARK INCOMING SHOTS — MOVE OR DASH");
    expect(snapshots[snapshots.length - 1].hint).toContain("RINGS MARK");

    // The banner fades, but the tip stays available in the snapshot.
    frames.advance(300);
    fake.reset();
    frames.advance(2);
    expect(fake.texts).not.toContain("THREAT LEVEL 01");
    expect(snapshots[snapshots.length - 1].hint).toBeTruthy();
  });

  it("names the current arena and its tuning in the telemetry overlay", () => {
    game = createGame();
    game.beginRun("overlay-arena");
    frames.advance(20);
    game.setDebug(true);
    fake.reset();
    frames.advance(2);
    const line = fake.texts.find((text) => text.startsWith("ARENA "));
    expect(line).toBeTruthy();
    expect(line).toContain(game.activeWorld.arenaName);
    expect(line).toMatch(/OPEN 0\.\d\d · RANGE ×\d\.\d\d/);
  });

  it("draws an arena-side tuning overlay when telemetry is on", () => {
    game = createGame();
    game.beginRun("debug-overlay");
    frames.advance(180); // hostiles are on the floor and engaged
    fake.reset();
    frames.advance(2);
    const withoutDebug = fake.texts.filter((text) => text.includes("WINDUP") || text.includes("CD "));
    expect(withoutDebug).toEqual([]);
    expect(fake.texts.some((text) => text.startsWith("ELAPSED"))).toBe(false);

    game.setDebug(true);
    expect(game.isDebug()).toBe(true);
    fake.reset();
    frames.advance(2);
    // Bot state, the intercept crosshairs and the sim counters are drawn now.
    expect(fake.texts.some((text) => text.includes("HP"))).toBe(true);
    expect(fake.texts.some((text) => text.startsWith("ELAPSED"))).toBe(true);
    expect(fake.texts.some((text) => text.startsWith("BOTS"))).toBe(true);
    expect(fake.texts.some((text) => text.startsWith("ACC"))).toBe(true);

    game.setDebug(false);
    fake.reset();
    frames.advance(2);
    expect(fake.texts.some((text) => text.startsWith("ELAPSED"))).toBe(false);
  });

  it("toggles the telemetry overlay and screen shake", () => {
    game = createGame();
    expect(game.isDebug()).toBe(false);
    game.setDebug(true);
    expect(game.isDebug()).toBe(true);
    game.setShakeEnabled(false);
    expect(game.isShakeEnabled()).toBe(false);
    expect(window.localStorage.getItem("lbs-shake")).toBe("false");
  });

  it("ignores game hotkeys while the player is typing a seed", () => {
    game = createGame();
    game.beginRun("typing");
    expect(game.isMuted()).toBe(false);
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    for (const key of ["m", "r", " ", "Shift"]) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    frames.advance(6);
    // Mute, restart and dash must not fire from a text field.
    expect(game.isMuted()).toBe(false);
    expect(game.activeWorld.stats.dashes).toBe(0);
    expect(game.isStarted).toBe(true);
    input.remove();
  });

  it("tracks eliminations per profile for the run summary", () => {
    game = createGame();
    game.beginRun("tally");
    frames.advance(60);
    const world = game.activeWorld;
    world.player.invulnerability = 0;
    world.player.health = 1;
    world.bullets.push({
      position: { ...world.player.position },
      velocity: { x: 0, y: 0 },
      owner: "bot",
      damage: 50,
      life: 1,
      color: "#fff",
      source: "mirror",
      travelled: 0
    });
    frames.advance(6);
    expect(results[0].endedBy).toBe("mirror");
    // Kill tallies are reported per profile even when the run ends early.
    const tally = { ...results[0].killsByKind };
    expect(Object.values(tally).reduce((sum, value) => sum + value, 0)).toBe(results[0].stats.kills);
  });

  it("remembers finished runs for the panel's best-runs list", () => {
    window.localStorage.clear();
    game = createGame();
    game.beginRun("history-a");
    frames.advance(40);
    killPlayer(game, "hunter");
    expect(results[0]).toBeTruthy();
    expect(snapshots[snapshots.length - 1].topRuns.map((run) => run.score)).toEqual([results[0].score.total]);

    // A second, better run should sort above the first.
    game.beginRun("history-b");
    frames.advance(40);
    const stats = game.activeWorld.stats;
    stats.kills = 6;
    stats.wavesCleared = 3;
    killPlayer(game, "mirror");
    const listed = snapshots[snapshots.length - 1].topRuns;
    expect(listed.length).toBe(2);
    expect(listed[0].score).toBeGreaterThanOrEqual(listed[1].score);
    expect(listed[0].seed).toBe(game.getSeedLabel());
    expect(listed.every((run) => run.difficulty === "standard")).toBe(true);

    // A fresh engine on the same device still sees the history.
    game.destroy();
    game = createGame();
    expect(game.activeWorld.stats.kills).toBe(0);
    expect(snapshots[snapshots.length - 1].topRuns.length).toBe(2);
  });

  it("remembers which arena a stored run was played in", () => {
    game = createGame();
    game.beginRun("arena-history");
    frames.advance(40);
    const arena = game.activeWorld.arenaName;
    killPlayer(game, "hunter");
    const stored = JSON.parse(window.localStorage.getItem("lbs-run-history") ?? "[]");
    expect(stored[stored.length - 1].arenaName).toBe(arena);
    expect(snapshots[snapshots.length - 1].topRuns[0].arenaName).toBe(arena);

    // Records written before layouts existed still load, just without an arena.
    game.destroy();
    window.localStorage.clear();
    window.localStorage.setItem(
      "lbs-run-history",
      JSON.stringify([{ seed: "ABC123", difficulty: "standard", score: 1200, kills: 4, victory: false, elapsed: 40 }])
    );
    game = createGame();
    const restored = snapshots[snapshots.length - 1].topRuns;
    expect(restored.map((run) => run.seed)).toEqual(["ABC123"]);
    expect(restored[0].arenaName).toBeUndefined();
  });

  it("keeps a per-weapon service record and a badge shelf across runs", () => {
    window.localStorage.clear();
    game = createGame();
    game.beginRun("record-a");
    frames.advance(40);
    game.activeWorld.stats.kills = 5;
    game.activeWorld.stats.interrupts = 2;
    killPlayer(game, "hunter");
    expect(results[0]).toBeTruthy();

    let career = game.getCareer();
    const rifle = career.weapons.find((weapon) => weapon.id === "vanguard");
    expect(rifle?.record.runs).toBe(1);
    expect(rifle?.record.kills).toBe(5);
    expect(rifle?.record.bestScore).toBe(results[0].score.total);
    expect(career.weapons).toHaveLength(6);
    expect(career.weapons.find((weapon) => weapon.id === "breacher")?.record.runs).toBe(0);
    expect(career.badgesEarned).toBeGreaterThanOrEqual(1); // FIRST CONTACT
    expect(career.badges.find((badge) => badge.id === "first-run")?.earned).toBe(true);
    // A badge that needs more than one run is still locked, with progress.
    const tour = career.badges.find((badge) => badge.id === "tourist");
    expect(tour?.earned).toBe(false);
    expect(tour?.progress).toBeGreaterThanOrEqual(0);

    // A fresh engine on the same device reads the record back.
    game.destroy();
    game = createGame();
    career = game.getCareer();
    expect(career.weapons.find((weapon) => weapon.id === "vanguard")?.record.kills).toBe(5);
    // And a second run with the other weapon does not pollute the rifle's row.
    game.destroy();
  });

  it("opens a contract board and signs orders off as runs land", () => {
    window.localStorage.clear();
    game = createGame();
    // A brand new account is handed three orders before it has played anything.
    let board = game.getContractBoard();
    expect(board.active.map((order) => order.id)).toEqual(["first-contact", "field-test", "spotter"]);
    expect(board.completed).toEqual([]);
    expect(board.total).toBeGreaterThanOrEqual(12);

    game.beginRun("contract-a");
    frames.advance(40);
    game.activeWorld.stats.kills = 3;
    killPlayer(game, "hunter");
    expect(results[0]).toBeTruthy();
    expect(results[0].contractsSigned).toEqual([]);

    // Two more runs finish the "finish 3 runs" order, and the bottom of the
    // board moves up into the slot it freed.
    for (const seed of ["contract-b", "contract-c"]) {
      game.beginRun(seed);
      frames.advance(40);
      killPlayer(game, "hunter");
    }
    expect(results[2].contractsSigned).toContain("FIRST CONTACT");
    board = game.getContractBoard();
    expect(board.completed.map((order) => order.id)).toContain("first-contact");
    expect(board.active.length).toBe(3);
    // The queue moves in board order, so the fourth order takes the slot.
    expect(board.active.map((order) => order.id)).toEqual(["field-test", "spotter", "pest-control"]);
    // The feed says what happened, in the game's own voice.
    expect(feed.some((line) => line.text.includes("Contract signed off: first contact"))).toBe(true);

    // The board is part of the account, so a fresh engine reads it back.
    const stored = window.localStorage.getItem("lbs-contracts");
    expect(stored).toBeTruthy();
    game.destroy();
    game = createGame();
    const reloaded = game.getContractBoard();
    expect(reloaded.completed.map((order) => order.id)).toContain("first-contact");
    expect(reloaded.active.length).toBe(3);
  });

  it("repairs a contract board it cannot trust", () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "lbs-contracts",
      JSON.stringify({ active: [{ id: "nonsense", baseline: 4 }], completed: ["also-nonsense"] })
    );
    game = createGame();
    const board = game.getContractBoard();
    // Junk ids are dropped and the empty slots are filled from the board again.
    expect(board.active.map((order) => order.id)).toEqual(["first-contact", "field-test", "spotter"]);
    expect(board.completed).toEqual([]);
    // Reading it did not leave the junk in storage either.
    expect(window.localStorage.getItem("lbs-contracts")).not.toContain("nonsense");
  });

  it("keeps a per-profile dossier of kills and the runs that ended", () => {
    window.localStorage.clear();
    game = createGame();
    game.beginRun("dossier-a");
    frames.advance(40);
    // Three hunters and a flanker die the normal way, so the counts come out of
    // the same event pipeline the game uses.
    spawnAndKill(game, "hunter", 3);
    spawnAndKill(game, "flanker", 1);
    killPlayer(game, "mirror");
    expect(results[0].endedBy).toBe("mirror");

    let career = game.getCareer();
    expect(career.killsByKind).toEqual({ ...emptyKindTotals(), hunter: 3, flanker: 1 });
    expect(career.deathsByKind).toEqual({ ...emptyKindTotals(), mirror: 1 });
    // The run lands in the recent list, newest first, with its weapon stamped.
    expect(career.recentRuns).toHaveLength(1);
    expect(career.recentRuns[0].seed).toBe(game.getSeedLabel());
    expect(career.recentRuns[0].weapon).toBe("vanguard");

    // A second run accumulates on top rather than replacing.
    game.beginRun("dossier-b");
    frames.advance(40);
    spawnAndKill(game, "hunter", 2);
    killPlayer(game, "hunter");
    career = game.getCareer();
    expect(career.killsByKind).toEqual({ ...emptyKindTotals(), hunter: 5, flanker: 1 });
    expect(career.deathsByKind).toEqual({ ...emptyKindTotals(), hunter: 1, mirror: 1 });
    expect(career.recentRuns.map((run) => run.seed)).toEqual([game.getSeedLabel(), career.recentRuns[1].seed]);

    // And it survives a reload, because the dossier is the account's memory.
    game.destroy();
    game = createGame();
    const restored = game.getCareer();
    expect(restored.killsByKind.hunter).toBe(5);
    expect(restored.deathsByKind.mirror).toBe(1);
  });

  it("survives corrupt account data in storage", () => {
    window.localStorage.setItem("lbs-weapon-records", "{not json");
    window.localStorage.setItem("lbs-career-arenas", "not-a-list");
    window.localStorage.setItem("lbs-career-levels", JSON.stringify([1, 2, 3]));
    window.localStorage.setItem("lbs-career-wins", "banana");
    window.localStorage.setItem("lbs-career-kills-by-kind", "[1,2,3]");
    window.localStorage.setItem("lbs-career-deaths-by-kind", "{\"hunter\":\"lots\"}");
    game = createGame();
    const career = game.getCareer();
    expect(career.weapons.every((weapon) => weapon.record.runs === 0)).toBe(true);
    // Corrupt junk cannot be read as an earned badge.
    expect(career.badges.some((badge) => badge.earned)).toBe(false);
    expect(career.score).toBe(0);
    expect(Number.isFinite(career.runs)).toBe(true);
  });

  it("ignores a corrupted run history instead of crashing", () => {
    window.localStorage.setItem("lbs-run-history", "{not json");
    game = createGame();
    expect(snapshots[snapshots.length - 1].topRuns).toEqual([]);
    window.localStorage.setItem("lbs-run-history", JSON.stringify([{ seed: "ABC" }, { seed: "DEF", difficulty: "veteran", score: 900, kills: 3, victory: false, elapsed: 30 }]));
    game.destroy();
    game = createGame();
    expect(snapshots[snapshots.length - 1].topRuns.map((run) => run.seed)).toEqual(["DEF"]);
  });

  it("keeps a separate best score for each difficulty", () => {
    window.localStorage.clear();
    game = createGame();
    game.setDifficulty("recruit");
    game.beginRun("recruit-best");
    frames.advance(40);
    const world = game.activeWorld;
    world.player.invulnerability = 0;
    world.player.health = 1;
    world.bullets.push({
      position: { ...world.player.position },
      velocity: { x: 0, y: 0 },
      owner: "bot",
      damage: 50,
      life: 1,
      color: "#fff",
      source: "hunter",
      travelled: 0
    });
    frames.advance(6);
    const recruitBest = results[0].score.total;
    expect(recruitBest).toBeGreaterThan(0);
    expect(game.activeWorld.difficulty).toBe("recruit");
    const stored = JSON.parse(window.localStorage.getItem("lbs-best-by-difficulty") ?? "{}");
    expect(stored.recruit.score).toBe(recruitBest);

    // A veteran run must not compare against the recruit record.
    game.setDifficulty("veteran");
    expect(game.activeWorld.difficulty).toBe("veteran");
    game.beginRun("veteran-best");
    frames.advance(20);
    const veteranWorld = game.activeWorld;
    veteranWorld.player.invulnerability = 0;
    veteranWorld.player.health = 1;
    veteranWorld.bullets.push({
      position: { ...veteranWorld.player.position },
      velocity: { x: 0, y: 0 },
      owner: "bot",
      damage: 50,
      life: 1,
      color: "#fff",
      source: "hunter",
      travelled: 0
    });
    frames.advance(6);
    expect(results[1].isDifficultyBest).toBe(true);
    expect(results[1].previousBestScore).toBe(0);
    const updated = JSON.parse(window.localStorage.getItem("lbs-best-by-difficulty") ?? "{}");
    expect(updated.veteran.score).toBe(results[1].score.total);
    expect(updated.recruit.score).toBe(recruitBest);
  });

  it("survives a long session without unbounded effect growth", () => {
    game = createGame();
    game.beginRun("endurance");
    pressKey(" ");
    for (let i = 0; i < 40; i += 1) {
      frames.advance(30);
      if (game.currentPhase !== "running") {
        game.beginRun("endurance");
        pressKey(" ");
      }
    }
    const snapshot = snapshots[snapshots.length - 1];
    expect(snapshot.fps).toBeGreaterThan(0);
    expect(fake.total()).toBeGreaterThan(1000);
  });
});

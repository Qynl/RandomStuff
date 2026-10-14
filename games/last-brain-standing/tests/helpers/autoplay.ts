import { normalize } from "../../src/ai";
import { attackFor } from "../../src/signatures";
import { pointInObstacle, segmentBlocked, WORLD } from "../../src/arena";
import { PLAYER_BULLET_SPEED, PLAYER_RADIUS, BOT_RADIUS } from "../../src/constants";
import { createWorld, emptyInput, stepWorld, type SimInput, type World } from "../../src/sim";
import type { DifficultyId, Rect, RunStats, SimEvent } from "../../src/types";

export type PlayStyle = "competent" | "reckless" | "passive";

export interface AutoplayOptions {
  seed: number | string;
  difficulty?: DifficultyId;
  style?: PlayStyle;
  /** Extra distance the player tries to keep from the nearest hostile. */
  standOff?: number;
  /** Simulated frame length. Defaults to 1/60 to match a normal monitor. */
  step?: number;
  maxSeconds?: number;
  /** Optional per-step probe, used by debugging tests. */
  probe?: (world: World) => void;
}

export interface FairnessReport {
  /** Player took damage with no bullet or body nearby to blame. */
  unexplainedHits: number;
  /** Hostiles that materialised too close to the player to be readable. */
  closeSpawns: number;
  /** Hostiles ended up inside arena geometry. */
  botsInsideGeometry: number;
  /** Player ended up inside arena geometry. */
  playerInsideGeometry: number;
  /** Hostiles fired with their shot lane blocked. */
  shotsThroughWalls: number;
  /** Hostiles fired without completing a telegraph. */
  untelegraphedShots: number;
}

export interface AutoplayResult {
  phase: World["phase"];
  victory: boolean;
  stats: RunStats;
  elapsed: number;
  frames: number;
  fairness: FairnessReport;
  /** Events grouped by type, for assertions. */
  events: SimEvent[];
  world: World;
}

const emptyFairness = (): FairnessReport => ({
  unexplainedHits: 0,
  closeSpawns: 0,
  botsInsideGeometry: 0,
  playerInsideGeometry: 0,
  shotsThroughWalls: 0,
  untelegraphedShots: 0
});

/**
 * Scripted player with a fixed reaction clock. Decisions are refreshed on a
 * 30 Hz cadence keyed off simulation time, so the same policy reacts equally
 * well at 30, 60 or 144 fps instead of getting free frames at high refresh
 * rates. Between decisions the simulated player keeps holding its last intent,
 * exactly like a human holding a key.
 */
export interface AutoplayPolicy {
  decide(world: World): SimInput;
}

export function createPolicy(style: PlayStyle, standOff = 0, reactionInterval = 1 / 30): AutoplayPolicy {
  let nextDecisionAt = -Infinity;
  let cached: SimInput = { ...emptyInput(), aimMode: "mouse" };
  return {
    decide(world: World): SimInput {
      if (world.elapsed + 1e-9 >= nextDecisionAt) {
        nextDecisionAt = world.elapsed + reactionInterval;
        const decision = buildInput(world, style, standOff);
        // A dash is an edge input: hold it for a single frame only.
        cached = { ...decision, dash: decision.dash };
        if (decision.dash) nextDecisionAt = world.elapsed + reactionInterval;
      }
      const result = cached;
      cached = { ...cached, dash: false };
      return result;
    }
  };
}

/** Runs one full headless match with a scripted player. */
export function autoplay(options: AutoplayOptions): AutoplayResult {
  const step = options.step ?? 1 / 60;
  const style = options.style ?? "competent";
  const maxSeconds = options.maxSeconds ?? 240;
  const policy = createPolicy(style, options.standOff ?? 0);
  const world = createWorld({ seed: options.seed, difficulty: options.difficulty ?? "standard" });
  world.phase = "running";
  world.waveState = "cleared";
  world.waveTimer = 0.3;

  const fairness = emptyFairness();
  const events: SimEvent[] = [];
  const windupStart = new Map<number, number>();
  let frames = 0;

  while (world.phase === "running" && world.elapsed < maxSeconds) {
    const input = policy.decide(world);
    const bulletsBefore = world.bullets.filter((bullet) => bullet.owner === "bot").map((bullet) => ({ ...bullet.position }));
    const shellsBefore = world.shells.map((shell) => ({ ...shell.target }));
    // The shot was created against the world as it stood at the start of the
    // frame, so the lane is judged against the player's position *before* the
    // step: a player who dives into cover during the same frame was still shot
    // at fairly, and the round simply hits the wall.
    const playerBefore = { ...world.player.position };
    // A frame may swap the arena layout (a run starting, a wave turning over),
    // so the "before" check has to remember the obstacles the sim was using.
    const obstaclesBefore = world.obstacles;
    const botsBefore = world.bots.filter((bot) => bot.alive).map((bot) => ({ id: bot.id, position: { ...bot.position } }));

    const frameEvents = stepWorld(world, input, step);
    frames += 1;
    if (frameEvents.length > 0) events.push(...frameEvents);

    for (const event of frameEvents) {
      if (event.type === "bot-windup") windupStart.set(event.botId, world.elapsed);
      if (event.type === "bot-fired") {
        const started = windupStart.get(event.botId);
        if (started === undefined || world.elapsed - started < 0.14) fairness.untelegraphedShots += 1;
        // Use the shooter's pre-step position: a bot may legally fire and then
        // move into cover during the same frame.
        const shooterBefore = botsBefore.find((entry) => entry.id === event.botId);
        const shooterAfter = world.bots.find((entry) => entry.id === event.botId);
        // Only straight-lane attacks are lane-checked. A lobbed shell is *meant*
        // to clear cover, a shield bash happens at arm's length, and a spray is
        // checked once when it starts: its later rounds simply burn out on the
        // wall they hit.
        const indirect =
          attackFor(event.kind).shell !== undefined ||
          attackFor(event.kind).melee !== undefined ||
          attackFor(event.kind).kamikaze === true ||
          attackFor(event.kind).spray !== undefined;
        // The shot is released part-way through the frame, after the player has
        // moved and before the shooter does. The metric only knows the frame's
        // endpoints, so it is a violation only if every lane the frame could
        // have contained was blocked: shooter and player each at both of their
        // positions. A near-corner graze that happens to be blocked at both
        // endpoints is not treated as a shot through a wall.
        const blocked = (from: { x: number; y: number } | undefined, obstacles: Rect[]) =>
          from !== undefined && segmentBlocked(from, playerBefore, obstacles) && segmentBlocked(from, world.player.position, world.obstacles);
        const everyLaneBlocked =
          blocked(shooterBefore?.position, obstaclesBefore) &&
          (shooterAfter === undefined ||
            (segmentBlocked(shooterAfter.position, playerBefore, obstaclesBefore) && segmentBlocked(shooterAfter.position, world.player.position, world.obstacles)));
        if (!indirect && everyLaneBlocked) fairness.shotsThroughWalls += 1;
      }
      if (event.type === "player-hit") {
        const nearestBullet = bulletsBefore.reduce((min, position) => Math.min(min, Math.hypot(position.x - world.player.position.x, position.y - world.player.position.y)), Infinity);
        // A bulwark's bash and a shard's detonation happen at arm's length, so
        // proximity is the cause: allow the melee radius, not just body contact.
        const nearestBot = botsBefore.reduce((min, entry) => Math.min(min, Math.hypot(entry.position.x - world.player.position.x, entry.position.y - world.player.position.y)), Infinity);
        // A shell in the air over the player's head is a cause too: it is
        // telegraphed by the marked circle, not by a projectile on screen.
        const nearestShell = shellsBefore.reduce((min, position) => Math.min(min, Math.hypot(position.x - world.player.position.x, position.y - world.player.position.y)), Infinity);
        if (nearestBullet > 120 && nearestBot > 100 && nearestShell > 90) fairness.unexplainedHits += 1;
      }
      if (event.type === "bot-spawned") {
        if (Math.hypot(event.position.x - world.player.position.x, event.position.y - world.player.position.y) < 200) fairness.closeSpawns += 1;
        if (pointInObstacle(event.position, world.obstacles)) fairness.botsInsideGeometry += 1;
      }
    }

    for (const bot of world.bots) {
      if (!bot.alive) continue;
      if (pointInObstacle(bot.position, world.obstacles)) fairness.botsInsideGeometry += 1;
      if (bot.position.x < 0 || bot.position.y < 0 || bot.position.x > WORLD.width || bot.position.y > WORLD.height) {
        fairness.botsInsideGeometry += 1;
      }
    }
    if (pointInObstacle(world.player.position, world.obstacles)) fairness.playerInsideGeometry += 1;
    options.probe?.(world);
  }

  return { phase: world.phase, victory: (world.phase as World["phase"]) === "victory", stats: { ...world.stats }, elapsed: world.elapsed, frames, fairness, events, world };
}

function buildInput(world: World, style: PlayStyle, standOff: number): SimInput {
  if (style === "passive") {
    return { move: { x: 0, y: 0 }, aim: { x: world.player.position.x, y: world.player.position.y - 100 }, firing: false, dash: false, aimMode: "mouse" };
  }

  const player = world.player.position;
  const live = world.bots.filter((bot) => bot.alive);
  const visible = live.filter((bot) => !segmentBlocked(player, bot.position, world.obstacles));
  const target = (visible.length > 0 ? visible : live).sort(
    (a, b) => Math.hypot(a.position.x - player.x, a.position.y - player.y) - Math.hypot(b.position.x - player.x, b.position.y - player.y)
  )[0];

  // Aim with a simple intercept so the scripted player is a fair stand-in for a human.
  const aimPoint = target
    ? {
        x: target.position.x + target.velocity.x * (Math.hypot(target.position.x - player.x, target.position.y - player.y) / PLAYER_BULLET_SPEED),
        y: target.position.y + target.velocity.y * (Math.hypot(target.position.x - player.x, target.position.y - player.y) / PLAYER_BULLET_SPEED)
      }
    : { x: player.x, y: player.y - 100 };

  const aimDirection = normalize({ x: aimPoint.x - player.x, y: aimPoint.y - player.y });
  const toTarget = target ? normalize({ x: target.position.x - player.x, y: target.position.y - player.y }) : { x: 0, y: 0 };
  const aligned = aimDirection.x * toTarget.x + aimDirection.y * toTarget.y;
  const laneClear = target ? !segmentBlocked(player, aimPoint, world.obstacles) : false;
  const firing = Boolean(target) && laneClear && aligned > 0.985;

  // Movement: hold a ring around the nearest hostile, dodge telegraphed shots and bullets.
  let moveDirection = { x: 0, y: 0 };
  const ringDistance = 230 + standOff;
  if (target) {
    const range = Math.hypot(target.position.x - player.x, target.position.y - player.y);
    const radial = range > ringDistance ? 1 : range < ringDistance - 60 ? -1 : 0;
    moveDirection = { x: toTarget.x * radial, y: toTarget.y * radial };
    const tangent = { x: -toTarget.y, y: toTarget.x };
    const strafeSign = target.strafeSign >= 0 ? 1 : -1;
    moveDirection = { x: moveDirection.x + tangent.x * strafeSign * 0.75, y: moveDirection.y + tangent.y * strafeSign * 0.75 };
  }
  for (const bot of live) {
    const dx = player.x - bot.position.x;
    const dy = player.y - bot.position.y;
    const range = Math.hypot(dx, dy);
    if (range > 190) continue;
    const weight = (190 - range) / 190;
    moveDirection = { x: moveDirection.x + (dx / range) * weight * 1.6, y: moveDirection.y + (dy / range) * weight * 1.6 };
    if (bot.windup > 0) {
      // Sidestep the telegraph: move across the firing line, not along it.
      const across = { x: -Math.sin(bot.facing), y: Math.cos(bot.facing) };
      const side = across.x * (player.x - bot.position.x) + across.y * (player.y - bot.position.y) >= 0 ? 1 : -1;
      moveDirection = { x: moveDirection.x + across.x * side * 1.5, y: moveDirection.y + across.y * side * 1.5 };
    }
  }
  // Keep off the walls and away from blocks.
  const wallMargin = 70;
  if (player.x < wallMargin) moveDirection.x += 1.2;
  if (player.x > WORLD.width - wallMargin) moveDirection.x -= 1.2;
  if (player.y < wallMargin) moveDirection.y += 1.2;
  if (player.y > WORLD.height - wallMargin) moveDirection.y -= 1.2;
  for (const obstacle of world.obstacles) {
    const centre = { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2 };
    const range = Math.hypot(player.x - centre.x, player.y - centre.y);
    if (range > 150) continue;
    const weight = (150 - range) / 150;
    moveDirection = { x: moveDirection.x + ((player.x - centre.x) / range) * weight * 0.9, y: moveDirection.y + ((player.y - centre.y) / range) * weight * 0.9 };
  }

  // Dash out of incoming fire when it is about to land.
  const dashing = shouldDash(world);

  return {
    move: moveDirection,
    aim: aimPoint,
    firing,
    dash: dashing,
    aimMode: "mouse"
  };
}

function shouldDash(world: World): boolean {
  if (world.player.dashCooldown > 0) return false;
  const player = world.player.position;
  for (const bullet of world.bullets) {
    if (bullet.owner !== "bot") continue;
    const dx = player.x - bullet.position.x;
    const dy = player.y - bullet.position.y;
    const gap = Math.hypot(dx, dy);
    if (gap > 130) continue;
    const speed = Math.hypot(bullet.velocity.x, bullet.velocity.y) || 1;
    const approach = (dx * bullet.velocity.x + dy * bullet.velocity.y) / speed;
    if (approach <= 0) continue;
    const closest = Math.abs(dx * (bullet.velocity.y / speed) - dy * (bullet.velocity.x / speed));
    if (closest < PLAYER_RADIUS + BOT_RADIUS && approach < 0.42) return true;
  }
  return false;
}

/** Small deterministic hash of the visible world state, for replay checks. */
export function worldHash(world: World): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return JSON.stringify({
    phase: world.phase,
    wave: world.wave,
    elapsed: round(world.elapsed),
    player: [round(world.player.position.x), round(world.player.position.y), round(world.player.health)],
    bots: world.bots.map((bot) => [bot.id, bot.kind, round(bot.position.x), round(bot.position.y), round(bot.health), bot.alive, round(bot.windup)]),
    bullets: world.bullets.map((bullet) => [bullet.owner, round(bullet.position.x), round(bullet.position.y)]),
    pending: world.pendingSpawns.map((pending) => [pending.kind, round(pending.position.x), round(pending.position.y), round(pending.delay)]),
    stats: world.stats
  });
}

/** Convenience helper used by balance sweeps. */
export function runSeeds(seeds: Array<number | string>, options: Omit<AutoplayOptions, "seed"> = {}): AutoplayResult[] {
  return seeds.map((seed) => autoplay({ ...options, seed }));
}

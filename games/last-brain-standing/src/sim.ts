import {
  BOT_PROFILES,
  chooseBotMovement,
  chooseBotSpeedScale,
  detectFiringHabit,
  detectMovementHabit,
  distance,
  evaluateBotFire,
  nearestAlly,
  normalize,
  preferredStrafeSign,
  predictIntercept,
  rotateToward,
  windupAimPoint,
  windupDuration,
  windupTurnRate
} from "./ai";
import {
  ARENA_LAYOUTS,
  firstBlockingFraction,
  findSpawnPositions,
  layoutForSeed,
  rangeScaleForOpenness,
  segmentBlocked,
  segmentHitsCircle,
  sweepMovement,
  WORLD
} from "./arena";
import {
  BOT_RADIUS,
  CONTACT_COOLDOWN,
  CONTACT_DAMAGE,
  CONTACT_KNOCKBACK,
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  ELIMINATION_HEAL,
  PLAYER_DASH_DISTANCE,
  PLAYER_DASH_INVULNERABILITY,
  PLAYER_HIT_INVULNERABILITY,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  TELEMETRY_DIRECTION_SAMPLES,
  TELEMETRY_SHOT_SAMPLES
} from "./constants";
import { LOADOUTS, resolveLoadout, type Loadout } from "./loadouts";
import { getWavePlan, MAX_WAVES, type WavePlan } from "./progression";
import { createRandomSeed, createRng, normalizeSeed, type Rng } from "./rng";
import type { AimMode, AgentState, Bullet, DifficultyId, PendingSpawn, PlayerTelemetry, Rect, RunStats, SimEvent, Vec2 } from "./types";

export type SimPhase = "standby" | "running" | "victory" | "defeat";
export type WaveState = "idle" | "cleared" | "telegraph" | "active";

export interface PlayerState {
  position: Vec2;
  velocity: Vec2;
  /** Unit direction of the last movement input; dash follows this so knockback cannot hijack it. */
  moveIntent: Vec2;
  /** Unit aim direction; kept as a vector so assisted aiming can rotate it. */
  aimDirection: Vec2;
  health: number;
  maxHealth: number;
  fireCooldown: number;
  dashCooldown: number;
  /** Remaining dash input buffer so a dash pressed during cooldown still fires. */
  dashBuffer: number;
  /** Seconds of the current dash animation. */
  dashTimer: number;
  invulnerability: number;
  contactCooldown: number;
  hitFlash: number;
  /** Screen-space direction the last hit came from, for the damage indicator. */
  lastHitDirection: Vec2;
}

export interface SimInput {
  move: Vec2;
  /** World point the player is aiming at. Ignored while assisted aiming has a target in its cone. */
  aim: Vec2;
  firing: boolean;
  /** Edge-triggered dash request; the presentation layer clears it after each frame. */
  dash: boolean;
  aimMode: AimMode;
}

export const emptyInput = (): SimInput => ({
  move: { x: 0, y: 0 },
  aim: { x: WORLD.width / 2, y: WORLD.height / 2 },
  firing: false,
  dash: false,
  aimMode: "mouse"
});

export interface World {
  seed: number;
  /**
   * Blocks that occupy this arena. Every geometry query (movement sweeps, line
   * of sight, spawn clearance) reads this list rather than the module constant,
   * so a run plays in one fixed layout from start to finish.
   */
  obstacles: Rect[];
  /** Human-readable name of the current layout, for the HUD. */
  arenaName: string;
  /** Primary weapon this run is played with. */
  loadout: Loadout;
  difficulty: DifficultyId;
  rng: Rng;
  phase: SimPhase;
  /** Active combat time in seconds; frozen while paused or on an end screen. */
  elapsed: number;
  player: PlayerState;
  bots: AgentState[];
  bullets: Bullet[];
  pendingSpawns: PendingSpawn[];
  telemetry: PlayerTelemetry;
  stats: RunStats;
  wave: number;
  waveState: WaveState;
  waveTimer: number;
  activePlan: WavePlan;
  events: SimEvent[];
  shake: number;
  /** Seconds of "your shot connected" feedback. */
  hitMarker: number;
  nextBotId: number;
  /** Bot currently being tracked by assisted aiming, for the HUD reticle. */
  assistTargetId: number | null;
  /** What the Mirror can currently read out of the player's habits, for the HUD. */
  mirrorRead: { movement: number; firing: number } | null;
  /** Accumulator that makes habit sampling frame-rate independent. */
  telemetryTimer: number;
}

export interface CreateWorldOptions {
  seed?: number | string;
  difficulty?: DifficultyId;
}

/** A wave telegraph never drops below this even later in a run. */
const MIN_TELEGRAPH = 0.6;
/** Habit samples are taken on a fixed clock so 30 fps and 144 fps read identically. */
const TELEMETRY_INTERVAL = 0.05;
/** How long a dash pressed during cooldown stays queued. */
const DASH_BUFFER = 0.2;
/** A materialising hostile must never appear closer than this to the player. */
const SPAWN_MIN_PLAYER_DISTANCE = 210;
/** Fresh warning marker time when a spawn has to be moved. */
const SPAWN_RETELEGRAPH = 0.35;
/** How many times a spawn may be moved before it is allowed to land anyway. */
const MAX_SPAWN_RELOCATIONS = 4;
/** How long a bot commits to an orbit side once it picks one. */
const STRAFE_HOLD = 0.7;

export function createWorld(options: CreateWorldOptions = {}): World {
  const seedValue = options.seed ?? createRandomSeed();
  const world: World = {
    seed: 1,
    obstacles: ARENA_LAYOUTS.quadrant.obstacles,
    arenaName: ARENA_LAYOUTS.quadrant.name,
    loadout: LOADOUTS.rifle,
    difficulty: options.difficulty ?? DEFAULT_DIFFICULTY,
    rng: createRng(seedValue),
    phase: "standby",
    elapsed: 0,
    player: createPlayer(),
    bots: [],
    bullets: [],
    pendingSpawns: [],
    telemetry: { recentDirections: [], recentShots: [], stationaryTime: 0, lastMoveDirection: { x: 0, y: 0 } },
    stats: emptyStats(),
    wave: 0,
    waveState: "idle",
    waveTimer: 0,
    activePlan: getWavePlan(1, options.difficulty ?? DEFAULT_DIFFICULTY),
    events: [],
    shake: 0,
    hitMarker: 0,
    nextBotId: 1,
    assistTargetId: null,
    mirrorRead: null,
    telemetryTimer: 0
  };
  // The world keeps the canonical 24 bit seed so the HUD label always replays.
  world.seed = normalizeSeed(seedValue);
  world.rng = createRng(world.seed);
  applyArenaLayoutForSeed(world);
  return world;
}

function createPlayer(): PlayerState {
  return {
    position: { x: WORLD.width / 2, y: WORLD.height - 88 },
    velocity: { x: 0, y: 0 },
    moveIntent: { x: 0, y: 0 },
    aimDirection: { x: 0, y: -1 },
    health: PLAYER_MAX_HEALTH,
    maxHealth: PLAYER_MAX_HEALTH,
    fireCooldown: 0,
    dashCooldown: 0,
    dashBuffer: 0,
    dashTimer: 0,
    invulnerability: 1.2,
    contactCooldown: 0,
    hitFlash: 0,
    lastHitDirection: { x: 0, y: 0 }
  };
}

export function emptyStats(): RunStats {
  return {
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    damageTaken: 0,
    dashes: 0,
    dodges: 0,
    interrupts: 0,
    wavesCleared: 0,
    elapsed: 0,
    wave: 0
  };
}

/** Resets a world in place for a fresh run, keeping object identity for React refs. */
/** How open the world's current layout is, for behaviour that adapts to cover. */
function opennessOf(world: World): number {
  const layout = Object.values(ARENA_LAYOUTS).find((entry) => entry.obstacles === world.obstacles);
  return layout?.openness ?? 1;
}

/** Points a world at the layout its seed names, and keeps the HUD name in sync. */
function applyArenaLayoutForSeed(world: World): void {
  const layoutId = layoutForSeed(world.seed);
  world.obstacles = ARENA_LAYOUTS[layoutId].obstacles;
  world.arenaName = ARENA_LAYOUTS[layoutId].name;
}

/**
 * Swaps the primary weapon. Anything unknown or still locked resolves to the
 * default, so a tampered stored value cannot skip an unlock.
 */
export function setWorldLoadout(world: World, id: unknown, career = Number.POSITIVE_INFINITY): Loadout {
  world.loadout = LOADOUTS[resolveLoadout(id, career)];
  return world.loadout;
}

export function resetWorld(world: World, options: { seed?: number | string; difficulty?: DifficultyId } = {}): World {
  if (options.seed !== undefined) {
    world.seed = normalizeSeed(options.seed);
    world.rng = createRng(world.seed);
  }
  // A restart can change the seed, which changes the arena it plays in.
  applyArenaLayoutForSeed(world);
  if (options.difficulty) world.difficulty = options.difficulty;
  world.phase = "running";
  world.elapsed = 0;
  world.bots.length = 0;
  world.bullets.length = 0;
  world.pendingSpawns.length = 0;
  world.events.length = 0;
  world.stats = emptyStats();
  world.wave = 0;
  world.waveState = "cleared";
  world.waveTimer = 0.45;
  world.activePlan = getWavePlan(1, world.difficulty);
  world.shake = 0;
  world.hitMarker = 0;
  world.nextBotId = 1;
  world.assistTargetId = null;
  world.mirrorRead = null;
  world.telemetryTimer = 0;
  world.telemetry.recentDirections.length = 0;
  world.telemetry.recentShots.length = 0;
  world.telemetry.stationaryTime = 0;
  world.telemetry.lastMoveDirection = { x: 0, y: 0 };
  world.player = createPlayer();
  return world;
}

/** Advances the world by one frame and returns the events raised during that frame. */
export function stepWorld(world: World, input: SimInput, dt: number): SimEvent[] {
  world.events.length = 0;
  if (world.phase !== "running") return world.events;
  const step = Math.max(0, Math.min(0.05, dt));
  world.elapsed += step;
  world.stats.elapsed = world.elapsed;
  world.shake = Math.max(0, world.shake - step * 26);
  world.hitMarker = Math.max(0, world.hitMarker - step);

  updatePlayer(world, input, step);
  updateMirrorRead(world);
  updateBots(world, step);
  updateBullets(world, step);
  updateSpawns(world, step);
  updateWaveState(world, step);
  return world.events;
}

const preset = (world: World) => DIFFICULTIES[world.difficulty];

/**
 * Publishes what the Mirror could exploit right now. The HUD turns this into
 * advice, which is what makes the profile counterable instead of mysterious:
 * the player can watch the read spike while repeating a pattern and drop when
 * they break it.
 */
function updateMirrorRead(world: World): void {
  if (!world.bots.some((bot) => bot.alive && bot.kind === "mirror")) {
    world.mirrorRead = null;
    return;
  }
  world.mirrorRead = {
    movement: detectMovementHabit(world.telemetry.recentDirections).strength,
    firing: detectFiringHabit(world.telemetry.recentShots).strength
  };
}

function updatePlayer(world: World, input: SimInput, dt: number): void {
  const player = world.player;
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.invulnerability = Math.max(0, player.invulnerability - dt);
  player.contactCooldown = Math.max(0, player.contactCooldown - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  player.dashTimer = Math.max(0, player.dashTimer - dt);
  player.dashBuffer = Math.max(0, player.dashBuffer - dt);

  const inputMagnitude = Math.hypot(input.move.x, input.move.y);
  const move = normalize(input.move);
  if (move.x !== 0 || move.y !== 0) player.moveIntent = move;

  updateAim(world, input, dt);
  updateTelemetry(world, move, dt);

  const speed = PLAYER_SPEED * Math.min(1, inputMagnitude);
  const previous = { ...player.position };
  const movement = { x: move.x * speed * dt, y: move.y * speed * dt };
  player.position = sweepMovement(player.position, movement, PLAYER_RADIUS, 6, world.obstacles).position;
  player.velocity = {
    x: (player.position.x - previous.x) / Math.max(dt, 0.0001),
    y: (player.position.y - previous.y) / Math.max(dt, 0.0001)
  };

  if (input.dash) player.dashBuffer = DASH_BUFFER;
  if (player.dashBuffer > 0 && player.dashCooldown <= 0) tryDash(world);

  if (input.firing && player.fireCooldown <= 0) firePlayerBullet(world);
}

function updateTelemetry(world: World, move: Vec2, dt: number): void {
  const telemetry = world.telemetry;
  if (move.x !== 0 || move.y !== 0) {
    telemetry.lastMoveDirection = move;
    telemetry.stationaryTime = 0;
    world.telemetryTimer += dt;
    if (world.telemetryTimer >= TELEMETRY_INTERVAL) {
      world.telemetryTimer = 0;
      telemetry.recentDirections.push(move);
      if (telemetry.recentDirections.length > TELEMETRY_DIRECTION_SAMPLES) telemetry.recentDirections.shift();
    }
  } else {
    telemetry.stationaryTime += dt;
    telemetry.lastMoveDirection = { x: telemetry.lastMoveDirection.x * 0.94, y: telemetry.lastMoveDirection.y * 0.94 };
  }
}

function updateAim(world: World, input: SimInput, dt: number): void {
  const player = world.player;
  if (input.aimMode === "assisted") {
    const target = findAssistTarget(world);
    world.assistTargetId = target?.id ?? null;
    if (target) {
      const desired = normalize({ x: target.position.x - player.position.x, y: target.position.y - player.position.y });
      // A bounded turn rate keeps assisted aiming helpful instead of magnetic.
      player.aimDirection = rotateToward(player.aimDirection, desired, 7.5 * dt);
      return;
    }
  } else {
    world.assistTargetId = null;
  }
  const desired = normalize({ x: input.aim.x - player.position.x, y: input.aim.y - player.position.y });
  if (desired.x !== 0 || desired.y !== 0) player.aimDirection = desired;
}

/**
 * Nearest visible hostile inside a forward cone. Using a cone (rather than the
 * nearest bot anywhere) stops assisted aiming from spinning the player around
 * to shoot backwards — assistance, not autopilot.
 */
export function findAssistTarget(world: World, maxRange = 620, coneRadians = 1.45): AgentState | null {
  const player = world.player.position;
  const aimAngle = Math.atan2(world.player.aimDirection.y, world.player.aimDirection.x);
  let best: { bot: AgentState; cost: number } | null = null;
  for (const bot of world.bots) {
    if (!bot.alive) continue;
    const range = distance(player, bot.position);
    if (range > maxRange) continue;
    if (segmentBlocked(player, bot.position, world.obstacles)) continue;
    const angle = Math.atan2(bot.position.y - player.y, bot.position.x - player.x);
    const delta = Math.abs(normalizeAngle(angle - aimAngle));
    if (delta > coneRadians) continue;
    const cost = delta * 1.5 + range / 400;
    if (!best || cost < best.cost) best = { bot, cost };
  }
  return best?.bot ?? null;
}

function normalizeAngle(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function tryDash(world: World): void {
  const player = world.player;
  if (player.dashCooldown > 0) return;
  const direction = selectDashDirection(world);
  if (direction.x === 0 && direction.y === 0) return;
  const movement = { x: direction.x * PLAYER_DASH_DISTANCE, y: direction.y * PLAYER_DASH_DISTANCE };
  const from = { ...player.position };
  const swept = sweepMovement(player.position, movement, PLAYER_RADIUS, 4, world.obstacles);
  player.position = swept.position;
  player.dashCooldown = preset(world).dashCooldown;
  player.dashBuffer = 0;
  player.invulnerability = Math.max(player.invulnerability, PLAYER_DASH_INVULNERABILITY);
  player.dashTimer = 0.18;
  world.shake = Math.max(world.shake, 4);
  world.stats.dashes += 1;
  world.events.push({ type: "player-dash", from, to: { ...player.position }, blocked: swept.blocked });
}

/** Dash follows the movement input, and falls back to the aim direction. */
export function selectDashDirection(world: World): Vec2 {
  const intent = world.player.moveIntent;
  if (Math.hypot(intent.x, intent.y) > 0.01) return normalize(intent);
  return normalize(world.player.aimDirection);
}

function firePlayerBullet(world: World): void {
  const player = world.player;
  const weapon = world.loadout;
  const direction = normalize(player.aimDirection);
  if (direction.x === 0 && direction.y === 0) return;
  player.fireCooldown = weapon.fireInterval * preset(world).playerFireScale;
  world.telemetry.recentShots.push(direction);
  if (world.telemetry.recentShots.length > TELEMETRY_SHOT_SAMPLES) world.telemetry.recentShots.shift();

  // Multi-round weapons fan their shot out deterministically from the world rng,
  // so a replay with the same seed produces the same pellet pattern.
  const baseAngle = Math.atan2(direction.y, direction.x);
  const pellets = Math.max(1, Math.round(weapon.shots));
  for (let index = 0; index < pellets; index += 1) {
    const offset = pellets === 1
      ? weapon.spread * world.rng.range(-1, 1) * 0
      : (-weapon.spread / 2 + (weapon.spread * index) / (pellets - 1)) + world.rng.range(-0.02, 0.02);
    const angle = baseAngle + offset;
    const shotDirection = { x: Math.cos(angle), y: Math.sin(angle) };
    const origin = { x: player.position.x + direction.x * 18, y: player.position.y + direction.y * 18 };
    world.bullets.push({
      position: { ...origin },
      velocity: { x: shotDirection.x * weapon.bulletSpeed, y: shotDirection.y * weapon.bulletSpeed },
      owner: "player",
      damage: weapon.damage,
      life: weapon.bulletLife,
      color: "#e8dcc0",
      source: "player",
      travelled: 0
    });
    world.stats.shotsFired += 1;
  }
  world.shake = Math.max(world.shake, weapon.recoil);
  world.events.push({ type: "player-fired", position: { x: player.position.x + direction.x * 18, y: player.position.y + direction.y * 18 }, direction });
}

function updateBots(world: World, dt: number): void {
  const player = world.player;
  const difficulty = preset(world);
  const plan = world.activePlan;
  // Hostiles hold a tighter ring in cover-heavy arenas.
  const openness = opennessOf(world);

  for (const bot of world.bots) {
    if (!bot.alive) continue;
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    bot.hitFlash = Math.max(0, bot.hitFlash - dt);
    bot.spawnGuard = Math.max(0, bot.spawnGuard - dt);
    bot.strafeLock = Math.max(0, bot.strafeLock - dt);
    const profile = BOT_PROFILES[bot.kind];
    const range = distance(bot.position, player.position);
    const seesPlayer = !segmentBlocked(bot.position, player.position, world.obstacles);
    bot.blindTime = seesPlayer ? 0 : bot.blindTime + dt;

    if (bot.windup > 0) {
      updateWindup(world, bot, dt, seesPlayer);
    } else if (bot.spawnGuard <= 0) {
      const intent = evaluateBotFire(bot.kind, range, bot.fireCooldown, world.telemetry, {
        hasLineOfSight: seesPlayer,
        blindTime: bot.blindTime,
        difficultyFireScale: difficulty.fireScale
      });
      if (intent.shouldFire) startWindup(world, bot);
    }

    const windingUp = bot.windup > 0;
    const allies = collectAllies(world, bot);
    // Bots that orbit pick the side away from their nearest ally, so a wave
    // converges on the player from two directions instead of one long queue.
    if (bot.kind !== "hunter" && bot.strafeLock <= 0) {
      const ally = nearestAlly(bot, allies, 340);
      if (ally) {
        const nextSign = preferredStrafeSign(
          normalize({ x: player.position.x - bot.position.x, y: player.position.y - bot.position.y }),
          { x: ally.x - bot.position.x, y: ally.y - bot.position.y },
          bot.strafeSign
        );
        if (nextSign !== bot.strafeSign) {
          bot.strafeSign = nextSign;
          // Hold the new side long enough to read as a decision, not a twitch.
          bot.strafeLock = STRAFE_HOLD;
        }
      }
    }
    const decision = chooseBotMovement(bot, world.telemetry, world.elapsed, {
      player: player.position,
      playerVelocity: player.velocity,
      allies,
      awareness: plan.awareness * difficulty.aimScale,
      // Cover-heavy arenas shrink the ring hostiles try to hold.
      rangeScale: rangeScaleForOpenness(openness)
    });
    const speedScale = chooseBotSpeedScale(bot.kind, range, { advancing: decision.intent === "advance", windingUp });
    const speed = profile.speed * plan.speedMultiplier * speedScale;
    const steered = steerSafely(world, bot, decision.direction, Math.max(30, speed * 0.34));
    const previous = { ...bot.position };
    const swept = sweepMovement(bot.position, { x: steered.x * speed * dt, y: steered.y * speed * dt }, BOT_RADIUS, 5, world.obstacles);
    bot.position = swept.position;
    bot.velocity = {
      x: (bot.position.x - previous.x) / Math.max(dt, 0.0001),
      y: (bot.position.y - previous.y) / Math.max(dt, 0.0001)
    };

    const travelled = Math.hypot(bot.position.x - previous.x, bot.position.y - previous.y);
    if (travelled < speed * dt * 0.25 && !windingUp && bot.strafeLock <= 0) {
      bot.strafeSign *= -1;
      bot.strafeLock = STRAFE_HOLD;
    }
    if (!windingUp) bot.facing = shortestAngleLerp(bot.facing, Math.atan2(steered.y, steered.x), Math.min(1, dt * 6));

    if (bot.spawnGuard > 0) continue;
    // Body contact: the hostile body-checks you, both actors bounce apart, and
    // the hit has its own cooldown so a crowd cannot chain-stun the player.
    const gap = distance(bot.position, player.position);
    if (gap >= PLAYER_RADIUS + BOT_RADIUS + 4 || player.contactCooldown > 0 || player.invulnerability > 0) continue;
    const away = contactNormal(bot.position, player.position, world);
    player.position = sweepMovement(player.position, { x: away.x * CONTACT_KNOCKBACK, y: away.y * CONTACT_KNOCKBACK }, PLAYER_RADIUS, 5, world.obstacles).position;
    bot.position = sweepMovement(bot.position, { x: -away.x * 16, y: -away.y * 16 }, BOT_RADIUS, 4, world.obstacles).position;
    player.contactCooldown = CONTACT_COOLDOWN;
    world.shake = Math.max(world.shake, 7);
    damagePlayer(world, CONTACT_DAMAGE * difficulty.damageScale, bot.position, away, bot.kind);
  }
}

/** Separating direction for a body check, with a fallback for perfect overlaps. */
function contactNormal(botPosition: Vec2, playerPosition: Vec2, world: World): Vec2 {
  const direct = normalize({ x: playerPosition.x - botPosition.x, y: playerPosition.y - botPosition.y });
  if (direct.x !== 0 || direct.y !== 0) return direct;
  const awayFromAim = normalize({ x: -world.player.aimDirection.x, y: -world.player.aimDirection.y });
  return awayFromAim.x !== 0 || awayFromAim.y !== 0 ? awayFromAim : { x: 1, y: 0 };
}

function startWindup(world: World, bot: AgentState): void {
  const difficulty = preset(world);
  const profile = BOT_PROFILES[bot.kind];
  const duration = windupDuration(bot.kind, difficulty.windupScale, world.rng.range(-0.05, 0.06));
  bot.windup = duration;
  bot.windupDuration = duration;
  bot.windupTurnRate = windupTurnRate(bot.kind, difficulty.windupScale);
  const aimPoint = windupAimPoint(
    bot.kind,
    bot.position,
    world.player.position,
    world.player.velocity,
    profile.bulletSpeed * difficulty.bulletSpeedScale,
    world.telemetry
  );
  bot.facing = Math.atan2(aimPoint.y - bot.position.y, aimPoint.x - bot.position.x);
  world.events.push({ type: "bot-windup", botId: bot.id, kind: bot.kind, position: { ...bot.position }, duration });
}

function collectAllies(world: World, self: AgentState): Vec2[] {
  const allies: Vec2[] = [];
  for (const other of world.bots) {
    if (other === self || !other.alive) continue;
    allies.push(other.position);
  }
  return allies;
}

/** Steers around blocks (and walls) so bots stop grinding against geometry. */
function steerSafely(world: World, bot: AgentState, desired: Vec2, lookahead: number): Vec2 {
  if (desired.x === 0 && desired.y === 0) return { x: 0, y: 0 };
  const base = Math.atan2(desired.y, desired.x);
  const offsets = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.1, -2.1];
  for (const offset of offsets) {
    const angle = base + offset;
    const probe = { x: bot.position.x + Math.cos(angle) * lookahead, y: bot.position.y + Math.sin(angle) * lookahead };
    if (
      probe.x < BOT_RADIUS + 4 ||
      probe.y < BOT_RADIUS + 4 ||
      probe.x > WORLD.width - BOT_RADIUS - 4 ||
      probe.y > WORLD.height - BOT_RADIUS - 4
    ) {
      continue;
    }
    if (firstBlockingFraction(bot.position, probe, world.obstacles) === null) return { x: Math.cos(angle), y: Math.sin(angle) };
  }
  return { x: Math.cos(base + Math.PI / 2), y: Math.sin(base + Math.PI / 2) };
}

function updateWindup(world: World, bot: AgentState, dt: number, seesPlayer: boolean): void {
  const player = world.player;
  if (!seesPlayer || bot.spawnGuard > 0) {
    bot.windup = 0;
    bot.windupDuration = 0;
    bot.fireCooldown = Math.max(bot.fireCooldown, 0.3);
    world.events.push({ type: "bot-windup-cancel", botId: bot.id, kind: bot.kind, position: { ...bot.position } });
    return;
  }
  const profile = BOT_PROFILES[bot.kind];
  const difficulty = preset(world);
  const aimPoint = windupAimPoint(
    bot.kind,
    bot.position,
    player.position,
    player.velocity,
    profile.bulletSpeed * difficulty.bulletSpeedScale,
    world.telemetry
  );
  const desired = Math.atan2(aimPoint.y - bot.position.y, aimPoint.x - bot.position.x);
  bot.facing = shortestAngleLerp(bot.facing, desired, bot.windupTurnRate * dt);
  bot.windup -= dt;
  if (bot.windup > 0) return;

  bot.windup = 0;
  bot.windupDuration = 0;
  fireBotBullet(world, bot);
}

function fireBotBullet(world: World, bot: AgentState): void {
  const profile = BOT_PROFILES[bot.kind];
  const difficulty = preset(world);
  const speed = profile.bulletSpeed * difficulty.bulletSpeedScale;
  const jitter = bot.kind === "flanker" ? 0.1 : bot.kind === "mirror" ? 0.05 : 0.03;
  const direction = world.rng.spreadDirection(bot.facing, jitter);
  const origin = { x: bot.position.x + direction.x * 17, y: bot.position.y + direction.y * 17 };
  world.bullets.push({
    position: origin,
    velocity: { x: direction.x * speed, y: direction.y * speed },
    owner: "bot",
    damage: profile.damage * difficulty.damageScale,
    life: 1.9,
    color: profile.color,
    source: bot.kind,
    travelled: 0
  });
  bot.fireCooldown = profile.fireRate / Math.max(0.5, difficulty.fireScale) + world.rng.range(-0.08, 0.14);
  world.events.push({ type: "bot-fired", botId: bot.id, kind: bot.kind, position: origin, direction });
}

function updateBullets(world: World, dt: number): void {
  const player = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    // Ending the run clears the projectile list, so re-check the slot each pass.
    const bullet = world.bullets[i];
    if (!bullet) continue;
    const previous = { ...bullet.position };
    bullet.position.x += bullet.velocity.x * dt;
    bullet.position.y += bullet.velocity.y * dt;
    bullet.life -= dt;
    bullet.travelled += Math.hypot(bullet.position.x - previous.x, bullet.position.y - previous.y);

    const out =
      bullet.position.x < -24 ||
      bullet.position.x > WORLD.width + 24 ||
      bullet.position.y < -24 ||
      bullet.position.y > WORLD.height + 24;
    if (out || bullet.life <= 0) {
      world.bullets.splice(i, 1);
      continue;
    }
    if (segmentBlocked(previous, bullet.position, world.obstacles)) {
      world.bullets.splice(i, 1);
      continue;
    }

    if (bullet.owner === "player") {
      const target = nearestSweptHit(world, previous, bullet.position, BOT_RADIUS + 4);
      if (target) {
        world.bullets.splice(i, 1);
        const impact = { ...bullet.position };
        target.health -= bullet.damage;
        target.hitFlash = 0.16;
        world.stats.damageDealt += bullet.damage;
        world.stats.shotsHit += 1;
        world.hitMarker = 0.16;
        world.events.push({
          type: "bot-hit",
          botId: target.id,
          kind: target.kind,
          position: impact,
          amount: bullet.damage,
          health: Math.max(0, target.health)
        });
        if (target.health <= 0) eliminateBot(world, target);
      }
      continue;
    }

    // Bot rounds pass straight through an invulnerable player: that is what
    // makes dashing out of a bullet stream feel earned rather than lucky. The
    // round is only reported once, so a single bullet cannot spam the feedback.
    if (player.invulnerability > 0) {
      if (!bullet.dodgeReported && segmentHitsCircle(previous, bullet.position, player.position, PLAYER_RADIUS + 4)) {
        bullet.dodgeReported = true;
        world.stats.dodges += 1;
        world.events.push({
          type: "player-dodged",
          position: { ...player.position },
          kind: bullet.source === "player" ? "unknown" : bullet.source
        });
      }
      continue;
    }
    if (segmentHitsCircle(previous, bullet.position, player.position, PLAYER_RADIUS + 3)) {
      world.bullets.splice(i, 1);
      const direction = normalize(bullet.velocity);
      const push = Math.max(3, Math.hypot(bullet.velocity.x, bullet.velocity.y) * 0.012);
      player.position = sweepMovement(player.position, { x: direction.x * push, y: direction.y * push }, PLAYER_RADIUS, 4, world.obstacles).position;
      damagePlayer(world, bullet.damage, bullet.position, direction, bullet.source === "player" ? "unknown" : bullet.source);
      // A lethal round wipes the projectile list; stop looping over it.
      if (world.phase !== "running") return;
    }
  }
}

/** Closest bot along the swept path, so a shot cannot skip the front target. */
function nearestSweptHit(world: World, previous: Vec2, next: Vec2, radius: number): AgentState | null {
  let best: { bot: AgentState; distance: number } | null = null;
  for (const bot of world.bots) {
    if (!bot.alive) continue;
    if (pointSegmentDistance(bot.position, previous, next) > radius) continue;
    const along = Math.hypot(bot.position.x - previous.x, bot.position.y - previous.y);
    if (!best || along < best.distance) best = { bot, distance: along };
  }
  return best?.bot ?? null;
}

function pointSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-6) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Applies damage to the player. Callers own the knockback, this function owns
 * health, invulnerability frames, feedback and the defeat transition.
 */
export function damagePlayer(world: World, amount: number, source: Vec2, push: Vec2, origin: AgentState["kind"] | "unknown"): void {
  const player = world.player;
  if (world.phase !== "running" || player.invulnerability > 0) return;
  const applied = Math.max(1, Math.round(amount));
  player.health = Math.max(0, player.health - applied);
  player.invulnerability = PLAYER_HIT_INVULNERABILITY;
  player.hitFlash = 0.3;
  player.lastHitDirection = normalize(push);
  world.shake = Math.max(world.shake, 9);
  world.stats.damageTaken += applied;
  world.events.push({ type: "player-hit", amount: applied, position: { ...source }, health: player.health, direction: player.lastHitDirection, source: origin });
  if (player.health <= 0) endRun(world, "defeat");
}

export function eliminateBot(world: World, bot: AgentState): void {
  if (!bot.alive) return;
  // Killing a hostile mid-telegraph cancels the shot it was about to take. That
  // is the intended answer to a wind-up, so it is counted and paid for.
  const interrupted = bot.windup > 0;
  bot.alive = false;
  bot.windup = 0;
  world.stats.kills += 1;
  if (interrupted) world.stats.interrupts += 1;
  const healed = Math.min(ELIMINATION_HEAL, world.player.maxHealth - world.player.health);
  if (healed > 0) world.player.health += healed;
  world.shake = Math.max(world.shake, 6);
  world.events.push({
    type: "bot-eliminated",
    botId: bot.id,
    kind: bot.kind,
    position: { ...bot.position },
    heals: healed,
    kills: world.stats.kills,
    interrupted
  });
}

function updateSpawns(world: World, dt: number): void {
  for (let i = world.pendingSpawns.length - 1; i >= 0; i -= 1) {
    const pending = world.pendingSpawns[i];
    pending.delay -= dt;
    pending.age += dt;
    if (pending.delay > 0) continue;
    // The player can walk onto a marker after it was placed. Move it and
    // re-telegraph instead of dropping a hostile into their lap.
    if (distance(pending.position, world.player.position) < SPAWN_MIN_PLAYER_DISTANCE && pending.relocations < MAX_SPAWN_RELOCATIONS) {
      const relocation = findRelocation(world, pending);
      pending.position = relocation;
      pending.delay = SPAWN_RETELEGRAPH;
      pending.age = 0;
      pending.relocations += 1;
      world.events.push({ type: "spawn-warning", kind: pending.kind, position: { ...pending.position }, delay: pending.delay });
      continue;
    }
    world.pendingSpawns.splice(i, 1);
    materialiseBot(world, pending);
  }
}

/** Picks the legal spawn ring point furthest from the player. */
function findRelocation(world: World, pending: PendingSpawn): Vec2 {
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = findSpawnPositions(1, world.player.position, 265, BOT_RADIUS, (min, max) => world.rng.range(min, max), 250, world.obstacles)[0].position;
    const playerGap = distance(candidate, world.player.position);
    const crowdPenalty = world.pendingSpawns.reduce((penalty, other) => {
      if (other === pending) return penalty;
      return penalty + Math.max(0, 60 - distance(candidate, other.position)) * 3;
    }, 0);
    const botPenalty = world.bots.reduce((penalty, bot) => {
      if (!bot.alive) return penalty;
      return penalty + Math.max(0, 50 - distance(candidate, bot.position)) * 2;
    }, 0);
    const minPlayerGap = Math.min(playerGap, SPAWN_MIN_PLAYER_DISTANCE + 55);
    const score = minPlayerGap - crowdPenalty - botPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? { ...pending.position };
}

function materialiseBot(world: World, pending: PendingSpawn): void {
  const profile = BOT_PROFILES[pending.kind];
  const plan = world.activePlan;
  const difficulty = preset(world);
  const health = Math.max(12, Math.round((profile.maxHealth + difficulty.healthBonus * 8) * plan.healthMultiplier));
  const bot: AgentState = {
    id: world.nextBotId,
    kind: pending.kind,
    position: { ...pending.position },
    velocity: { x: 0, y: 0 },
    health,
    maxHealth: health,
    fireCooldown: world.rng.range(0.35, 0.9),
    windup: 0,
    windupDuration: 0,
    windupTurnRate: windupTurnRate(pending.kind, difficulty.windupScale),
    facing: Math.atan2(world.player.position.y - pending.position.y, world.player.position.x - pending.position.x),
    spawnGuard: 0.55,
    strafeSign: world.rng.chance(0.5) ? 1 : -1,
    strafeLock: 0,
    alive: true,
    hitFlash: 0,
    blindTime: 0
  };
  world.nextBotId += 1;
  world.bots.push(bot);
  world.events.push({ type: "bot-spawned", botId: bot.id, kind: bot.kind, position: { ...bot.position } });
}

function updateWaveState(world: World, dt: number): void {
  const liveBots = world.bots.some((bot) => bot.alive);
  const spawning = world.pendingSpawns.length > 0;

  if (world.waveState === "active") {
    if (!liveBots && !spawning) {
      world.waveState = "cleared";
      world.waveTimer = 0.65;
      world.stats.wavesCleared = Math.max(world.stats.wavesCleared, world.wave);
      world.events.push({ type: "wave-cleared", wave: world.wave });
    }
    return;
  }

  if (world.waveState === "cleared") {
    world.waveTimer -= dt;
    if (world.waveTimer > 0) return;
    if (world.wave >= MAX_WAVES) {
      endRun(world, "victory");
      return;
    }
    const plan = getWavePlan(world.wave + 1, world.difficulty);
    world.waveState = "telegraph";
    world.waveTimer = Math.max(MIN_TELEGRAPH, plan.telegraph);
    world.events.push({ type: "wave-start", wave: plan.wave, count: plan.kinds.length, kinds: [...plan.kinds] });
    return;
  }

  if (world.waveState === "telegraph") {
    world.waveTimer -= dt;
    if (world.waveTimer > 0) return;
    const plan = getWavePlan(world.wave + 1, world.difficulty);
    world.activePlan = plan;
    world.wave = plan.wave;
    world.stats.wave = Math.max(world.stats.wave, plan.wave);
    world.waveState = "active";
    queueWaveSpawns(world, plan);
  }
}

function queueWaveSpawns(world: World, plan: WavePlan): void {
  const placements = findSpawnPositions(plan.kinds.length, world.player.position, 265, BOT_RADIUS, (min, max) => world.rng.range(min, max), 250, world.obstacles);
  const ordered = world.rng.chance(0.5) ? placements : [...placements].reverse();
  ordered.forEach((placement, index) => {
    const pending: PendingSpawn = {
      kind: plan.kinds[index % plan.kinds.length],
      position: placement.position,
      delay: 0.18 + index * plan.spawnInterval,
      age: 0,
      relocations: 0
    };
    world.pendingSpawns.push(pending);
    world.events.push({ type: "spawn-warning", kind: pending.kind, position: { ...pending.position }, delay: pending.delay });
  });
}

function endRun(world: World, result: "victory" | "defeat"): void {
  if (world.phase !== "running") return;
  world.phase = result;
  world.bullets.length = 0;
  world.pendingSpawns.length = 0;
  // A finished run has no live habits worth reporting.
  world.mirrorRead = null;
  world.shake = Math.max(world.shake, result === "victory" ? 6 : 13);
  world.events.push(result === "victory" ? { type: "victory", stats: { ...world.stats } } : { type: "defeat", stats: { ...world.stats } });
}

/** Convenience for tests and the HUD: how many hostiles are still standing. */
export function livingBots(world: World): AgentState[] {
  return world.bots.filter((bot) => bot.alive);
}

/** Habit strength read-out shown in the HUD so the Mirror's read is legible. */
export function playerPredictability(world: World): number {
  return detectMovementHabit(world.telemetry.recentDirections).strength;
}

/** Intercept preview used by the telemetry panel. */
export function predictedPlayerPoint(world: World, botPosition: Vec2, bulletSpeed: number): Vec2 {
  return predictIntercept(botPosition, world.player.position, world.player.velocity, bulletSpeed, 0.5);
}

/** Shortest-path angle lerp, kept here so the math is testable in one place. */
export function shortestAngleLerp(from: number, to: number, t: number): number {
  return from + normalizeAngle(to - from) * Math.max(0, Math.min(1, t));
}

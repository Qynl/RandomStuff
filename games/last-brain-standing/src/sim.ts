import {
  aimFor,
  attackFor,
  botKeepsTracking,
  SIGHT_SETTLE_RATE,
  SIGHT_START_RANGE,
  sightSweepFor,
  SIGHT_TRACK_RATE,
  telegraphScaleFor,
  diveSpeedScale,
  FLANKER_DIVE,
  flankerHoldsFire,
  flankerShouldDive,
  platingScale,
  shieldBlocks,
  STUNNED_DAMAGE_SCALE,
  volleyFor,
  type VolleyRound
} from "./signatures";
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
  windupTurnRate,
  tracksTargetAlways,
  TARGET_TRACK_RATE,
  windupDrainRate
} from "./ai";
import {
  ARENA_LAYOUTS,
  DEFAULT_ARENA,
  CRATE_HEALTH,
  firstBlockingBlock,
  firstBlockingFraction,
  TILE,
  findSpawnPositions,
  layoutForSeed,
  rangeScaleForOpenness,
  segmentBlocked,
  segmentHitsCircle,
  sweepMovement,
  WORLD,
  type ArenaLayoutId
} from "./arena";
import {
  BOT_RADIUS,
  CONTACT_COOLDOWN,
  CONTACT_DAMAGE,
  CONTACT_KNOCKBACK,
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  ELIMINATION_HEAL,
  STEADY_DASH_REFUND,
  PLAYER_DASH_INVULNERABILITY,
  PLAYER_HIT_INVULNERABILITY,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  TELEMETRY_DIRECTION_SAMPLES,
  TELEMETRY_SHOT_SAMPLES
} from "./constants";
import { LOADOUTS, resolveLoadout, type Loadout } from "./loadouts";
import { getWavePlan, MAX_WAVES, type WavePlan } from "./progression";
import { createRandomSeed, createRng, normalizeSeed, type Rng } from "./rng";
export { CRATE_HEALTH } from "./arena";
import type {
  AimMode,
  AgentState,
  BotKind,
  Bullet,
  DifficultyId,
  PendingSpawn,
  BlockRect,
  Pickup,
  PlayerTelemetry,
  Rect,
  RunStats,
  Shell,
  SimEvent,
  Vec2
} from "./types";

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
  /** Seconds of "nothing can see me" left, from a Ghost's phase dash. */
  phaseTime: number;
  /** Seconds this operative has been standing still: the Marksman's focus bank. */
  focusTime: number;
  /**
   * Seconds this operative is still lit up after firing from cover.
   *
   * Firing from a bush gives you away: the muzzle flash leaves you visible to
   * everything for a moment, so cover is a place to reposition from rather than
   * a place to shoot from with impunity. Zero means fully hidden while inside a
   * bush, which is the state the wave AI checks.
   */
  revealTime: number;
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
   *
   * These are *copies* of the layout's blocks, because crates carry the damage
   * this run has done to them and a shared array would leak that into every
   * other world built from the same arena.
   */
  obstacles: BlockRect[];
  /** Where crates used to stand, so the floor can remember them. */
  brokenCrates: Rect[];
  /** Supplies dropped by broken crates. */
  pickups: Pickup[];
  nextPickupId: number;
  /** Which authored arena this run is playing in. */
  arena: ArenaLayoutId;
  /** Human-readable name of the current layout, for the HUD. */
  arenaName: string;
  /** Bushes in this arena: concealment that blocks nothing. */
  bushes: Rect[];
  /** Shallow water in this arena: slow to wade, no cover at all. */
  water: Rect[];
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
  /** Seconds since the last elimination while a wave was active. */
  stallTimer: number;
  /** 0..1 arena pressure: 0 fresh fight, 1 hostiles closing on a passive player. */
  pressure: number;
  /** Set once the pressure warning has been announced for this wave. */
  pressureAnnounced: boolean;
  /** Lobbed shells currently in the air. */
  shells: Shell[];
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

/** Health a medkit restores when the operative walks over it. */
export const MEDKIT_HEAL = 26;
/** How long a supply waits on the floor before the arena takes it back. */
export const PICKUP_LIFE = 26;
/** How close the operative has to get to a supply to take it. */
export const PICKUP_RADIUS = 20;

export function createWorld(options: CreateWorldOptions = {}): World {
  const seedValue = options.seed ?? createRandomSeed();
  const world: World = {
    seed: 1,
    obstacles: copyBlocks(DEFAULT_ARENA),
    brokenCrates: [],
    pickups: [],
    nextPickupId: 1,
    arena: DEFAULT_ARENA,
    arenaName: ARENA_LAYOUTS[DEFAULT_ARENA].name,
    bushes: ARENA_LAYOUTS[DEFAULT_ARENA].bushes,
    water: ARENA_LAYOUTS[DEFAULT_ARENA].water,
    loadout: LOADOUTS.vanguard,
    difficulty: options.difficulty ?? DEFAULT_DIFFICULTY,
    rng: createRng(seedValue),
    phase: "standby",
    elapsed: 0,
    player: createPlayer(LOADOUTS.vanguard),
    bots: [],
    bullets: [],
    pendingSpawns: [],
    stallTimer: 0,
    pressure: 0,
    pressureAnnounced: false,
    shells: [],
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

function createPlayer(loadout: Loadout): PlayerState {
  return {
    position: { x: WORLD.width / 2, y: WORLD.height - 88 },
    velocity: { x: 0, y: 0 },
    moveIntent: { x: 0, y: 0 },
    aimDirection: { x: 0, y: -1 },
    health: loadout.maxHealth,
    maxHealth: loadout.maxHealth,
    fireCooldown: 0,
    dashCooldown: 0,
    dashBuffer: 0,
    dashTimer: 0,
    invulnerability: 1.2,
    contactCooldown: 0,
    hitFlash: 0,
    lastHitDirection: { x: 0, y: 0 },
    phaseTime: 0,
    focusTime: 0,
    revealTime: 0
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
  return ARENA_LAYOUTS[world.arena]?.openness ?? 1;
}

/** Points a world at the layout its seed names, and keeps the HUD name in sync. */
/**
 * The world's own copy of an arena's blocks.
 *
 * The layout itself is module-level and shared by every world that uses it, so
 * the copies are what a run is allowed to damage: a crate broken in one run must
 * not be missing from the next one, or from the layout the tests read.
 */
function copyBlocks(layoutId: ArenaLayoutId): BlockRect[] {
  return ARENA_LAYOUTS[layoutId].obstacles.map((block) => ({ ...block }));
}

function applyArenaLayoutForSeed(world: World): void {
  const layoutId = layoutForSeed(world.seed);
  const layout = ARENA_LAYOUTS[layoutId];
  world.arena = layoutId;
  world.obstacles = copyBlocks(layoutId);
  world.brokenCrates = [];
  world.pickups = [];
  world.nextPickupId = 1;
  // Bushes and water never change during a run, so they stay shared.
  world.bushes = layout.bushes;
  world.water = layout.water;
  world.arenaName = layout.name;
}

/**
 * Cracks a crate, or bursts it open and leaves a supply on the floor.
 *
 * Crates are the only cover that can be taken away, which is what lets the arena
 * change shape over a run: a lane that is shut on wave one can be open by wave
 * four, and the supply inside is the reason to spend the rounds on opening it.
 * The drop is chosen from where the crate stood rather than from the order they
 * break in, so a given arena always pays out the same way.
 */
function damageCrate(world: World, block: BlockRect, amount: number): void {
  const maxHealth = block.maxHealth ?? CRATE_HEALTH;
  const health = Math.max(0, (block.health ?? maxHealth) - amount);
  block.health = health;
  const centre = { x: block.x + block.w / 2, y: block.y + block.h / 2 };
  if (health > 0) {
    world.events.push({ type: "crate-hit", position: centre, health, maxHealth });
    return;
  }
  const index = world.obstacles.indexOf(block);
  if (index >= 0) world.obstacles.splice(index, 1);
  world.brokenCrates.push({ ...block });
  const stagger = Math.round(centre.x / TILE) + Math.round(centre.y / TILE);
  const kind = stagger % 2 === 0 ? "medkit" : "charge";
  world.pickups.push({ id: world.nextPickupId, kind, position: centre, life: PICKUP_LIFE });
  world.nextPickupId += 1;
  world.events.push({ type: "crate-broken", position: centre, rect: { ...block }, drop: kind });
  world.shake = Math.max(world.shake, 4.5);
}

/**
 * Supplies on the floor: they wait, they blink, and the operative takes them by
 * walking over them. A medkit heals; a charge hands the dash straight back.
 */
function updatePickups(world: World, dt: number): void {
  const player = world.player;
  const reach = PLAYER_RADIUS + PICKUP_RADIUS;
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const pickup = world.pickups[i];
    pickup.life -= dt;
    const gap = Math.hypot(pickup.position.x - player.position.x, pickup.position.y - player.position.y);
    if (pickup.life > 0 && gap <= reach) {
      const heals = pickup.kind === "medkit" ? Math.min(MEDKIT_HEAL, player.maxHealth - player.health) : 0;
      if (pickup.kind === "medkit") player.health = Math.min(player.maxHealth, player.health + MEDKIT_HEAL);
      else player.dashCooldown = 0;
      world.pickups.splice(i, 1);
      world.events.push({ type: "pickup-collected", kind: pickup.kind, position: { ...pickup.position }, heals });
      continue;
    }
    if (pickup.life <= 0) world.pickups.splice(i, 1);
  }
}

/** True when a point sits inside one of the given rects. */
export function pointInRects(point: Vec2, rects: Rect[]): boolean {
  for (const rect of rects) {
    if (point.x > rect.x && point.x < rect.x + rect.w && point.y > rect.y && point.y < rect.y + rect.h) return true;
  }
  return false;
}

/**
 * How far a hostile has to be before a bush hides the player completely.
 *
 * Inside this range the hostile is close enough to hear them, so a bush is not a
 * get-out-of-jail card: it buys the moment it takes to walk out of the line, not
 * a free escape from something already on top of you.
 */
export const BUSH_HIDE_RANGE = 170;

/** Wading speed while standing in shallow water. Both sides get the same deal. */
export const WATER_SPEED_SCALE = 0.78;

/** How long firing leaves you lit up for. Shooting from cover is a real choice. */
export const REVEAL_AFTER_FIRING = 1.15;

/**
 * Whether the player is hidden from a hostile right now.
 *
 * A bush hides an operative who is standing in it and has not given themselves
 * away - unless the hostile is close enough to hear them.
 */
export function isPlayerHidden(world: World, observer: Vec2): boolean {
  const player = world.player;
  if (player.phaseTime > 0) return true;
  if (player.revealTime > 0) return false;
  if (!pointInRects(player.position, world.bushes)) return false;
  return distance(observer, player.position) > BUSH_HIDE_RANGE;
}

/**
 * Swaps the primary weapon. Anything unknown or still locked resolves to the
 * default, so a tampered stored value cannot skip an unlock.
 */
export function setWorldLoadout(world: World, id: unknown, _career = Number.POSITIVE_INFINITY): Loadout {
  const next = LOADOUTS[resolveLoadout(id)];
  const previous = world.loadout;
  world.loadout = next;
  // A class swap carries its body with it: an operative that changes to a
  // heavier class does so at the heavier class's health, scaled to how hurt
  // they already were, so swapping is never a free heal.
  if (previous.maxHealth !== next.maxHealth) {
    const fraction = world.player.maxHealth > 0 ? world.player.health / world.player.maxHealth : 1;
    world.player.maxHealth = next.maxHealth;
    world.player.health = Math.max(1, Math.round(next.maxHealth * Math.max(0.15, fraction)));
  }
  world.player.focusTime = 0;
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
  world.brokenCrates.length = 0;
  world.pickups.length = 0;
  world.nextPickupId = 1;
  world.bots.length = 0;
  world.bullets.length = 0;
  world.pendingSpawns.length = 0;
  world.stallTimer = 0;
  world.pressure = 0;
  world.pressureAnnounced = false;
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
  world.player = createPlayer(world.loadout);
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
  updatePressure(world, step);
  updateBots(world, step);
  updateBullets(world, step);
  updatePickups(world, step);
  updateShells(world, step);
  updateSpawns(world, step);
  updateWaveState(world, step);
  return world.events;
}

const preset = (world: World) => DIFFICULTIES[world.difficulty];

// --- operative class kit -----------------------------------------------------
/** The Breacher's charge: how long a knocked-down hostile stays down. */
const SIEGE_STUN = 1.1;
/** What the charge itself takes off a hostile it catches. */
const SIEGE_DASH_DAMAGE = 8;
/** How long a Ghost stays un-targetable after a phase dash. */
const GHOST_PHASE = 0.34;
/** Seconds of standing still before a Marksman's shot is focused. */
const FOCUS_TIME = 0.7;
/** How much heavier a focused round is. */
const FOCUS_DAMAGE_SCALE = 1.6;
/** How many extra hostiles a focused round passes through. */
const FOCUS_PIERCE = 2;
/** Shortest lob a Sapper can make: the shell still has to arc. */
const SHELL_MIN_RANGE = 90;
/** Seconds a Cinder's flames keep burning after they land. */
const BURN_DURATION = 3;
/** Damage per second while alight. */
const BURN_DPS = 5;
/** How much slower a burning hostile moves. */
const BURN_SLOW = 0.78;

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
  player.phaseTime = Math.max(0, player.phaseTime - dt);
  player.revealTime = Math.max(0, player.revealTime - dt);

  const inputMagnitude = Math.hypot(input.move.x, input.move.y);
  const move = normalize(input.move);
  if (move.x !== 0 || move.y !== 0) player.moveIntent = move;

  updateAim(world, input, dt);
  updateTelemetry(world, move, dt);

  // The Marksman banks focus by standing still: the counter is measured from
  // the *intent*, so a dash or a shove does not break it, only walking does.
  if (inputMagnitude < 0.15) player.focusTime += dt;
  else player.focusTime = 0;

  const wading = pointInRects(player.position, world.water) ? WATER_SPEED_SCALE : 1;
  const speed = PLAYER_SPEED * world.loadout.speedScale * wading * Math.min(1, inputMagnitude);
  const previous = { ...player.position };
  const movement = { x: move.x * speed * dt, y: move.y * speed * dt };
  player.position = sweepMovement(player.position, movement, PLAYER_RADIUS, 6, world.obstacles).position;
  player.velocity = {
    x: (player.position.x - previous.x) / Math.max(dt, 0.0001),
    y: (player.position.y - previous.y) / Math.max(dt, 0.0001)
  };

  if (input.dash) player.dashBuffer = DASH_BUFFER;
  if (player.dashBuffer > 0 && player.dashCooldown <= 0) tryDash(world);

  if (input.firing && player.fireCooldown <= 0) firePlayerBullet(world, input);
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
  const klass = world.loadout;
  const movement = { x: direction.x * klass.dashDistance, y: direction.y * klass.dashDistance };
  const from = { ...player.position };
  const swept = sweepMovement(player.position, movement, PLAYER_RADIUS, 4, world.obstacles);
  player.position = swept.position;
  // The class cooldown is the floor; a difficulty preset may make it longer.
  player.dashCooldown = Math.max(klass.dashCooldown, preset(world).dashCooldown);
  player.dashBuffer = 0;
  player.invulnerability = Math.max(player.invulnerability, PLAYER_DASH_INVULNERABILITY);

  if (klass.dashKind === "charge") {
    // The Breacher's dash is a body check: everything on the path is knocked
    // down and takes a bruise, which is the whole point of the class.
    for (const bot of world.bots) {
      if (!bot.alive) continue;
      const gap = pointSegmentDistance(bot.position, from, player.position);
      if (gap > BOT_RADIUS + PLAYER_RADIUS + 6) continue;
      bot.stun = Math.max(bot.stun, SIEGE_STUN);
      bot.windup = 0;
      bot.windupDuration = 0;
      bot.burn = undefined;
      damageBot(world, bot, SIEGE_DASH_DAMAGE, from, "charge");
      world.events.push({ type: "bot-stunned", botId: bot.id, kind: bot.kind, position: { ...bot.position }, duration: SIEGE_STUN });
    }
    world.shake = Math.max(world.shake, 6);
  }

  if (klass.trait === "phase") {
    // The Ghost's dash blanks hostile targeting for a moment: telegraphs that
    // were underway are dropped, which is the answer to a committed wind-up.
    player.phaseTime = GHOST_PHASE;
    for (const bot of world.bots) {
      if (!bot.alive || bot.windup <= 0) continue;
      bot.windup = 0;
      bot.windupDuration = 0;
      world.events.push({ type: "bot-windup-cancel", botId: bot.id, kind: bot.kind, position: { ...bot.position } });
    }
  }

  player.dashTimer = 0.18;
  world.shake = Math.max(world.shake, 4);
  world.stats.dashes += 1;
  world.events.push({ type: "player-dash", from, to: { ...player.position }, blocked: swept.blocked });
}

/**
 * Hands the Vanguard part of its dash back.
 *
 * Reads the same total `tryDash` charges - the class cooldown, floored by the
 * difficulty preset - so the refund means the same thing on every threat level.
 */
function refundDash(world: World): void {
  const player = world.player;
  if (player.dashCooldown <= 0) return;
  const total = Math.max(world.loadout.dashCooldown, preset(world).dashCooldown);
  player.dashCooldown = Math.max(0, player.dashCooldown - total * STEADY_DASH_REFUND);
}

/** Dash follows the movement input, and falls back to the aim direction. */
export function selectDashDirection(world: World): Vec2 {
  const intent = world.player.moveIntent;
  if (Math.hypot(intent.x, intent.y) > 0.01) return normalize(intent);
  return normalize(world.player.aimDirection);
}

function firePlayerBullet(world: World, input: SimInput): void {
  const player = world.player;
  const weapon = world.loadout;
  const direction = normalize(player.aimDirection);
  if (direction.x === 0 && direction.y === 0) return;
  player.fireCooldown = weapon.fireInterval * preset(world).playerFireScale;
  world.telemetry.recentShots.push(direction);
  if (world.telemetry.recentShots.length > TELEMETRY_SHOT_SAMPLES) world.telemetry.recentShots.shift();

  if (weapon.trait === "arc") {
    // The Sapper lobs: the round is aimed at a patch of floor and clears
    // anything in between. It lands where the reticle is, so a lob at a hostile
    // standing twenty metres away explodes there rather than sailing past it,
    // and the class's maximum range is the only clamp.
    const cursor = Math.hypot(input.aim.x - player.position.x, input.aim.y - player.position.y);
    const reach = Math.min(weapon.shellRange ?? 420, Math.max(SHELL_MIN_RANGE, cursor));
    const target = { x: player.position.x + direction.x * reach, y: player.position.y + direction.y * reach };
    world.shells.push({
      position: { ...player.position },
      from: { ...player.position },
      target,
      flight: weapon.shellFlight ?? 0.75,
      totalFlight: weapon.shellFlight ?? 0.75,
      radius: weapon.shellRadius ?? 74,
      damage: weapon.damage,
      kind: "mortar",
      botId: -1,
      owner: "player"
    });
    world.stats.shotsFired += 1;
    player.revealTime = Math.max(player.revealTime, REVEAL_AFTER_FIRING);
    world.shake = Math.max(world.shake, weapon.recoil);
    world.events.push({
      type: "shell-launched",
      botId: -1,
      kind: "mortar",
      from: { ...player.position },
      target,
      flight: weapon.shellFlight ?? 0.75,
      radius: weapon.shellRadius ?? 74
    });
    return;
  }

  // The Marksman's focus: a still moment buys one heavy, piercing round.
  const focused = weapon.trait === "focus" && player.focusTime >= FOCUS_TIME;
  if (weapon.trait === "focus") player.focusTime = 0;
  const damage = focused ? weapon.damage * FOCUS_DAMAGE_SCALE : weapon.damage;
  const pierce = weapon.pierce + (focused ? FOCUS_PIERCE : 0);

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
      damage,
      life: weapon.bulletLife,
      color: "#e8dcc0",
      source: "player",
      travelled: 0,
      pierce: pierce > 0 ? pierce : undefined,
      burn: weapon.trait === "ignite" ? BURN_DURATION : undefined,
      flame: weapon.trait === "ignite" ? true : undefined
    });
    world.stats.shotsFired += 1;
  }
  player.revealTime = Math.max(player.revealTime, REVEAL_AFTER_FIRING);
  world.shake = Math.max(world.shake, weapon.recoil + (focused ? 2.4 : 0));
  if (focused) {
    world.events.push({ type: "player-focus", position: { ...player.position }, direction });
  }
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
    bot.diveCooldown = Math.max(0, bot.diveCooldown - dt);
    bot.diveTime = Math.max(0, bot.diveTime - dt);
    bot.detourTime = Math.max(0, bot.detourTime - dt);
    const profile = BOT_PROFILES[bot.kind];
    const range = distance(bot.position, player.position);
    // A Ghost mid-phase is not there as far as hostile targeting is concerned,
    // and neither is anyone lying in a bush with hostiles still far away.
    const seesPlayer = !isPlayerHidden(world, bot.position) && !segmentBlocked(bot.position, player.position, world.obstacles);
    bot.blindTime = seesPlayer ? 0 : bot.blindTime + dt;

    const allies = collectAllies(world, bot);
    if (bot.windup > 0) {
      updateWindup(world, bot, dt, seesPlayer);
    } else if ((bot.acquire ?? 0) > 0) {
      updateAcquire(world, bot, dt, seesPlayer);
    } else if (bot.spawnGuard <= 0) {
      // The Flanker's discipline: no second gun from the same angle.
      // A Flanker only yields its shot to another Flanker: the discipline is a
      // pack tactic, not politeness toward a Hunter's salvo.
      const holdsFire =
        bot.kind === "flanker" &&
        flankerHoldsFire(bot.position, player.position, collectAllies(world, bot, "flanker"), range);
      const attack = attackFor(bot.kind);
      const inRange = range <= attack.range + 40;
      const hasSight = attack.requiresSight ? seesPlayer : bot.blindTime < 1.6;
      // A staggered hostile is a free target for a moment: it cannot act.
      if (bot.stun <= 0) {
        const intent = holdsFire || !inRange || !hasSight
          ? { shouldFire: false, confidence: 0 }
          : evaluateBotFire(bot.kind, range, bot.fireCooldown, world.telemetry, {
              hasLineOfSight: hasSight,
              blindTime: bot.blindTime,
              difficultyFireScale: difficulty.fireScale
            });
        const wantsCharge = attack.charge !== undefined && inRange && !holdsFire;
        const wantsShot = intent.shouldFire || wantsCharge;
        // A profile that aims in front of the shot spends its acquisition time
        // standing still first. That is a warning and a window at once: the
        // player can see the sight crawling onto them and shoot back.
        const aim = aimFor(bot.kind);
        if (wantsShot && aim.acquire > 0) beginAcquire(world, bot, aim.acquire);
        else if (wantsShot) startWindup(world, bot);
      }
    }

    const windingUp = bot.windup > 0;
    bot.stun = Math.max(0, bot.stun - dt);
    updateSpray(world, bot, dt);

    // Burning: a Cinder's mark keeps working while the fight moves on.
    if (bot.burn !== undefined && bot.burn > 0) {
      bot.burn = Math.max(0, bot.burn - dt);
      bot.burnTimer = (bot.burnTimer ?? 0) + dt;
      if (bot.burnTimer >= 0.25) {
        bot.burnTimer = 0;
        damageBot(world, bot, BURN_DPS * 0.25, bot.position, "burn");
      }
      if (!bot.alive) continue;
      if (bot.burn <= 0) {
        bot.burn = undefined;
        bot.burnDamage = undefined;
      }
    }
    const burning = (bot.burn ?? 0) > 0;

    // A committed charge overrides steering entirely: it runs down the lane it
    // marked, and if it comes up empty it staggers and is easy prey.
    if (bot.chargeTime > 0) {
      advanceCharge(world, bot, dt);
      continue;
    }
    if (bot.stun > 0) {
      bot.velocity = { x: 0, y: 0 };
      continue;
    }

    // The Flanker dives to close a gap instead of jogging across the arena.
    if (bot.kind === "flanker" && flankerShouldDive(range, bot.diveCooldown, windingUp, profile.preferredRange * rangeScaleForOpenness(openness))) {
      bot.diveTime = FLANKER_DIVE.duration;
      bot.diveCooldown = FLANKER_DIVE.cooldown;
      world.events.push({
        type: "bot-dive",
        botId: bot.id,
        kind: bot.kind,
        position: { ...bot.position },
        direction: normalize({ x: player.position.x - bot.position.x, y: player.position.y - bot.position.y })
      });
    }
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
      rangeScale: rangeScaleForOpenness(openness),
      blindTime: bot.blindTime,
      detour: { sign: bot.detourSign, strength: Math.min(1, bot.detourTime / DETOUR_RAMP) }
    });
    // A planted profile holds its ground while it aims: a Marksman that is
    // sighting in does not walk, which is what makes closing on it work.
    const aiming = windingUp || (bot.acquire ?? 0) > 0;
    const plant = aiming && aimFor(bot.kind).plants ? 0.05 : 1;
    const speedScale =
      chooseBotSpeedScale(bot.kind, range, { advancing: decision.intent === "advance", windingUp }) *
      diveSpeedScale(bot.kind, bot.diveTime) *
      pressureSpeedScale(world.pressure) *
      plant *
      (burning ? BURN_SLOW : 1);
    const speed = profile.speed * plan.speedMultiplier * speedScale * (pointInRects(bot.position, world.water) ? WATER_SPEED_SCALE : 1);
    const steered = steerSafely(world, bot, decision.direction, Math.max(30, speed * 0.34));
    const previous = { ...bot.position };
    const swept = sweepMovement(bot.position, { x: steered.x * speed * dt, y: steered.y * speed * dt }, BOT_RADIUS, 5, world.obstacles);
    bot.position = swept.position;
    bot.velocity = {
      x: (bot.position.x - previous.x) / Math.max(dt, 0.0001),
      y: (bot.position.y - previous.y) / Math.max(dt, 0.0001)
    };

    const travelled = Math.hypot(bot.position.x - previous.x, bot.position.y - previous.y);
    // Grinding against geometry: commit to sliding around it for a moment
    // rather than flipping the orbit side every half second in place.
    const grinding = travelled < speed * dt * 0.4;
    if (!grinding) {
      bot.grindTime = 0;
    } else if (!windingUp) {
      bot.grindTime += dt;
      if (bot.grindTime > DETOUR_TRIGGER && bot.detourTime <= 0) {
        bot.detourSign = bot.strafeSign;
        bot.detourTime = DETOUR_TIME;
        bot.grindTime = 0;
      }
    }
    if (travelled < speed * dt * 0.25 && !windingUp && bot.strafeLock <= 0 && bot.detourTime <= 0) {
      bot.strafeSign *= -1;
      bot.strafeLock = STRAFE_HOLD;
    }
    if (!windingUp) {
      // A profile that keeps its glass on you steers its whole body at the
      // player between shots, so its silhouette points at whoever it is about
      // to shoot rather than at wherever it happens to be driving. Everything
      // else - and every other profile - faces its own heading.
      const watching = tracksTargetAlways(bot.kind) && seesPlayer;
      const desired = watching
        ? Math.atan2(player.position.y - bot.position.y, player.position.x - bot.position.x)
        : Math.atan2(steered.y, steered.x);
      bot.facing = shortestAngleLerp(bot.facing, desired, Math.min(1, dt * (watching ? TARGET_TRACK_RATE : 6)));
    }

    if (bot.spawnGuard > 0) continue;
    // Body contact: the hostile body-checks you, both actors bounce apart, and
    // the hit has its own cooldown so a crowd cannot chain-stun the player.
    const gap = distance(bot.position, player.position);
    if (gap >= PLAYER_RADIUS + BOT_RADIUS + 4 || player.contactCooldown > 0 || player.invulnerability > 0 || player.phaseTime > 0) continue;
    const away = contactNormal(bot.position, player.position, world);
    const detonates = attackFor(bot.kind).kamikaze === true;
    const knockback = detonates ? CONTACT_KNOCKBACK * 1.8 : CONTACT_KNOCKBACK;
    player.position = sweepMovement(player.position, { x: away.x * knockback, y: away.y * knockback }, PLAYER_RADIUS, 5, world.obstacles).position;
    bot.position = sweepMovement(bot.position, { x: -away.x * 16, y: -away.y * 16 }, BOT_RADIUS, 4, world.obstacles).position;
    player.contactCooldown = CONTACT_COOLDOWN;
    world.shake = Math.max(world.shake, detonates ? 9 : 7);
    damagePlayer(world, (detonates ? profile.damage : CONTACT_DAMAGE) * difficulty.damageScale, bot.position, away, bot.kind);
    // A shard spends itself on the hit.
    if (detonates) eliminateBot(world, bot);
  }
}

/** Separating direction for a body check, with a fallback for perfect overlaps. */
function contactNormal(botPosition: Vec2, playerPosition: Vec2, world: World): Vec2 {
  const direct = normalize({ x: playerPosition.x - botPosition.x, y: playerPosition.y - botPosition.y });
  if (direct.x !== 0 || direct.y !== 0) return direct;
  const awayFromAim = normalize({ x: -world.player.aimDirection.x, y: -world.player.aimDirection.y });
  return awayFromAim.x !== 0 || awayFromAim.y !== 0 ? awayFromAim : { x: 1, y: 0 };
}

/**
 * Starts a profile's aim-in: the sight slides onto the player, in full view,
 * before the barrel starts charging.
 *
 * The sight lives on the bot so the renderer draws exactly what the shot will
 * follow - there is no second aim model in the renderer to drift away from this
 * one.
 */
function beginAcquire(world: World, bot: AgentState, duration: number): void {
  // The difficulty stretches the whole tell, and the aim-in is part of the
  // tell: a recruit's marksman takes its time sliding onto you, a veteran's
  // barely lets the sight settle before the trigger goes.
  const scaled = duration * preset(world).windupScale;
  bot.acquire = scaled;
  bot.acquireTotal = scaled;
  // The sight does not open on the player: it opens beside them - out at the
  // range they are standing, swung off by a per-unit angle - and then sweeps
  // across onto them. A player the rifle happens to be pointing at has the
  // shortest swing to sit through, one well off the line the longest, and the
  // reticle is a warning the player can act on rather than a sentence.
  const toPlayer = Math.atan2(world.player.position.y - bot.position.y, world.player.position.x - bot.position.x);
  const opening = toPlayer + sightSweepFor(bot.id);
  const reach = Math.max(120, Math.min(SIGHT_START_RANGE, distance(bot.position, world.player.position)));
  bot.sight = clampToArena({
    x: bot.position.x + Math.cos(opening) * reach,
    y: bot.position.y + Math.sin(opening) * reach
  });
  bot.aimSettle = 0;
  world.events.push({
    type: "bot-aim",
    botId: bot.id,
    kind: bot.kind,
    position: { ...bot.position },
    duration
  });
}

/** Cancels an aim-in, whether the line broke or the target vanished. */
function cancelAcquire(world: World, bot: AgentState, cooldown: number): void {
  if ((bot.acquire ?? 0) <= 0) return;
  bot.acquire = 0;
  bot.acquireTotal = 0;
  bot.aimSettle = 0;
  bot.sight = null;
  bot.fireCooldown = Math.max(bot.fireCooldown, cooldown);
  world.events.push({ type: "bot-windup-cancel", botId: bot.id, kind: bot.kind, position: { ...bot.position } });
}

/**
 * The Marksman's aim-in.
 *
 * The sight crawls toward wherever the player is *now* at a fixed rate, so a
 * player who keeps moving is harder to settle on and a player who stands still
 * gets the shortest possible warning. When the time is up the sight is frozen
 * and the wind-up begins: the shot goes where the sight came to rest, which is
 * why the last-second sidestep is the counterplay.
 */
function updateAcquire(world: World, bot: AgentState, dt: number, seesPlayer: boolean): void {
  const remaining = bot.acquire ?? 0;
  if (!seesPlayer || bot.spawnGuard > 0) {
    cancelAcquire(world, bot, 0.35);
    return;
  }
  const total = Math.max(0.001, bot.acquireTotal ?? remaining);
  const sight = bot.sight ?? { ...world.player.position };
  const toTarget = {
    x: world.player.position.x - sight.x,
    y: world.player.position.y - sight.y
  };
  const gap = Math.hypot(toTarget.x, toTarget.y);
  const step = Math.min(gap, SIGHT_SETTLE_RATE * dt);
  bot.sight = clampToArena(
    gap > 0.001
      ? { x: sight.x + (toTarget.x / gap) * step, y: sight.y + (toTarget.y / gap) * step }
      : { x: world.player.position.x, y: world.player.position.y }
  );
  // The rifle swings onto the sight at a rate that makes the barrel arrive
  // about when the sight does, never long before it.
  const desired = Math.atan2(bot.sight.y - bot.position.y, bot.sight.x - bot.position.x);
  bot.facing = shortestAngleLerp(bot.facing, desired, windupTurnRate(bot.kind, preset(world).windupScale) * 0.8 * dt);
  bot.acquire = Math.max(0, remaining - dt);
  bot.aimSettle = clamp01(1 - (bot.acquire ?? 0) / total);
  if ((bot.acquire ?? 0) > 0) return;
  // Settled: the sight is now where the shot is committed to go.
  bot.acquire = 0;
  startWindup(world, bot);
}

/**
 * Slides a settling sight toward where the shot should go.
 *
 * The crawl onto a target is slow and the tracking that follows it is quick, so
 * the reticle reads as "found you, following you, locked" instead of blinking
 * from one place to another. Faster than any hostile can move, slower than a
 * teleport, and it is capped by the distance left to cover so it never
 * overshoots the point it is aiming at.
 */
function glideSight(bot: AgentState, aimPoint: { x: number; y: number }, dt: number): { x: number; y: number } {
  const sight = bot.sight ?? { ...aimPoint };
  const gap = Math.hypot(aimPoint.x - sight.x, aimPoint.y - sight.y);
  if (gap <= 0.01) return { x: aimPoint.x, y: aimPoint.y };
  const step = Math.min(gap, SIGHT_TRACK_RATE * dt);
  return {
    x: sight.x + ((aimPoint.x - sight.x) / gap) * step,
    y: sight.y + ((aimPoint.y - sight.y) / gap) * step
  };
}

/** Keeps an aim point inside the arena, with a little margin. */
function clampToArena(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(10, Math.min(WORLD.width - 10, point.x)),
    y: Math.max(10, Math.min(WORLD.height - 10, point.y))
  };
}

function startWindup(world: World, bot: AgentState): void {
  const difficulty = preset(world);
  const profile = BOT_PROFILES[bot.kind];
  // The telegraph length is the profile's own: a marksman sights in for nearly
  // three times as long as a rifleman, and a cinder snaps its flame out faster.
  // Getting this from the volley alone (as it used to) quietly gave every late
  // profile the Mirror's timing instead of its own.
  const duration =
    windupDuration(bot.kind, difficulty.windupScale, world.rng.range(-0.05, 0.06)) *
    telegraphScaleFor(bot.kind, world.loadout.id);
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

function collectAllies(world: World, self: AgentState, kind?: AgentState["kind"]): Vec2[] {
  const allies: Vec2[] = [];
  for (const other of world.bots) {
    if (other === self || !other.alive) continue;
    if (kind && other.kind !== kind) continue;
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
    bot.sight = null;
    bot.aimSettle = 0;
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
  // The Hunter's barrel commits halfway through its wind-up: from there the
  // shot goes where it was last pointed, so late lateral movement escapes it
  // while an early dash does not.
  const progress = bot.windupDuration > 0 ? 1 - bot.windup / bot.windupDuration : 1;
  if (botKeepsTracking(bot.kind, progress)) {
    const desired = Math.atan2(aimPoint.y - bot.position.y, aimPoint.x - bot.position.x);
    bot.facing = shortestAngleLerp(bot.facing, desired, bot.windupTurnRate * dt);
    // Kept inside the arena: a sight pinned against the wall is a warning the
    // player can read, where a sight hanging off the edge is just a missing line.
    // It follows the target rather than jumping to it, so the reticle the player
    // sees is always where the rifle is actually pointed.
    if (aimFor(bot.kind).tell === "sight") bot.sight = clampToArena(glideSight(bot, aimPoint, dt));
  } else if (aimFor(bot.kind).tell === "sight" && bot.sight) {
    // Committed: the sight stays exactly where it was when the barrel locked,
    // so the reticle on screen is the line the slug will take.
    bot.facing = Math.atan2(bot.sight.y - bot.position.y, bot.sight.x - bot.position.x);
  }
  if (aimFor(bot.kind).tell === "sight") bot.aimSettle = progress < aimFor(bot.kind).lockAt ? progress : 1;
  // A profile that refuses to fire wide bleeds its wind-up slowly while the
  // barrel is still coming round, so the shot always leaves down a settled line.
  // Its patience bounds the wait, so a target it cannot line up is still
  // answered rather than held for ever.
  const aimError = Math.abs(shortestAngleDelta(bot.facing, Math.atan2(aimPoint.y - bot.position.y, aimPoint.x - bot.position.x)));
  const drain = windupDrainRate(bot.kind, aimError, bot.windupDuration - bot.windup, bot.windupDuration);
  bot.windup -= dt * drain;
  if (bot.windup > 0) return;

  bot.windup = 0;
  bot.windupDuration = 0;

  // Cover is cover: a straight-lane shot is not released into a block. The
  // marksman is exempt from nothing here either - hiding is the counterplay to
  // every direct-fire profile, and the lane is re-checked at the last instant.
  const attack = attackFor(bot.kind);
  const direct = attack.rounds !== undefined || attack.slug !== undefined;

  if (direct && !attack.spray && segmentBlocked(bot.position, player.position, world.obstacles)) {
    bot.sight = null;
    bot.aimSettle = 0;
    bot.fireCooldown = Math.max(bot.fireCooldown, 0.45);
    world.events.push({ type: "bot-windup-cancel", botId: bot.id, kind: bot.kind, position: { ...bot.position } });
    return;
  }

  startVolley(world, bot);
}

/**
 * A wind-up ends here. Profiles differ in what comes out: the Hunter fires a
 * two-round salvo on a short delay, the Flanker a single moving shot, and the
 * Mirror a copy of the player's own weapon geometry.
 */
/**
 * A telegraph just finished. What comes out is entirely the profile's business:
 * a salvo, a copied weapon, a rail slug, a flame cone, a lobbed shell, a shield
 * bash, a committed charge, or nothing at all until contact.
 */
function startVolley(world: World, bot: AgentState): void {
  const profile = BOT_PROFILES[bot.kind];
  const attack = attackFor(bot.kind);

  if (attack.charge) {
    bot.chargeTime = attack.charge.duration;
    bot.chargeDirection = { x: Math.cos(bot.facing), y: Math.sin(bot.facing) };
    world.events.push({
      type: "bot-charge",
      botId: bot.id,
      kind: bot.kind,
      from: { ...bot.position },
      direction: { ...bot.chargeDirection },
      distance: attack.charge.reach
    });
    setCooldown(world, bot);
    return;
  }

  if (attack.shell) {
    const player = world.player;
    // It aims at where you are, with a little lead: it can shoot over cover but
    // it cannot predict a corner, so the marked circle is always survivable.
    const target = {
      x: player.position.x + player.velocity.x * attack.shell.lead,
      y: player.position.y + player.velocity.y * attack.shell.lead
    };
    world.shells.push({
      position: { ...bot.position },
      from: { ...bot.position },
      target,
      flight: attack.shell.flight,
      totalFlight: attack.shell.flight,
      radius: attack.shell.radius,
      damage: profile.damage * preset(world).damageScale,
      kind: bot.kind,
      botId: bot.id,
      owner: "bot"
    });
    world.events.push({
      type: "shell-launched",
      botId: bot.id,
      kind: bot.kind,
      from: { ...bot.position },
      target,
      flight: attack.shell.flight,
      radius: attack.shell.radius
    });
    setCooldown(world, bot);
    return;
  }

  if (attack.melee) {
    // The bulwark's bash: a shockwave at arm's length, not a projectile.
    const player = world.player;
    const gap = distance(bot.position, player.position);
    const direction = normalize({ x: player.position.x - bot.position.x, y: player.position.y - bot.position.y });
    world.events.push({ type: "bot-fired", botId: bot.id, kind: bot.kind, position: { ...bot.position }, direction });
    if (gap <= attack.melee.radius && player.invulnerability <= 0) {
      player.position = sweepMovement(
        player.position,
        { x: direction.x * attack.melee.knockback, y: direction.y * attack.melee.knockback },
        PLAYER_RADIUS,
        4,
        world.obstacles
      ).position;
      damagePlayer(world, profile.damage * preset(world).damageScale, bot.position, direction, bot.kind);
    }
    setCooldown(world, bot);
    return;
  }

  if (attack.kamikaze) {
    // It only knows how to explode; the contact rule does the rest.
    setCooldown(world, bot);
    return;
  }

  if (attack.spray) {
    // A continuous attack: the first round leaves now, the rest tick out while
    // the player runs for cover.
    bot.sprayTime = attack.spray.duration;
    bot.burstTimer = 0;
    fireSprayRound(world, bot);
    bot.burstTimer = attack.spray.interval;
    setCooldown(world, bot);
    return;
  }

  if (attack.slug) {
    fireVolleyRound(world, bot, {
      delay: 0,
      spread: attack.spread ?? 0.03,
      damageShare: 1,
      speedScale: attack.slug.speedScale,
      lifeScale: attack.slug.lifeScale
    });
  } else if (attack.rounds && bot.kind === "splitter") {
    const rounds = attack.rounds;
    for (let index = 0; index < rounds; index += 1) {
      fireVolleyRound(world, bot, {
        delay: 0,
        spread: attack.spread ?? 0.2,
        damageShare: 1 / rounds,
        speedScale: 1,
        lifeScale: 1
      });
    }
  } else {
    for (const round of volleyFor(bot.kind, world.loadout.id).rounds) fireVolleyRound(world, bot, round);
  }
  setCooldown(world, bot);
}

/**
 * Time this profile spends telegraphing that a plain rifleman does not: its
 * aim-in plus the part of its charge that is longer than a standard pull.
 *
 * Every profile's tell is now honest - the Marksman really does hold its aim
 * line for a second and a half - which would otherwise make the fight slower
 * and softer for everyone. So the time is paid for out of the reload: a profile
 * that has been standing in the open, aiming, is already cycling its action.
 * The cadence of a fight is unchanged, and the warning is in plain sight.
 */
function tellOverhead(world: World, kind: AgentState["kind"]): number {
  const difficulty = preset(world);
  const base = windupDuration(kind, difficulty.windupScale, 0);
  const tell = aimFor(kind).acquire * difficulty.windupScale + base * telegraphScaleFor(kind, world.loadout.id);
  return Math.max(0, tell - base);
}

/** Sets the profile's next shot time, scaled by difficulty and arena pressure. */
function setCooldown(world: World, bot: AgentState): void {
  const fireScale = preset(world).fireScale * pressureFireScale(world.pressure);
  const reload = BOT_PROFILES[bot.kind].fireRate / Math.max(0.5, fireScale) - tellOverhead(world, bot.kind);
  bot.fireCooldown = Math.max(0.24, reload) + world.rng.range(-0.08, 0.14);
}

/** Ticks a continuous attack while it lasts. */
function updateSpray(world: World, bot: AgentState, dt: number): void {
  if (bot.sprayTime <= 0) return;
  // Fire stops when the target is hidden: a pyro never burns down a wall.
  if (bot.blindTime > 0.35) {
    bot.sprayTime = 0;
    return;
  }
  bot.sprayTime = Math.max(0, bot.sprayTime - dt);
  bot.burstTimer -= dt;
  if (bot.burstTimer > 0) return;
  const attack = attackFor(bot.kind);
  fireSprayRound(world, bot);
  bot.burstTimer = attack.spray?.interval ?? 0.1;
}

/** One round of a spray: short-lived, wide, and drawn as fire. */
function fireSprayRound(world: World, bot: AgentState): void {
  const spray = attackFor(bot.kind).spray;
  if (!spray) return;
  const profile = BOT_PROFILES[bot.kind];
  const difficulty = preset(world);
  const speed = profile.bulletSpeed * difficulty.bulletSpeedScale * spray.speedScale;
  const direction = world.rng.spreadDirection(bot.facing, spray.spread);
  const origin = { x: bot.position.x + direction.x * 15, y: bot.position.y + direction.y * 15 };
  world.bullets.push({
    position: origin,
    velocity: { x: direction.x * speed, y: direction.y * speed },
    owner: "bot",
    damage: profile.damage * difficulty.damageScale,
    life: 1.9 * spray.lifeScale,
    color: profile.color,
    source: bot.kind,
    travelled: 0,
    flame: true
  });
  world.events.push({ type: "bot-fired", botId: bot.id, kind: bot.kind, position: origin, direction });
}

/** Runs a committed charge, and staggers the charger once it is spent. */
function advanceCharge(world: World, bot: AgentState, dt: number): void {
  const charge = attackFor(bot.kind).charge;
  if (!charge) {
    bot.chargeTime = 0;
    return;
  }
  const difficulty = preset(world);
  const speed = BOT_PROFILES[bot.kind].speed * charge.speedScale;
  const previous = { ...bot.position };
  bot.position = sweepMovement(
    bot.position,
    { x: bot.chargeDirection.x * speed * dt, y: bot.chargeDirection.y * speed * dt },
    BOT_RADIUS,
    5,
    world.obstacles
  ).position;
  bot.facing = Math.atan2(bot.chargeDirection.y, bot.chargeDirection.x);
  bot.velocity = {
    x: (bot.position.x - previous.x) / Math.max(dt, 0.0001),
    y: (bot.position.y - previous.y) / Math.max(dt, 0.0001)
  };

  // Contact during a charge is what makes it dangerous.
  const gap = distance(bot.position, world.player.position);
  if (gap < PLAYER_RADIUS + BOT_RADIUS + 4 && world.player.invulnerability <= 0 && world.player.contactCooldown <= 0) {
    const away = contactNormal(bot.position, world.player.position, world);
    world.player.position = sweepMovement(
      world.player.position,
      { x: away.x * CONTACT_KNOCKBACK * 1.7, y: away.y * CONTACT_KNOCKBACK * 1.7 },
      PLAYER_RADIUS,
      5,
      world.obstacles
    ).position;
    world.player.contactCooldown = CONTACT_COOLDOWN;
    damagePlayer(world, BOT_PROFILES[bot.kind].damage * difficulty.damageScale, bot.position, away, bot.kind);
    bot.chargeTime = 0;
  }

  bot.chargeTime -= dt;
  if (bot.chargeTime <= 0) {
    bot.chargeTime = 0;
    bot.stun = charge.stunOnMiss;
    world.events.push({
      type: "bot-stunned",
      botId: bot.id,
      kind: bot.kind,
      position: { ...bot.position },
      duration: charge.stunOnMiss
    });
  }
}

function fireVolleyRound(world: World, bot: AgentState, round: VolleyRound): void {
  const profile = BOT_PROFILES[bot.kind];
  const difficulty = preset(world);
  const speed = profile.bulletSpeed * difficulty.bulletSpeedScale * round.speedScale;
  const direction = world.rng.spreadDirection(bot.facing, round.spread);
  const origin = { x: bot.position.x + direction.x * 17, y: bot.position.y + direction.y * 17 };
  world.bullets.push({
    position: origin,
    velocity: { x: direction.x * speed, y: direction.y * speed },
    owner: "bot",
    damage: profile.damage * difficulty.damageScale * round.damageShare,
    life: 1.9 * round.lifeScale,
    color: profile.color,
    source: bot.kind,
    travelled: 0
  });
  world.events.push({ type: "bot-fired", botId: bot.id, kind: bot.kind, position: origin, direction });
}

/** Lobbed shells: fly for a fixed time, then burst on the marked circle. */
function updateShells(world: World, dt: number): void {
  for (let index = world.shells.length - 1; index >= 0; index -= 1) {
    const shell = world.shells[index];
    shell.flight -= dt;
    if (shell.flight > 0) continue;
    world.shells.splice(index, 1);
    const player = world.player;
    const falloffWidth = shell.radius * (attackFor(shell.kind).shell?.falloff ?? 0.45);
    world.shake = Math.max(world.shake, 8);
    world.events.push({ type: "shell-landed", kind: shell.kind, position: { ...shell.target }, radius: shell.radius });

    if (shell.owner === "player") {
      // The sapper's shell clears hostiles: everyone in the ring takes the hit,
      // hardest at the centre, and a knocked-down target stays down.
      for (const bot of world.bots) {
        if (!bot.alive) continue;
        const inRing = distance(shell.target, bot.position);
        if (inRing > shell.radius) continue;
        const share = inRing <= shell.radius - falloffWidth ? 1 : Math.max(0.3, (shell.radius - inRing) / falloffWidth);
        damageBot(world, bot, shell.damage * share, shell.target, "shell");
      }
      continue;
    }

    const gap = distance(shell.target, player.position);
    if (gap > shell.radius || player.invulnerability > 0) continue;
    // Falls off toward the rim, so clipping the edge is a graze not a hit.
    const falloff = falloffWidth;
    const share = gap <= shell.radius - falloff ? 1 : Math.max(0.25, (shell.radius - gap) / falloff);
    const direction = normalize({ x: player.position.x - shell.target.x, y: player.position.y - shell.target.y });
    const push = direction.x === 0 && direction.y === 0 ? { x: 0, y: 0 } : direction;
    player.position = sweepMovement(
      player.position,
      { x: push.x * 22, y: push.y * 22 },
      PLAYER_RADIUS,
      4,
      world.obstacles
    ).position;
    damagePlayer(world, shell.damage * share, shell.target, push, shell.kind);
  }
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
    const blocking = firstBlockingBlock(previous, bullet.position, world.obstacles);
    if (blocking) {
      // Only the operative's rounds take cover apart. A hostile's round stops at
      // a crate the same as at a wall - otherwise a long firefight would quietly
      // dismantle the arena the player is fighting from.
      if (bullet.owner === "player" && blocking.kind === "crate") {
        damageCrate(world, blocking, bullet.damage);
      }
      world.bullets.splice(i, 1);
      continue;
    }

    if (bullet.owner === "player") {
      const target = nearestSweptHit(world, previous, bullet.position, BOT_RADIUS + 4);
      if (target) {
        const impact = { ...bullet.position };
        // A raised shield stops the round dead; a staggered one has dropped it.
        // The guard is up while it walks, and drops while it winds up a bash or
        // recovers from a failed charge: those are the windows to shoot through.
        const guardDown = target.stun > 0 || target.windup > 0;
        if (shieldBlocks(target.kind, target.facing, target.position, impact, guardDown)) {
          world.bullets.splice(i, 1);
          world.events.push({
            type: "bot-blocked",
            botId: target.id,
            kind: target.kind,
            position: { ...impact }
          });
          continue;
        }
        // Plated profiles shrug off part of a frontal hit; a staggered one takes
        // extra damage instead.
        const plating = platingScale(target.kind, target.position, target.facing, impact);
        const stagger = target.stun > 0 ? STUNNED_DAMAGE_SCALE : 1;
        const applied = bullet.damage * plating * stagger;
        if (bullet.burn) {
          target.burn = Math.max(target.burn ?? 0, bullet.burn);
        }
        // A piercing round carries on through: the Marksman's focus shot is what
        // makes a queue of hostiles a bad idea. It is nudged past the body it
        // just left so the same hostile cannot be hit twice by one round.
        const pierceLeft = bullet.pierce ?? 0;
        if (pierceLeft > 0) {
          bullet.pierce = pierceLeft - 1;
          const heading = normalize(bullet.velocity);
          const past = { x: target.position.x + heading.x * (BOT_RADIUS + 8), y: target.position.y + heading.y * (BOT_RADIUS + 8) };
          if (!segmentBlocked(target.position, past, world.obstacles)) bullet.position = past;
        } else {
          world.bullets.splice(i, 1);
        }
        target.health -= applied;
        target.hitFlash = 0.16;
        world.stats.damageDealt += applied;
        world.stats.shotsHit += 1;
        world.hitMarker = 0.16;
        world.events.push({
          type: "bot-hit",
          botId: target.id,
          kind: target.kind,
          position: impact,
          amount: applied,
          health: Math.max(0, target.health),
          plated: plating < 1
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
/**
 * Applies damage to one hostile and reports it the same way a player round does,
 * so every wound in the arena has a single name in the event stream.
 */
export function damageBot(world: World, bot: AgentState, amount: number, source: Vec2, cause: BotKind | "charge" | "shell" | "burn" | "player"): number {
  if (!bot.alive) return 0;
  const applied = Math.max(1, Math.round(amount));
  bot.health -= applied;
  bot.hitFlash = 0.12;
  world.stats.damageDealt += applied;
  world.events.push({ type: "bot-hit", botId: bot.id, kind: bot.kind, amount: applied, position: { ...source }, health: bot.health, plated: false });
  if (bot.health <= 0) eliminateBot(world, bot);
  else if (cause === "burn") world.stats.shotsHit += 0;
  return applied;
}

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
  // A kill proves the fight is moving: the arena stops tightening.
  world.stallTimer = 0;
  world.pressure = 0;
  if (interrupted) world.stats.interrupts += 1;
  const healed = Math.min(ELIMINATION_HEAL, world.player.maxHealth - world.player.health);
  if (healed > 0) world.player.health += healed;
  // The Vanguard's Resolute trait. Paid out of the total cooldown rather than
  // what is left of it, so the first kill of a wave is worth as much as the
  // fifth and the class can be played on the front foot.
  if (world.loadout.trait === "steady") refundDash(world);
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

  // The swarm cell comes apart: it dies into two shards rather than leaving a
  // gap in the wave, so the fight gets louder before it gets quieter.
  const splits = attackFor(bot.kind).splitsInto;
  if (splits) summonShards(world, bot, splits.kind, splits.count);
}

/** Materialises the smaller hostiles a dying profile leaves behind. */
function summonShards(world: World, parent: AgentState, kind: AgentState["kind"], count: number): void {
  const profile = BOT_PROFILES[kind];
  const plan = world.activePlan;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + world.rng.range(-0.4, 0.4);
    const spawn = sweepMovement(
      parent.position,
      { x: Math.cos(angle) * 26, y: Math.sin(angle) * 26 },
      BOT_RADIUS,
      4,
      world.obstacles
    ).position;
    const health = Math.max(6, Math.round(profile.maxHealth * plan.healthMultiplier));
    world.bots.push({
      id: world.nextBotId,
      kind,
      position: spawn,
      velocity: { x: 0, y: 0 },
      health,
      maxHealth: health,
      fireCooldown: world.rng.range(0.2, 0.6),
      windup: 0,
      windupDuration: 0,
      windupTurnRate: 2,
      facing: world.rng.range(-Math.PI, Math.PI),
      spawnGuard: 0.25,
      strafeSign: world.rng.chance(0.5) ? 1 : -1,
      strafeLock: 0,
      alive: true,
      hitFlash: 0,
      blindTime: 0,
      pendingRounds: 0,
      burstTimer: 0,
      diveTime: 0,
      diveCooldown: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0,
      stun: 0,
      chargeTime: 0,
      chargeDirection: { x: 0, y: 0 },
      sprayTime: 0,
      acquire: 0,
      acquireTotal: 0,
      sight: null,
      aimSettle: 0
    });
    world.nextBotId += 1;
  }
  world.events.push({
    type: "bot-split",
    botId: parent.id,
    kind: parent.kind,
    into: kind,
    count,
    position: { ...parent.position }
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
    acquire: 0,
    acquireTotal: 0,
    sight: null,
    aimSettle: 0,
    facing: Math.atan2(world.player.position.y - pending.position.y, world.player.position.x - pending.position.x),
    spawnGuard: 0.55,
    strafeSign: world.rng.chance(0.5) ? 1 : -1,
    strafeLock: 0,
    alive: true,
    hitFlash: 0,
    blindTime: 0,
    pendingRounds: 0,
    burstTimer: 0,
    diveTime: 0,
    diveCooldown: FLANKER_DIVE.cooldown * 0.5,
    detourTime: 0,
    detourSign: 1,
    grindTime: 0,
    stun: 0,
    chargeTime: 0,
    chargeDirection: { x: 0, y: 0 },
    sprayTime: 0
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

/**
 * The arena does not wait for you.
 *
 * Bots are slower than the player by design, so without this a patient player
 * could kite a corner behind cover forever and a wave would never resolve. After
 * `STALL_PRESSURE_TIME` without a kill the remaining hostiles start closing
 * faster and firing sooner, ramping to a cap. It only ever engages on a stalled
 * wave, so ordinary fights are untouched.
 */
export const STALL_PRESSURE_TIME = 12;
const STALL_SPEED_BOOST = 0.62;
/** How long a bot grinds against geometry before committing to slide around it. */
export const DETOUR_TRIGGER = 0.26;
/** How long that slide lasts. */
export const DETOUR_TIME = 1.1;
/** Ramp from a light nudge to a full detour. */
export const DETOUR_RAMP = 0.35;
const STALL_FIRE_BOOST = 0.32;

/** How much faster the remaining hostiles move, given the current pressure. */
export function pressureSpeedScale(pressure: number): number {
  return 1 + STALL_SPEED_BOOST * clamp01(pressure);
}

/** How much faster they cycle their guns, given the current pressure. */
export function pressureFireScale(pressure: number): number {
  return 1 + STALL_FIRE_BOOST * clamp01(pressure);
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Advances the stall clock; a wave that is not active cannot be stalled. */
function updatePressure(world: World, dt: number): void {
  const stalling = world.waveState === "active" && world.pendingSpawns.length === 0;
  world.stallTimer = stalling ? world.stallTimer + dt : 0;
  const pressure = clamp01((world.stallTimer - STALL_PRESSURE_TIME * 0.45) / STALL_PRESSURE_TIME);
  world.pressure = pressure;
  if (pressure > 0.5 && !world.pressureAnnounced) {
    world.pressureAnnounced = true;
    world.events.push({ type: "arena-pressure", level: 1 });
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

/** Signed shortest turn from one heading to another, in radians. */
export function shortestAngleDelta(from: number, to: number): number {
  return normalizeAngle(to - from);
}

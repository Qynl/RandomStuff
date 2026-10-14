import type { AgentState, BotProfile, PlayerTelemetry, Vec2 } from "./types";
import { BOT_RADIUS } from "./constants";

export const BOT_PROFILES: Record<AgentState["kind"], BotProfile> = {
  hunter: {
    kind: "hunter",
    name: "THE HUNTER",
    tactic: "DIRECT PRESSURE",
    signature: "DOUBLE SALVO · PLATED FRONT · LOCKS ITS AIM MID-WIND-UP",
    counter: "BREAK THE LINE EARLY OR SIDESTEP LATE — THE BARREL STOPS TRACKING HALFWAY",
    color: "#c9695a",
    speed: 148,
    fireRate: 1.05,
    preferredRange: 215,
    maxHealth: 48,
    damage: 11,
    bulletSpeed: 380
  },
  flanker: {
    kind: "flanker",
    name: "THE FLANKER",
    tactic: "ANGLE CONTROL",
    signature: "PINCER DISCIPLINE · DIVE TO CLOSE · SHOOTS ON THE MOVE",
    counter: "SPLIT THE PAIR: A FLANKER HOLDS FIRE WHILE IT IS STACKED WITH AN ALLY",
    color: "#8fb0cf",
    speed: 162,
    fireRate: 1.2,
    preferredRange: 258,
    maxHealth: 42,
    damage: 10,
    bulletSpeed: 360
  },
  mirror: {
    kind: "mirror",
    name: "THE MIRROR",
    tactic: "HABIT PUNISHER",
    signature: "FIRES A COPY OF YOUR OWN WEAPON · SLIDES OUT OF YOUR AIM LANE",
    counter: "CHANGE DIRECTION AND FIRING LANE — IT MIRRORS WHATEVER YOU BROUGHT",
    color: "#a08ec0",
    speed: 138,
    fireRate: 0.98,
    preferredRange: 285,
    maxHealth: 56,
    damage: 12,
    bulletSpeed: 400
  }
};

export const BOT_KINDS: Array<AgentState["kind"]> = ["hunter", "flanker", "mirror"];

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

export const normalize = (v: Vec2): Vec2 => {
  const length = Math.hypot(v.x, v.y);
  return length > 0.0001 ? { x: v.x / length, y: v.y / length } : { x: 0, y: 0 };
};

export const rotate = (v: Vec2, radians: number): Vec2 => {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
};

/** Rotates `from` toward `to` by at most `maxRadians`, preserving length. */
export function rotateToward(from: Vec2, to: Vec2, maxRadians: number): Vec2 {
  const fromAngle = Math.atan2(from.y, from.x);
  const toAngle = Math.atan2(to.y, to.x);
  let delta = toAngle - fromAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const step = Math.max(-maxRadians, Math.min(maxRadians, delta));
  return rotate({ x: Math.cos(fromAngle), y: Math.sin(fromAngle) }, step);
}

/**
 * Classic intercept: where the player will be when a bullet travelling at
 * `bulletSpeed` covers the gap, capped by `maxLeadTime` so bots cannot predict
 * a player into the far future (the old code led by a fixed 65 units).
 */
export function predictIntercept(shooter: Vec2, target: Vec2, targetVelocity: Vec2, bulletSpeed: number, maxLeadTime = 0.55): Vec2 {
  const gap = distance(shooter, target);
  if (bulletSpeed <= 0) return { ...target };
  const time = Math.min(maxLeadTime, gap / bulletSpeed);
  return { x: target.x + targetVelocity.x * time, y: target.y + targetVelocity.y * time };
}

export interface BotSteeringContext {
  /** Live player position. */
  player: Vec2;
  /** Live player velocity in world units per second, if known. */
  playerVelocity?: Vec2;
  /** Positions of the other live bots, for crowd separation. */
  allies?: Vec2[];
  /** Radius used for separation, defaults to two bot radii. */
  allyRadius?: number;
  /** How much the bot knows about player habits: 0 = oblivious, 1 = fully adapted. */
  awareness?: number;
  /**
   * Multiplier applied to this bot's preferred fighting range, so a layout with
   * lots of cover does not ask for a ring it cannot hold. Defaults to 1.
   */
  rangeScale?: number;
  /**
   * Seconds this bot has gone without a clear line of sight. Past a short
   * threshold it stops dancing around a corner and comes straight for you.
   */
  blindTime?: number;
  /**
   * A committed slide around whatever is in the way. Per-frame obstacle
   * avoidance alone makes a bot pressed against a crate edge vibrate in place,
   * because the best-looking direction keeps flipping as the edge moves under
   * it; holding one side for a moment turns that into walking around the crate.
   */
  detour?: { sign: number; strength: number };
}

/** How long a hostile will hold an angle it cannot see through before pressing. */
export const BLIND_PRESS_TIME = 0.35;

export interface BotDirectionResult {
  /** Unit movement direction. */
  direction: Vec2;
  /** Set when the bot is deliberately holding an angle or backing out of range. */
  intent: "advance" | "hold" | "retreat" | "flank" | "predict";
}

/**
 * Pure movement decision per profile. The functions only describe *intent*:
 * collision, obstacle steering, and speed application happen in the simulation.
 */
export function chooseBotDirection(
  bot: Pick<AgentState, "kind" | "position" | "strafeSign">,
  player: Vec2,
  telemetry: PlayerTelemetry,
  elapsed: number,
  context: BotSteeringContext = { player }
): Vec2 {
  return chooseBotMovement(bot, telemetry, elapsed, { ...context, player }).direction;
}

export function chooseBotMovement(
  bot: Pick<AgentState, "kind" | "position" | "strafeSign"> & Partial<Pick<AgentState, "health" | "maxHealth" | "blindTime">>,
  telemetry: PlayerTelemetry,
  elapsed: number,
  context: BotSteeringContext
): BotDirectionResult {
  const player = context.player;
  const awareness = Math.max(0, Math.min(1, context.awareness ?? 1));
  const rangeScale = Math.max(0.4, Math.min(1.2, context.rangeScale ?? 1));
  const profile = BOT_PROFILES[bot.kind];
  const toward = normalize({ x: player.x - bot.position.x, y: player.y - bot.position.y });
  const range = distance(bot.position, player);
  const tangent = { x: -toward.y * bot.strafeSign, y: toward.x * bot.strafeSign };
  const playerVelocity = context.playerVelocity ?? telemetry.lastMoveDirection;
  const intercept =
    awareness > 0
      ? predictIntercept(bot.position, player, scale(playerVelocity, awareness), profile.bulletSpeed, bot.kind === "hunter" ? 0.6 : 0.45)
      : { ...player };
  const towardIntercept = normalize({ x: intercept.x - bot.position.x, y: intercept.y - bot.position.y });

  if (bot.kind === "hunter") {
    // Presses the predicted position, backs off when it is already in your face.
    const pressed = range > 190;
    const tooClose = range < 118;
    const approach = tooClose ? -0.62 : pressed ? 1 : 0.16;
    const lead = normalize({ x: toward.x + towardIntercept.x * 0.55, y: toward.y + towardIntercept.y * 0.55 });
    const intent: BotDirectionResult["intent"] = tooClose ? "retreat" : pressed ? "predict" : "hold";
    const base = normalize({
      x: lead.x * approach + tangent.x * (tooClose ? 0.5 : 0.16),
      y: lead.y * approach + tangent.y * (tooClose ? 0.5 : 0.16)
    });
    return pressedResult(base, intent, toward, bot, context);
  }

  if (bot.kind === "flanker") {
    // Holds a ring around the player and drifts to cut off the escape lane.
    const outer = profile.preferredRange * rangeScale + 40;
    const inner = profile.preferredRange * rangeScale - 60;
    const orbit = range > outer ? 0.86 : range < inner ? -0.5 : 0.14;
    const escapeLane = scale(normalize(playerVelocity), 0.5);
    const cutOff = normalize({
      x: player.x + escapeLane.x * 110 + toward.x * 40,
      y: player.y + escapeLane.y * 110 + toward.y * 40
    });
    const pulse = Math.sin(elapsed * 1.7 + bot.position.x * 0.01 + bot.position.y * 0.008) * 0.14;
    const pursue = normalize({
      x: toward.x * orbit + cutOff.x * (range > inner ? 0.34 : 0.06),
      y: toward.y * orbit + cutOff.y * (range > inner ? 0.34 : 0.06)
    });
    const base = normalize({
      x: pursue.x + tangent.x * (0.68 + pulse),
      y: pursue.y + tangent.y * (0.68 + pulse)
    });
    const intent: BotDirectionResult["intent"] = range < inner ? "retreat" : range > outer ? "advance" : "flank";
    return pressedResult(base, intent, toward, bot, context);
  }

  // Mirror: reads sustained movement habits and repeated firing lanes, then
  // takes the angle that punishes the habit. Capped so it never feels psychic.
  const movementHabit = detectMovementHabit(telemetry.recentDirections);
  const firingHabit = detectFiringHabit(telemetry.recentShots);
  const habitDirection = movementHabit.direction;
  const habitStrength = movementHabit.strength * awareness;
  const firingStrength = firingHabit.strength * awareness;

  const punish = normalize({ x: -habitDirection.x, y: -habitDirection.y });
  const interceptPull = habitStrength > 0.2 ? 1.15 : 0.75;
  const desiredRange =
    range > profile.preferredRange * rangeScale + 25 ? interceptPull : range < profile.preferredRange * rangeScale - 80 ? -0.72 : 0.06;
  const sliding = firingStrength > 0.25
    ? { x: -firingHabit.direction.y * firingHabit.sign, y: firingHabit.direction.x * firingHabit.sign }
    : tangent;

  const base = normalize({
    x: toward.x * desiredRange + towardIntercept.x * (0.22 + habitStrength * 0.35) + punish.x * (0.24 + habitStrength * 0.62) + sliding.x * (0.3 + firingStrength * 0.5),
    y: toward.y * desiredRange + towardIntercept.y * (0.22 + habitStrength * 0.35) + punish.y * (0.24 + habitStrength * 0.62) + sliding.y * (0.3 + firingStrength * 0.5)
  });
  const intent: BotDirectionResult["intent"] =
    range < profile.preferredRange * rangeScale - 80 ? "retreat" : habitStrength > 0.35 ? "predict" : "flank";
  return pressedResult(base, intent, toward, bot, context);

  /**
   * A hostile that has lost sight for a while stops holding its ring and comes
   * straight for the player. Without this a bot can orbit a crate forever at a
   * range it likes while never regaining the line it wants to shoot down, which
   * stalls a wave instead of applying pressure.
   */
  function pressedResult(
    base: Vec2,
    intent: BotDirectionResult["intent"],
    towardPlayer: Vec2,
    self: Pick<AgentState, "position">,
    ctx: BotSteeringContext
  ): BotDirectionResult {
    const blind = (ctx.blindTime ?? 0) > BLIND_PRESS_TIME;
    let direction = blind
      ? normalize({ x: base.x * 0.35 + towardPlayer.x * 0.75, y: base.y * 0.35 + towardPlayer.y * 0.75 })
      : base;
    const detourStrength = Math.max(0, Math.min(1, ctx.detour?.strength ?? 0));
    if (detourStrength > 0.01) {
      // Slide around the obstacle: mostly sideways, a little forward, on the
      // side the bot committed to a moment ago.
      const sign = (ctx.detour?.sign ?? 1) >= 0 ? 1 : -1;
      const slide = { x: -towardPlayer.y * sign, y: towardPlayer.x * sign };
      const forward = blind ? 0.3 : 0.55;
      direction = normalize({
        x: direction.x * (1 - detourStrength) + slide.x * detourStrength * (1 + forward) + towardPlayer.x * detourStrength * forward,
        y: direction.y * (1 - detourStrength) + slide.y * detourStrength * (1 + forward) + towardPlayer.y * detourStrength * forward
      });
      intent = blind ? "advance" : intent;
    }
    return { direction: applySeparation(direction, self.position, ctx), intent };
  }
}

const scale = (v: Vec2, factor: number): Vec2 => ({ x: v.x * factor, y: v.y * factor });

/**
 * Chooses which side of the player a bot should orbit, given where its nearest
 * ally is. Both bots run the same rule, and their tangents are opposite, so two
 * bots that start on the same side drift apart into a pincer rather than
 * queueing up behind each other. The angle threshold is hysteresis: a bot only
 * changes side when the ally is clearly (more than ~11 degrees) to one side.
 */
export function preferredStrafeSign(towardPlayer: Vec2, allyOffset: Vec2, currentSign: number, threshold = 0.2): number {
  const gap = Math.hypot(allyOffset.x, allyOffset.y);
  if (gap < 1e-3) return currentSign;
  const cross = towardPlayer.x * allyOffset.y - towardPlayer.y * allyOffset.x;
  const side = cross / gap;
  if (Math.abs(side) < threshold) return currentSign;
  return side > 0 ? -1 : 1;
}

/** Nearest living ally to a bot, or null when none is within `maxRange`. */
export function nearestAlly(bot: Pick<AgentState, "position">, allies: Vec2[], maxRange: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestGap = maxRange;
  for (const ally of allies) {
    const gap = distance(bot.position, ally);
    if (gap < bestGap) {
      bestGap = gap;
      best = ally;
    }
  }
  return best;
}

/** Push away from nearby allies so bots do not stack into one unreadable blob. */
export function applySeparation(direction: Vec2, position: Vec2, context: BotSteeringContext): Vec2 {
  const allies = context.allies;
  if (!allies || allies.length === 0) return direction;
  const radius = context.allyRadius ?? BOT_RADIUS * 2.9;
  let push = { x: 0, y: 0 };
  for (const ally of allies) {
    const dx = position.x - ally.x;
    const dy = position.y - ally.y;
    const gap = Math.hypot(dx, dy);
    if (gap > radius || gap < 1e-4) continue;
    const weight = (radius - gap) / radius;
    push = { x: push.x + (dx / gap) * weight, y: push.y + (dy / gap) * weight };
  }
  if (push.x === 0 && push.y === 0) return normalize(direction);
  return normalize({ x: direction.x + push.x * 1.25, y: direction.y + push.y * 1.25 });
}

export interface HabitReading {
  direction: Vec2;
  strength: number;
}

/**
 * Reads a sustained directional habit out of recent movement samples.
 * Requires enough samples and a clear dominant direction, so that a couple of
 * random dodges do not read as a "habit".
 */
export function detectMovementHabit(recentDirections: Vec2[], window = 10): HabitReading {
  const recent = recentDirections.slice(-window);
  if (recent.length < 4) return { direction: { x: 0, y: 0 }, strength: 0 };
  const average = recent.reduce((sum, direction) => ({ x: sum.x + direction.x, y: sum.y + direction.y }), { x: 0, y: 0 });
  const consistency = Math.hypot(average.x, average.y) / recent.length;
  const strength = Math.max(0, Math.min(1, (consistency - 0.3) / 0.55));
  if (strength <= 0) return { direction: { x: 0, y: 0 }, strength: 0 };
  return { direction: normalize(average), strength };
}

export interface FiringHabitReading extends HabitReading {
  /** Which side of the habit the Mirror slides to. */
  sign: number;
}

/** Reads the player's favourite firing lane from recent shots. */
export function detectFiringHabit(recentShots: Vec2[], window = 8): FiringHabitReading {
  const recent = recentShots.slice(-window);
  if (recent.length < 3) return { direction: { x: 0, y: 0 }, strength: 0, sign: 1 };
  const average = recent.reduce((sum, shot) => ({ x: sum.x + shot.x, y: sum.y + shot.y }), { x: 0, y: 0 });
  const consistency = Math.hypot(average.x, average.y) / recent.length;
  const strength = Math.max(0, Math.min(1, (consistency - 0.35) / 0.5));
  if (strength <= 0) return { direction: { x: 0, y: 0 }, strength: 0, sign: 1 };
  const direction = normalize(average);
  return { direction, strength, sign: direction.x * direction.y >= 0 ? 1 : -1 };
}

/**
 * How much of its speed each profile keeps while a telegraph is running. All of
 * them slow down so the wind-up is readable and fair, but they do it in their
 * own way: the Hunter plants its feet and becomes a target, the Flanker never
 * quite stops skirmishing, and the Mirror keeps drifting.
 */
export const WINDUP_MOVE_SCALE: Record<AgentState["kind"], number> = {
  hunter: 0.24,
  flanker: 0.72,
  mirror: 0.44
};

/**
 * Profile speed intent. The Flanker commits with a short burst when it is far
 * out of position, and everything slows down while winding up a shot so the
 * telegraph is readable and fair.
 */
export function chooseBotSpeedScale(kind: AgentState["kind"], range: number, progress: { advancing: boolean; windingUp: boolean }): number {
  if (progress.windingUp) return WINDUP_MOVE_SCALE[kind];
  if (kind === "flanker" && range > BOT_PROFILES.flanker.preferredRange + 90) return 1.24;
  if (kind === "hunter" && range > 260 && progress.advancing) return 1.12;
  if (kind === "mirror" && range < 150) return 0.92;
  return 1;
}

export interface FireIntent {
  shouldFire: boolean;
  /** 0..1 confidence used by the HUD to tint the bot's telegraph. */
  confidence: number;
}

/**
 * Decides whether a bot should start (or keep) a visible wind-up.
 * Fire rate, range, and the Mirror's read on player habits all matter, and a
 * bot will not commit when it has been blind for a while.
 */
export function evaluateBotFire(
  kind: AgentState["kind"],
  range: number,
  cooldown: number,
  telemetry: PlayerTelemetry,
  options: { hasLineOfSight?: boolean; blindTime?: number; difficultyFireScale?: number } = {}
): FireIntent {
  const hasLineOfSight = options.hasLineOfSight ?? true;
  const blindTime = options.blindTime ?? 0;
  const fireScale = options.difficultyFireScale ?? 1;
  const maxRange = kind === "hunter" ? 470 : kind === "flanker" ? 430 : 470;
  if (cooldown > 0 || range > maxRange || !hasLineOfSight || blindTime > 0.35) return { shouldFire: false, confidence: 0 };

  if (kind === "hunter") {
    return { shouldFire: range < 440 * fireScale, confidence: clamp01(1.15 - range / 460) };
  }
  if (kind === "flanker") {
    const aligned = range < 400 * fireScale;
    return { shouldFire: aligned, confidence: clamp01(1.05 - range / 420) };
  }
  // The Mirror only commits while the player is predictable or standing still.
  const habitual = detectMovementHabit(telemetry.recentDirections).strength;
  const stationary = clamp01(telemetry.stationaryTime / 2.2);
  const predictable = Math.max(habitual, stationary);
  const shouldFire = range < 450 * fireScale && (predictable > 0.18 || range < 250);
  return { shouldFire, confidence: clamp01(0.3 + predictable * 0.7) };
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Backwards-compatible boolean form of {@link evaluateBotFire}. */
export function shouldBotFire(kind: AgentState["kind"], range: number, cooldown: number, telemetry: PlayerTelemetry): boolean {
  return evaluateBotFire(kind, range, cooldown, telemetry).shouldFire;
}

/**
 * How long a bot should stand and telegraph before shooting. Shorter telegraphs
 * read as more "reflexes"; harder difficulties reduce this. Pure and testable.
 */
export function windupDuration(kind: AgentState["kind"], difficultyScale: number, speedVariance: number): number {
  const base = kind === "hunter" ? 0.36 : kind === "flanker" ? 0.44 : 0.4;
  return Math.max(0.16, base * difficultyScale + speedVariance);
}

/** Turn rate used while a bot tracks you during its wind-up. */
export function windupTurnRate(kind: AgentState["kind"], difficultyScale: number): number {
  const base = kind === "hunter" ? 2.6 : kind === "flanker" ? 2.1 : 2.35;
  return base / Math.max(0.4, difficultyScale);
}

/**
 * Bots lead the player differently while winding up: the Hunter tracks the
 * predicted point, the Flanker barely leads, and the Mirror leads by exactly as
 * much as the player's habits justify.
 */
export function windupAimPoint(
  kind: AgentState["kind"],
  botPosition: Vec2,
  player: Vec2,
  playerVelocity: Vec2,
  bulletSpeed: number,
  telemetry: PlayerTelemetry
): Vec2 {
  if (kind === "flanker") return { x: player.x + playerVelocity.x * 0.06, y: player.y + playerVelocity.y * 0.06 };
  if (kind === "mirror") {
    const habit = detectMovementHabit(telemetry.recentDirections).strength;
    return predictIntercept(botPosition, player, scale(playerVelocity, 0.45 + habit * 0.75), bulletSpeed, 0.4);
  }
  return predictIntercept(botPosition, player, scale(playerVelocity, 0.85), bulletSpeed, 0.45);
}

export interface MirrorRead {
  /** 0..1 strength of the movement habit the Mirror can currently see. */
  movement: number;
  /** 0..1 strength of the firing-lane habit the Mirror can currently see. */
  firing: number;
}

export interface MirrorReadSummary {
  /** Short status for the HUD, e.g. "READING YOUR STRAFE". */
  label: string;
  /** What the player should do about it. */
  counter: string;
  /** The habit being punished, or null when the Mirror has no read yet. */
  focus: "movement" | "firing" | null;
}

/** Below this the Mirror has nothing worth exploiting. */
export const MIRROR_READ_THRESHOLD = 0.18;

/**
 * Turns the Mirror's two habit readings into a readable status plus a concrete
 * counter. Kept pure so the HUD wording is unit tested rather than guessed.
 */
export function summarizeMirrorRead(read: MirrorRead | null): MirrorReadSummary {
  if (!read) return { label: "NO MIRROR ACTIVE", counter: "—", focus: null };
  const movement = Math.max(0, Math.min(1, read.movement));
  const firing = Math.max(0, Math.min(1, read.firing));
  if (movement < MIRROR_READ_THRESHOLD && firing < MIRROR_READ_THRESHOLD) {
    return { label: "NO PATTERN YET", counter: "KEEP MOVING", focus: null };
  }
  if (firing > movement) {
    return { label: "READING YOUR FIRING LANE", counter: "SHOOT FROM ANOTHER ANGLE", focus: "firing" };
  }
  return { label: "READING YOUR MOVEMENT", counter: "CHANGE DIRECTION", focus: "movement" };
}

/** Targets worth shooting at, ordered by how close they are to the aim ray. */
export function rankTargetsByAim(aimOrigin: Vec2, aimDirection: Vec2, targets: Array<{ id: number; position: Vec2 }>, minDot = 0.86): number[] {
  const direction = normalize(aimDirection);
  return targets
    .map((target) => {
      const toTarget = normalize({ x: target.position.x - aimOrigin.x, y: target.position.y - aimOrigin.y });
      return { id: target.id, dot: toTarget.x * direction.x + toTarget.y * direction.y };
    })
    .filter((entry) => entry.dot >= minDot)
    .sort((a, b) => b.dot - a.dot)
    .map((entry) => entry.id);
}

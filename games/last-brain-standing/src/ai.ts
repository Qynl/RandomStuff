import type { AgentState, BotProfile, PlayerTelemetry, Vec2 } from "./types";
import { BOT_RADIUS } from "./constants";

export const BOT_PROFILES: Record<AgentState["kind"], BotProfile> = {
  // ---- the first three: the ones every run opens with -----------------------
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
    bulletSpeed: 380,
    attack: "salvo",
    movement: "press",
    attackLabel: "DOUBLE SALVO"
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
    bulletSpeed: 360,
    attack: "shot",
    movement: "orbit",
    attackLabel: "MOVING SHOT"
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
    bulletSpeed: 400,
    attack: "copy",
    movement: "predict",
    attackLabel: "MIRRORED COPY"
  },

  // ---- the later roster ----------------------------------------------------
  sniper: {
    kind: "sniper",
    name: "THE MARKSMAN",
    tactic: "RANGED DENIAL",
    signature: "A LASER-FAST SLUG ACROSS THE WHOLE ARENA · 1.5 S AIM LINE · NO CHASE",
    counter: "BREAK THE LINE OR MOVE THE MOMENT THE AIM LINE APPEARS — IT NEVER LEADS MUCH",
    color: "#cbb37f",
    speed: 104,
    fireRate: 2.05,
    preferredRange: 470,
    maxHealth: 38,
    damage: 19,
    bulletSpeed: 900,
    attack: "beam",
    movement: "sniper",
    attackLabel: "RAIL SLUG"
  },
  pyro: {
    kind: "pyro",
    name: "THE CINDER",
    tactic: "AREA DENIAL",
    signature: "SIX-SECOND FLAME CONE · SHORT RANGE · BURNS YOU OUT OF COVER",
    counter: "STAY OUTSIDE ARM'S REACH AND KILL IT WHILE IT SPRAYS",
    color: "#d08a4a",
    speed: 132,
    fireRate: 3.4,
    preferredRange: 96,
    maxHealth: 62,
    damage: 3.2,
    bulletSpeed: 265,
    attack: "flame",
    movement: "brawl",
    attackLabel: "FLAME CONE"
  },
  mortar: {
    kind: "mortar",
    name: "THE MORTAR",
    tactic: "INDIRECT FIRE",
    signature: "LOBS A SHELL AT WHERE YOU ARE · LANDS ON A MARKED CIRCLE 1.6 S LATER",
    counter: "WATCH THE MARKER AND WALK OUT OF IT — IT CANNOT SHOOT WHERE YOU WILL BE",
    color: "#a9926a",
    speed: 108,
    fireRate: 2.4,
    preferredRange: 330,
    maxHealth: 52,
    damage: 21,
    bulletSpeed: 150,
    attack: "mortar",
    movement: "pod",
    attackLabel: "LOBBED SHELL"
  },
  shielder: {
    kind: "shielder",
    name: "THE BULWARK",
    tactic: "ATTRITION",
    signature: "A TOWER SHIELD THAT BLOCKS EVERYTHING IN FRONT · WALKS YOU DOWN",
    counter: "GET BEHIND IT OR DASH PAST — THE SHIELD ONLY COVERS ONE SIDE",
    color: "#8a97a6",
    speed: 96,
    fireRate: 1.5,
    preferredRange: 120,
    maxHealth: 68,
    damage: 14,
    bulletSpeed: 330,
    attack: "shield",
    movement: "turtle",
    attackLabel: "SHIELD BASH"
  },
  splitter: {
    kind: "splitter",
    name: "THE SWARM CELL",
    tactic: "NUMBER PRESSURE",
    signature: "COMES APART INTO TWO FAST SHARDS WHEN IT DIES",
    counter: "KILL IT EARLY AND AT RANGE, OR PLAN FOR THE TWO THAT FOLLOW",
    color: "#8fb48c",
    speed: 124,
    fireRate: 1.35,
    preferredRange: 240,
    maxHealth: 46,
    damage: 9,
    bulletSpeed: 355,
    attack: "split",
    movement: "swarm",
    attackLabel: "SPORE VOLLEY"
  },
  charger: {
    kind: "charger",
    name: "THE RAM",
    tactic: "BURST PRESSURE",
    signature: "WIND-UP THEN A 3× CHARGE ALONG A MARKED LANE · STAGGERED IF IT MISSES",
    counter: "STEP OUT OF THE LANE AND PUNISH THE STAGGER — IT TAKES EXTRA DAMAGE",
    color: "#c9744f",
    speed: 128,
    fireRate: 2.6,
    preferredRange: 300,
    maxHealth: 66,
    damage: 16,
    bulletSpeed: 340,
    attack: "charge",
    movement: "ram",
    attackLabel: "CHARGE"
  },
  shard: {
    kind: "shard",
    name: "THE SHARD",
    tactic: "KAMIKAZE",
    signature: "TINY, FAST, AND EXPLODES ON CONTACT",
    counter: "SHOOT IT OUT OF THE AIR — IT DIES TO A SINGLE ROUND",
    color: "#a9c7a4",
    speed: 196,
    fireRate: 99,
    preferredRange: 0,
    maxHealth: 9,
    damage: 11,
    bulletSpeed: 300,
    attack: "kamikaze",
    movement: "kamikaze",
    attackLabel: "CONTACT BURST"
  }
};

/** Profiles a wave may field, in the order the side panel lists them. */
export const BOT_KINDS: Array<AgentState["kind"]> = [
  "hunter",
  "flanker",
  "mirror",
  "sniper",
  "pyro",
  "mortar",
  "shielder",
  "splitter",
  "charger"
];

/** The small ones the swarm cell leaves behind; never spawned by a wave. */
export const SUMMONED_KINDS: Array<AgentState["kind"]> = ["shard"];


/** A zeroed per-profile tally. Every table that counts hostiles is built this way. */
export function emptyKindTotals(): Record<AgentState["kind"], number> {
  const totals = {} as Record<AgentState["kind"], number>;
  for (const kind of [...BOT_KINDS, ...SUMMONED_KINDS]) totals[kind] = 0;
  return totals;
}

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

  if (bot.kind === "sniper") {
    // Owns the long lane: backs off hard when crowded, edges sideways for a
    // clean shot, and never chases. Getting close to a marksman is the answer.
    const hold = profile.preferredRange * rangeScale;
    const approach = range > hold + 120 ? 0.9 : range < hold - 110 ? -0.95 : 0.05;
    const base = normalize({
      x: toward.x * approach + tangent.x * 0.26,
      y: toward.y * approach + tangent.y * 0.26
    });
    const intent: BotDirectionResult["intent"] = approach < 0 ? "retreat" : approach > 0.4 ? "advance" : "hold";
    return pressedResult(base, intent, toward, bot, context);
  }

  if (bot.kind === "pyro") {
    // Owns the short range: walks straight into your face and stays there.
    const approach = range > 74 ? 1 : -0.2;
    const base = normalize({
      x: toward.x * approach + tangent.x * 0.24,
      y: toward.y * approach + tangent.y * 0.24
    });
    return pressedResult(base, approach > 0 ? "advance" : "hold", toward, bot, context);
  }

  if (bot.kind === "mortar") {
    // Owns the mid ring: content to lob from cover and drift sideways.
    const hold = profile.preferredRange * rangeScale;
    const approach = range > hold + 80 ? 0.8 : range < hold - 90 ? -0.7 : 0.08;
    const base = normalize({
      x: toward.x * approach + tangent.x * 0.42,
      y: toward.y * approach + tangent.y * 0.42
    });
    const intent: BotDirectionResult["intent"] = approach < 0 ? "retreat" : approach > 0.4 ? "advance" : "hold";
    return pressedResult(base, intent, toward, bot, context);
  }

  if (bot.kind === "shielder") {
    // Owns the approach: straight in behind the shield, no orbiting, no fear.
    const approach = range > 96 ? 1 : -0.15;
    const base = normalize({
      x: toward.x * approach + tangent.x * 0.08,
      y: toward.y * approach + tangent.y * 0.08
    });
    return pressedResult(base, approach > 0 ? "advance" : "hold", toward, bot, context);
  }

  if (bot.kind === "splitter") {
    // The swarm cell drifts in on a slow weave: it never holds a straight line,
    // so tracking it is different from tracking a marching soldier.
    const approach = range > 90 ? 1 : 0.1;
    // The weave is a function of position, not identity: identical inputs give
    // identical movement, which the determinism tests insist on.
    const weave = Math.sin(elapsed * 2.2 + bot.position.x * 0.01) * 0.55;
    const base = normalize({
      x: toward.x * approach + tangent.x * weave,
      y: toward.y * approach + tangent.y * weave
    });
    return pressedResult(base, "advance", toward, bot, context);
  }

  if (bot.kind === "shard") {
    // A shard only knows the straight line between it and you.
    const approach = range > 40 ? 1 : 0.1;
    const base = normalize({ x: toward.x * approach, y: toward.y * approach });
    return pressedResult(base, "advance", toward, bot, context);
  }

  if (bot.kind === "charger") {
    // Lines up head on and holds the lane it wants to run down.
    const approach = range > 240 ? 1 : range < 150 ? -0.75 : 0.05;
    const base = normalize({
      x: toward.x * approach + towardIntercept.x * 0.5,
      y: toward.y * approach + towardIntercept.y * 0.5
    });
    return pressedResult(base, approach > 0.4 ? "advance" : approach < 0 ? "retreat" : "hold", toward, bot, context);
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
  mirror: 0.44,
  sniper: 0.12,
  pyro: 0.0,
  mortar: 0.2,
  shielder: 0.3,
  splitter: 0.5,
  charger: 0.0,
  shard: 0.8
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
  const maxRange = kind === "sniper" ? 520 : kind === "hunter" ? 470 : kind === "flanker" ? 430 : 470;
  if (cooldown > 0 || range > maxRange || !hasLineOfSight || blindTime > 0.35) return { shouldFire: false, confidence: 0 };

  if (kind === "hunter") {
    return { shouldFire: range < 440 * fireScale, confidence: clamp01(1.15 - range / 460) };
  }
  if (kind === "flanker") {
    const aligned = range < 400 * fireScale;
    return { shouldFire: aligned, confidence: clamp01(1.05 - range / 420) };
  }
  if (kind === "sniper") {
    // A marksman takes the long line whenever it has one: it does not wait for
    // the player to look predictable the way the Mirror does. Its warning is not
    // a tell in its habits, it is the sight itself crawling onto you, so the only
    // question is whether it can settle before you move. The ceiling sits above
    // the 470 it likes to hold, so the stance it is steering for is a stance it
    // can actually shoot from.
    return { shouldFire: true, confidence: clamp01(1.2 - range / 560) };
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
 * Profiles that never take their glass off you.
 *
 * Most hostiles face the way they are driving and only swing onto you when they
 * decide to shoot. The Marksman is an emplacement: its rail stays lined up on
 * the player between shots as well, so the long low silhouette always points at
 * whoever it is about to shoot, and the player can read the threat from the
 * shape alone. Turning its whole body rather than just its barrel also makes it
 * slow to come round, which is the counterplay: a hard sidestep is a real dodge.
 */
export function tracksTargetAlways(kind: AgentState["kind"]): boolean {
  return kind === "sniper";
}

/** How fast that continuous track comes round, in radians per second. */
export const TARGET_TRACK_RATE = 3.35;

/**
 * Where a body-to-target aim counts as settled, in radians. Under about three
 * degrees the deviation is invisible at the ranges these units fight at, so a
 * shot released inside it reads as pointed at the player.
 */
export const AIM_SETTLED_ERROR = 0.06;

/**
 * How much of its wind-up a profile that refuses to fire wide is allowed to
 * bleed while it is still coming round, as a fraction of the wind-up it was
 * granted. Bounded on purpose: a target it could never line up must still be
 * answered rather than held for ever.
 */
export const AIM_HOLD_PATIENCE = 1.9;

/** Drain rate applied to a wind-up being held while the aim is off. */
export const AIM_HOLD_RATE = 0.3;

/**
 * Does this profile hold its shot rather than fire while still slewing?
 *
 * Only the Marksman: it is the one whose fantasy is the settled shot, and it is
 * the one with a sight the player can watch come to rest.
 */
export function holdsFireWhileSlewing(kind: AgentState["kind"]): boolean {
  return kind === "sniper";
}

/**
 * How much of a wind-up drains this frame. One means "not held"; a smaller
 * number is a profile that is waiting for its barrel to finish coming round.
 */
export function windupDrainRate(
  kind: AgentState["kind"],
  aimError: number,
  elapsed: number,
  granted: number
): number {
  if (!holdsFireWhileSlewing(kind)) return 1;
  if (aimError <= AIM_SETTLED_ERROR) return 1;
  if (granted > 0 && elapsed >= granted * AIM_HOLD_PATIENCE) return 1;
  return AIM_HOLD_RATE;
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

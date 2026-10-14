/**
 * Hostile profiles. Each one is a different answer to "what am I fighting?":
 * the kind picks the attack, the movement style, the model and the counterplay.
 * `shard` is never part of a wave - the swarm cell leaves those behind when it
 * comes apart.
 */
export type BotKind =
  | "hunter"
  | "flanker"
  | "mirror"
  | "sniper"
  | "pyro"
  | "mortar"
  | "shielder"
  | "splitter"
  | "charger"
  | "shard";

/** How a profile hurts you. Resolved by the simulation when a wind-up ends. */
export type BotAttack = "salvo" | "shot" | "copy" | "beam" | "flame" | "mortar" | "shield" | "split" | "charge" | "kamikaze";

/** How a profile moves. Resolved by {@link chooseBotMovement}. */
export type BotMovement =
  | "press"
  | "orbit"
  | "predict"
  | "sniper"
  | "brawl"
  | "pod"
  | "turtle"
  | "swarm"
  | "ram"
  | "kamikaze";

export type DifficultyId = "recruit" | "standard" | "veteran";

/** How the player is currently aiming. Keyboard/touch aiming is assisted, mouse aiming is raw. */
export type AimMode = "mouse" | "assisted";

export interface Vec2 {
  x: number;
  y: number;
}

export interface BotProfile {
  kind: BotKind;
  name: string;
  /** What it does when its telegraph completes. */
  attack: BotAttack;
  /** How it moves while it is not shooting. */
  movement: BotMovement;
  /** Two-word label for the HUD, e.g. "FLAME CONE". */
  attackLabel: string;
  /** One-line tactical identity shown in the side panel. */
  tactic: string;
  /** One-line counterplay hint, surfaced as a tooltip and after a defeat. */
  counter: string;
  /** The behaviour that makes this profile unlike the other two. */
  signature: string;
  color: string;
  /** Base movement speed in world units per second. */
  speed: number;
  /** Seconds between shots once a wind-up completes. */
  fireRate: number;
  /** Distance the bot tries to hold while fighting. */
  preferredRange: number;
  /** Base durability before wave scaling. */
  maxHealth: number;
  /** Damage dealt by one round. */
  damage: number;
  /** Speed of its projectiles. */
  bulletSpeed: number;
}

export interface PlayerTelemetry {
  recentDirections: Vec2[];
  recentShots: Vec2[];
  stationaryTime: number;
  lastMoveDirection: Vec2;
}

export interface AgentState {
  id: number;
  kind: BotKind;
  position: Vec2;
  velocity: Vec2;
  health: number;
  maxHealth: number;
  fireCooldown: number;
  /** Seconds left in the visible wind-up before this bot fires. 0 means idle. */
  windup: number;
  /** Total wind-up duration, used by the renderer to draw the progress ring. */
  windupDuration: number;
  /** Radians per second the bot can still track the player during a wind-up. */
  windupTurnRate: number;
  /** Angle the bot is currently facing (radians). */
  facing: number;
  /** Bots cannot shoot or body-check players for a moment after materialising. */
  spawnGuard: number;
  strafeSign: number;
  /** Seconds left during which the orbit side is locked, so bots do not twitch. */
  strafeLock: number;
  alive: boolean;
  hitFlash: number;
  /** Seconds since this bot last had a clear line of sight to the player. */
  blindTime: number;
  /** Rounds still queued from the current volley. */
  pendingRounds: number;
  /** Seconds until the next queued round leaves the barrel. */
  burstTimer: number;
  /** Seconds left of a committed closing dive, if this profile dives. */
  diveTime: number;
  /** Seconds before this bot may dive again. */
  diveCooldown: number;
  /** Seconds left of a committed wall-slide, so a blocked bot does not vibrate. */
  detourTime: number;
  /** Which way it slides around the obstacle. */
  detourSign: number;
  /** Seconds this bot has spent failing to move where it wants to go. */
  grindTime: number;
  /** Seconds left staggered by a failed charge; a stunned hostile is easy prey. */
  stun: number;
  /** Seconds left of a committed charge, for profiles that ram. */
  chargeTime: number;
  /** Unit direction locked in when the charge started. */
  chargeDirection: Vec2;
  /** Seconds left of a continuous attack, for profiles that spray. */
  sprayTime: number;
  /**
   * Seconds left of *aiming in* before the wind-up starts.
   *
   * A profile with an acquisition time gives the player a second warning before
   * the shot is even committed: the sight slides onto you, settles, and only
   * then does the barrel start charging. The Marksman is the one that uses it,
   * so these three are only meaningful for profiles with `aimFor(kind).acquire`.
   */
  acquire?: number;
  /** Total acquisition time, so the renderer can size the settling reticle. */
  acquireTotal?: number;
  /**
   * Where this hostile is currently pointing its sight, for the renderer.
   * Absent when it is not aiming at anything.
   */
  sight?: Vec2 | null;
  /** 0..1: how settled the sight is. 1 means it has stopped moving. */
  aimSettle?: number;
  /** Seconds left burning, from a Cinder's flames. */
  burn?: number;
  /** Damage per second while burning. */
  burnDamage?: number;
  /** Seconds banked toward the next burn tick. */
  burnTimer?: number;
}

/** A lobbed shell: it flies for `flight` seconds and then bursts. */
export interface Shell {
  position: Vec2;
  from: Vec2;
  target: Vec2;
  /** Seconds of flight remaining. */
  flight: number;
  /** Seconds of flight when it was launched, for the arc. */
  totalFlight: number;
  radius: number;
  damage: number;
  kind: BotKind;
  botId: number;
  /** Who fired it: the mortar's shells hunt the player, the sapper's the bots. */
  owner: "player" | "bot";
}

export interface Bullet {
  position: Vec2;
  velocity: Vec2;
  owner: "player" | "bot";
  damage: number;
  life: number;
  color: string;
  /** Bot bullets keep the kind so hit feedback can name the shooter. */
  source: BotKind | "player";
  /** Distance travelled, used for tracers. */
  travelled: number;
  /** Set once a round has been reported as dodged, so one bullet counts once. */
  dodgeReported?: boolean;
  /** Flame rounds are drawn as fire and die young; they are not slugs. */
  flame?: boolean;
  /** Hostiles this round still passes through before it stops. */
  pierce?: number;
  /** Sets its target alight on impact. */
  burn?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A solid block on the floor plan.
 *
 * Walls are permanent and carry no hit points; crates do, because a crate is the
 * one piece of cover a run is allowed to take away.
 */
export interface BlockRect extends Rect {
  kind?: "wall" | "crate";
  /** Hit points left. Only written once a crate has actually been hit. */
  health?: number;
  maxHealth?: number;
}

export interface PendingSpawn {
  kind: BotKind;
  position: Vec2;
  /** Seconds until the bot materialises. */
  delay: number;
  /** Seconds the warning marker has been visible, for the pulsing render. */
  age: number;
  /** How many times the marker has been re-telegraphed because the player walked into it. */
  relocations: number;
}

export interface RunStats {
  kills: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  dashes: number;
  /** Rounds that passed through the player during invulnerability frames. */
  dodges: number;
  /** Hostiles eliminated while they were winding up a shot. */
  interrupts: number;
  wavesCleared: number;
  /** Seconds of active combat. */
  elapsed: number;
  /** Highest threat level reached. */
  wave: number;
}

/** What a broken crate leaves on the floor. */
export type PickupKind = "medkit" | "charge";

/** A supply drop, waiting to be walked over. */
export interface Pickup {
  id: number;
  kind: PickupKind;
  position: Vec2;
  /** Seconds left on the floor before the arena takes it back. */
  life: number;
}

export type SimEvent =
  | { type: "player-fired"; position: Vec2; direction: Vec2 }
  | { type: "player-dash"; from: Vec2; to: Vec2; blocked: boolean }
  | { type: "player-hit"; amount: number; position: Vec2; health: number; direction: Vec2; source: BotKind | "unknown" }
  | { type: "player-blocked"; position: Vec2 }
  | { type: "player-focus"; position: Vec2; direction: Vec2 }
  | { type: "player-dodged"; position: Vec2; kind: BotKind | "unknown" }
  | { type: "bot-windup"; botId: number; kind: BotKind; position: Vec2; duration: number }
  | { type: "bot-aim"; botId: number; kind: BotKind; position: Vec2; duration: number }
  | { type: "bot-windup-cancel"; botId: number; kind: BotKind; position: Vec2 }
  | { type: "bot-fired"; botId: number; kind: BotKind; position: Vec2; direction: Vec2 }
  | { type: "bot-hit"; botId: number; kind: BotKind; position: Vec2; amount: number; health: number; plated?: boolean }
  | { type: "bot-dive"; botId: number; kind: BotKind; position: Vec2; direction: Vec2 }
  | { type: "bot-blocked"; botId: number; kind: BotKind; position: Vec2 }
  | { type: "bot-charge"; botId: number; kind: BotKind; from: Vec2; direction: Vec2; distance: number }
  | { type: "bot-stunned"; botId: number; kind: BotKind; position: Vec2; duration: number }
  | { type: "bot-split"; botId: number; kind: BotKind; into: BotKind; count: number; position: Vec2 }
  | { type: "shell-launched"; botId: number; kind: BotKind; from: Vec2; target: Vec2; flight: number; radius: number }
  | { type: "shell-landed"; kind: BotKind; position: Vec2; radius: number }
  | { type: "arena-pressure"; level: number }
  | { type: "crate-hit"; position: Vec2; health: number; maxHealth: number }
  | { type: "crate-broken"; position: Vec2; rect: Rect; drop: PickupKind }
  | { type: "pickup-collected"; kind: PickupKind; position: Vec2; heals: number }
  | { type: "bot-eliminated"; botId: number; kind: BotKind; position: Vec2; heals: number; kills: number; interrupted: boolean }
  | { type: "spawn-warning"; kind: BotKind; position: Vec2; delay: number }
  | { type: "bot-spawned"; botId: number; kind: BotKind; position: Vec2 }
  | { type: "wave-start"; wave: number; count: number; kinds: BotKind[] }
  | { type: "wave-cleared"; wave: number }
  | { type: "victory"; stats: RunStats }
  | { type: "defeat"; stats: RunStats };

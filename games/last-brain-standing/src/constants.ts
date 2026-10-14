import type { DifficultyId } from "./types";

export const PLAYER_RADIUS = 12;
export const BOT_RADIUS = 12;

export const PLAYER_SPEED = 232;
export const PLAYER_FIRE_INTERVAL = 0.155;
export const PLAYER_BULLET_SPEED = 620;
export const PLAYER_BULLET_DAMAGE = 12;
export const PLAYER_BULLET_LIFE = 1.6;
export const PLAYER_MAX_HEALTH = 100;

export const PLAYER_DASH_DISTANCE = 118;
export const PLAYER_DASH_INVULNERABILITY = 0.2;
export const PLAYER_HIT_INVULNERABILITY = 0.46;

/** Killing a bot restores a little integrity so a run can recover from a bad wave. */
export const ELIMINATION_HEAL = 3;

/** Body contact knocks the player away instead of silently melting their health. */
export const CONTACT_DAMAGE = 7;
export const CONTACT_KNOCKBACK = 62;
export const CONTACT_COOLDOWN = 0.75;

export const MAX_PARTICLES = 460;
export const TELEMETRY_DIRECTION_SAMPLES = 24;
export const TELEMETRY_SHOT_SAMPLES = 12;

export interface DifficultyPreset {
  id: DifficultyId;
  label: string;
  blurb: string;
  /** Multiplies bot wind-up duration: higher means more warning before shots. */
  windupScale: number;
  /** Multiplies bot fire-rate thresholds. */
  fireScale: number;
  /** Multiplies incoming bullet damage. */
  damageScale: number;
  /** Extra rounds a bot can take. */
  healthBonus: number;
  /** Bots added to (or removed from) each wave. */
  countBonus: number;
  /** Multiplies bot accuracy: the fraction of the player's velocity bots lead. */
  aimScale: number;
  /** Player dash cooldown in seconds. */
  dashCooldown: number;
  /** Player fire interval multiplier. */
  playerFireScale: number;
  /** Multiplies projectile speed so the player can read incoming fire. */
  bulletSpeedScale: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyPreset> = {
  recruit: {
    id: "recruit",
    label: "RECRUIT",
    blurb: "Longer telegraphs, softer rounds. Learn the profiles.",
    windupScale: 1.5,
    fireScale: 0.82,
    damageScale: 0.7,
    healthBonus: -1,
    countBonus: -1,
    aimScale: 0.6,
    dashCooldown: 1.5,
    playerFireScale: 1,
    bulletSpeedScale: 0.86
  },
  standard: {
    id: "standard",
    label: "STANDARD",
    blurb: "The tuned fight. Readable pressure, honest damage.",
    windupScale: 1,
    fireScale: 1,
    damageScale: 1,
    healthBonus: 0,
    countBonus: 0,
    aimScale: 1,
    dashCooldown: 2.1,
    playerFireScale: 1,
    bulletSpeedScale: 1
  },
  veteran: {
    id: "veteran",
    label: "VETERAN",
    blurb: "Short tells, sharper tracking, heavier rounds. For practised hands.",
    windupScale: 0.86,
    fireScale: 1.25,
    damageScale: 1.15,
    healthBonus: 1,
    countBonus: 0,
    aimScale: 1.25,
    dashCooldown: 2.4,
    playerFireScale: 1,
    bulletSpeedScale: 1.12
  }
};

export const DEFAULT_DIFFICULTY: DifficultyId = "standard";

export const DIFFICULTY_ORDER: DifficultyId[] = ["recruit", "standard", "veteran"];

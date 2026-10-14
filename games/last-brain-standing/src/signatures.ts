import type { AgentState } from "./types";
import type { LoadoutId } from "./loadouts";

/**
 * Archetype signatures — the part of a hostile that is *behaviour*, not stats.
 *
 * The brief was that the three profiles must not read as the same enemy in
 * different paint. Each one now owns a different axis:
 *
 * - **The Hunter** owns *timing*: it fires a two-round salvo and its aim locks
 *   for the second half of the wind-up, so late lateral movement beats it while
 *   early panic does not. Its front plating eats a share of frontal damage.
 * - **The Flanker** owns *space*: it will not shoot while stacked with an ally,
 *   and dives across the room to close out of position.
 * - **The Mirror** owns *your own kit*: it copies the projectile geometry of
 *   whatever weapon you brought, so your loadout choice arms it differently.
 *
 * Everything here is pure data or pure functions, so the rules can be asserted
 * directly rather than inferred from a full simulation run.
 */

export interface VolleyRound {
  /** Seconds after the wind-up completes before this round leaves the barrel. */
  delay: number;
  /** Radians of random spread applied to the aim direction. */
  spread: number;
  /** Share of the profile's nominal damage this round carries. */
  damageShare: number;
  /** Multiplier on the profile's bullet speed. */
  speedScale: number;
  /** Multiplier on the round's lifetime. */
  lifeScale: number;
}

export interface Volley {
  rounds: VolleyRound[];
  /** Short label shown in the HUD when this profile is the one shooting. */
  label: string;
  /** Multiplier on the wind-up duration: heavier commitments telegraph longer. */
  telegraphScale: number;
}

const round = (overrides: Partial<VolleyRound> = {}): VolleyRound => ({
  delay: 0,
  spread: 0.04,
  damageShare: 1,
  speedScale: 1,
  lifeScale: 1,
  ...overrides
});

/**
 * Two rounds leave the barrel together: one tight, one sloppy. It is a wider
 * threat than a single round without adding a second reaction window, which
 * keeps the fight step-size independent and the telegraph honest.
 */
export const HUNTER_VOLLEY: Volley = {
  rounds: [
    round({ delay: 0, spread: 0.04, damageShare: 0.55 }),
    round({ delay: 0, spread: 0.13, damageShare: 0.45, speedScale: 0.94 })
  ],
  label: "DOUBLE SALVO",
  telegraphScale: 1
};

/** The Flanker's identity is positional, not ballistic: one round, on the move. */
export const FLANKER_VOLLEY: Volley = {
  rounds: [round({ spread: 0.1 })],
  label: "MOVING SHOT",
  telegraphScale: 1
};

/** The Mirror fires a copy of whatever you brought. */
export function mirrorVolley(loadout: LoadoutId): Volley {
  if (loadout === "scatter") {
    return {
      rounds: [
        round({ spread: 0.3, damageShare: 0.32, speedScale: 0.95, lifeScale: 0.6 }),
        round({ spread: 0.3, damageShare: 0.32, speedScale: 0.95, lifeScale: 0.6 }),
        round({ spread: 0.3, damageShare: 0.32, speedScale: 0.95, lifeScale: 0.6 })
      ],
      label: "COPIED SCATTERGUN",
      telegraphScale: 0.95
    };
  }
  if (loadout === "rail") {
    return {
      rounds: [round({ spread: 0.02, damageShare: 1.1, speedScale: 1.35, lifeScale: 1.4 })],
      label: "COPIED RAILGUN",
      telegraphScale: 1.3
    };
  }
  return {
    rounds: [round({ spread: 0.05 })],
    label: "COPIED RIFLE",
    telegraphScale: 1
  };
}

/** The volley a profile will actually fire, given the player's weapon. */
export function volleyFor(kind: AgentState["kind"], loadout: LoadoutId): Volley {
  if (kind === "hunter") return HUNTER_VOLLEY;
  if (kind === "flanker") return FLANKER_VOLLEY;
  return mirrorVolley(loadout);
}

/** Total share of nominal damage one full volley carries. */
export function volleyDamage(volley: Volley): number {
  return volley.rounds.reduce((sum, entry) => sum + entry.damageShare, 0);
}

// ------------------------------------------------------------------- the Hunter

/** Fraction of frontal damage the Hunter's plating absorbs. */
export const HUNTER_PLATING = 0.22;
/** Half-angle of the plated frontal arc, in radians (about 65° either side). */
export const HUNTER_PLATING_ARC = 1.13;
/**
 * How far through its wind-up the Hunter keeps tracking. Past this the barrel is
 * committed and the shot goes where it was last pointed.
 */
export const HUNTER_LOCK_PROGRESS = 0.55;

/**
 * Plating multiplier for a hit that lands at `impact` on a hostile at
 * `position` facing `facing`: 1 normally, less than 1 inside the frontal arc.
 * Only the Hunter is plated.
 */
export function platingScale(
  kind: AgentState["kind"],
  position: { x: number; y: number },
  facing: number,
  impact: { x: number; y: number }
): number {
  if (kind !== "hunter") return 1;
  const dx = impact.x - position.x;
  const dy = impact.y - position.y;
  const gap = Math.hypot(dx, dy);
  // A hit reported at the centre tells us nothing about the angle, and guessing
  // would punish the player for an artefact of a fast projectile.
  if (gap < 0.001) return 1;
  const cos = (dx / gap) * Math.cos(facing) + (dy / gap) * Math.sin(facing);
  return cos > Math.cos(HUNTER_PLATING_ARC) ? 1 - HUNTER_PLATING : 1;
}

/**
 * Whether a hostile keeps re-aiming this far through its wind-up. The Hunter
 * commits; everyone else tracks all the way to the shot.
 */
export function botKeepsTracking(kind: AgentState["kind"], progress: number): boolean {
  if (kind !== "hunter") return true;
  return progress < HUNTER_LOCK_PROGRESS;
}

/**
 * Pitch multiplier per profile, so the same cue sounds like whoever fired it:
 * the Hunter is heavy and low, the Flanker light and high, the Mirror in
 * between with a flat electronic edge. A player can hear which profile is
 * winding up behind them without turning around.
 */
export const PROFILE_PITCH: Record<AgentState["kind"], number> = {
  hunter: 0.78,
  flanker: 1.22,
  mirror: 0.98
};

// ------------------------------------------------------------------ the Flanker

/** An ally further than this from the player is not part of the same attack. */
export const PINCER_ALLY_RANGE = 430;
/** Inside this the Flanker takes the shot regardless of where its ally is. */
export const PINCER_PRESS_RANGE = 195;
/**
 * How far apart two flankers must be *around the player* before both may shoot:
 * about 100°, so crowding the same arc counts as the same angle and splitting to
 * opposite sides counts as an envelop.
 */
export const PINCER_ARC = (100 * Math.PI) / 180;

/** Smallest angle between two bearings, in radians. */
export function angleApart(a: number, b: number): number {
  let delta = Math.abs(a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}

/**
 * How far off the player→ally line a flanker sits, signed. Positive means the
 * ally is on one side of the bot's approach, negative the other; near zero means
 * they are queued up behind each other.
 */
export function pincerSide(position: { x: number; y: number }, player: { x: number; y: number }, ally: { x: number; y: number }): number {
  const toward = { x: player.x - position.x, y: player.y - position.y };
  const gap = Math.hypot(toward.x, toward.y);
  if (gap < 0.001) return 0;
  toward.x /= gap;
  toward.y /= gap;
  const offset = { x: ally.x - position.x, y: ally.y - position.y };
  const offsetGap = Math.hypot(offset.x, offset.y);
  if (offsetGap < 0.001) return 0;
  return (toward.x * offset.y - toward.y * offset.x) / offsetGap;
}

/**
 * The Flanker's discipline: it holds fire while it is still stacked with a live
 * ally, because a second gun from the same angle is wasted pressure. It takes
 * the shot anyway when it is close enough to press, or when it is the only one
 * left, so a lone survivor never freezes.
 */
export function flankerHoldsFire(
  position: { x: number; y: number },
  player: { x: number; y: number },
  allies: Array<{ x: number; y: number }>,
  range: number
): boolean {
  if (range < PINCER_PRESS_RANGE) return false;
  const mine = Math.atan2(position.y - player.y, position.x - player.x);
  for (const ally of allies) {
    // Only allies still in this fight count, measured against the player: one
    // across the arena is somebody else's problem.
    if (Math.hypot(ally.x - player.x, ally.y - player.y) > PINCER_ALLY_RANGE) continue;
    // Standing on top of it: nothing to see through.
    if (Math.hypot(ally.x - position.x, ally.y - position.y) < 40) return true;
    // Still crowding the same arc around the player: a second gun here adds
    // nothing. It keeps moving instead, and fires once it has the envelop.
    const theirs = Math.atan2(ally.y - player.y, ally.x - player.x);
    if (angleApart(mine, theirs) < PINCER_ARC) return true;
  }
  return false;
}

/** The Flanker's committed closing burst. */
export const FLANKER_DIVE = {
  /** Speed multiplier while diving. */
  speed: 1.8,
  /** How long the burst lasts. */
  duration: 0.42,
  /** Seconds before it may dive again. */
  cooldown: 2.4,
  /** How far outside its preferred ring it must be to bother. */
  extraRange: 60
} as const;

/** Whether the Flanker should launch a closing dive right now. */
export function flankerShouldDive(range: number, cooldown: number, windingUp: boolean, preferredRange: number): boolean {
  if (windingUp || cooldown > 0) return false;
  return range > preferredRange + FLANKER_DIVE.extraRange;
}

/** Speed multiplier for a profile's committed dive, if any. */
export function diveSpeedScale(kind: AgentState["kind"], diveTime: number): number {
  return kind === "flanker" && diveTime > 0 ? FLANKER_DIVE.speed : 1;
}

// ------------------------------------------------------------------- the Mirror

/**
 * How far past the player the Mirror slides away from the aim ray, so standing
 * in its lane is not the same as hitting it.
 */
export function mirrorEvadePull(aimDot: number): number {
  if (aimDot < 0.86) return 0; // the player is not even aiming this way
  return (aimDot - 0.86) / 0.14; // 0 at the edge of the lane, 1 dead centre
}

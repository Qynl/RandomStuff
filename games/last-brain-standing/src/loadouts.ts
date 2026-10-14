/**
 * Loadouts.
 *
 * The player picks the primary weapon before a run, and each one changes how a
 * fight is played rather than just how much damage it does: a service rifle
 * trades everything evenly, a scattergun rewards closing to point-blank and
 * punishes distance, a railgun demands patience and punishes a miss. Loadouts
 * are unlocked by career score, so a new player has one weapon and earns the
 * others by playing.
 */

export type LoadoutId = "rifle" | "scatter" | "rail";

export interface Loadout {
  id: LoadoutId;
  name: string;
  /** Short weapon-type label for the picker. */
  kind: string;
  /** One line on how it plays. */
  tagline: string;
  /** One line of tactical advice. */
  counter: string;
  /** Rounds per trigger pull. */
  shots: number;
  /** Total spread across the shot, in radians. */
  spread: number;
  /** Damage per round. */
  damage: number;
  /** Seconds between shots. */
  fireInterval: number;
  bulletSpeed: number;
  bulletLife: number;
  /** Camera kick per shot, in the same units the world shake uses. */
  recoil: number;
  /** Career score needed before the weapon can be picked. */
  unlockScore: number;
  /** Short label for the unlock requirement. */
  unlockLabel: string;
}

export const LOADOUTS: Record<LoadoutId, Loadout> = {
  rifle: {
    id: "rifle",
    name: "SERVICE RIFLE",
    kind: "RIFLE",
    tagline: "Balanced semi-auto. Reliable at every range.",
    counter: "No tricks: keep the reticle on the target and pace your shots.",
    shots: 1,
    spread: 0,
    damage: 12,
    fireInterval: 0.155,
    bulletSpeed: 620,
    bulletLife: 1.6,
    recoil: 1.3,
    unlockScore: 0,
    unlockLabel: "STANDARD ISSUE"
  },
  scatter: {
    id: "scatter",
    name: "BREACH SCATTERGUN",
    kind: "SHOTGUN",
    tagline: "Six pellets per trigger. Devastating up close, useless far away.",
    counter: "Close the distance behind cover, then fire; long duels are not yours.",
    shots: 6,
    spread: 0.42,
    damage: 5,
    fireInterval: 0.46,
    bulletSpeed: 540,
    bulletLife: 0.42,
    recoil: 5.2,
    unlockScore: 4500,
    unlockLabel: "4,500 CAREER"
  },
  rail: {
    id: "rail",
    name: "RAILGUN",
    kind: "RAIL",
    tagline: "One slow, heavy round. Miss and you are wide open.",
    counter: "Fire only when a telegraph commits them to a straight line.",
    shots: 1,
    spread: 0,
    damage: 34,
    fireInterval: 0.68,
    bulletSpeed: 940,
    bulletLife: 2.1,
    recoil: 6.4,
    unlockScore: 11000,
    unlockLabel: "11,000 CAREER"
  }
};

export const LOADOUT_ORDER: LoadoutId[] = ["rifle", "scatter", "rail"];
export const DEFAULT_LOADOUT: LoadoutId = "rifle";

export function isLoadoutId(value: unknown): value is LoadoutId {
  return typeof value === "string" && value in LOADOUTS;
}

/**
 * Career score is the sum of the best score on every threat level, so improving
 * on any level (and especially on the harsher ones) moves the unlock ladder.
 */
export function careerScore(bestByDifficulty: Partial<Record<string, { score: number } | number>>): number {
  let total = 0;
  for (const value of Object.values(bestByDifficulty)) {
    const score = typeof value === "number" ? value : value?.score;
    if (typeof score === "number" && Number.isFinite(score) && score > 0) total += score;
  }
  return Math.round(total);
}

export function isUnlocked(id: LoadoutId, career: number): boolean {
  return LOADOUTS[id].unlockScore <= career;
}

export function unlockedLoadouts(career: number): LoadoutId[] {
  return LOADOUT_ORDER.filter((id) => isUnlocked(id, career));
}

/** 0..1 progress toward unlocking a loadout. */
export function unlockProgress(id: LoadoutId, career: number): number {
  const need = LOADOUTS[id].unlockScore;
  if (need <= 0) return 1;
  return Math.max(0, Math.min(1, career / need));
}

/**
 * Picks a loadout that is actually available: an unknown or still-locked choice
 * falls back to the default rather than letting a stored value cheat the unlock.
 */
export function resolveLoadout(id: unknown, career: number): LoadoutId {
  if (!isLoadoutId(id)) return DEFAULT_LOADOUT;
  return isUnlocked(id, career) ? id : DEFAULT_LOADOUT;
}

/** The first loadout the player has not unlocked yet, for the "next unlock" line. */
export function nextLockedLoadout(career: number): LoadoutId | null {
  return LOADOUT_ORDER.find((id) => !isUnlocked(id, career)) ?? null;
}

export interface CareerRank {
  name: string;
  /** Career score needed to reach the rank. */
  threshold: number;
  insignia: string;
}

export const CAREER_RANKS: CareerRank[] = [
  { name: "RECRUIT", threshold: 0, insignia: "I" },
  { name: "OPERATOR", threshold: 3000, insignia: "II" },
  { name: "SPECIALIST", threshold: 9000, insignia: "III" },
  { name: "VETERAN", threshold: 16000, insignia: "IV" },
  { name: "INSTRUCTOR", threshold: 26000, insignia: "V" }
];

export function rankFor(career: number): CareerRank {
  let current = CAREER_RANKS[0];
  for (const rank of CAREER_RANKS) {
    if (career >= rank.threshold) current = rank;
  }
  return current;
}

/** The rank after the current one, or null at the top. */
export function nextRank(career: number): CareerRank | null {
  return CAREER_RANKS.find((rank) => rank.threshold > career) ?? null;
}

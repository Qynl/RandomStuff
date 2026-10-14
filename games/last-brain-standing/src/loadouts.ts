/**
 * Operative classes.
 *
 * The player picks a class before a run. A class is not a weapon skin: it is a
 * body (health, speed), a mobility rule (how the dash behaves) and one signature
 * trait that changes what you do in a fight. Every class is issued from the
 * start - career score buys badges and cosmetics, never access.
 */

export type LoadoutId = "vanguard" | "breacher" | "marksman" | "ghost" | "cinder" | "sapper";

/** The one thing a class does that no other class does. */
export type ClassTrait = "steady" | "siege" | "focus" | "phase" | "ignite" | "arc";

/** How this class moves when it dashes. */
export type DashKind = "dash" | "charge";

export interface Loadout {
  id: LoadoutId;
  name: string;
  /** Weapon-type label for the picker. */
  kind: string;
  /** One line on the weapon. */
  tagline: string;
  /** One line on how to play the class. */
  counter: string;
  /** Weapon: rounds per trigger pull. */
  shots: number;
  /** Weapon: total spread across the shot, in radians. */
  spread: number;
  /** Weapon: damage per round. */
  damage: number;
  /** Weapon: seconds between shots. */
  fireInterval: number;
  bulletSpeed: number;
  bulletLife: number;
  /** Camera kick per shot, in the same units the world shake uses. */
  recoil: number;
  /** Rounds that pass through a hostile before stopping. */
  pierce: number;
  /** Body: starting health. */
  maxHealth: number;
  /** Body: movement-speed multiplier on top of the base operative speed. */
  speedScale: number;
  /** Mobility: seconds between dashes. */
  dashCooldown: number;
  /** Mobility: distance covered, in world units. */
  dashDistance: number;
  /** Mobility: a dash, or a shoulder charge that knocks hostiles down. */
  dashKind: DashKind;
  /** The signature rule, in one line, for the picker. */
  traitName: string;
  traitRule: string;
  trait: ClassTrait;
}

export const LOADOUTS: Record<LoadoutId, Loadout> = {
  vanguard: {
    id: "vanguard",
    name: "VANGUARD",
    kind: "SERVICE RIFLE",
    tagline: "Balanced semi-auto, balanced body, dependable dash.",
    counter: "No tricks: keep the reticle on the target, pace your shots, dash on reaction.",
    shots: 1,
    spread: 0,
    damage: 12,
    fireInterval: 0.155,
    bulletSpeed: 620,
    bulletLife: 1.6,
    recoil: 1.3,
    pierce: 0,
    maxHealth: 100,
    speedScale: 1,
    dashCooldown: 2,
    dashDistance: 118,
    dashKind: "dash",
    traitName: "RESOLUTE",
    traitRule: "Every kill hands back 35% of your dash.",
    trait: "steady"
  },
  breacher: {
    id: "breacher",
    name: "BREACHER",
    kind: "BREACH SCATTERGUN",
    tagline: "Six pellets a pull, a heavy body, and a dash that is a body check.",
    counter: "Close the distance behind cover. Your dash staggers whatever it touches.",
    shots: 6,
    spread: 0.42,
    damage: 5,
    fireInterval: 0.46,
    bulletSpeed: 540,
    bulletLife: 0.42,
    recoil: 5.2,
    pierce: 0,
    maxHealth: 132,
    speedScale: 0.93,
    dashCooldown: 2.7,
    dashDistance: 152,
    dashKind: "charge",
    traitName: "SIEGE DASH",
    traitRule: "Charge through a hostile to stagger it and hit for 8.",
    trait: "siege"
  },
  marksman: {
    id: "marksman",
    name: "MARKSMAN",
    kind: "RAILGUN",
    tagline: "One slow heavy round that punches through a queue of hostiles.",
    counter: "Hold an angle, stand still to bank focus, and fire when they commit.",
    shots: 1,
    spread: 0,
    damage: 30,
    fireInterval: 0.7,
    bulletSpeed: 940,
    bulletLife: 2.1,
    recoil: 6.4,
    pierce: 2,
    maxHealth: 86,
    speedScale: 0.96,
    dashCooldown: 3,
    dashDistance: 132,
    dashKind: "dash",
    traitName: "FOCUS",
    traitRule: "Stand still for 0.7s: your next shot does +60% and pierces two.",
    trait: "focus"
  },
  ghost: {
    id: "ghost",
    name: "GHOST",
    kind: "BURST CARBINE",
    tagline: "Three-round bursts, fast legs, and a dash that makes you untargetable.",
    counter: "Dash through a wind-up to break it, then burst them down while they reset.",
    shots: 3,
    spread: 0.09,
    damage: 6,
    fireInterval: 0.34,
    bulletSpeed: 700,
    bulletLife: 1.1,
    recoil: 2.1,
    pierce: 0,
    maxHealth: 94,
    speedScale: 1.12,
    dashCooldown: 1.7,
    dashDistance: 126,
    dashKind: "dash",
    traitName: "PHASE",
    traitRule: "Your dash blanks their aim for a third of a second: fired shots die.",
    trait: "phase"
  },
  cinder: {
    id: "cinder",
    name: "CINDER",
    kind: "FLAME PROJECTOR",
    tagline: "A short cone of fire. Everything it touches keeps burning.",
    counter: "Get close behind cover, light them up, then back out and let the burn work.",
    shots: 1,
    spread: 0.2,
    damage: 4.5,
    fireInterval: 0.06,
    bulletSpeed: 300,
    bulletLife: 0.4,
    recoil: 0.8,
    pierce: 0,
    maxHealth: 118,
    speedScale: 0.94,
    dashCooldown: 2.3,
    dashDistance: 124,
    dashKind: "dash",
    traitName: "IGNITE",
    traitRule: "Burning hostiles take 3/s and move 15% slower for 2.5s.",
    trait: "ignite"
  },
  sapper: {
    id: "sapper",
    name: "SAPPER",
    kind: "ARC LOBBER",
    tagline: "Lobs a shell over cover onto a marked circle. Area, not aim.",
    counter: "You do not need the line of sight they keep. Fire where they will be.",
    shots: 1,
    spread: 0,
    damage: 24,
    fireInterval: 0.95,
    bulletSpeed: 260,
    bulletLife: 1,
    recoil: 4.2,
    pierce: 0,
    maxHealth: 106,
    speedScale: 1,
    dashCooldown: 2.2,
    dashDistance: 118,
    dashKind: "dash",
    traitName: "ARC FIRE",
    traitRule: "Shells clear cover: a 74-unit burst for 24, landing where you aim.",
    trait: "arc"
  }
};

export const LOADOUT_ORDER: LoadoutId[] = ["vanguard", "breacher", "marksman", "ghost", "cinder", "sapper"];
export const DEFAULT_LOADOUT: LoadoutId = "vanguard";

/** Stored values from before the classes were renamed still resolve. */
const LEGACY_IDS: Record<string, LoadoutId> = {
  rifle: "vanguard",
  scatter: "breacher",
  rail: "marksman"
};

/**
 * Career score is the sum of the best score on every threat level. It buys rank
 * and badges; no class is behind it.
 */
export function careerScore(bestByDifficulty: Partial<Record<string, { score: number } | number>>): number {
  let total = 0;
  for (const value of Object.values(bestByDifficulty)) {
    const score = typeof value === "number" ? value : value?.score;
    if (typeof score === "number" && Number.isFinite(score) && score > 0) total += score;
  }
  return Math.round(total);
}

/**
 * Every class is issued from the start. The ladder is kept as a single place to
 * answer "may I play this?", so a future cosmetic gate has one home, and it is
 * always true today.
 */
export function isUnlocked(_id: LoadoutId, _career = 0): boolean {
  return true;
}

export function unlockedLoadouts(_career = 0): LoadoutId[] {
  return [...LOADOUT_ORDER];
}

/** Always complete: the roster is fully issued. */
export function unlockProgress(_id: LoadoutId, _career = 0): number {
  return 1;
}

/**
 * Picks a class that exists: an unknown stored value falls back to the default,
 * and a legacy id from before the rename maps onto its successor.
 */
export function resolveLoadout(id: unknown, _career = 0): LoadoutId {
  if (typeof id === "string" && id in LEGACY_IDS) return LEGACY_IDS[id];
  return isLoadoutId(id) ? id : DEFAULT_LOADOUT;
}

/** No class is ever locked, so there is never a next unlock. */
export function nextLockedLoadout(_career = 0): LoadoutId | null {
  return null;
}

export function isLoadoutId(value: unknown): value is LoadoutId {
  return typeof value === "string" && value in LOADOUTS;
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

import { LOADOUT_ORDER, type LoadoutId } from "./loadouts";

/**
 * Operator account.
 *
 * Everything a player accumulates across runs: per-weapon service records and a
 * shelf of badges. Both are plain descriptions of state, so the same code that
 * decides whether a badge is earned can also explain what is missing.
 */

export interface WeaponRecord {
  /** Runs finished with this weapon. */
  runs: number;
  kills: number;
  bestScore: number;
  /** Clears (wins) with this weapon. */
  victories: number;
}

export type WeaponRecords = Record<LoadoutId, WeaponRecord>;

export function emptyWeaponRecords(): WeaponRecords {
  const records = {} as WeaponRecords;
  for (const id of LOADOUT_ORDER) records[id] = { runs: 0, kills: 0, bestScore: 0, victories: 0 };
  return records;
}

/** Adds one finished run to a weapon's service record. Mutates and returns it. */
/** Turns anything into a finite, non-negative integer. */
const sane = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

export function recordRun(record: WeaponRecord, run: { kills: number; score: number; victory: boolean }): WeaponRecord {
  record.runs += 1;
  record.kills += sane(run.kills);
  record.bestScore = Math.max(record.bestScore, sane(run.score));
  if (run.victory) record.victories += 1;
  return record;
}

export interface BadgeContext {
  runs: number;
  kills: number;
  careerScore: number;
  bestCombo: number;
  interrupts: number;
  perfectVictories: number;
  victories: number;
  unlocks: number;
  /** Arenas a run has been won in. */
  arenasCleared: string[];
  /** Threat levels a run has been won on. */
  levelsCleared: string[];
  /** Best strict-accuracy figure across finished runs, in percent. */
  bestAccuracy: number;
}

export interface Badge {
  id: string;
  name: string;
  /** What it takes, in one line. */
  requirement: string;
  /** 0..1 progress toward it, for the locked state. */
  progress: (context: BadgeContext) => number;
  earned: (context: BadgeContext) => boolean;
}

const at = (value: number, target: number) => (target <= 0 ? 1 : Math.max(0, Math.min(1, value / target)));

export const BADGES: Badge[] = [
  {
    id: "first-run",
    name: "FIRST CONTACT",
    requirement: "Finish your first run",
    progress: (c) => at(c.runs, 1),
    earned: (c) => c.runs >= 1
  },
  {
    id: "marksman",
    name: "MARKSMAN",
    requirement: "Finish a run at 80% accuracy or better",
    progress: (c) => at(c.bestAccuracy, 80),
    earned: (c) => c.bestAccuracy >= 80
  },
  {
    id: "chain",
    name: "CHAIN REACTION",
    requirement: "Eliminate five hostiles without a break",
    progress: (c) => at(c.bestCombo, 5),
    earned: (c) => c.bestCombo >= 5
  },
  {
    id: "interrupter",
    name: "WIND-UP CUTTER",
    requirement: "Cut five wind-ups in one career",
    progress: (c) => at(c.interrupts, 5),
    earned: (c) => c.interrupts >= 5
  },
  {
    id: "tourist",
    name: "ARENA TOUR",
    requirement: "Win a run in three different arenas",
    progress: (c) => at(c.arenasCleared.length, 3),
    earned: (c) => c.arenasCleared.length >= 3
  },
  {
    id: "all-levels",
    name: "FULL SWEEP",
    requirement: "Clear every threat level at least once",
    progress: (c) => at(c.levelsCleared.length, 3),
    earned: (c) => c.levelsCleared.length >= 3
  },
  {
    id: "untouchable",
    name: "UNTOUCHABLE",
    requirement: "Win a run without taking damage",
    progress: (c) => at(c.perfectVictories, 1),
    earned: (c) => c.perfectVictories >= 1
  },
  {
    id: "gun-metal",
    name: "GUNSMITH",
    requirement: "Unlock every weapon",
    progress: (c) => at(c.unlocks, LOADOUT_ORDER.length),
    earned: (c) => c.unlocks >= LOADOUT_ORDER.length
  },
  {
    id: "centurion",
    name: "CENTURION",
    requirement: "Reach 20,000 career score",
    progress: (c) => at(c.careerScore, 20000),
    earned: (c) => c.careerScore >= 20000
  }
];

export interface BadgeStatus {
  id: string;
  name: string;
  requirement: string;
  earned: boolean;
  progress: number;
}

export function badgeStatuses(context: BadgeContext): BadgeStatus[] {
  return BADGES.map((badge) => ({
    id: badge.id,
    name: badge.name,
    requirement: badge.requirement,
    earned: badge.earned(context),
    progress: Math.max(0, Math.min(1, badge.progress(context)))
  }));
}

export const EMPTY_BADGE_CONTEXT: BadgeContext = {
  runs: 0,
  kills: 0,
  careerScore: 0,
  bestCombo: 0,
  interrupts: 0,
  perfectVictories: 0,
  victories: 0,
  unlocks: 1,
  arenasCleared: [],
  levelsCleared: [],
  bestAccuracy: 0
};

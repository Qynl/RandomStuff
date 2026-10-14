import type { BotKind, DifficultyId } from "./types";
import { DIFFICULTIES } from "./constants";

export const MAX_WAVES = 5;

/** Returns null after the final wave has been cleared. */
export function getNextWave(currentWave: number): number | null {
  return currentWave >= MAX_WAVES ? null : Math.max(1, currentWave + 1);
}

/** Enemy count rises across the early waves and then caps at six. */
export function getWaveSpawnCount(wave: number): number {
  return Math.max(0, Math.min(3 + wave - 1, 6));
}

/** Percentage filled by the current threat level, clamped to the five-wave run. */
export function getWaveProgressPercent(wave: number): number {
  return Math.max(0, Math.min(wave, MAX_WAVES)) / MAX_WAVES * 100;
}

/**
 * Deliberate wave composition. Early waves teach one profile at a time so the
 * player can learn each telegraph before the fights get crowded.
 */
const WAVE_COMPOSITION: BotKind[][] = [
  ["hunter", "hunter", "hunter"],
  ["hunter", "flanker", "flanker", "hunter"],
  ["hunter", "flanker", "mirror", "flanker", "hunter"],
  ["hunter", "flanker", "mirror", "mirror", "flanker", "hunter"],
  ["hunter", "flanker", "mirror", "hunter", "flanker", "mirror"]
];

const COMPOSITION_CYCLE: BotKind[] = ["hunter", "flanker", "mirror", "flanker", "hunter", "mirror"];

export interface WavePlan {
  wave: number;
  kinds: BotKind[];
  /** Seconds of warning before the first hostile materialises. */
  telegraph: number;
  /** Seconds between consecutive materialisations inside the wave. */
  spawnInterval: number;
  /** Durability multiplier applied to every bot in the wave. */
  healthMultiplier: number;
  /** Movement speed multiplier applied to every bot in the wave. */
  speedMultiplier: number;
  /** How much of the player's velocity the bots lead, 0..1. */
  awareness: number;
}

/**
 * Full wave plan for a difficulty. Everything a wave needs is derived here so
 * the behaviour is unit-testable instead of being scattered through the engine.
 */
export function getWavePlan(wave: number, difficulty: DifficultyId = "standard"): WavePlan {
  const clampedWave = Math.max(1, Math.min(MAX_WAVES, Math.round(wave)));
  const preset = DIFFICULTIES[difficulty];
  const baseCount = getWaveSpawnCount(clampedWave);
  const targetCount = Math.max(2, Math.min(7, baseCount + preset.countBonus));
  const composition = WAVE_COMPOSITION[clampedWave - 1];

  const kinds: BotKind[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    kinds.push(i < composition.length ? composition[i] : COMPOSITION_CYCLE[(i - composition.length) % COMPOSITION_CYCLE.length]);
  }

  return {
    wave: clampedWave,
    kinds,
    telegraph: clampedWave === 1 ? 1.25 : 0.95,
    spawnInterval: clampedWave >= 4 ? 0.2 : 0.3,
    healthMultiplier: 1 + 0.14 * (clampedWave - 1),
    speedMultiplier: 1 + 0.028 * (clampedWave - 1),
    awareness: Math.min(1, 0.58 + 0.13 * (clampedWave - 1))
  };
}

/**
 * One short, wave-specific piece of advice shown under the inbound banner.
 *
 * Waves introduce profiles one at a time, so the tip for the wave that first
 * fields a profile can teach it before the fight starts. Waves 4 and 5 mix
 * profiles rather than introducing new ones, so their tips are about pressure.
 */
export function getWaveHint(wave: number): string {
  const clamped = Math.max(1, Math.min(MAX_WAVES, Math.round(wave)));
  const introduces = (kind: BotKind): boolean =>
    WAVE_COMPOSITION[clamped - 1].includes(kind) && !WAVE_COMPOSITION.slice(0, clamped - 1).some((entry) => entry.includes(kind));
  if (introduces("hunter")) return "RINGS MARK INCOMING SHOTS — MOVE OR DASH";
  if (introduces("flanker")) return "BREAK ITS LINE OF SIGHT AND THE SHOT DIES";
  if (introduces("mirror")) return "STOP REPEATING YOURSELF — IT READS PATTERNS";
  if (clamped >= 5) return "KILL MID-TELEGRAPH: THE SHOT NEVER LANDS";
  return "MORE OF THEM, LESS ROOM — KEEP MOVING";
}

/** Short human-readable briefing used by the HUD wave banner. */
export function getWaveBriefing(wave: number): string {
  const plan = getWavePlan(wave);
  const counts = new Map<BotKind, number>();
  for (const kind of plan.kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const order: BotKind[] = ["hunter", "flanker", "mirror"];
  const parts = order
    .filter((kind) => (counts.get(kind) ?? 0) > 0)
    .map((kind) => `${counts.get(kind)}×${kind.toUpperCase()}`);
  return parts.join("  ");
}

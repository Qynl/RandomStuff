/**
 * Small deterministic random number generator.
 *
 * The game previously called `Math.random()` from every system, which made runs
 * impossible to reproduce, impossible to test, and impossible to balance with
 * data. Every stochastic decision in the simulation now flows through an `Rng`
 * instance derived from a run seed, so:
 *
 * - a seed plus an input sequence always replays the exact same fight,
 * - balance sweeps can be run headlessly in tests,
 * - players can be given a visible, shareable seed.
 *
 * `Math.random` is still fine for pure cosmetics outside the simulation.
 */
export interface Rng {
  /** Current internal state, so a run can be saved and resumed deterministically. */
  readonly state: number;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Random element, or undefined for an empty list. */
  pick<T>(items: readonly T[]): T | undefined;
  /** True with the given probability (0..1). */
  chance(probability: number): boolean;
  /** Unit vector with a uniformly distributed angle. */
  direction(): { x: number; y: number };
  /** Unit vector at `angle` plus up to `jitter` radians of noise. */
  spreadDirection(angle: number, jitter: number): { x: number; y: number };
}

const UINT32 = 4294967296;

/** Converts arbitrary text into a 32 bit seed (FNV-1a, stable across platforms). */
export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Seeds are kept inside 24 bits so the six-character label is exact.
 *
 * `formatSeed` has always shown six hex characters, but the stored seed was a
 * full 32 bit number and the label was truncated - so replaying the label shown
 * on the HUD (or in a share link) silently produced a *different* fight. Every
 * seed now passes through `normalizeSeed` before it reaches the generator, which
 * makes the label lossless: `parse(label) === seed` and a replay is byte-for-byte
 * the same run.
 */
export const SEED_SPACE = 0x1000000;

/** Six character, human-shareable uppercase seed label. */
export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(6, "0").slice(-6);
}

const HEX_LABEL = /^[0-9a-f]{6}$/i;

/**
 * Turns any accepted seed form into the canonical 24 bit seed.
 *
 * - numbers are masked into the seed space (0 becomes 1),
 * - a six-character hex string is read as a label, so `formatSeed` output
 *   round-trips exactly,
 * - any other text is hashed (FNV-1a), which keeps old text seeds working.
 */
export function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") {
    const value = (Number.isFinite(seed) ? Math.floor(seed) : 0) >>> 0;
    return (value % SEED_SPACE) || 1;
  }
  // Text seeds are case-insensitive: the seed field, share links and the HUD all
  // talk about the same run whether the player typed `mirror` or `MIRROR`.
  const text = seed.trim().toUpperCase();
  if (HEX_LABEL.test(text)) {
    const value = Number.parseInt(text, 16) >>> 0;
    return (value % SEED_SPACE) || 1;
  }
  return (hashSeed(text) % SEED_SPACE) || 1;
}

/** True when the text is a seed label the HUD could have produced. */
export function looksLikeSeedLabel(text: string): boolean {
  return HEX_LABEL.test(text.trim());
}

/** Creates a seeded generator (mulberry32: fast, tiny, good enough for a game). */
export function createRng(seed: number | string): Rng {
  let state = (typeof seed === "string" ? hashSeed(seed) : seed) >>> 0;
  if (state === 0) state = 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };

  const rng: Rng = {
    get state() {
      return state;
    },
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T | undefined => (items.length === 0 ? undefined : items[Math.floor(next() * items.length) % items.length]),
    chance: (probability) => next() < probability,
    direction: () => {
      const angle = next() * Math.PI * 2;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    },
    spreadDirection: (angle, jitter) => {
      const offset = (next() * 2 - 1) * jitter;
      return { x: Math.cos(angle + offset), y: Math.sin(angle + offset) };
    }
  };

  return rng;
}

/** Random seed source for a fresh run when the player does not supply one. */
export function createRandomSeed(): number {
  return (Math.floor(Math.random() * SEED_SPACE) >>> 0) || 1;
}

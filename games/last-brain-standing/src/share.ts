import { DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY } from "./constants";
import { formatSeed, normalizeSeed } from "./rng";
import type { DifficultyId } from "./types";

/**
 * Run codes.
 *
 * A run is fully determined by `(seed, difficulty)`, so the whole fight can be
 * written into a URL hash and handed to someone else. Everything in this module
 * is pure so the format can be unit tested without a browser.
 *
 * Format: `#seed=1A2B3C&level=veteran` - short, human readable, and tolerant of
 * the punctuation a chat client might add.
 */

export interface RunCode {
  seed: string;
  difficulty: DifficultyId;
}

export const MAX_SEED_LENGTH = 16;

/** Strips decoration and uppercases a seed so `1a2b-3c` and `1A2B3C` match. */
export function normalizeSeedText(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, MAX_SEED_LENGTH);
}

export function isDifficultyId(value: string): value is DifficultyId {
  return (DIFFICULTY_ORDER as string[]).includes(value);
}

/**
 * Parses a run code from a location hash, a bare `seed=..&level=..` string, or
 * a full share URL. Returns null when there is nothing usable to replay.
 */
export function parseRunCode(input: string): RunCode | null {
  if (!input) return null;
  const raw = input.trim();
  // Accept a full URL, a `?query`, a `#hash`, or a bare query string.
  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");
  const start = hashIndex >= 0 ? hashIndex + 1 : queryIndex >= 0 ? queryIndex + 1 : 0;
  const query = raw.slice(start);
  if (!query) return null;

  const params = new URLSearchParams(query);
  const seedParam = params.get("seed") ?? params.get("s") ?? "";
  const levelParam = (params.get("level") ?? params.get("difficulty") ?? params.get("d") ?? "").toLowerCase();
  const seed = normalizeSeedText(seedParam);
  if (seed.length === 0) return null;
  const difficulty = isDifficultyId(levelParam) ? levelParam : DEFAULT_DIFFICULTY;
  return { seed, difficulty };
}

/**
 * True when pasted text looks like a run code rather than a typed seed, so the
 * seed field can unpack a shared link instead of mangling it into a seed.
 */
export function looksLikeRunCode(input: string): boolean {
  if (!input) return false;
  const text = input.trim();
  if (text.startsWith("#")) return true;
  return /(^|[?&#])seed=/i.test(text) || /(^|[?&#])(level|difficulty)=/i.test(text);
}

/** Builds the shareable fragment (no leading `#`). */
export function buildRunCode(run: RunCode): string {
  const seed = normalizeSeedText(run.seed);
  const difficulty = isDifficultyId(run.difficulty) ? run.difficulty : DEFAULT_DIFFICULTY;
  return `seed=${seed}&level=${difficulty}`;
}

/** Appends a run code to a base URL, replacing any existing hash. */
export function buildShareUrl(base: string, run: RunCode): string {
  const trimmed = base.split("#")[0];
  return `${trimmed}#${buildRunCode(run)}`;
}

/** Short label used in the HUD and the run summary. */
export function describeRunCode(run: RunCode): string {
  const label = DIFFICULTIES[run.difficulty]?.label ?? run.difficulty.toUpperCase();
  return `${normalizeSeedText(run.seed)} · ${label}`;
}

/** Canonical numeric seed for a run code, so text seeds and URLs agree. */
export function runCodeSeed(run: RunCode): number {
  return normalizeSeed(run.seed);
}

/** Human sentence used by the copy-link confirmation. */
export function describeShare(run: RunCode): string {
  return `Seed ${describeRunCode(run)} copied. Send it to a friend to replay this exact fight.`;
}

/**
 * Seed label shown for a run started from a URL. A label in the link is kept
 * verbatim (it is already canonical); text seeds are hashed into a label.
 */
export function seedLabelFromHash(hash: string): string | null {
  const run = parseRunCode(hash);
  if (!run) return null;
  return formatSeed(runCodeSeed(run));
}

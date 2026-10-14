import { BOT_KINDS, BOT_PROFILES } from "./ai";
import type { BotKind, RunStats } from "./types";

export interface ScoreBreakdown {
  kills: number;
  waves: number;
  accuracy: number;
  speed: number;
  /** Bonus for hostiles eliminated during their wind-up. */
  interrupts: number;
  total: number;
}

export const SCORE_PER_KILL = 120;
/** Cutting a wind-up both cancels a shot and scores, so the counterplay pays. */
export const SCORE_PER_INTERRUPT = 60;
export const SCORE_PER_WAVE = 250;
/** Runs that finish fast keep a bonus that decays to zero after two minutes. */
export const SPEED_BONUS_WINDOW = 120;
export const SPEED_BONUS_PER_SECOND = 5;

export function accuracyPercent(stats: Pick<RunStats, "shotsFired" | "shotsHit">): number {
  if (stats.shotsFired <= 0) return 0;
  return Math.round((Math.max(0, Math.min(stats.shotsFired, stats.shotsHit)) / stats.shotsFired) * 100);
}

/**
 * Score rewards pressure (kills), progress (waves) and efficiency (accuracy
 * plus a shrinking time bonus) instead of only counting eliminations.
 */
export function computeScore(stats: RunStats): ScoreBreakdown {
  const kills = Math.max(0, Math.round(stats.kills)) * SCORE_PER_KILL;
  const waves = Math.max(0, Math.min(5, Math.round(stats.wavesCleared))) * SCORE_PER_WAVE;
  const accuracyValue = Math.round(accuracyPercent(stats) * 4);
  const remaining = Math.max(0, SPEED_BONUS_WINDOW - Math.max(0, stats.elapsed));
  const speed = Math.round(remaining * SPEED_BONUS_PER_SECOND);
  const interrupts = Math.max(0, Math.round(stats.interrupts)) * SCORE_PER_INTERRUPT;
  return { kills, waves, accuracy: accuracyValue, speed, interrupts, total: kills + waves + accuracyValue + speed + interrupts };
}

export type RunGrade = "S" | "A" | "B" | "C" | "D";

/** Coarse grade so the end-of-run screen says more than a raw number. */
export function gradeRun(score: number): RunGrade {
  if (score >= 3200) return "S";
  if (score >= 2400) return "A";
  if (score >= 1700) return "B";
  if (score >= 1000) return "C";
  return "D";
}

/** mm:ss clock used by the HUD and the run summary. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export interface SummaryRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

/** Extra run detail the summary can show when the runtime provides it. */
export interface RunSummaryDetail {
  /** What landed the final blow on a lost run. */
  endedBy?: BotKind | "unknown" | null;
  /** Eliminations per profile. */
  killsByKind?: Record<BotKind, number>;
  /** Stored best score on the difficulty that was played. */
  bestScoreOnDifficulty?: number;
  isDifficultyBest?: boolean;
  /** True for a victory with zero damage taken. */
  perfect?: boolean;
  /** Arena layout the run was played in. */
  arenaName?: string;
}

/** "3× HUNTER · 1× MIRROR" - empty when the run ended before any kill. */
export function describeKillBreakdown(killsByKind: Partial<Record<BotKind, number>>): string {
  const order = BOT_KINDS;
  return order
    .filter((kind) => (killsByKind[kind] ?? 0) > 0)
    .map((kind) => `${killsByKind[kind]}× ${BOT_PROFILES[kind].name.replace("THE ", "")}`)
    .join(" · ");
}

/** Names the profile that ended the run, for the defeat screen. */
export function describeEnding(endedBy: BotKind | "unknown" | null | undefined): string {
  if (!endedBy) return "—";
  if (endedBy === "unknown") return "UNKNOWN FIRE";
  return BOT_PROFILES[endedBy].name;
}

/** Rows rendered by the overlay after a run ends. */
export function buildRunSummary(
  stats: RunStats,
  score: ScoreBreakdown,
  seedLabel: string,
  isBest: boolean,
  detail: RunSummaryDetail = {}
): SummaryRow[] {
  const rows: SummaryRow[] = [
    { label: "ELIMINATIONS", value: String(stats.kills).padStart(2, "0"), emphasis: true },
    { label: "THREAT LEVEL", value: `${String(Math.max(0, stats.wave)).padStart(2, "0")} / 05` },
    { label: "ACCURACY", value: `${accuracyPercent(stats)}%` },
    { label: "DAMAGE TAKEN", value: `${Math.round(stats.damageTaken)}%` },
    { label: "DASHES", value: String(stats.dashes) },
    { label: "TIME", value: formatDuration(stats.elapsed) },
    { label: "SEED", value: seedLabel },
    { label: isBest ? "NEW BEST" : "SCORE", value: String(score.total), emphasis: isBest }
  ];

  // Perfect dodges are a skill read-out, so they only appear when they happened.
  if (stats.dodges > 0) rows.splice(rows.length - 1, 0, { label: "PERFECT DODGES", value: String(stats.dodges) });

  // Wind-up cuts are the skill the game asks for, so they get their own row.
  if (stats.interrupts > 0) rows.splice(rows.length - 1, 0, { label: "WIND-UP CUTS", value: String(stats.interrupts) });

  const breakdown = detail.killsByKind ? describeKillBreakdown(detail.killsByKind) : "";
  if (breakdown) rows.splice(1, 0, { label: "TAKEN DOWN", value: breakdown });

  if (!isBest && detail.isDifficultyBest) {
    rows.push({ label: "NEW DIFFICULTY BEST", value: String(score.total), emphasis: true });
  } else if (!isBest && detail.bestScoreOnDifficulty && detail.bestScoreOnDifficulty > 0) {
    rows.push({ label: "BEST ON THIS LEVEL", value: String(detail.bestScoreOnDifficulty) });
  }

  if (detail.arenaName) rows.push({ label: "ARENA", value: detail.arenaName });
  if (detail.endedBy) rows.push({ label: "ENDED BY", value: describeEnding(detail.endedBy) });
  if (detail.perfect) rows.push({ label: "CLEAN SWEEP", value: "NO DAMAGE TAKEN", emphasis: true });
  return rows;
}

/** One line of fight feedback, kept short enough for the combat feed. */
export function describeScore(score: ScoreBreakdown): string {
  return `Score ${score.total} (kills ${score.kills} · waves ${score.waves} · accuracy ${score.accuracy} · pace ${score.speed} · wind-up cuts ${score.interrupts}).`;
}

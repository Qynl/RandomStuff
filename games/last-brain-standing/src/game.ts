import { BOT_KINDS, BOT_PROFILES, emptyKindTotals } from "./ai";
import { attackFor, PROFILE_PITCH, volleyFor } from "./signatures";
import { ARENA_LAYOUTS, firstBlockingFraction, layoutForSeed, rangeScaleForOpenness, WORLD } from "./arena";
import { BLOCK, BOT_ART, BULLET, CLASS_ART, FLOOR, PLAYER_ART, STATUS, TELEGRAPH, TELEGRAPH_STYLE } from "./art";
import { SoundEngine, type SoundName } from "./audio";
import { BOT_RADIUS, DIFFICULTIES, MAX_PARTICLES, PLAYER_MAX_HEALTH, PLAYER_RADIUS } from "./constants";
import {
  badgeStatuses,
  emptyWeaponRecords,
  recordRun,
  type BadgeContext,
  type BadgeStatus,
  type WeaponRecord,
  type WeaponRecords
} from "./account";
import {
  careerScore,
  isLoadoutId,
  isUnlocked,
  LOADOUTS,
  LOADOUT_ORDER,
  unlockedLoadouts,
  nextRank,
  rankFor,
  resolveLoadout,
  type LoadoutId
} from "./loadouts";
import { getWaveBriefing, getWaveHint, MAX_WAVES } from "./progression";
import { computeScore, formatDuration, gradeRun, type RunGrade, type ScoreBreakdown } from "./scoring";
import {
  createWorld,
  playerPredictability,
  predictedPlayerPoint,
  resetWorld,
  setWorldLoadout,
  stepWorld,
  type SimPhase,
  type World,
  type WaveState
} from "./sim";
import { dashChargeFraction, isEditableTarget, keyboardMoveVector, mergeMoveInputs, screenToWorld } from "./input";
import { createRandomSeed, createRng, formatSeed } from "./rng";
import type { AgentState, AimMode, BotKind, DifficultyId, RunStats, Vec2 } from "./types";
import type { PlayerState } from "./sim";

/** Seconds of standing still a Marksman needs: mirrored from the simulation. */
const FOCUS_WINDOW = 0.7;
/** Same value, kept here so the renderer never imports simulation state. */
const FOCUS_DRAW_WINDOW = 0.7;
/** How long a Ghost's phase lasts, in seconds. */
const PHASE_DRAW_SPAN = 0.34;
/** Burn duration, for scaling the flame overlay. */
const BURN_DRAW_SPAN = 2.5;

export interface GameSnapshot {
  phase: SimPhase;
  started: boolean;
  paused: boolean;
  fps: number;
  frameMs: number;
  hitStop: number;
  /** Screen flash level 0..1, useful for verifying calm mode. */
  flash: number;
  shakeEnabled: boolean;
  combo: number;
  wave: number;
  maxWave: number;
  waveState: WaveState;
  waveTimer: number;
  briefing: string;
  /** Tactical tip for the wave that is inbound or running. */
  hint: string;
  /** Arena layout name for the current run. */
  arenaName: string;
  /** Primary weapon for this run. */
  loadout: LoadoutId;
  /** Career progress and unlocks, for the profile screen and the picker. */
  career: CareerSummary;
  health: number;
  maxHealth: number;
  kills: number;
  score: number;
  bestScore: number;
  bestKills: number;
  stats: RunStats;
  dashCharge: number;
  /** 0..1 toward the Marksman's focused shot; 1 means the next pull is heavy. */
  focus: number;
  /** Whether the next shot from this class will be the focused one. */
  focusReady: boolean;
  /** Seconds left of a Ghost's phase window. */
  phaseTime: number;
  predictability: number;
  seedLabel: string;
  difficulty: DifficultyId;
  liveKinds: Record<BotKind, number>;
  hostileCount: number;
  invulnerable: boolean;
  assistTarget: boolean;
  /** Stored best score on the currently selected difficulty. */
  difficultyBestScore: number;
  /** Stored best elimination count on the currently selected difficulty. */
  difficultyBestKills: number;
  /** Live habit readings the Mirror can exploit, or null when no Mirror is up. */
  mirrorRead: { movement: number; firing: number } | null;
  /** What the Mirror is currently echoing back at you, or null when none is up. */
  mirrorEcho: string | null;
  /** 0..1 arena pressure: rises while a wave stalls with nothing dying. */
  pressure: number;
  /** Best finished runs on this device, highest score first. */
  topRuns: RunRecord[];
}

export interface FeedLine {
  id: number;
  time: string;
  text: string;
  tone: "info" | "good" | "bad" | "warn";
}

export interface CareerSummary {
  /** Sum of the best score on every threat level. */
  score: number;
  runs: number;
  kills: number;
  bestCombo: number;
  rank: { name: string; insignia: string; threshold: number };
  nextRank: { name: string; insignia: string; threshold: number } | null;
  /** 0..1 from the current rank's threshold to the next one; 1 at top rank. */
  rankProgress: number;
  /** Threat levels the account has ever cleared, for the command screen strip. */
  levelsClearedCount: number;
  /** Loadouts the current career score has opened, in picker order. Every class
   *  is issued from the first run, so this is always the full roster. */
  unlocked: LoadoutId[];
  bestByDifficulty: Array<{ id: DifficultyId; label: string; score: number; kills: number }>;
  /** Per-weapon service records, in picker order. */
  weapons: Array<{ id: LoadoutId; name: string; kind: string; record: WeaponRecord }>;
  /** Every badge, earned or not, with progress for the locked ones. */
  badges: BadgeStatus[];
  /** How many badges are earned, for a quick "3/9" line. */
  badgesEarned: number;
  /** Career eliminations per profile, for the threat dossier. */
  killsByKind: Record<BotKind, number>;
  /** How many runs each profile has ended, for the threat dossier. */
  deathsByKind: Record<BotKind, number>;
  /** Finished runs, newest first, for the account's recent-run list. */
  recentRuns: RunRecord[];
}

export interface RunResult {
  victory: boolean;
  /** Arena layout the run was played in. */
  arenaName: string;
  /** Won without taking a single point of damage: the rare badge. */
  perfect: boolean;
  stats: RunStats;
  score: ScoreBreakdown;
  grade: RunGrade;
  seedLabel: string;
  isBest: boolean;
  difficulty: DifficultyId;
  /** What landed the final blow, so the end screen can name it. */
  endedBy: BotKind | "unknown" | null;
  /** Eliminations per profile, used by the run summary. */
  killsByKind: Record<BotKind, number>;
  /** True when this run beat the best score previously recorded on this difficulty. */
  isDifficultyBest: boolean;
  /** Best score already stored for this difficulty before the run started. */
  previousBestScore: number;
}

export interface ArenaGameOptions {
  canvas: HTMLCanvasElement;
  onSnapshot?: (snapshot: GameSnapshot) => void;
  onFeed?: (line: FeedLine) => void;
  onRunEnd?: (result: RunResult) => void;
  difficulty?: DifficultyId;
  muted?: boolean;
  shakeEnabled?: boolean;
  aimMode?: AimMode;
}

interface Particle {
  position: Vec2;
  velocity: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  drag: number;
}

interface FloatingText {
  position: Vec2;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Pulse {
  position: Vec2;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

/** A scorch mark left where a round hit something; fades over a few seconds. */
interface Decal {
  position: Vec2;
  size: number;
  strength: number;
  /** Marks aimed at the floor fade faster than ones on a crate face. */
  onFloor: boolean;
}

/** A dust mote drifting through the room, for depth and atmosphere. */
interface Mote {
  position: Vec2;
  drift: Vec2;
  size: number;
  phase: number;
}

/** How many scorch marks are kept before the oldest is dropped. */
const MAX_DECALS = 90;

/** Per-difficulty bests, so recruit and veteran progress do not overwrite each other. */
type BestByDifficulty = Partial<Record<DifficultyId, { kills: number; score: number }>>;

/** One finished run, kept so the panel can show a small leaderboard. */
export interface RunRecord {
  seed: string;
  difficulty: DifficultyId;
  score: number;
  kills: number;
  victory: boolean;
  elapsed: number;
  /** Arena layout name, absent in records written before layouts existed. */
  arenaName?: string;
  /** Weapon used, absent in records written before loadouts existed. */
  weapon?: LoadoutId;
}

/** How many finished runs are remembered, and how many are shown. */
const HISTORY_LIMIT = 12;
const HISTORY_SHOWN = 3;
/** How many entries the account's recent-run list keeps. */
const RECENT_RUNS = 5;

const STORAGE = {
  bestKills: "lbs-best-kills",
  bestScore: "lbs-best-score",
  bestByDifficulty: "lbs-best-by-difficulty",
  history: "lbs-run-history",
  muted: "lbs-muted",
  difficulty: "lbs-difficulty",
  shake: "lbs-shake",
  touch: "lbs-touch",
  aim: "lbs-aim",
  loadout: "lbs-loadout",
  careerRuns: "lbs-career-runs",
  careerKills: "lbs-career-kills",
  careerBestCombo: "lbs-career-combo",
  careerWins: "lbs-career-wins",
  careerInterrupts: "lbs-career-interrupts",
  careerPerfect: "lbs-career-perfect",
  careerAccuracy: "lbs-career-accuracy",
  careerArenas: "lbs-career-arenas",
  careerLevels: "lbs-career-levels",
  weaponRecords: "lbs-weapon-records",
  careerKillsByKind: "lbs-career-kills-by-kind",
  careerDeathsByKind: "lbs-career-deaths-by-kind"
} as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Stand-in 2D context used when the canvas has none. Drawing disappears, but the
 * gradient objects still have to be callable so the render path cannot throw.
 */
function createNullRenderContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
  const target: Record<string, unknown> = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setLineDash: () => undefined,
    getLineDash: () => []
  };
  return new Proxy(target, {
    get(object, property: string) {
      if (property in object) return object[property];
      return () => undefined;
    },
    set(object, property: string, value: unknown) {
      object[property] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
}
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

/** Presentation + input shell around the deterministic simulation. */
export class ArenaGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly options: ArenaGameOptions;
  private readonly sound = new SoundEngine();
  private readonly keys = new Set<string>();
  private readonly eventController = new AbortController();

  private world: World;
  private input = { move: { x: 0, y: 0 }, aim: { x: WORLD.width / 2, y: WORLD.height / 2 }, firing: false, dash: false, aimMode: "mouse" as AimMode };
  private touchMove: Vec2 = { x: 0, y: 0 };
  private touchAim: Vec2 | null = null;
  private touchFiring = false;
  /** Space bar or left mouse button. Kept apart from touch so neither can latch the trigger. */
  private holdFiring = false;
  private rawAim: Vec2 = { x: WORLD.width / 2, y: WORLD.height / 4 };

  private readonly particles: Particle[] = [];
  private readonly texts: FloatingText[] = [];
  private readonly pulses: Pulse[] = [];
  private readonly dashTrail: Array<{ position: Vec2; life: number }> = [];

  private frameId = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private snapshotTimer = 0;
  private lastSnapshot = "";
  private feedId = 0;
  private lastFeedAt = 0;
  private flash = 0;
  private hitMarker = 0;
  private shake = 0;
  private shakeEnabled = true;
  private bannerTimer = 0;
  private waveBanner: { title: string; subtitle: string; hint?: string } = { title: "", subtitle: "" };

  private phase: SimPhase = "standby";
  private paused = false;
  private started = false;
  private debug = false;
  private hitStop = 0;
  private decals: Decal[] = [];
  private motes: Mote[] = [];
  private combo = 0;
  private comboTimer = 0;
  private lowHealthAlarm = 0;
  private simSteps = 0;
  private renderFaultReported = false;
  private fpsAverage = 60;
  private frameMsAverage = 16;
  private bestKills = 0;
  private bestScore = 0;
  private bestByDifficulty: BestByDifficulty = {};
  private careerRuns = 0;
  private careerKills = 0;
  private careerBestCombo = 0;
  private careerWins = 0;
  private careerInterrupts = 0;
  private careerPerfect = 0;
  private careerAccuracy = 0;
  private careerArenas: string[] = [];
  private careerLevels: string[] = [];
  private weaponRecords: WeaponRecords = emptyWeaponRecords();
  private careerKillsByKind: Record<BotKind, number> = emptyKindTotals();
  private careerDeathsByKind: Record<BotKind, number> = emptyKindTotals();
  private history: RunRecord[] = [];
  private killsByKind: Record<BotKind, number> = emptyKindTotals();
  private lastHitBy: BotKind | "unknown" | null = null;
  private background: HTMLCanvasElement | null = null;
  private backgroundScale = 0;
  private dpr = 1;
  private ro: ResizeObserver | null = null;
  private readonly onVisibility = () => {
    if (document.visibilityState === "hidden" && this.isRunning()) this.pause();
  };

  constructor(options: ArenaGameOptions) {
    this.options = options;
    this.canvas = options.canvas;
    // A 2D context is optional: the simulation, input and HUD must keep working
    // in environments without one (jsdom, or a browser that refused the context),
    // so a missing context degrades to a no-op renderer instead of a crash.
    this.ctx = this.canvas.getContext("2d", { alpha: false }) ?? createNullRenderContext(this.canvas);
    this.sound.setMuted(options.muted ?? this.readBool(STORAGE.muted, false));
    const prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.shakeEnabled = options.shakeEnabled ?? (prefersReducedMotion ? false : this.readBool(STORAGE.shake, true));
    // The aiming preference is a setting like any other: restore it unless the
    // caller (or a run code) asked for something specific.
    const storedAim = this.readString(STORAGE.aim);
    this.input.aimMode = options.aimMode ?? (storedAim === "assisted" ? "assisted" : "mouse");
    const storedDifficulty = this.readString(STORAGE.difficulty) as DifficultyId | null;
    const difficulty = options.difficulty ?? (storedDifficulty && storedDifficulty in DIFFICULTIES ? storedDifficulty : "standard");
    this.bestKills = this.readNumber(STORAGE.bestKills, 0);
    this.bestScore = this.readNumber(STORAGE.bestScore, 0);
    this.bestByDifficulty = this.readBests();
    this.careerRuns = this.readNumber(STORAGE.careerRuns, 0);
    this.careerKills = this.readNumber(STORAGE.careerKills, 0);
    this.careerBestCombo = this.readNumber(STORAGE.careerBestCombo, 0);
    this.careerWins = this.readNumber(STORAGE.careerWins, 0);
    this.careerInterrupts = this.readNumber(STORAGE.careerInterrupts, 0);
    this.careerPerfect = this.readNumber(STORAGE.careerPerfect, 0);
    this.careerAccuracy = this.readNumber(STORAGE.careerAccuracy, 0);
    this.careerArenas = this.readStringList(STORAGE.careerArenas);
    this.careerLevels = this.readStringList(STORAGE.careerLevels);
    this.weaponRecords = this.readWeaponRecords();
    this.careerKillsByKind = this.readKindTotals(STORAGE.careerKillsByKind);
    this.careerDeathsByKind = this.readKindTotals(STORAGE.careerDeathsByKind);
    this.history = this.readHistory();
    this.world = createWorld({ seed: createRandomSeed(), difficulty });
    this.applyLoadout();
    // The engine owns keyboard input, so it owns being focusable: without a
    // tabindex a click cannot focus the canvas and keys never arrive inside an
    // iframe. Authors can still supply their own tabindex.
    if (!this.canvas.hasAttribute("tabindex")) this.canvas.tabIndex = 0;
    this.resizeCanvas();
    this.bindEvents();
    this.render();
    this.emitSnapshot(true);
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    if (this.phase === "running" && !this.paused) return;
    this.sound.resume();
    if (this.phase !== "standby" && this.phase !== "running") {
      this.beginRun();
      return;
    }
    if (!this.started) {
      this.beginRun();
      return;
    }
    this.resumeRun();
  }

  /** Starts a brand new run, optionally with an explicit seed. */
  beginRun(seed?: number | string): void {
    this.sound.resume();
    resetWorld(this.world, { seed: seed ?? createRandomSeed(), difficulty: this.world.difficulty });
    // A restart is still the same run, so it keeps the weapon that was picked.
    this.applyLoadout();
    this.started = true;
    this.paused = false;
    this.phase = "running";
    this.particles.length = 0;
    this.texts.length = 0;
    this.pulses.length = 0;
    this.decals.length = 0;
    this.seedMotes();
    this.dashTrail.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.bannerTimer = 0;
    this.hitStop = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.lowHealthAlarm = 0;
    this.renderFaultReported = false;
    this.killsByKind = emptyKindTotals();
    this.lastHitBy = null;
    this.lastFrame = 0;
    this.pushFeed("Simulation online. Three hostile profiles inbound.", "info");
    this.pushFeed(
      `Seed ${formatSeed(this.world.seed)} · ${DIFFICULTIES[this.world.difficulty].label} · ${this.world.arenaName} arena.`,
      "info"
    );
    this.startLoop();
    this.emitSnapshot(true);
  }

  resumeRun(): void {
    if (this.phase !== "running") {
      this.beginRun();
      return;
    }
    this.sound.resume();
    this.paused = false;
    this.keys.clear();
    this.lastFrame = 0;
    this.pushFeed("Simulation resumed.", "info");
    this.startLoop();
    this.emitSnapshot(true);
  }

  pause(): void {
    if (!this.started || this.paused || this.phase !== "running") return;
    this.paused = true;
    cancelAnimationFrame(this.frameId);
    this.keys.clear();
    this.touchFiring = false;
    this.holdFiring = false;
    this.input.firing = false;
    this.input.dash = false;
    this.pushFeed("Simulation paused.", "warn");
    this.emitSnapshot(true);
  }

  togglePause(): void {
    if (!this.started || (this.phase !== "running" && this.phase !== "standby")) return;
    if (this.paused) this.resumeRun();
    else this.pause();
  }

  destroy(): void {
    cancelAnimationFrame(this.frameId);
    this.holdFiring = false;
    this.touchFiring = false;
    this.eventController.abort();
    this.ro?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.keys.clear();
    this.paused = true;
  }

  get isStarted(): boolean {
    return this.started;
  }

  get currentPhase(): SimPhase {
    return this.phase;
  }

  get activeWorld(): World {
    return this.world;
  }

  private isRunning(): boolean {
    return this.phase === "running" && !this.paused;
  }

  // ------------------------------------------------------------------ settings

  setDifficulty(difficulty: DifficultyId): void {
    this.world.difficulty = difficulty;
    this.write(STORAGE.difficulty, difficulty);
    this.pushFeed(`Difficulty set to ${DIFFICULTIES[difficulty].label}.`, "info");
    this.emitSnapshot(true);
  }

  /** Career score across all threat levels, which is what unlocks loadouts. */
  getCareerScore(): number {
    return careerScore(this.bestByDifficulty);
  }

  getLoadoutId(): LoadoutId {
    return this.world.loadout.id;
  }

  /** Equips a weapon. Locked or unknown ids resolve to the default. */
  setLoadout(id: unknown): void {
    const career = this.getCareerScore();
    const resolved = resolveLoadout(id, career);
    this.world.loadout = LOADOUTS[resolved];
    this.write(STORAGE.loadout, resolved);
    this.emitSnapshot(true);
  }

  /** Applies the stored weapon to the current world (used on run start). */
  private applyLoadout(): void {
    const stored = this.readString(STORAGE.loadout);
    const career = this.getCareerScore();
    const resolved = isLoadoutId(stored) && isUnlocked(stored, career) ? stored : resolveLoadout(stored, career);
    setWorldLoadout(this.world, resolved, Number.POSITIVE_INFINITY);
  }

  /** The state every badge is judged against. */
  private badgeContext(): BadgeContext {
    return {
      runs: this.careerRuns,
      kills: this.careerKills,
      careerScore: this.getCareerScore(),
      bestCombo: this.careerBestCombo,
      interrupts: this.careerInterrupts,
      perfectVictories: this.careerPerfect,
      victories: this.careerWins,
      unlocks: unlockedLoadouts(this.getCareerScore()).length,
      // Every class is issued, so the shelf measures what has actually been
      // flown rather than what has been bought.
      classesFlown: this.weaponRecords
        ? LOADOUT_ORDER.filter((id) => (this.weaponRecords?.[id]?.runs ?? 0) > 0).length
        : 0,
      arenasCleared: [...this.careerArenas],
      levelsCleared: [...this.careerLevels],
      bestAccuracy: this.careerAccuracy
    };
  }

  /** Everything the profile screen needs, in one object. */
  getCareer(): CareerSummary {
    const score = this.getCareerScore();
    const rank = rankFor(score);
    const upcoming = nextRank(score);
    const badges = badgeStatuses(this.badgeContext());
    return {
      score,
      runs: this.careerRuns,
      kills: this.careerKills,
      bestCombo: this.careerBestCombo,
      rank: { name: rank.name, insignia: rank.insignia, threshold: rank.threshold },
      nextRank: upcoming ? { name: upcoming.name, insignia: upcoming.insignia, threshold: upcoming.threshold } : null,
      rankProgress: upcoming
        ? clamp((score - rank.threshold) / Math.max(1, upcoming.threshold - rank.threshold), 0, 1)
        : 1,
      levelsClearedCount: this.careerLevels.length,
      unlocked: LOADOUT_ORDER.filter((id) => isUnlocked(id, score)),
      bestByDifficulty: (Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => ({
        id,
        label: DIFFICULTIES[id].label,
        score: this.bestByDifficulty[id]?.score ?? 0,
        kills: this.bestByDifficulty[id]?.kills ?? 0
      })),
      weapons: LOADOUT_ORDER.map((id) => ({
        id,
        name: LOADOUTS[id].name,
        kind: LOADOUTS[id].kind,
        record: { ...this.weaponRecords[id] }
      })),
      badges,
      badgesEarned: badges.filter((badge) => badge.earned).length,
      killsByKind: { ...this.careerKillsByKind },
      deathsByKind: { ...this.careerDeathsByKind },
      recentRuns: [...this.history].slice(-RECENT_RUNS).reverse()
    };
  }

  setMuted(muted: boolean): void {
    this.sound.setMuted(muted);
    this.write(STORAGE.muted, String(muted));
  }

  isMuted(): boolean {
    return this.sound.isMuted;
  }

  setShakeEnabled(enabled: boolean): void {
    this.shakeEnabled = enabled;
    this.write(STORAGE.shake, String(enabled));
    if (!enabled) this.flash = 0;
    this.emitSnapshot(true);
  }

  isShakeEnabled(): boolean {
    return this.shakeEnabled;
  }

  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  toggleDebug(): void {
    this.debug = !this.debug;
  }

  isDebug(): boolean {
    return this.debug;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getSeedLabel(): string {
    return formatSeed(this.world.seed);
  }

  setAimMode(mode: AimMode): void {
    if (this.input.aimMode === mode) return;
    this.input.aimMode = mode;
    this.write(STORAGE.aim, mode);
    this.emitSnapshot(true);
  }

  getAimMode(): AimMode {
    return this.input.aimMode;
  }

  /** Called by the React layer whenever touch controls move. */
  setTouchMovement(stick: Vec2): void {
    this.touchMove = stick;
  }

  setTouchFiring(firing: boolean): void {
    this.touchFiring = firing;
    if (firing) this.sound.resume();
  }

  /** Touch aiming: the player drags a point on the arena. */
  setTouchAim(point: Vec2 | null): void {
    this.touchAim = point;
    if (point) {
      this.rawAim = point;
      if (this.input.aimMode === "assisted") return;
    }
  }

  queueDash(): void {
    this.sound.resume();
    this.input.dash = true;
  }

  // -------------------------------------------------------------------- events

  private bindEvents(): void {
    const options = { signal: this.eventController.signal };
    window.addEventListener(
      "keydown",
      (event) => {
        // Typing a seed must never fire, dash, mute, or restart the game.
        if (isEditableTarget(event.target)) return;
        const key = event.key.toLowerCase();
        if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
        if (event.repeat && key !== " ") {
          this.keys.add(key);
          return;
        }
        this.keys.add(key);
        this.sound.resume();
        if (key === "escape") this.togglePause();
        if (key === " ") this.holdFiring = true;
        if (key === "shift") this.input.dash = true;
        if (key === "r" && this.started) this.beginRun(event.shiftKey ? this.world.seed : undefined);
        if (key === "m") this.setMuted(!this.sound.isMuted);
        if (key === "f3") {
          event.preventDefault();
          this.toggleDebug();
        }
      },
      options
    );
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      if (key === " ") this.holdFiring = false;
    }, options);
    // Releasing outside the canvas must never leave the trigger held.
    window.addEventListener("pointerup", () => { this.holdFiring = false; }, options);
    window.addEventListener("pointercancel", () => { this.holdFiring = false; }, options);
    this.canvas.addEventListener("pointermove", (event) => {
      this.rawAim = this.pointerToWorld(event.clientX, event.clientY);
      if (this.input.aimMode !== "assisted") this.input.aim = this.rawAim;
      if (event.pointerType === "touch") this.touchAim = this.rawAim;
    }, options);
    this.canvas.addEventListener(
      "pointerdown",
      (event) => {
        this.sound.resume();
        // Taking focus on click keeps the keyboard working when the game runs
        // inside an iframe, where key events only reach the focused document.
        this.canvas.focus({ preventScroll: true });
        this.rawAim = this.pointerToWorld(event.clientX, event.clientY);
        this.input.aim = this.rawAim;
        if (event.button === 0 && event.pointerType !== "touch") this.holdFiring = true;
      },
      options
    );
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault(), options);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.holdFiring = false;
      this.input.firing = false;
      this.input.move = { x: 0, y: 0 };
      this.touchMove = { x: 0, y: 0 };
      if (this.isRunning()) this.pause();
    }, options);

    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resizeCanvas());
      this.ro.observe(this.canvas);
    }
    window.addEventListener("resize", () => this.resizeCanvas(), options);
  }

  private pointerToWorld(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return screenToWorld(clientX, clientY, { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, WORLD);
  }

  /** Keeps the backing store crisp on high-DPI displays without changing world scale. */
  private resizeCanvas(): void {
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const targetWidth = Math.round(WORLD.width * ratio);
    const targetHeight = Math.round(WORLD.height * ratio);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
      this.background = null;
    }
    this.dpr = ratio;
  }

  // ---------------------------------------------------------------------- loop

  private startLoop(): void {
    cancelAnimationFrame(this.frameId);
    this.lastFrame = 0;
    this.accumulator = 0;
    this.frameId = requestAnimationFrame(this.loop);
  }

  /**
   * Fixed 120 Hz simulation steps with a capped catch-up, so AI timing and
   * habit sampling are identical on a 60 Hz laptop and a 144 Hz monitor.
   */
  private loop = (now: number): void => {
    if (!this.isRunning()) return;
    // The first frame of a run starts with a zero delta, so a clock mismatch
    // between performance.now() and the animation frame timestamp can never
    // make the opening frame lurch.
    const frameTime = this.lastFrame === 0 ? 0 : Math.min(0.25, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.accumulator = Math.min(this.accumulator + frameTime, 0.25);
    this.fpsAverage = this.fpsAverage * 0.9 + (frameTime > 0 ? 1 / frameTime : 60) * 0.1;
    this.frameMsAverage = this.frameMsAverage * 0.9 + frameTime * 1000 * 0.1;

    // Hit-stop: a few frames of impact freeze makes eliminations land harder.
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - frameTime);
      this.accumulator = 0;
    }

    const step = 1 / 120;
    let steps = 0;
    try {
      while (this.accumulator >= step && steps < 12) {
        this.simulate(step);
        this.accumulator -= step;
        steps += 1;
        if (!this.isRunning()) break;
      }
      if (steps === 0 && this.accumulator > 0 && this.hitStop <= 0) {
        this.simulate(Math.min(this.accumulator, step));
        this.accumulator = 0;
      }
    } catch (error) {
      // A throwing frame would otherwise repeat 60 times a second and bury the
      // cause. Stop the loop so the failure surfaces once, in the console.
      this.pause();
      throw error;
    }
    this.simSteps = this.simSteps * 0.9 + steps * 0.1;
    this.comboTimer = Math.max(0, this.comboTimer - frameTime);
    if (this.comboTimer <= 0) this.combo = 0;

    this.updateEffects(frameTime);
    this.render();
    this.snapshotTimer += frameTime;
    if (this.snapshotTimer >= 0.1) {
      this.snapshotTimer = 0;
      this.emitSnapshot(false);
    }
    if (this.isRunning()) this.frameId = requestAnimationFrame(this.loop);
  };

  private simulate(dt: number): void {
    const keyboard = keyboardMoveVector(this.keys);
    this.input.move = mergeMoveInputs(keyboard, this.touchMove);
    this.input.firing = this.holdFiring || this.touchFiring;
    this.input.aim = this.touchAim ?? this.rawAim;

    const events = stepWorld(this.world, this.input, dt);
    if (events.length > 0) this.handleEvents(events);
    this.input.dash = false;

    // Keep the simulation's phase in sync with the engine's presentation state.
    if (this.world.phase !== this.phase) {
      if (this.world.phase === "victory" || this.world.phase === "defeat") this.finishRun(this.world.phase);
      else this.phase = this.world.phase;
    }
  }

  // ------------------------------------------------------------------- effects

  /**
   * Scorch marks make the room remember the fight: rounds leave a stain where
   * they land, floors fade faster than crate faces, and the oldest is dropped so
   * a long run cannot accumulate without bound.
   */
  private spawnDecal(position: Vec2, size: number, owner: "player" | "bot"): void {
    const onFloor = !this.world.obstacles.some(
      (block) =>
        position.x > block.x && position.x < block.x + block.w && position.y > block.y && position.y < block.y + block.h
    );
    this.decals.push({
      position: { ...position },
      size: size * (owner === "player" ? 1 : 0.85),
      strength: 0.5,
      onFloor
    });
    if (this.decals.length > MAX_DECALS) this.decals.splice(0, this.decals.length - MAX_DECALS);
  }

  /** Ambient dust, seeded once per run so it drifts the same way every replay. */
  private seedMotes(): void {
    const rng = createRng(`motes-${this.world.seed}`);
    this.motes = [];
    for (let i = 0; i < 46; i += 1) {
      this.motes.push({
        position: { x: rng.range(20, WORLD.width - 20), y: rng.range(20, WORLD.height - 20) },
        drift: { x: rng.range(-5, 5), y: rng.range(-3.4, 1.6) },
        size: rng.range(0.7, 1.9),
        phase: rng.range(0, Math.PI * 2)
      });
    }
  }

  private handleEvents(events: ReturnType<typeof stepWorld>): void {
    for (const event of events) {
      switch (event.type) {
        case "player-fired": {
          this.burst(event.position, "#e8dcc0", 2, 0.16, 90);
          this.playSound("player-shot");
          break;
        }
        case "player-dash": {
          this.dashTrail.push({ position: { ...event.from }, life: 0.28 });
          this.dashTrail.push({ position: { ...event.to }, life: 0.34 });
          this.burst(event.to, "#cfa25f", 12, 0.32, 150);
          this.pulses.push({ position: { ...event.to }, radius: PLAYER_RADIUS, life: 0.32, maxLife: 0.32, color: "#cfa25f" });
          this.playSound("dash");
          if (event.blocked) this.pushFeed("Dash cut short by arena plating.", "warn");
          break;
        }
        case "player-hit": {
          this.lastHitBy = event.source;
          this.spawnDecal(event.position, 6, "player");
          // Calm mode: with screen shake switched off the player has asked for
          // less motion, so the full-screen damage flash stays off too.
          if (this.shakeEnabled) this.flash = Math.max(this.flash, 0.55);
          this.shake = Math.max(this.shake, 9);
          if (this.shakeEnabled) this.hitStop = Math.max(this.hitStop, 0.07);
          this.burst(event.position, "#c9695a", 10, 0.4, 170);
          this.burst(this.world.player.position, "#c9695a", 6, 0.36, 120);
          this.pulses.push({ position: { ...this.world.player.position }, radius: PLAYER_RADIUS + 4, life: 0.34, maxLife: 0.34, color: "#c9695a" });
          this.texts.push({
            position: { x: this.world.player.position.x, y: this.world.player.position.y - 22 },
            text: `-${event.amount}%`,
            life: 0.7,
            maxLife: 0.7,
            color: "#d98a78",
            size: 12
          });
          this.playSound("damage");
          const label = event.source === "unknown" ? "Unknown fire" : BOT_PROFILES[event.source].name.replace("THE ", "");
          this.pushFeed(`${label} hit you for ${event.amount}%.`, "bad");
          break;
        }
        case "player-dodged": {
          // A round that passed through during i-frames: say so, because it is
          // the hardest thing the player can read and time correctly.
          this.texts.push({
            position: { x: this.world.player.position.x, y: this.world.player.position.y - 26 },
            text: "DODGE",
            life: 0.55,
            maxLife: 0.55,
            color: "#e8dcc0",
            size: 11
          });
          this.pulses.push({ position: { ...this.world.player.position }, radius: PLAYER_RADIUS + 6, life: 0.28, maxLife: 0.28, color: "#e8dcc0" });
          this.playSound("dash", 0.4);
          break;
        }
        case "bot-windup": {
          this.playSound("telegraph", 0.6);
          break;
        }
        case "bot-windup-cancel": {
          break;
        }
        case "bot-dive": {
          // A committed dive leaves a streak and a puff, so a Flanker crossing
          // the room reads as a decision rather than a teleport.
          this.dashTrail.push({ position: { ...event.position }, life: 0.3 });
          this.dashTrail.push({
            position: { x: event.position.x + event.direction.x * 26, y: event.position.y + event.direction.y * 26 },
            life: 0.36
          });
          this.burst(event.position, BOT_PROFILES[event.kind].color, 10, 0.3, 150);
          this.playSound("dive", 0.9, PROFILE_PITCH[event.kind]);
          break;
        }
        case "arena-pressure": {
          this.pushFeed("THE ARENA IS TIGHTENING — HOSTILES CLOSING FASTER.", "warn");
          this.shake = Math.max(this.shake, 3);
          break;
        }
        case "bot-fired": {
          // A spray is many rounds a second: one small puff each, and only
          // every other round gets a cue so the mix does not turn to mud.
          const spray = attackFor(event.kind).spray !== undefined;
          this.burst(event.position, BOT_PROFILES[event.kind].color, spray ? 1 : 3, spray ? 0.12 : 0.2, spray ? 60 : 100);
          if (!spray || Math.floor(this.world.elapsed * 6) % 2 === 0) {
            this.playSound("bot-shot", spray ? 0.7 : 1, PROFILE_PITCH[event.kind]);
          }
          break;
        }
        case "bot-blocked": {
          // Rounds stop dead on a raised shield: sparks, a chime, and a word.
          this.burst(event.position, "#b9c2cc", 6, 0.2, 120);
          this.texts.push({
            position: { ...event.position },
            text: "BLOCKED",
            life: 0.4,
            maxLife: 0.4,
            color: "#cfd6de",
            size: 9
          });
          this.playSound("impact", 0.7, 1.35);
          break;
        }
        case "bot-charge": {
          this.dashTrail.push({ position: { ...event.from }, life: 0.34 });
          this.burst(event.from, BOT_PROFILES[event.kind].color, 8, 0.26, 160);
          this.pushFeed("A RAM IS COMMITTED — BREAK THE LANE.", "warn");
          this.playSound("dive", 1, PROFILE_PITCH[event.kind]);
          break;
        }
        case "bot-stunned": {
          // A failed charge leaves it wide open: the feedback says so loudly.
          this.texts.push({
            position: { x: event.position.x, y: event.position.y - 26 },
            text: "STAGGERED",
            life: 0.7,
            maxLife: 0.7,
            color: "#f0c088",
            size: 11
          });
          this.burst(event.position, "#c9a15a", 12, 0.4, 120);
          this.pulses.push({ position: { ...event.position }, life: 0.4, maxLife: 0.4, radius: 30, color: "#c9a15a" });
          this.playSound("impact", 0.9, 0.7);
          break;
        }
        case "bot-split": {
          this.pushFeed("THE SWARM CELL CAME APART — TWO SHARDS.", "warn");
          this.burst(event.position, BOT_PROFILES[event.kind].color, 14, 0.4, 150);
          this.pulses.push({ position: { ...event.position }, life: 0.5, maxLife: 0.5, radius: 40, color: BOT_PROFILES[event.kind].color });
          this.playSound("spawn", 0.6, PROFILE_PITCH[event.kind]);
          break;
        }
        case "shell-launched": {
          this.burst(event.from, BOT_PROFILES[event.kind].color, 6, 0.3, 110);
          this.playSound("bot-shot", 0.9, PROFILE_PITCH[event.kind]);
          break;
        }
        case "shell-landed": {
          // The burst is the warning made good: dust, a ring, and a hard shake.
          this.burst(event.position, "#d8c9a6", 18, 0.45, 190);
          this.pulses.push({ position: { ...event.position }, life: 0.45, maxLife: 0.45, radius: event.radius, color: "#d8c9a6" });
          this.spawnDecal(event.position, event.radius * 0.45, "bot");
          this.shake = Math.max(this.shake, 7);
          this.playSound("impact", 1, 0.62);
          break;
        }
        case "bot-hit": {
          this.hitMarker = 0.16;
          this.spawnDecal(event.position, 4.5, "bot");
          // A plated hit answers with sparks off steel instead of a clean bite.
          this.burst(event.position, event.plated ? "#b9c2cc" : "#ffffff", event.plated ? 8 : 5, 0.22, 140);
          if (event.plated) {
            this.texts.push({
              position: { ...event.position },
              text: "PLATED",
              life: 0.4,
              maxLife: 0.4,
              color: "#cfd6de",
              size: 9
            });
          }
          this.texts.push({
            position: { ...event.position },
            text: String(event.amount),
            life: 0.55,
            maxLife: 0.55,
            color: "#d8f7ff",
            size: 10
          });
          this.playSound("impact");
          break;
        }
        case "bot-eliminated": {
          this.killsByKind[event.kind] += 1;
          if (event.interrupted) {
            this.texts.push({
              position: { x: event.position.x, y: event.position.y - 18 },
              text: "CUT!",
              life: 0.6,
              maxLife: 0.6,
              color: "#cfa25f",
              size: 12
            });
          }
          this.burst(event.position, BOT_PROFILES[event.kind].color, 26, 0.55, 210);
          this.pulses.push({ position: { ...event.position }, radius: 8, life: 0.5, maxLife: 0.5, color: BOT_PROFILES[event.kind].color });
          this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
          this.comboTimer = 2.2;
          if (this.shakeEnabled) this.hitStop = Math.max(this.hitStop, 0.055);
          this.texts.push({
            position: { ...event.position },
            text: this.combo > 1 ? `ELIMINATED ×${this.combo}` : "ELIMINATED",
            life: 0.9,
            maxLife: 0.9,
            color: BOT_PROFILES[event.kind].color,
            size: this.combo > 1 ? 12 : 11
          });
          this.shake = Math.max(this.shake, 5);
          this.playSound("elimination");
          this.pushFeed(
            `${BOT_PROFILES[event.kind].name} eliminated${event.interrupted ? " mid-wind-up" : ""}${this.combo > 1 ? ` (×${this.combo} chain)` : ""}.${event.heals > 0 ? ` +${event.heals}% integrity.` : ""}`,
            event.interrupted ? "warn" : "good"
          );
          break;
        }
        case "spawn-warning": {
          this.pulses.push({ position: { ...event.position }, radius: 6, life: 0.7, maxLife: 0.7, color: BOT_PROFILES[event.kind].color });
          this.playSound("telegraph", 0.5, PROFILE_PITCH[event.kind]);
          break;
        }
        case "bot-spawned": {
          this.burst(event.position, BOT_PROFILES[event.kind].color, 14, 0.4, 160);
          this.pulses.push({ position: { ...event.position }, radius: BOT_RADIUS, life: 0.42, maxLife: 0.42, color: BOT_PROFILES[event.kind].color });
          this.playSound("spawn", 0.8, PROFILE_PITCH[event.kind]);
          break;
        }
        case "wave-start": {
          this.waveBanner = {
            title: `THREAT LEVEL ${String(event.wave).padStart(2, "0")}`,
            subtitle: getWaveBriefing(event.wave),
            hint: getWaveHint(event.wave)
          };
          this.bannerTimer = 2.4;
          this.playSound("wave-incoming");
          this.pushFeed(`Threat level ${String(event.wave).padStart(2, "0")} incoming: ${getWaveBriefing(event.wave)}.`, "warn");
          break;
        }
        case "wave-cleared": {
          this.pushFeed(`Threat level ${String(event.wave).padStart(2, "0")} cleared.`, "good");
          break;
        }
        case "victory":
        case "defeat": {
          break;
        }
        default:
          break;
      }
    }
  }

  private finishRun(result: "victory" | "defeat"): void {
    this.phase = result;
    cancelAnimationFrame(this.frameId);
    const stats = { ...this.world.stats };
    const difficulty = this.world.difficulty;
    const score = computeScore(stats);
    const isBest = score.total > this.bestScore;
    if (score.total > this.bestScore) {
      this.bestScore = score.total;
      this.write(STORAGE.bestScore, String(this.bestScore));
    }
    if (stats.kills > this.bestKills) {
      this.bestKills = stats.kills;
      this.write(STORAGE.bestKills, String(this.bestKills));
    }
    const previousOnDifficulty = this.bestByDifficulty[difficulty] ?? { kills: 0, score: 0 };
    const isDifficultyBest = score.total > previousOnDifficulty.score;
    this.bestByDifficulty = {
      ...this.bestByDifficulty,
      [difficulty]: {
        kills: Math.max(previousOnDifficulty.kills, stats.kills),
        score: Math.max(previousOnDifficulty.score, score.total)
      }
    };
    this.write(STORAGE.bestByDifficulty, JSON.stringify(this.bestByDifficulty));
    this.history = [
      ...this.history,
      {
        seed: formatSeed(this.world.seed),
        difficulty,
        score: score.total,
        kills: stats.kills,
        victory: result === "victory",
        elapsed: stats.elapsed,
        arenaName: this.world.arenaName,
        weapon: this.world.loadout.id
      }
    ].slice(-HISTORY_LIMIT);
    this.write(STORAGE.history, JSON.stringify(this.history));
    // Career totals feed the profile screen and the unlock ladder.
    this.careerRuns += 1;
    this.careerKills += stats.kills;
    this.careerBestCombo = Math.max(this.careerBestCombo, this.combo);
    const won = result === "victory";
    if (won) this.careerWins += 1;
    this.careerInterrupts += stats.interrupts;
    if (won && stats.damageTaken === 0) this.careerPerfect += 1;
    const accuracy = stats.shotsFired > 0 ? (stats.shotsHit / stats.shotsFired) * 100 : 0;
    this.careerAccuracy = Math.max(this.careerAccuracy, accuracy);
    if (won && !this.careerArenas.includes(this.world.arenaName)) this.careerArenas.push(this.world.arenaName);
    if (won && !this.careerLevels.includes(this.world.difficulty)) this.careerLevels.push(this.world.difficulty);
    // Per-weapon service record, so the profile can say what each gun has done.
    const weaponId = this.world.loadout.id;
    recordRun(this.weaponRecords[weaponId], { kills: stats.kills, score: score.total, victory: won });
    this.write(STORAGE.careerRuns, String(this.careerRuns));
    this.write(STORAGE.careerKills, String(this.careerKills));
    this.write(STORAGE.careerBestCombo, String(this.careerBestCombo));
    this.write(STORAGE.careerWins, String(this.careerWins));
    this.write(STORAGE.careerInterrupts, String(this.careerInterrupts));
    this.write(STORAGE.careerPerfect, String(this.careerPerfect));
    this.write(STORAGE.careerAccuracy, String(Math.round(this.careerAccuracy * 10) / 10));
    this.write(STORAGE.careerArenas, JSON.stringify(this.careerArenas));
    this.write(STORAGE.careerLevels, JSON.stringify(this.careerLevels));
    this.write(STORAGE.weaponRecords, JSON.stringify(this.weaponRecords));
    for (const kind of BOT_KINDS) {
      this.careerKillsByKind[kind] += this.killsByKind[kind];
    }
    const runKiller = result === "defeat" ? this.lastHitBy : null;
    if (runKiller && runKiller !== "unknown") this.careerDeathsByKind[runKiller] += 1;
    this.write(STORAGE.careerKillsByKind, JSON.stringify(this.careerKillsByKind));
    this.write(STORAGE.careerDeathsByKind, JSON.stringify(this.careerDeathsByKind));
    this.playSound(result === "victory" ? "victory" : "defeat");
    this.shake = Math.max(this.shake, result === "victory" ? 6 : 13);
    const endedBy = result === "defeat" ? this.lastHitBy : null;
    const killer = endedBy && endedBy !== "unknown" ? BOT_PROFILES[endedBy].name : null;
    this.pushFeed(
      result === "victory"
        ? `Arena conquered with score ${score.total}.`
        : `Run terminated${killer ? ` by ${killer.toLowerCase()}` : ""}. Score ${score.total}.`,
      result === "victory" ? "good" : "bad"
    );
    this.options.onRunEnd?.({
      victory: result === "victory",
      stats,
      score,
      grade: gradeRun(score.total),
      seedLabel: formatSeed(this.world.seed),
      isBest,
      difficulty,
      endedBy,
      killsByKind: { ...this.killsByKind },
      isDifficultyBest,
      previousBestScore: previousOnDifficulty.score,
      perfect: result === "victory" && stats.damageTaken === 0,
      arenaName: this.world.arenaName
    });
    this.emitSnapshot(true);
  }

  private playSound(name: SoundName, intensity = 1, pitch = 1): void {
    this.sound.play(name, intensity, pitch);
  }

  private burst(position: Vec2, color: string, count: number, life = 0.4, speed = 150): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = randomBetween(speed * 0.25, speed);
      const duration = randomBetween(life * 0.4, life);
      this.particles.push({
        position: { ...position },
        velocity: { x: Math.cos(angle) * velocity, y: Math.sin(angle) * velocity },
        life: duration,
        maxLife: duration,
        color,
        size: randomBetween(1.4, 3.2),
        drag: 0.94
      });
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  private updateEffects(dt: number): void {
    // Scorch marks fade out slowly, slower on a vertical face than on the floor.
    for (let i = this.decals.length - 1; i >= 0; i -= 1) {
      const decal = this.decals[i];
      decal.strength -= dt * (decal.onFloor ? 0.055 : 0.035);
      if (decal.strength <= 0) this.decals.splice(i, 1);
    }
    // Dust never stops moving; it just wraps around the room.
    for (const mote of this.motes) {
      mote.position.x += mote.drift.x * dt;
      mote.position.y += mote.drift.y * dt;
      if (mote.position.x < 8) mote.position.x = WORLD.width - 8;
      if (mote.position.x > WORLD.width - 8) mote.position.x = 8;
      if (mote.position.y < 8) mote.position.y = WORLD.height - 8;
      if (mote.position.y > WORLD.height - 8) mote.position.y = 8;
    }

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.velocity.x *= particle.drag;
      particle.velocity.y *= particle.drag;
      particle.life -= dt;
      if (particle.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const text = this.texts[i];
      text.life -= dt;
      text.position.y -= 26 * dt;
      if (text.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      this.pulses[i].life -= dt;
      if (this.pulses[i].life <= 0) this.pulses.splice(i, 1);
    }
    for (let i = this.dashTrail.length - 1; i >= 0; i -= 1) {
      this.dashTrail[i].life -= dt;
      if (this.dashTrail[i].life <= 0) this.dashTrail.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 2.1);
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);

    // Audible tension cue when integrity is critical.
    const healthFraction = this.world.player.health / Math.max(1, this.world.player.maxHealth);
    this.lowHealthAlarm = Math.max(0, this.lowHealthAlarm - dt);
    if (healthFraction > 0 && healthFraction < 0.34 && this.lowHealthAlarm <= 0 && this.phase === "running" && !this.paused) {
      this.lowHealthAlarm = 1.6;
      this.playSound("telegraph", 0.5);
    }
  }

  // ---------------------------------------------------------------------- feed

  private pushFeed(text: string, tone: FeedLine["tone"]): void {
    const now = performance.now();
    if (now - this.lastFeedAt < 90 && tone === "info") return;
    this.lastFeedAt = now;
    this.feedId += 1;
    this.options.onFeed?.({ id: this.feedId, time: formatDuration(this.world.elapsed), text, tone });
  }

  // ------------------------------------------------------------------ snapshot

  private emitSnapshot(force: boolean): void {
    const snapshot = this.buildSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === this.lastSnapshot) return;
    this.lastSnapshot = signature;
    this.options.onSnapshot?.(snapshot);
  }

  private buildSnapshot(): GameSnapshot {
    const world = this.world;
    const difficulty = DIFFICULTIES[world.difficulty];
    const liveKinds: Record<BotKind, number> = emptyKindTotals();
    for (const bot of world.bots) if (bot.alive) liveKinds[bot.kind] += 1;
    const hostileCount = liveKinds.hunter + liveKinds.flanker + liveKinds.mirror;
    return {
      phase: this.phase,
      started: this.started,
      paused: this.paused,
      fps: Math.round(this.fpsAverage),
      frameMs: Math.round(this.frameMsAverage * 10) / 10,
      hitStop: this.hitStop,
      flash: this.flash,
      shakeEnabled: this.shakeEnabled,
      combo: this.comboTimer > 0 ? this.combo : 0,
      wave: world.wave,
      maxWave: MAX_WAVES,
      waveState: world.waveState,
      waveTimer: Math.max(0, world.waveTimer),
      briefing: getWaveBriefing(Math.max(1, world.wave)),
      hint: getWaveHint(Math.max(1, world.wave)),
      arenaName: world.arenaName,
      loadout: world.loadout.id,
      career: this.getCareer(),
      health: Math.round(world.player.health),
      maxHealth: world.player.maxHealth || PLAYER_MAX_HEALTH,
      kills: world.stats.kills,
      score: computeScore(world.stats).total,
      bestScore: Math.max(this.bestScore, computeScore(world.stats).total),
      bestKills: Math.max(this.bestKills, world.stats.kills),
      stats: { ...world.stats, elapsed: world.elapsed },
      dashCharge: dashChargeFraction(world.player.dashCooldown, Math.max(difficulty.dashCooldown, world.loadout.dashCooldown)),
      focus: clamp(world.player.focusTime / FOCUS_WINDOW, 0, 1),
      focusReady: world.loadout.trait === "focus" && world.player.focusTime >= FOCUS_WINDOW,
      phaseTime: world.player.phaseTime,
      predictability: playerPredictability(world),
      seedLabel: formatSeed(world.seed),
      difficulty: world.difficulty,
      liveKinds,
      hostileCount,
      invulnerable: world.player.invulnerability > 0,
      assistTarget: world.assistTargetId !== null,
      difficultyBestScore: this.bestByDifficulty[world.difficulty]?.score ?? 0,
      difficultyBestKills: this.bestByDifficulty[world.difficulty]?.kills ?? 0,
      mirrorRead: world.mirrorRead ? { ...world.mirrorRead } : null,
      mirrorEcho: liveKinds.mirror > 0 ? volleyFor("mirror", this.world.loadout.id).label : null,
      pressure: world.pressure,
      topRuns: this.topRuns()
    };
  }

  private readNumber(key: string, fallback: number): number {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
      return fallback;
    }
  }

  private readBool(key: string, fallback: boolean): boolean {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === "true";
    } catch {
      return fallback;
    }
  }

  /** Highest scoring finished runs, newest wins ties. */
  private topRuns(): RunRecord[] {
    return [...this.history].sort((left, right) => right.score - left.score).slice(0, HISTORY_SHOWN);
  }

  /** Reads the run history, dropping anything that is not a well formed record. */
  private readHistory(): RunRecord[] {
    const raw = this.readString(STORAGE.history);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const records: RunRecord[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Partial<RunRecord>;
        const score = Number(record.score);
        const kills = Number(record.kills);
        const elapsed = Number(record.elapsed);
        const difficulty = record.difficulty;
        if (typeof record.seed !== "string" || typeof difficulty !== "string" || !(difficulty in DIFFICULTIES)) continue;
        if (!Number.isFinite(score) || !Number.isFinite(kills)) continue;
        records.push({
          seed: record.seed,
          difficulty: difficulty as DifficultyId,
          score: Math.max(0, Math.round(score)),
          kills: Math.max(0, Math.round(kills)),
          victory: record.victory === true,
          elapsed: Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0,
          // Records written before layouts existed simply have no arena.
          ...(typeof record.arenaName === "string" ? { arenaName: record.arenaName } : {})
        });
      }
      return records.slice(-HISTORY_LIMIT);
    } catch {
      return [];
    }
  }

  /** Reads a stored list of short labels, ignoring anything malformed. */
  private readStringList(key: string): string[] {
    const raw = this.readString(key);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0).slice(0, 24);
    } catch {
      return [];
    }
  }

  /** Reads a stored per-profile total, ignoring junk and clamping to sane values. */
  private readKindTotals(key: string): Record<BotKind, number> {
    const totals: Record<BotKind, number> = emptyKindTotals();
    const raw = this.readString(key);
    if (!raw) return totals;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return totals;
      for (const kind of BOT_KINDS) {
        const value = Number((parsed as Record<string, unknown>)[kind]);
        totals[kind] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
      }
      return totals;
    } catch {
      return totals;
    }
  }

  /** Reads per-weapon service records, dropping anything that is not a record. */
  private readWeaponRecords(): WeaponRecords {
    const records = emptyWeaponRecords();
    const raw = this.readString(STORAGE.weaponRecords);
    if (!raw) return records;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return records;
      for (const id of LOADOUT_ORDER) {
        const entry = (parsed as Record<string, unknown>)[id];
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Partial<WeaponRecord>;
        const runs = Number(record.runs);
        const kills = Number(record.kills);
        const bestScore = Number(record.bestScore);
        const victories = Number(record.victories);
        records[id] = {
          runs: Number.isFinite(runs) && runs > 0 ? Math.round(runs) : 0,
          kills: Number.isFinite(kills) && kills > 0 ? Math.round(kills) : 0,
          bestScore: Number.isFinite(bestScore) && bestScore > 0 ? Math.round(bestScore) : 0,
          victories: Number.isFinite(victories) && victories > 0 ? Math.round(victories) : 0
        };
      }
      return records;
    } catch {
      return records;
    }
  }

  /** Reads the per-difficulty best table, tolerating corrupt or partial JSON. */
  private readBests(): BestByDifficulty {
    const raw = this.readString(STORAGE.bestByDifficulty);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const bests: BestByDifficulty = {};
      for (const id of Object.keys(DIFFICULTIES) as DifficultyId[]) {
        const entry = (parsed as Record<string, unknown>)[id];
        if (!entry || typeof entry !== "object") continue;
        const kills = Number((entry as { kills?: unknown }).kills);
        const score = Number((entry as { score?: unknown }).score);
        bests[id] = {
          kills: Number.isFinite(kills) && kills > 0 ? Math.round(kills) : 0,
          score: Number.isFinite(score) && score > 0 ? Math.round(score) : 0
        };
      }
      return bests;
    } catch {
      return {};
    }
  }

  private readString(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Storage can be disabled; the game must still run. */
    }
  }

  // -------------------------------------------------------------------- render

  private render(): void {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);

    const shakeAmount = this.shakeEnabled ? this.shake : 0;
    ctx.save();
    if (shakeAmount > 0) ctx.translate(randomBetween(-shakeAmount, shakeAmount) * 0.5, randomBetween(-shakeAmount, shakeAmount) * 0.5);

    try {
      this.drawBackground();
      this.drawFloorDecals();
      this.drawObstacles();
      this.drawSpawnWarnings();
      this.drawDashTrail();
      this.drawAimLine();
      this.drawTelegraphs();
      this.drawShells();
      this.drawBullets();
      this.drawAgents();
      this.drawPulses();
      this.drawParticles();
      this.drawMotes();
      this.drawTexts();
      this.drawOverlays();
      // F3 draws the tuning overlay in the arena itself: what each hostile can
      // see, where it is aiming, and how long its current telegraph has left.
      if (this.debug) this.drawDebugOverlay();
    } catch (error) {
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // A drawing fault (a lost context, a driver hiccup) must not kill the run.
      // Report it once per run, skip the rest of the frame, and keep simulating.
      if (!this.renderFaultReported) {
        this.renderFaultReported = true;
        this.pushFeed("Renderer fault: drawing skipped, simulation unaffected.", "bad");
        console.error("Arena render fault", error);
      }
      return;
    }
    ctx.restore();
  }

  /**
   * Arena-side telemetry. Costs nothing until telemetry is switched on, and
   * answers the questions the balance sweeps keep asking: does this bot have a
   * shot, what is it leading to, and how much warning is left.
   */
  private drawDebugOverlay(): void {
    const ctx = this.ctx;
    const world = this.world;
    const player = world.player;
    ctx.save();
    ctx.lineWidth = 1;

    for (const bot of world.bots) {
      if (!bot.alive) continue;
      const profile = BOT_PROFILES[bot.kind];
      const seesPlayer = bot.blindTime <= 0;
      ctx.strokeStyle = seesPlayer ? "rgba(143, 180, 140, 0.35)" : "rgba(201, 105, 90, 0.35)";
      ctx.setLineDash(seesPlayer ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(bot.position.x, bot.position.y);
      ctx.lineTo(player.position.x, player.position.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Where this profile would put a round if it fired right now.
      const lead = predictedPlayerPoint(world, bot.position, profile.bulletSpeed * DIFFICULTIES[world.difficulty].bulletSpeedScale);
      ctx.strokeStyle = "rgba(157, 243, 255, 0.75)";
      ctx.beginPath();
      ctx.moveTo(lead.x - 5, lead.y);
      ctx.lineTo(lead.x + 5, lead.y);
      ctx.moveTo(lead.x, lead.y - 5);
      ctx.lineTo(lead.x, lead.y + 5);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.beginPath();
      ctx.arc(bot.position.x, bot.position.y, profile.preferredRange, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '9px "DM Mono", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = seesPlayer ? "#8fb48c" : "#d98a78";
      const state = bot.windup > 0 ? `WINDUP ${bot.windup.toFixed(2)}` : `CD ${bot.fireCooldown.toFixed(2)}`;
      ctx.fillText(`${bot.kind.toUpperCase()} ${Math.round(bot.health)}HP ${state}`, bot.position.x, bot.position.y - 24);
      if (bot.blindTime > 0) {
        ctx.fillStyle = "#d98a78";
        ctx.fillText(`BLIND ${bot.blindTime.toFixed(2)}`, bot.position.x, bot.position.y - 34);
      }
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#e8dcc0";
    ctx.fillText(`ELAPSED ${world.elapsed.toFixed(2)}  WAVE ${world.wave} ${world.waveState}`, 12, 14);
    ctx.fillText(`BOTS ${world.bots.filter((bot) => bot.alive).length}  BULLETS ${world.bullets.length}`, 12, 26);
    // Tuning readout: which arena this run is in, how open it is, and the range
    // multiplier hostiles are holding as a result.
    const layout = ARENA_LAYOUTS[layoutForSeed(world.seed)];
    ctx.fillText(
      `ARENA ${world.arenaName} · OPEN ${layout.openness.toFixed(2)} · RANGE ×${rangeScaleForOpenness(layout.openness).toFixed(2)}`,
      12,
      62
    );
    ctx.fillText(`ACC ${world.stats.shotsHit}/${world.stats.shotsFired}  DMG ${Math.round(world.stats.damageDealt)}/${Math.round(world.stats.damageTaken)}`, 12, 38);
    if (world.mirrorRead) {
      ctx.fillText(`MIRROR MOVE ${world.mirrorRead.movement.toFixed(2)} FIRE ${world.mirrorRead.firing.toFixed(2)}`, 12, 50);
    }
    if (world.pressure > 0.02) {
      ctx.fillText(`ARENA PRESSURE ${Math.round(world.pressure * 100)}%`, 12, world.mirrorRead ? 64 : 50);
    }
    ctx.restore();
  }

  /** Static arena art is drawn once into an offscreen canvas per DPR. */
  /** Static arena art is drawn once into an offscreen canvas per DPR. */
  private ensureBackground(): HTMLCanvasElement {
    if (this.background && this.backgroundScale === this.dpr) return this.background;
    const canvas = document.createElement("canvas");
    canvas.width = WORLD.width * this.dpr;
    canvas.height = WORLD.height * this.dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.scale(this.dpr, this.dpr);

    // Poured-concrete floor: a warm gradient, coarse speckle, then painted
    // markings that have been walked over for a long time.
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width * 0.4, WORLD.height);
    gradient.addColorStop(0, FLOOR.top);
    gradient.addColorStop(1, FLOOR.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    const rng = createRng("floor-texture");
    for (let i = 0; i < 2600; i += 1) {
      const x = rng.range(0, WORLD.width);
      const y = rng.range(0, WORLD.height);
      const size = rng.range(0.6, 2.1);
      ctx.fillStyle = rng.chance(0.5) ? "rgba(255, 244, 226, 0.035)" : "rgba(0, 0, 0, 0.09)";
      ctx.fillRect(x, y, size, size);
    }
    // Faint slab seams, so the floor has scale without a bright grid.
    ctx.strokeStyle = FLOOR.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.width, y);
      ctx.stroke();
    }

    // Painted markings: a worn perimeter band, corner brackets and ramp marks.
    ctx.strokeStyle = FLOOR.paint;
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, WORLD.width - 36, WORLD.height - 36);
    ctx.strokeStyle = FLOOR.paintStrong;
    ctx.lineWidth = 2;
    const bracket = 46;
    for (const [cx, cy, sx, sy] of [
      [26, 26, 1, 1],
      [WORLD.width - 26, 26, -1, 1],
      [26, WORLD.height - 26, 1, -1],
      [WORLD.width - 26, WORLD.height - 26, -1, -1]
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * bracket, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * bracket);
      ctx.stroke();
    }
    ctx.setLineDash([14, 16]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WORLD.width / 2 - 150, WORLD.height / 2 + 74);
    ctx.lineTo(WORLD.width / 2 + 150, WORLD.height / 2 + 74);
    ctx.stroke();
    ctx.setLineDash([]);
    // Faded centre medallion, worn away at the edges.
    ctx.strokeStyle = "rgba(206, 196, 176, 0.07)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(WORLD.width / 2, WORLD.height / 2, 104, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(WORLD.width / 2, WORLD.height / 2, 150, 0, Math.PI * 2);
    ctx.stroke();

    // Stencilled sector marks, low contrast so they never fight the action.
    ctx.fillStyle = FLOOR.stencil;
    ctx.font = "600 11px 'DM Mono', monospace";
    ctx.fillText("SECTOR 01", 30, WORLD.height - 30);
    ctx.font = "500 9px 'DM Mono', monospace";
    ctx.fillStyle = "rgba(206, 196, 176, 0.14)";
    ctx.fillText("LBS // COMBAT TEST CHAMBER", WORLD.width - 208, WORLD.height - 30);
    ctx.fillText("KEEP CLEAR", WORLD.width / 2 - 27, 40);

    // Work lamps: fixed pools of light that give the room depth and landmarks.
    for (const [lx, ly, radius, strength] of [
      [WORLD.width * 0.22, WORLD.height * 0.26, 190, 0.05],
      [WORLD.width * 0.78, WORLD.height * 0.26, 190, 0.05],
      [WORLD.width * 0.5, WORLD.height * 0.78, 240, 0.06]
    ]) {
      const lamp = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
      lamp.addColorStop(0, `rgba(238, 226, 198, ${strength})`);
      lamp.addColorStop(0.6, `rgba(238, 226, 198, ${strength * 0.35})`);
      lamp.addColorStop(1, "rgba(238, 226, 198, 0)");
      ctx.fillStyle = lamp;
      ctx.fillRect(lx - radius, ly - radius, radius * 2, radius * 2);
    }

    // Dust build-up in the corners, which sells the age of the room.
    for (const [x, y, r] of [
      [0, 0, 260],
      [WORLD.width, 0, 260],
      [0, WORLD.height, 260],
      [WORLD.width, WORLD.height, 260]
    ]) {
      const haze = ctx.createRadialGradient(x, y, 0, x, y, r);
      haze.addColorStop(0, FLOOR.dust);
      haze.addColorStop(1, "rgba(196, 186, 168, 0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    this.background = canvas;
    this.backgroundScale = this.dpr;
    return canvas;
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    ctx.drawImage(this.ensureBackground(), 0, 0, WORLD.width, WORLD.height);
    // A soft pool of lamp light around the player; the only light source in the
    // room that moves, which keeps the eye on the player without any bloom.
    const glow = ctx.createRadialGradient(
      this.world.player.position.x,
      this.world.player.position.y,
      0,
      this.world.player.position.x,
      this.world.player.position.y,
      250
    );
    glow.addColorStop(0, "rgba(226, 210, 176, 0.06)");
    glow.addColorStop(1, "rgba(226, 210, 176, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  /** Scorch marks on the floor; crate-face marks are drawn with the blocks. */
  private drawFloorDecals(): void {
    const ctx = this.ctx;
    for (const decal of this.decals) {
      if (!decal.onFloor) continue;
      ctx.save();
      ctx.globalAlpha = clamp(decal.strength, 0, 1) * 0.34;
      ctx.fillStyle = "#141210";
      ctx.beginPath();
      ctx.ellipse(decal.position.x, decal.position.y, decal.size, decal.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Dust motes drifting in the lamp light, which gives the room depth. */
  private drawMotes(): void {
    const ctx = this.ctx;
    const time = this.world.elapsed;
    ctx.save();
    for (const mote of this.motes) {
      const shimmer = 0.5 + 0.5 * Math.sin(time * 1.4 + mote.phase);
      ctx.globalAlpha = 0.05 + shimmer * 0.09;
      ctx.fillStyle = "#efe6d2";
      ctx.fillRect(mote.position.x, mote.position.y, mote.size, mote.size);
    }
    ctx.restore();
  }

  private drawObstacles(): void {
    const ctx = this.ctx;
    // Two flat tints so every crate in the layout is exactly the same colour:
    // the visual signature of a layout is the silhouette, not the paint.
    const layout = ARENA_LAYOUTS[layoutForSeed(this.world.seed)];
    const lift = 7;
    for (const block of this.world.obstacles) {
      // Ground shadow, offset away from the light so the crates sit on the floor.
      ctx.fillStyle = "rgba(4, 5, 7, 0.42)";
      ctx.fillRect(block.x + 6, block.y + lift + 6, block.w, block.h);

      // Left and right side faces give the block its height.
      ctx.fillStyle = BLOCK.face;
      ctx.beginPath();
      ctx.moveTo(block.x, block.y + lift);
      ctx.lineTo(block.x, block.y + block.h + lift);
      ctx.lineTo(block.x + block.w, block.y + block.h + lift);
      ctx.lineTo(block.x + block.w, block.y + block.h);
      ctx.lineTo(block.x + block.w * 0.12, block.y + block.h);
      ctx.lineTo(block.x, block.y + block.h - lift);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = BLOCK.faceShade;
      ctx.beginPath();
      ctx.moveTo(block.x, block.y + block.h - lift);
      ctx.lineTo(block.x, block.y + block.h + lift);
      ctx.lineTo(block.x + block.w, block.y + block.h + lift);
      ctx.lineTo(block.x + block.w, block.y + block.h);
      ctx.lineTo(block.x + block.w * 0.16, block.y + block.h);
      ctx.closePath();
      ctx.fill();

      // Top face: ribbed steel plate with a highlight along the near edge.
      const top = ctx.createLinearGradient(block.x, block.y, block.x, block.y + block.h);
      top.addColorStop(0, BLOCK.top);
      top.addColorStop(1, "#252a31");
      ctx.fillStyle = top;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.strokeStyle = BLOCK.topHighlight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(block.x + 0.5, block.y + 1.5);
      ctx.lineTo(block.x + block.w - 0.5, block.y + 1.5);
      ctx.stroke();

      // Ribs across the top, spaced so small and large blocks both read.
      ctx.strokeStyle = "rgba(12, 14, 18, 0.35)";
      const ribStep = block.w > 70 ? 16 : 11;
      for (let x = block.x + ribStep; x < block.x + block.w - 4; x += ribStep) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, block.y + 4);
        ctx.lineTo(x + 0.5, block.y + block.h - 4);
        ctx.stroke();
      }

      // Rust bleeding down from the rim, deterministic per block.
      const rustSeed = createRng(`rust-${Math.round(block.x)}-${Math.round(block.y)}`);
      for (let i = 0; i < 4; i += 1) {
        const rx = rustSeed.range(block.x + 3, block.x + block.w - 9);
        const rw = rustSeed.range(3, 9);
        const rh = rustSeed.range(6, block.h * 0.55);
        const streak = ctx.createLinearGradient(rx, block.y, rx, block.y + rh);
        streak.addColorStop(0, BLOCK.rust);
        streak.addColorStop(1, "rgba(138, 96, 62, 0)");
        ctx.fillStyle = streak;
        ctx.fillRect(rx, block.y + 3, rw, rh);
      }

      // Painted hazard strip along the base, mostly worn away.
      ctx.fillStyle = BLOCK.stripe;
      ctx.fillRect(block.x + 6, block.y + block.h - 3 + lift * 0.4, block.w - 12, 3);

      // Corner bolts.
      ctx.fillStyle = BLOCK.bolt;
      for (const [bx, by] of [
        [block.x + 5, block.y + 5],
        [block.x + block.w - 7, block.y + 5],
        [block.x + 5, block.y + block.h - 7],
        [block.x + block.w - 7, block.y + block.h - 7]
      ]) {
        ctx.fillRect(bx, by, 2.6, 2.6);
      }

      // Outline last, so the crisp edge sits above every surface detail. The
      // layout accent tints it, which is how a run's arena reads at a glance.
      ctx.strokeStyle = BLOCK.edge;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(block.x + 0.5, block.y + 0.5, block.w - 1, block.h - 1);
      ctx.strokeStyle = layout.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(block.x + 1.5, block.y + 1.5, block.w - 3, block.h - 3);
    }
  }

  /** Spawn warnings: a painted target ring that fills as the drop approaches. */
  private drawSpawnWarnings(): void {
    const ctx = this.ctx;
    for (const pending of this.world.pendingSpawns) {
      const art = BOT_ART[pending.kind];
      const progress = clamp(1 - pending.delay / Math.max(0.001, pending.delay + pending.age), 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(pending.age * 9);
      ctx.save();
      ctx.translate(pending.position.x, pending.position.y);
      // Painted landing ring on the floor.
      ctx.globalAlpha = 0.28 + pulse * 0.25;
      ctx.strokeStyle = art.accent;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, 21 + (1 - progress) * 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Crosshair.
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.stroke();
      // Drop timer.
      ctx.beginPath();
      ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.lineWidth = 2.4;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      // Stencilled unit name, faded into the floor.
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = art.accent;
      ctx.font = "600 8px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(pending.kind.toUpperCase(), 0, 40);
      ctx.restore();
    }
    ctx.textAlign = "left";
  }

  private drawDashTrail(): void {
    const ctx = this.ctx;
    for (const trail of this.dashTrail) {
      ctx.save();
      ctx.globalAlpha = clamp(trail.life / 0.34, 0, 1) * 0.4;
      ctx.strokeStyle = "#cfa25f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(trail.position.x, trail.position.y, PLAYER_RADIUS * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawAimLine(): void {
    const ctx = this.ctx;
    const player = this.world.player;
    const blocking = firstBlockingFraction(
      { x: player.position.x, y: player.position.y },
      { x: player.position.x + player.aimDirection.x * 900, y: player.position.y + player.aimDirection.y * 900 }
    );
    const length = blocking === null ? 240 : clamp(blocking * 900, 30, 240);
    ctx.save();
    ctx.setLineDash([4, 9]);
    ctx.strokeStyle = this.world.assistTargetId !== null ? "rgba(143, 180, 140, 0.4)" : "rgba(207, 162, 95, 0.18)";
    ctx.beginPath();
    ctx.moveTo(player.position.x + player.aimDirection.x * 20, player.position.y + player.aimDirection.y * 20);
    ctx.lineTo(player.position.x + player.aimDirection.x * length, player.position.y + player.aimDirection.y * length);
    ctx.stroke();
    ctx.restore();

    const assistTarget = this.world.bots.find((bot) => bot.alive && bot.id === this.world.assistTargetId);
    if (assistTarget) {
      ctx.save();
      ctx.strokeStyle = "rgba(143, 180, 140, 0.7)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(assistTarget.position.x, assistTarget.position.y, BOT_RADIUS + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Crosshair follows the raw aim point (mouse or finger), not the assist.
    const aim = this.touchAim ?? this.rawAim;
    ctx.save();
    ctx.strokeStyle = this.world.player.fireCooldown > 0 ? "rgba(207, 162, 95, 0.45)" : "rgba(207, 162, 95, 0.75)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(aim.x - 12, aim.y);
    ctx.lineTo(aim.x - 4, aim.y);
    ctx.moveTo(aim.x + 4, aim.y);
    ctx.lineTo(aim.x + 12, aim.y);
    ctx.moveTo(aim.x, aim.y - 12);
    ctx.lineTo(aim.x, aim.y - 4);
    ctx.moveTo(aim.x, aim.y + 4);
    ctx.lineTo(aim.x, aim.y + 12);
    ctx.stroke();
    if (this.hitMarker > 0) {
      ctx.globalAlpha = clamp(this.hitMarker / 0.16, 0, 1);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.6;
      const size = 5 + (1 - this.hitMarker / 0.16) * 4;
      ctx.beginPath();
      ctx.moveTo(aim.x - size, aim.y - size);
      ctx.lineTo(aim.x - 2, aim.y - 2);
      ctx.moveTo(aim.x + size, aim.y - size);
      ctx.lineTo(aim.x + 2, aim.y - 2);
      ctx.moveTo(aim.x - size, aim.y + size);
      ctx.lineTo(aim.x - 2, aim.y + 2);
      ctx.moveTo(aim.x + size, aim.y + size);
      ctx.lineTo(aim.x + 2, aim.y + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Laser-sight telegraph: players always see the shot before it happens. */
  /**
   * Telegraphs.
   *
   * A winding-up hostile shows three things: which way the shot will go (a
   * dotted lane that stops at the first block), how long is left (a depleting
   * ring over the barrel), and where it will land (a reticle on the aim point).
   * All of it in the unit's own muted accent, no glow.
   */
  private drawTelegraphs(): void {
    const ctx = this.ctx;
    const player = this.world.player.position;
    for (const bot of this.world.bots) {
      if (!bot.alive || bot.windup <= 0) continue;
      const tint = TELEGRAPH[bot.kind];
      const progress = clamp(1 - bot.windup / Math.max(0.001, bot.windupDuration), 0, 1);
      const direction = { x: Math.cos(bot.facing), y: Math.sin(bot.facing) };
      const blocking = firstBlockingFraction(
        bot.position,
        { x: bot.position.x + direction.x * 900, y: bot.position.y + direction.y * 900 },
        this.world.obstacles
      );
      const length = blocking === null ? 900 : blocking * 900;
      const style = TELEGRAPH_STYLE[bot.kind];

      if (style === "marker") {
        // Indirect fire marks the floor, not the barrel: a ring at the place
        // the shell will land, growing tighter as the shot closes.
        const shell = attackFor(bot.kind).shell;
        const target = {
          x: this.world.player.position.x + this.world.player.velocity.x * (shell?.lead ?? 0.3),
          y: this.world.player.position.y + this.world.player.velocity.y * (shell?.lead ?? 0.3)
        };
        const radius = shell?.radius ?? 60;
        ctx.save();
        ctx.globalAlpha = 0.2 + progress * 0.4;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius * (1.35 - progress * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.45 + progress * 0.5;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -this.world.elapsed * 20;
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius * Math.max(0.05, 1 - progress), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.translate(bot.position.x, bot.position.y);
        this.drawChargeGauge(ctx, tint, progress);
        ctx.restore();
        continue;
      }

      if (style === "ram") {
        // A charge lane: two rails with chevrons that advance as it commits.
        ctx.save();
        ctx.globalAlpha = 0.2 + progress * 0.45;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bot.position.x + direction.x * 14 + direction.y * 9, bot.position.y + direction.y * 14 - direction.x * 9);
        ctx.lineTo(bot.position.x + direction.x * length + direction.y * 9, bot.position.y + direction.y * length - direction.x * 9);
        ctx.moveTo(bot.position.x + direction.x * 14 - direction.y * 9, bot.position.y + direction.y * 14 + direction.x * 9);
        ctx.lineTo(bot.position.x + direction.x * length - direction.y * 9, bot.position.y + direction.y * length + direction.x * 9);
        ctx.stroke();
        ctx.lineWidth = 2.4;
        for (let step = 0; step < 5; step += 1) {
          const at = step * 40 + ((this.world.elapsed * 60) % 40);
          if (at > length - 20 || at < 20) continue;
          const cx = bot.position.x + direction.x * at;
          const cy = bot.position.y + direction.y * at;
          ctx.globalAlpha = (0.15 + progress * 0.35) * (1 - at / Math.max(60, length));
          ctx.beginPath();
          ctx.moveTo(cx - direction.x * 7 + direction.y * 7, cy - direction.y * 7 - direction.x * 7);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx - direction.x * 7 - direction.y * 7, cy - direction.y * 7 + direction.x * 7);
          ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        ctx.translate(bot.position.x, bot.position.y);
        this.drawChargeGauge(ctx, tint, progress);
        ctx.restore();
        continue;
      }

      if (style === "cone") {
        // Area denial shows its reach as a cone, not a lane: the whole wedge is
        // the danger, so stepping out of the arc is the counterplay.
        const reach = attackFor(bot.kind).range;
        ctx.save();
        ctx.globalAlpha = 0.14 + progress * 0.26;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.moveTo(bot.position.x, bot.position.y);
        ctx.arc(bot.position.x, bot.position.y, reach, bot.facing - 0.5, bot.facing + 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.3 + progress * 0.5;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bot.position.x, bot.position.y);
        ctx.arc(bot.position.x, bot.position.y, reach, bot.facing - 0.5, bot.facing + 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.translate(bot.position.x, bot.position.y);
        this.drawChargeGauge(ctx, tint, progress);
        ctx.restore();
        continue;
      }

      if (style === "beam") {
        // The marksman's lane is longer, straighter and darker at the core: one
        // thin line the whole way across the room.
        ctx.save();
        ctx.globalAlpha = 0.18 + progress * 0.42;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 0.9 + progress * 1.2;
        ctx.setLineDash([16, 4]);
        ctx.lineDashOffset = -this.world.elapsed * 90;
        ctx.beginPath();
        ctx.moveTo(bot.position.x + direction.x * 24, bot.position.y + direction.y * 24);
        ctx.lineTo(bot.position.x + direction.x * length, bot.position.y + direction.y * length);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.35 + progress * 0.5;
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "rgba(20, 18, 16, 0.5)";
        ctx.beginPath();
        ctx.moveTo(bot.position.x + direction.x * 24, bot.position.y + direction.y * 24);
        ctx.lineTo(bot.position.x + direction.x * length, bot.position.y + direction.y * length);
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.translate(bot.position.x, bot.position.y);
        this.drawChargeGauge(ctx, tint, progress);
        // Corner brackets at the far end, like a scope reticle.
        const endX = direction.x * length;
        const endY = direction.y * length;
        ctx.globalAlpha = 0.35 + progress * 0.5;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
          ctx.moveTo(endX + sx * 6, endY + sy * 14);
          ctx.lineTo(endX + sx * 6, endY + sy * 6);
          ctx.lineTo(endX + sx * 14, endY + sy * 6);
        }
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (style === "guard") {
        // The bulwark shows its guard arc and its short reach instead of a
        // firing lane: the shield is the whole threat.
        const arc = attackFor(bot.kind).shieldArc ?? 1.2;
        const reach = attackFor(bot.kind).melee?.radius ?? 80;
        ctx.save();
        ctx.translate(bot.position.x, bot.position.y);
        ctx.globalAlpha = 0.35 + progress * 0.45;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, BOT_RADIUS + 8, bot.facing - arc, bot.facing + arc);
        ctx.stroke();
        ctx.globalAlpha = 0.12 + progress * 0.2;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(0, 0, reach, bot.facing - 0.9, bot.facing + 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(bot.position.x, bot.position.y);
        this.drawChargeGauge(ctx, tint, progress);
        ctx.restore();
        continue;
      }

      if (style === "none") {
        ctx.save();
        ctx.translate(bot.position.x, bot.position.y);
        this.drawChargeGauge(ctx, tint, progress);
        ctx.restore();
        continue;
      }

      // Firing lane: dashes that thicken as the shot nears release.
      ctx.save();
      ctx.globalAlpha = 0.22 + progress * 0.5;
      ctx.strokeStyle = tint;
      ctx.lineWidth = 1 + progress * 1.8;
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = -this.world.elapsed * 26;
      ctx.beginPath();
      ctx.moveTo(bot.position.x + direction.x * 15, bot.position.y + direction.y * 15);
      ctx.lineTo(bot.position.x + direction.x * length, bot.position.y + direction.y * length);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.restore();

      // Muzzle reticle where the lane ends, drawn as a bracket rather than a dot.
      const endX = bot.position.x + direction.x * length;
      const endY = bot.position.y + direction.y * length;
      ctx.save();
      ctx.globalAlpha = 0.3 + progress * 0.55;
      ctx.strokeStyle = tint;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(endX, endY, 7 + progress * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(endX - 12 - progress * 4, endY);
      ctx.lineTo(endX - 3, endY);
      ctx.moveTo(endX + 3, endY);
      ctx.lineTo(endX + 12 + progress * 4, endY);
      ctx.stroke();
      ctx.restore();

      // Charge gauge over the unit itself: a dark track with a filling arc.
      ctx.save();
      ctx.translate(bot.position.x, bot.position.y);
      this.drawChargeGauge(ctx, tint, progress);

      // Threat wedge aimed at the player, only while the player is the target.
      const toPlayer = Math.atan2(player.y - bot.position.y, player.x - bot.position.x);
      const facingPlayer = Math.cos(toPlayer - bot.facing) > 0.55;
      if (facingPlayer) {
        ctx.globalAlpha = 0.18 + progress * 0.3;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 36, toPlayer - 0.2, toPlayer + 0.2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** The countable ring over a hostile that is winding up an attack. */
  private drawChargeGauge(ctx: CanvasRenderingContext2D, tint: string, progress: number): void {
    ctx.strokeStyle = STATUS.healthTrack;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, BOT_RADIUS + 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = tint;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, BOT_RADIUS + 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }

  /**
   * Lobbed shells: a dark projectile on a visible arc, plus the landing ring it
   * is going to land on, so the mechanic never has to be guessed.
   */
  private drawShells(): void {
    const ctx = this.ctx;
    for (const shell of this.world.shells) {
      const fromPlayer = shell.owner === "player";
      const art = fromPlayer ? PLAYER_ART : BOT_ART[shell.kind];
      const remaining = clamp(shell.flight / Math.max(0.001, shell.totalFlight), 0, 1);
      // Ballistic arc: the shadow stays on the floor while the shell climbs.
      const at = { x: shell.from.x + (shell.target.x - shell.from.x) * (1 - remaining), y: shell.from.y + (shell.target.y - shell.from.y) * (1 - remaining) };
      const height = Math.sin((1 - remaining) * Math.PI) * 46;

      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = STATUS.shadow;
      ctx.beginPath();
      ctx.ellipse(at.x, at.y + 4, 6 - height * 0.03, 3.4 - height * 0.015, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(at.x, at.y - height);
      ctx.rotate(Math.atan2(shell.target.y - shell.from.y, shell.target.x - shell.from.x) + this.world.elapsed * 6);
      ctx.fillStyle = art.plate;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.2, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = art.accent;
      ctx.fillRect(-1.4, -3.4, 2.8, 1.6);
      ctx.restore();

      // Landing ring: dark ink plus the tint, closing as it falls. The sapper's
      // own shell also paints the burst radius it is going to clear.
      ctx.save();
      if (fromPlayer) {
        ctx.globalAlpha = 0.14 + (1 - remaining) * 0.18;
        ctx.strokeStyle = PLAYER_ART.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(shell.target.x, shell.target.y, shell.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.3 + (1 - remaining) * 0.45;
      ctx.strokeStyle = art.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -this.world.elapsed * 22;
      ctx.beginPath();
      ctx.arc(shell.target.x, shell.target.y, shell.radius * (0.55 + remaining * 0.45), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  /** Rounds are tracers: a brass streak with a bright tip, no glow. */
  private drawBullets(): void {
    const ctx = this.ctx;
    for (const bullet of this.world.bullets) {
      const speed = Math.hypot(bullet.velocity.x, bullet.velocity.y);
      const trailLength = clamp(speed * 0.035, 9, 30);
      const direction = { x: bullet.velocity.x / (speed || 1), y: bullet.velocity.y / (speed || 1) };
      const fromPlayer = bullet.owner === "player";
      const trail = fromPlayer ? BULLET.playerTrail : BULLET.botTrail;
      const core = fromPlayer ? BULLET.playerCore : BULLET.botCore;

      if (bullet.flame) {
        // Fire is drawn as stacked, shrinking puffs in the emitter's own colour,
        // never as a glowing beam: hot, sooty, and clearly not a slug.
        const art = BOT_ART[bullet.source === "player" ? "hunter" : bullet.source];
        const puff = clamp((bullet.travelled % 26) / 26, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.30 + (1 - puff) * 0.25;
        ctx.fillStyle = art.accent;
        for (let index = 0; index < 3; index += 1) {
          const at = index * 7;
          const radius = 5.4 - index * 1.3 - puff * 1.2;
          ctx.beginPath();
          ctx.arc(
            bullet.position.x - direction.x * at + Math.sin(this.world.elapsed * 22 + index) * 1.4,
            bullet.position.y - direction.y * at + Math.cos(this.world.elapsed * 19 + index) * 1.4,
            Math.max(1.2, radius),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.globalAlpha = 0.5 + (1 - puff) * 0.3;
        ctx.fillStyle = art.detail ?? art.accent;
        ctx.beginPath();
        ctx.arc(bullet.position.x, bullet.position.y, 2 + (1 - puff) * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.lineCap = "round";
      // Wide, faint wake, then a solid core: reads as motion without blooming.
      ctx.strokeStyle = trail;
      ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(bullet.position.x, bullet.position.y);
      ctx.lineTo(bullet.position.x - direction.x * trailLength, bullet.position.y - direction.y * trailLength);
      ctx.stroke();
      ctx.strokeStyle = core;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bullet.position.x, bullet.position.y);
      ctx.lineTo(bullet.position.x - direction.x * trailLength * 0.55, bullet.position.y - direction.y * trailLength * 0.55);
      ctx.stroke();
      // Tip.
      ctx.globalAlpha = 1;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, fromPlayer ? 2.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fromPlayer ? "#fbf6ea" : "#f0c8b8";
      ctx.beginPath();
      ctx.arc(bullet.position.x, bullet.position.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Units.
   *
   * Everything is drawn from primitives, but each archetype is assembled from
   * its own parts so the three hostiles and the player are never silhouettes of
   * one another: a squat siege mech, a light interceptor, a slow mirrored prism,
   * and an armoured operative. Shadow, body, plate, hardware, then the state
   * overlays (damage, telegraph, invulnerability) in that order.
   */
  private drawAgents(): void {
    const ctx = this.ctx;

    for (const bot of this.world.bots) {
      if (!bot.alive) continue;
      const art = BOT_ART[bot.kind];
      const spawning = bot.spawnGuard > 0;
      const materialise = spawning ? clamp(1 - bot.spawnGuard / 0.55, 0, 1) : 1;
      ctx.save();
      ctx.translate(bot.position.x, bot.position.y);
      this.drawUnitShadow(ctx, BOT_RADIUS + 4, materialise);
      ctx.globalAlpha = spawning ? 0.25 + materialise * 0.75 : 1;
      ctx.scale(0.72 + materialise * 0.28, 0.72 + materialise * 0.28);
      this.drawBotModel(ctx, bot, art);
      ctx.restore();
      // Kit states sit on top of the model in world space: a burning hostile
      // and a staggered one have to be tellable apart mid-fight.
      if (bot.burn && bot.burn > 0) this.drawBurnOverlay(bot);
      if (bot.stun > 0) this.drawStaggerMark(bot);
    }

    this.drawOperator(this.world.player);
  }

  /** Soft contact shadow. Everything in the room stands on the same floor. */
  private drawUnitShadow(ctx: CanvasRenderingContext2D, radius: number, strength = 1): void {
    ctx.save();
    ctx.globalAlpha = 0.5 * strength;
    ctx.fillStyle = STATUS.shadow;
    ctx.beginPath();
    ctx.ellipse(2.5, radius * 0.72, radius * 1.05, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBotModel(ctx: CanvasRenderingContext2D, bot: AgentState, art: (typeof BOT_ART)["hunter"]): void {
    const healthFraction = clamp(bot.health / Math.max(1, bot.maxHealth), 0, 1);
    const hurt = healthFraction <= 0.34;
    const charge = bot.windup > 0 ? clamp(1 - bot.windup / Math.max(0.001, bot.windupDuration), 0, 1) : 0;
    const hit = bot.hitFlash > 0;
    const bodyFill = hit ? STATUS.hit : art.body;
    const plateFill = hit ? STATUS.hit : art.plate;
    ctx.lineJoin = "round";

    if (art.silhouette === "wedge") {
      // The Hunter: a squat siege mech with side skirts and a heavy cannon.
      ctx.rotate(bot.facing);
      ctx.fillStyle = art.shade;
      ctx.fillRect(-11, -13, 22, 26);

      ctx.fillStyle = plateFill;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(4, -12);
      ctx.lineTo(-9, -10);
      ctx.lineTo(-9, 10);
      ctx.lineTo(4, 12);
      ctx.closePath();
      ctx.fill();

      // Shoulder plates either side of the bore.
      ctx.fillStyle = bodyFill;
      ctx.fillRect(-6, -14, 12, 5);
      ctx.fillRect(-6, 9, 12, 5);
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(-6, -14, 12, 5);
      ctx.strokeRect(-6, 9, 12, 5);

      // Cannon: barrel, sleeve and a collar that glows with the charge.
      ctx.fillStyle = art.ink;
      ctx.fillRect(6, -3.2, 14 - charge * 2, 6.4);
      ctx.fillStyle = art.body;
      ctx.fillRect(4, -4.6, 7, 9.2);
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.globalAlpha *= 0.35 + charge * 0.65;
      ctx.fillRect(15 - charge * 2, -2, 3.4, 4);
      ctx.globalAlpha /= 0.35 + charge * 0.65;

      // Sensor slit: the "eye", which brightens as the shot charges.
      ctx.fillStyle = art.accent;
      ctx.globalAlpha *= 0.5 + charge * 0.5;
      ctx.fillRect(-2, -7.5, 6, 3);
      ctx.globalAlpha /= 0.5 + charge * 0.5;
      ctx.strokeStyle = art.ink;
      ctx.strokeRect(-2, -7.5, 6, 3);

      // Stubby legs, planted wider while it winds up.
      ctx.fillStyle = art.shade;
      ctx.fillRect(-9, -11 - charge, 5, 5 + charge * 2);
      ctx.fillRect(-9, 6, 5, 5 + charge * 2);
      ctx.rotate(-bot.facing);
    } else if (art.silhouette === "dart") {
      // The Flanker: a narrow interceptor with swept prongs and thruster pods.
      ctx.rotate(bot.facing);
      const flutter = Math.sin(this.world.elapsed * 9 + bot.id) * 1.4;
      ctx.fillStyle = art.shade;
      ctx.beginPath();
      ctx.moveTo(-10, -9);
      ctx.lineTo(6, -3);
      ctx.lineTo(6, 3);
      ctx.lineTo(-10, 9);
      ctx.closePath();
      ctx.fill();

      // Swept prongs either side of the fuselage.
      ctx.fillStyle = plateFill;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-4, -13 - flutter);
      ctx.lineTo(-10, -10);
      ctx.lineTo(2, -3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-4, 13 + flutter);
      ctx.lineTo(-10, 10);
      ctx.lineTo(2, 3);
      ctx.closePath();
      ctx.fill();

      // Fuselage.
      ctx.fillStyle = bodyFill;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(0, -5.4);
      ctx.lineTo(-8, 0);
      ctx.lineTo(0, 5.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Cannon slung under the nose.
      ctx.fillStyle = art.ink;
      ctx.fillRect(3, -1.6, 10 - charge * 2, 3.2);
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.globalAlpha *= 0.35 + charge * 0.65;
      ctx.beginPath();
      ctx.arc(4, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.35 + charge * 0.65;

      // Thruster pods at the tail, with a damped burn while it moves.
      const burn = clamp(Math.hypot(bot.velocity.x, bot.velocity.y) / 150, 0, 1);
      ctx.fillStyle = art.shade;
      ctx.fillRect(-12, -8, 5, 4);
      ctx.fillRect(-12, 4, 5, 4);
      ctx.fillStyle = art.accent;
      ctx.globalAlpha *= 0.35 + burn * 0.5;
      ctx.fillRect(-14 - burn * 3, -7, 3 + burn * 3, 2);
      ctx.fillRect(-14 - burn * 3, 5, 3 + burn * 3, 2);
      ctx.globalAlpha /= 0.35 + burn * 0.5;
      ctx.rotate(-bot.facing);
    } else if (art.silhouette === "lance") {
      // The Marksman: a long, low rifle platform. The barrel is longer than the
      // unit is wide, because a sniper has to read as a sniper at a glance.
      ctx.rotate(bot.facing);
      const breathe = Math.sin(this.world.elapsed * 2.4 + bot.id) * 0.6;

      // Bipod legs splayed behind the receiver.
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-15, -9);
      ctx.moveTo(-6, 0);
      ctx.lineTo(-15, 9);
      ctx.stroke();

      // Receiver: narrow, with a scope rail on top.
      ctx.fillStyle = art.shade;
      ctx.fillRect(-9, -6, 17, 12);
      ctx.fillStyle = plateFill;
      ctx.beginPath();
      ctx.moveTo(-9, -6);
      ctx.lineTo(8, -4.4);
      ctx.lineTo(8, 4.4);
      ctx.lineTo(-9, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.stroke();

      // The long barrel, with a muzzle brake at the far end. It recoils a
      // little as the wind-up completes.
      const recoil = charge * 2.4;
      ctx.fillStyle = art.ink;
      ctx.fillRect(6 - recoil, -1.7, 30, 3.4);
      ctx.fillStyle = art.plate;
      ctx.fillRect(32 - recoil, -2.6, 5, 5.2);
      ctx.fillRect(24 - recoil, -3.2, 2.4, 6.4);

      // Scope: a dark tube with a lit lens that narrows as it charges.
      ctx.fillStyle = art.shade;
      ctx.fillRect(-2, -5.6 - breathe * 0.2, 9, 3);
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.globalAlpha *= 0.4 + charge * 0.6;
      ctx.beginPath();
      ctx.arc(7, -4.1, 1.7 - charge * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.4 + charge * 0.6;

      // Prone skids so it looks planted rather than hovering.
      ctx.fillStyle = art.plate;
      ctx.fillRect(-8, -8.5, 12, 2.6);
      ctx.fillRect(-8, 5.9, 12, 2.6);
      ctx.rotate(-bot.facing);
    } else if (art.silhouette === "furnace") {
      // The Cinder: a round-shouldered furnace with a snout, a fuel tank and
      // vent slats. Wide at the shoulders, no straight edges anywhere.
      ctx.rotate(bot.facing);
      const pulse = 0.6 + 0.4 * Math.sin(this.world.elapsed * 6 + bot.id);

      // Back tank.
      ctx.fillStyle = art.shade;
      ctx.beginPath();
      ctx.ellipse(-8, 0, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rounded body.
      ctx.fillStyle = bodyFill;
      ctx.beginPath();
      ctx.ellipse(-1, 0, 12, 11.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Vent slats across the back, hot while it sprays.
      ctx.fillStyle = art.plate;
      for (let i = 0; i < 3; i += 1) ctx.fillRect(-10 + i * 4, -8.5, 2, 17);

      // Nozzle: a tapered snout with a pilot light.
      ctx.fillStyle = art.plate;
      ctx.beginPath();
      ctx.moveTo(8, -5.5);
      ctx.lineTo(17, -3);
      ctx.lineTo(17, 3);
      ctx.lineTo(8, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.globalAlpha *= 0.3 + charge * 0.5 + pulse * 0.2;
      ctx.beginPath();
      ctx.arc(16, 0, 2 + charge * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.3 + charge * 0.5 + pulse * 0.2;

      // Shoulder pauldrons.
      ctx.fillStyle = art.plate;
      ctx.beginPath();
      ctx.ellipse(2, -10, 6, 3.4, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(2, 10, 6, 3.4, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(-bot.facing);
    } else if (art.silhouette === "pod") {
      // The Mortar: a tracked carrier with a stubby elevated tube. Tracked
      // units read differently from walking ones even in one flat colour.
      ctx.rotate(bot.facing);

      // Two track bars, with cleats that cycle as it drives.
      const roll = (this.world.elapsed * 9) % 3;
      ctx.fillStyle = art.shade;
      ctx.fillRect(-13, -11.5, 27, 6);
      ctx.fillRect(-13, 5.5, 27, 6);
      ctx.fillStyle = art.plate;
      for (let i = 0; i < 6; i += 1) {
        ctx.fillRect(-12 + i * 4.6 + roll, -11, 1.6, 5);
        ctx.fillRect(-12 + i * 4.6 + roll, 6, 1.6, 5);
      }
      ctx.fillStyle = art.ink;
      ctx.fillRect(-13, -11.5, 27, 1.2);
      ctx.fillRect(-13, 10.3, 27, 1.2);

      // Hull between the tracks, with a sloped glacis.
      ctx.fillStyle = plateFill;
      ctx.beginPath();
      ctx.moveTo(-10, -5.5);
      ctx.lineTo(10, -4.5);
      ctx.lineTo(13, 0);
      ctx.lineTo(10, 4.5);
      ctx.lineTo(-10, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.stroke();

      // The tube, angled up, with a shell visible as it charges.
      ctx.save();
      ctx.translate(2, 0);
      ctx.rotate(-0.5);
      ctx.fillStyle = art.shade;
      ctx.fillRect(0, -2.6, 15, 5.2);
      ctx.fillStyle = art.ink;
      ctx.fillRect(13, -3.4, 3, 6.8);
      ctx.restore();
      if (charge > 0.05) {
        ctx.fillStyle = art.detail ?? art.accent;
        ctx.globalAlpha *= 0.35 + charge * 0.65;
        ctx.beginPath();
        ctx.arc(11, -6 - charge * 2, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha /= 0.35 + charge * 0.65;
      }
      ctx.rotate(-bot.facing);
    } else if (art.silhouette === "wall") {
      // The Bulwark: a broad tower shield on stubby legs. It is mostly shield.
      ctx.rotate(bot.facing);

      // Legs, planted wide and short.
      ctx.fillStyle = art.shade;
      ctx.fillRect(-9, -10, 6, 6);
      ctx.fillRect(-9, 4, 6, 6);

      // Torso behind the shield, kept small on purpose.
      ctx.fillStyle = bodyFill;
      ctx.fillRect(-11, -7, 12, 14);

      // The shield: a tall hexagonal plate held on the leading edge, with a
      // rivet line and a worn smear where rounds have hit it.
      ctx.save();
      ctx.translate(2, 0);
      const open = bot.windup > 0 ? 0.55 : 0; // guard drops while it winds up
      ctx.rotate(-open * 0.5);
      ctx.fillStyle = plateFill;
      ctx.beginPath();
      ctx.moveTo(3, -15);
      ctx.lineTo(7, -11);
      ctx.lineTo(7, 11);
      ctx.lineTo(3, 15);
      ctx.lineTo(-3, 13);
      ctx.lineTo(-3, -13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = art.shade;
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.arc(2, i * 8, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = art.accent;
      ctx.globalAlpha *= 0.5;
      ctx.fillRect(1, -4, 5, 8);
      ctx.globalAlpha /= 0.5;
      ctx.restore();

      // A small visor slit peeking over the rim.
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.fillRect(-1, -2, 3, 4);
      ctx.rotate(-bot.facing);
    } else if (art.silhouette === "cluster") {
      // The Swarm Cell: an organic knot of pods. Its outline is deliberately
      // lumpy so it never reads as one of the machined units.
      const writhe = this.world.elapsed * 1.8 + bot.id;
      ctx.fillStyle = art.shade;
      ctx.beginPath();
      ctx.ellipse(-2, 0, 14, 12, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Pods, each pulsing slightly out of phase.
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 + writhe * 0.3;
        const radius = 6 + Math.sin(writhe + i) * 1.4;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        ctx.fillStyle = i % 2 === 0 ? bodyFill : plateFill;
        ctx.beginPath();
        ctx.ellipse(px, py, 6.4, 5.4, angle, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = art.ink;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // A core that glows warmer as it prepares to spit spores.
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.globalAlpha *= 0.35 + charge * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, 4 + charge * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.35 + charge * 0.6;

      // Spores drifting off it.
      ctx.fillStyle = art.accent;
      for (let i = 0; i < 4; i += 1) {
        const angle = writhe * 0.9 + (i * Math.PI) / 2;
        const radius = 17 + Math.sin(writhe * 1.7 + i) * 2.4;
        ctx.globalAlpha *= 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha /= 0.5;
      }
    } else if (art.silhouette === "ram") {
      // The Ram: angled armour over oversized pistons, all of it pointing
      // forward. While it charges, the pistons extend.
      ctx.rotate(bot.facing);
      const lunge = bot.chargeTime > 0 ? 4 : 0;

      // Piston blocks either side.
      ctx.fillStyle = art.shade;
      ctx.fillRect(-12, -11, 10, 7);
      ctx.fillRect(-12, 4, 10, 7);
      ctx.fillStyle = art.plate;
      ctx.fillRect(-13 - lunge * 0.4, -10, 3, 5);
      ctx.fillRect(-13 - lunge * 0.4, 5, 3, 5);

      // Central block, sloped at the back.
      ctx.fillStyle = bodyFill;
      ctx.beginPath();
      ctx.moveTo(-13, -7);
      ctx.lineTo(6, -8.5);
      ctx.lineTo(6, 8.5);
      ctx.lineTo(-13, 7);
      ctx.closePath();
      ctx.fill();

      // Plough: a heavy wedge with ribs, pushed forward as it charges.
      ctx.fillStyle = plateFill;
      ctx.beginPath();
      ctx.moveTo(4 - lunge, -9.5);
      ctx.lineTo(15 + lunge, -4);
      ctx.lineTo(17 + lunge, 0);
      ctx.lineTo(15 + lunge, 4);
      ctx.lineTo(4 - lunge, 9.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = art.shade;
      ctx.fillRect(6 - lunge, -6.5, 8 + lunge, 2);
      ctx.fillRect(6 - lunge, 4.5, 8 + lunge, 2);

      // Impact studs along the leading edge.
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.fillRect(14 + lunge, -3, 2.4, 6);
      ctx.rotate(-bot.facing);
    } else if (art.silhouette === "splinter") {
      // The Shard: a tiny faceted splinter with a visible fuse. Small, sharp
      // and cheap-looking, because that is exactly what it is.
      ctx.rotate(Math.atan2(bot.velocity.y, bot.velocity.x) || bot.facing);
      const flicker = 0.5 + 0.5 * Math.sin(this.world.elapsed * 18 + bot.id * 3);
      ctx.fillStyle = art.shade;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-3, -6.5);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-3, 6.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = bodyFill;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-2, -4.4);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-2, 4.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.globalAlpha *= 0.45 + flicker * 0.55;
      ctx.beginPath();
      ctx.arc(-1, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.45 + flicker * 0.55;
      ctx.rotate(-(Math.atan2(bot.velocity.y, bot.velocity.x) || bot.facing));
    } else {
      // The Mirror: a tall faceted prism with slowly orbiting shards.
      const turn = this.world.elapsed * 0.6 + bot.id;
      const facets = 6;
      ctx.fillStyle = art.shade;
      ctx.beginPath();
      for (let i = 0; i < facets; i += 1) {
        const angle = (Math.PI * 2 * i) / facets + Math.PI / facets;
        const px = Math.cos(angle) * 13;
        const py = Math.sin(angle) * 13;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Mirror panels: alternating tints so it reads as reflective glass.
      for (let i = 0; i < facets; i += 1) {
        const a0 = (Math.PI * 2 * i) / facets;
        const a1 = (Math.PI * 2 * (i + 1)) / facets;
        const shimmer = 0.5 + 0.5 * Math.sin(turn + i * 1.6);
        ctx.fillStyle = i % 2 === 0 ? plateFill : bodyFill;
        ctx.globalAlpha *= 0.55 + shimmer * 0.45;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a0) * 12, Math.sin(a0) * 12);
        ctx.lineTo(Math.cos(a1) * 12, Math.sin(a1) * 12);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha /= 0.55 + shimmer * 0.45;
      }
      ctx.strokeStyle = art.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Central eye, narrowing as it charges.
      ctx.fillStyle = art.detail ?? art.accent;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.6 - charge * 1.6, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = art.ink;
      ctx.beginPath();
      ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting shards.
      ctx.fillStyle = art.accent;
      for (let i = 0; i < 3; i += 1) {
        const angle = turn * 1.4 + (i * Math.PI * 2) / 3;
        const radius = 18 + Math.sin(turn * 2 + i) * 1.6;
        ctx.save();
        ctx.translate(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7);
        ctx.rotate(angle);
        ctx.globalAlpha *= 0.75;
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(0, -2.6);
        ctx.lineTo(3, 0);
        ctx.lineTo(0, 2.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Scorch marks and a smoke tick once it is nearly dead.
    if (hurt) {
      ctx.fillStyle = "rgba(18, 16, 15, 0.55)";
      ctx.beginPath();
      ctx.arc(-4, 3, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(60, 58, 56, 0.35)";
      ctx.beginPath();
      ctx.arc(-7, -5 - (this.world.elapsed * 14) % 8, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Durability ring: a dark track so the value is legible on any floor.
    ctx.strokeStyle = STATUS.healthTrack;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(0, 0, BOT_RADIUS + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = hurt ? STATUS.healthLow : art.accent;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, BOT_RADIUS + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * healthFraction);
    ctx.stroke();
    ctx.lineCap = "butt";

    // A blip on the ring while it is winding up, so the charge is countable.
    if (charge > 0) {
      ctx.fillStyle = art.detail ?? art.accent;
      const angle = -Math.PI / 2 + Math.PI * 2 * charge;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * (BOT_RADIUS + 6), Math.sin(angle) * (BOT_RADIUS + 6), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * A hostile that is on fire: licking flame puffs climbing off its shoulders,
   * pulsing at the tick rate, plus a scorched ring on the floor. The flames are
   * drawn in warm paint strokes, never as a glow.
   */
  private drawBurnOverlay(bot: AgentState): void {
    const ctx = this.ctx;
    const burn = bot.burn ?? 0;
    const strength = clamp(burn / BURN_DRAW_SPAN, 0, 1);
    const time = this.world.elapsed;
    ctx.save();
    ctx.translate(bot.position.x, bot.position.y);
    // Scorched floor ring.
    ctx.globalAlpha = 0.3 * strength;
    ctx.strokeStyle = STATUS.ember;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -time * 14;
    ctx.beginPath();
    ctx.arc(0, 2, BOT_RADIUS + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Three tongues of flame, each on its own flicker phase.
    for (let i = 0; i < 3; i += 1) {
      const phase = time * (7 + i * 1.7) + i * 2.1;
      const flicker = 0.55 + 0.45 * Math.sin(phase);
      const x = -BOT_RADIUS * 0.6 + i * BOT_RADIUS * 0.6;
      const lift = 4 + flicker * 7;
      ctx.globalAlpha = (0.34 + flicker * 0.4) * strength;
      ctx.fillStyle = i === 1 ? STATUS.warning : "#a8552f";
      ctx.beginPath();
      ctx.moveTo(x - 3.4, 0);
      ctx.quadraticCurveTo(x - 1.6, -lift * 0.7, x, -lift);
      ctx.quadraticCurveTo(x + 1.6, -lift * 0.7, x + 3.4, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** A staggered hostile wears two amber ticks: it cannot act, so take the shot. */
  private drawStaggerMark(bot: AgentState): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(bot.position.x, bot.position.y);
    ctx.rotate(this.world.elapsed * 1.4);
    ctx.strokeStyle = "#c9975a";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, BOT_RADIUS + 7, side > 0 ? -0.5 : Math.PI - 0.5, side > 0 ? 0.5 : Math.PI + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The Marksman's focus bank: a brass arc that fills while the operative holds
   * still, closing into a full bracket the moment the next round is heavy.
   */
  private drawFocusGauge(player: PlayerState): void {
    const ctx = this.ctx;
    const ready = player.focusTime >= FOCUS_DRAW_WINDOW;
    const progress = clamp(player.focusTime / FOCUS_DRAW_WINDOW, 0, 1);
    ctx.save();
    ctx.translate(player.position.x, player.position.y);
    ctx.strokeStyle = STATUS.brassArc;
    ctx.lineWidth = ready ? 2.4 : 2;
    ctx.globalAlpha = ready ? 0.95 : 0.5 + progress * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    if (ready) {
      // Crosshair ticks, so "charged" reads even in a busy frame.
      for (let i = 0; i < 4; i += 1) {
        const angle = (Math.PI / 2) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * (PLAYER_RADIUS + 5), Math.sin(angle) * (PLAYER_RADIUS + 5));
        ctx.lineTo(Math.cos(angle) * (PLAYER_RADIUS + 13), Math.sin(angle) * (PLAYER_RADIUS + 13));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * The Ghost mid-phase: the operative fades to an outline with two afterimages
   * behind it and a countdown arc, because "nothing can see me" has to be
   * obvious enough to dash through a firing line on purpose.
   */
  private drawPhaseGhost(player: PlayerState): void {
    const ctx = this.ctx;
    const path = player.moveIntent;
    const length = Math.hypot(path.x, path.y) || 1;
    ctx.save();
    ctx.strokeStyle = STATUS.phaseInk;
    ctx.lineWidth = 1.4;
    for (let i = 1; i <= 2; i += 1) {
      ctx.globalAlpha = 0.3 / i;
      ctx.beginPath();
      ctx.arc(
        player.position.x - (path.x / length) * i * 11,
        player.position.y - (path.y / length) * i * 11,
        PLAYER_RADIUS * (1 - i * 0.12),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, PLAYER_RADIUS + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(player.phaseTime / PHASE_DRAW_SPAN, 0, 1));
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The class weapon, drawn in the operative's hands. Each one is a different
   * object on purpose: a long service rifle, a fat scattergun, a rail with a
   * scope, a stubby carbine, a projector with a tank, and a drum-fed lobber.
   */
  private drawClassWeapon(ctx: CanvasRenderingContext2D, id: LoadoutId, art: (typeof CLASS_ART)["vanguard"], recoil: number): void {
    ctx.fillStyle = art.ink;
    switch (id) {
      case "vanguard": {
        ctx.fillRect(2 - recoil, -2.4, 9, 4.8);
        ctx.fillRect(9 - recoil, -1.4, 12, 2.8);
        ctx.fillStyle = art.shade;
        ctx.fillRect(0 - recoil, -3.4, 6, 6.8);
        ctx.fillRect(5 - recoil, 2.2, 3, 4.2);
        break;
      }
      case "breacher": {
        ctx.fillRect(1 - recoil, -3.6, 11, 7.2);
        ctx.fillRect(11 - recoil, -4.4, 9, 8.8);
        // Muzzle brake fins.
        ctx.fillStyle = art.accent;
        ctx.fillRect(19 - recoil, -4.4, 1.6, 8.8);
        ctx.fillRect(16 - recoil, -4.8, 1.4, 2.4);
        ctx.fillRect(16 - recoil, 2.4, 1.4, 2.4);
        break;
      }
      case "marksman": {
        ctx.fillRect(2 - recoil, -1.2, 26, 2.4);
        ctx.fillStyle = art.shade;
        ctx.fillRect(4 - recoil, 1.2, 4, 4.6);
        ctx.fillStyle = art.ink;
        ctx.fillRect(6 - recoil, -6.2, 8, 3.4);
        ctx.strokeStyle = art.accent;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(12 - recoil, 1.2);
        ctx.lineTo(12 - recoil, 6.4);
        ctx.stroke();
        break;
      }
      case "ghost": {
        ctx.fillRect(2 - recoil, -2.2, 8, 4.4);
        ctx.fillRect(10 - recoil, -1.6, 11, 3.2);
        ctx.fillStyle = art.shade;
        ctx.fillRect(0 - recoil, -3.2, 4, 6.4);
        break;
      }
      case "cinder": {
        // Fuel tank on the back, hose over the shoulder, wide nozzle in front.
        ctx.fillStyle = art.shade;
        ctx.fillRect(-17, -7.5, 7, 15);
        ctx.fillStyle = art.accent;
        ctx.fillRect(-16, -5.5, 2, 3);
        ctx.fillStyle = art.ink;
        ctx.fillRect(2 - recoil, -2.6, 9, 5.2);
        ctx.beginPath();
        ctx.moveTo(11 - recoil, -4.6);
        ctx.lineTo(19 - recoil, -6);
        ctx.lineTo(19 - recoil, 6);
        ctx.lineTo(11 - recoil, 4.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "sapper": {
        ctx.fillStyle = art.shade;
        ctx.beginPath();
        ctx.arc(4 - recoil * 0.5, 0, 6.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = art.ink;
        ctx.fillRect(6 - recoil, -4.4, 12, 8.8);
        ctx.fillStyle = art.accent;
        ctx.beginPath();
        ctx.arc(4 - recoil * 0.5, 0, 3.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default:
        break;
    }
  }

  /** The player: an armoured operative with a visor, a rifle and a walk cycle. */
  private drawOperator(player: PlayerState): void {
    const ctx = this.ctx;
    const loadoutId = this.world.loadout.id;
    const art = CLASS_ART[loadoutId] ?? PLAYER_ART;
    const invulnerable = player.invulnerability > 0;
    const phasing = player.phaseTime > 0;
    const focusReady = this.world.loadout.trait === "focus" && player.focusTime >= FOCUS_DRAW_WINDOW;
    const kick = this.world.loadout.trait === "siege" && player.dashTimer > 0 ? 1.12 : 1;
    const speed = Math.hypot(player.velocity.x, player.velocity.y);
    const walk = this.world.elapsed * 11;
    const step = speed > 12 ? Math.sin(walk) * 2.2 : 0;
    const bob = speed > 12 ? Math.abs(Math.cos(walk)) * 1.1 : 0;

    ctx.save();
    ctx.translate(player.position.x, player.position.y);
    this.drawUnitShadow(ctx, PLAYER_RADIUS + 5);
    // Phasing blinks the operative half-there; i-frames blink faster.
    ctx.globalAlpha = phasing
      ? (Math.floor(this.world.elapsed * 18) % 2 === 0 ? 0.34 : 0.62)
      : invulnerable && Math.floor(this.world.elapsed * 24) % 2 === 0
        ? 0.45
        : 1;
    if (kick !== 1) ctx.scale(kick, kick);
    ctx.rotate(Math.atan2(player.aimDirection.y, player.aimDirection.x));

    // Boots, cycled with movement.
    ctx.fillStyle = art.shade;
    ctx.fillRect(-4 + step, -8.5, 6, 5);
    ctx.fillRect(-4 - step, 3.5, 6, 5);

    // Torso, then the chest plate and shoulder pads.
    ctx.fillStyle = player.hitFlash > 0 ? STATUS.hit : art.body;
    ctx.beginPath();
    ctx.ellipse(-1, 0, 10.5 + bob * 0.2, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = player.hitFlash > 0 ? STATUS.hit : art.plate;
    ctx.beginPath();
    ctx.moveTo(4, -6.5);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-6, 8);
    ctx.lineTo(4, 6.5);
    ctx.closePath();
    ctx.fill();

    // Pauldrons.
    ctx.fillStyle = art.body;
    ctx.fillRect(-5, -11.5, 9, 4.5);
    ctx.fillRect(-5, 7, 9, 4.5);
    ctx.strokeStyle = art.ink;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-5, -11.5, 9, 4.5);
    ctx.strokeRect(-5, 7, 9, 4.5);

    // Backpack and cooling vents.
    ctx.fillStyle = art.shade;
    ctx.fillRect(-12, -5, 5, 10);
    ctx.fillStyle = art.detail ?? art.accent;
    ctx.globalAlpha *= 0.55;
    ctx.fillRect(-11, -3.5, 2, 2);
    ctx.fillRect(-11, 1.5, 2, 2);
    ctx.globalAlpha /= 0.55;

    // The class weapon: stock, receiver, barrel, and a muzzle that recoils.
    const recoil = player.fireCooldown > 0 ? clamp(player.fireCooldown / 0.14, 0, 1) * 2.4 : 0;
    this.drawClassWeapon(ctx, loadoutId, art, recoil);

    // Helmet: dome, brow and an amber visor band.
    ctx.fillStyle = art.plate;
    ctx.beginPath();
    ctx.arc(-1, 0, 7.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = art.body;
    ctx.beginPath();
    ctx.arc(-2.6, 0, 6.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = focusReady ? STATUS.brassArc : art.accent;
    ctx.beginPath();
    ctx.moveTo(4.4, -3.6);
    ctx.lineTo(4.4, 3.6);
    ctx.lineTo(1.2, 2.6);
    ctx.lineTo(1.2, -2.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = art.ink;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // Antenna.
    ctx.strokeStyle = art.shade;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-10, -8.5);
    ctx.stroke();
    ctx.restore();

    // Kit readouts, drawn over the model: focus bank, phase window.
    if (this.world.loadout.trait === "focus" && (player.focusTime > 0.05 || focusReady)) this.drawFocusGauge(player);
    if (phasing) this.drawPhaseGhost(player);

    // Invulnerability bubble: a thin ring, no glow.
    if (invulnerable) {
      ctx.save();
      ctx.strokeStyle = "rgba(184, 208, 230, 0.5)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, PLAYER_RADIUS + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }


  /** Shockwaves: a ground ring plus a few dust motes thrown outward. */
  private drawPulses(): void {
    const ctx = this.ctx;
    for (const pulse of this.pulses) {
      const progress = 1 - pulse.life / pulse.maxLife;
      const radius = pulse.radius + progress * 44;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.45;
      ctx.strokeStyle = pulse.color;
      ctx.lineWidth = 3 * (1 - progress) + 0.6;
      // Squashed vertically so the ring lies on the floor plane.
      ctx.beginPath();
      ctx.ellipse(pulse.position.x, pulse.position.y + 4, radius, radius * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.position.x, particle.position.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    for (const text of this.texts) {
      const progress = 1 - text.life / text.maxLife;
      ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.font = `700 ${text.size}px 'DM Mono', monospace`;
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.position.x, text.position.y - progress * 6);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  private drawOverlays(): void {
    const ctx = this.ctx;
    const player = this.world.player;
    const healthFraction = clamp(player.health / Math.max(1, player.maxHealth), 0, 1);

    // Damage vignette: flares on a hit and pulses while critically wounded.
    const lowHealthPulse = healthFraction < 0.35 ? (0.35 - healthFraction) * (0.55 + 0.45 * Math.sin(this.world.elapsed * 6)) : 0;
    const vignette = clamp(this.flash + lowHealthPulse, 0, 1);
    if (vignette > 0.01) {
      const gradient = ctx.createRadialGradient(WORLD.width / 2, WORLD.height / 2, WORLD.height * 0.32, WORLD.width / 2, WORLD.height / 2, WORLD.height * 0.78);
      gradient.addColorStop(0, "rgba(190, 78, 62, 0)");
      gradient.addColorStop(1, `rgba(190, 78, 62, ${0.42 * vignette})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }

    // Directional damage indicator: shows where the last hit came from.
    if (player.hitFlash > 0) {
      const angle = Math.atan2(player.lastHitDirection.y, player.lastHitDirection.x);
      ctx.save();
      ctx.translate(player.position.x, player.position.y);
      ctx.rotate(angle);
      ctx.globalAlpha = clamp(player.hitFlash / 0.3, 0, 1) * 0.85;
      ctx.strokeStyle = "#c9695a";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 40, -0.34, 0.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(40, -6);
      ctx.lineTo(40, 6);
      ctx.stroke();
      ctx.restore();
    }

    // Wave banner during the telegraph window.
    if (this.bannerTimer > 0 && this.waveBanner.title) {
      const alpha = clamp(this.bannerTimer / 0.6, 0, 1) * clamp((2.4 - this.bannerTimer) / 0.28 + 0.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.textAlign = "center";
      ctx.fillStyle = "#e9f6ff";
      ctx.font = "700 26px 'Space Grotesk', sans-serif";
      ctx.fillText(this.waveBanner.title, WORLD.width / 2, 74);
      ctx.fillStyle = "rgba(207, 162, 95, 0.9)";
      ctx.font = "600 11px 'DM Mono', monospace";
      ctx.fillText(this.waveBanner.subtitle, WORLD.width / 2, 94);
      if (this.waveBanner.hint) {
        ctx.fillStyle = "rgba(157, 243, 255, 0.75)";
        ctx.fillText(this.waveBanner.hint, WORLD.width / 2, 112);
      }
      ctx.strokeStyle = "rgba(207, 162, 95, 0.5)";
      ctx.lineWidth = 2;
      const width = 240;
      const ready = clamp(1 - this.bannerTimer / 2.4, 0, 1);
      ctx.beginPath();
      ctx.moveTo(WORLD.width / 2 - width / 2, this.waveBanner.hint ? 122 : 104);
      ctx.lineTo(WORLD.width / 2 - width / 2 + width * ready, 104);
      ctx.stroke();
      ctx.restore();
      ctx.textAlign = "left";
    }

    // Corner telemetry so the canvas is readable without the side panel.
    ctx.save();
    ctx.font = "600 9px 'DM Mono', monospace";
    const currentWave = Math.max(1, this.world.wave);
    ctx.fillStyle = "rgba(180, 205, 225, 0.55)";
    ctx.fillText(`THREAT ${String(currentWave).padStart(2, "0")}/${String(MAX_WAVES).padStart(2, "0")}`, 26, 34);
    const hostiles = this.world.bots.filter((bot) => bot.alive).length;
    ctx.fillStyle = hostiles > 0 ? "rgba(201, 105, 90, 0.8)" : "rgba(143, 180, 140, 0.8)";
    ctx.fillText(`HOSTILES ${String(hostiles).padStart(2, "0")}`, 26, 48);
    if (this.world.pendingSpawns.length > 0) {
      ctx.fillStyle = "rgba(207, 162, 95, 0.85)";
      ctx.fillText(`INBOUND ${String(this.world.pendingSpawns.length).padStart(2, "0")}`, 26, 62);
    }
    const predictability = playerPredictability(this.world);
    ctx.fillStyle = "rgba(150, 175, 200, 0.4)";
    ctx.fillText("MIRROR READ", WORLD.width - 118, 34);
    ctx.fillStyle = predictability > 0.5 ? "rgba(181, 140, 255, 0.95)" : "rgba(110, 130, 155, 0.6)";
    ctx.fillRect(WORLD.width - 118, 40, 92 * predictability, 3);
    ctx.strokeStyle = "rgba(110, 130, 155, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(WORLD.width - 118.5, 39.5, 92, 4);
    ctx.restore();
  }
}

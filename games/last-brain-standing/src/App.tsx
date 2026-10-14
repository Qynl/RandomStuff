import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArenaGame, type FeedLine, type GameSnapshot, type RunResult } from "./game";
import { DIFFICULTIES } from "./constants";
import { buildRunSummary } from "./scoring";
import { BOT_KINDS, BOT_PROFILES, summarizeMirrorRead } from "./ai";
import { BOT_SYMBOLS } from "./art";
import { isMobileUserAgent, shouldShowTouchControls, stickVectorFromPointer } from "./input";
import { layoutForSeed, layoutRecordForSeed } from "./arena";
import { DEFAULT_LOADOUT, LOADOUTS, LOADOUT_ORDER, type LoadoutId } from "./loadouts";
import { createRandomSeed, formatSeed, normalizeSeed } from "./rng";
import {
  buildShareUrl,
  describeRunCode,
  describeShare,
  looksLikeRunCode,
  normalizeSeedText,
  parseRunCode,
  type RunCode
} from "./share";
import type { AimMode, DifficultyId, Vec2 } from "./types";
import HomeScreen from "./HomeScreen";
import SettingsPanel from "./SettingsPanel";

const TONE_GLYPH: Record<FeedLine["tone"], string> = { info: "·", good: "▲", bad: "▼", warn: "!" };

type UiState = "start" | "playing" | "paused" | "victory" | "defeat" | "profile";
/** Which of the three full-screen places the player is looking at. */
type Screen = "home" | "game" | "profile";

export interface AppProps {
  /**
   * Called with the engine once it is constructed. Lets an embedder (or a test
   * harness) drive the runtime without reaching into the DOM.
   */
  onGameReady?: (game: ArenaGame) => void;
}

export default function App({ onGameReady }: AppProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ArenaGame | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>("standard");
  const [aimMode, setAimMode] = useState<AimMode>("mouse");
  const [problem, setProblem] = useState<string | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [shakeEnabled, setShakeEnabled] = useState(true);
  const [muted, setMuted] = useState(false);
  const [debug, setDebug] = useState(false);
  const [touchOverride, setTouchOverride] = useState<boolean | null>(null);
  const [touchCapable, setTouchCapable] = useState(false);
  const [stick, setStick] = useState<Vec2>({ x: 0, y: 0 });
  const [firing, setFiring] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<RunCode | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  // Where "PROFILE" should hand the player back to: the lobby, or the run they
  // paused to look at their own record.
  const [profileReturn, setProfileReturn] = useState<Exclude<Screen, "profile">>("home");

  // ------------------------------------------------------------- engine setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let game: ArenaGame;
    try {
      game = new ArenaGame({
        canvas,
        onSnapshot: (next) => setSnapshot(next),
        onFeed: (line) => setFeed((current) => (current[0]?.id === line.id ? current : [line, ...current].slice(0, 7))),
        onRunEnd: (runResult) => setResult(runResult)
      });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The arena could not start.");
      return;
    }
    gameRef.current = game;
    setDifficulty(game.activeWorld.difficulty);
    setMuted(game.isMuted());
    setShakeEnabled(game.isShakeEnabled());
    setAimMode(game.getAimMode());
    onGameReady?.(game);
    return () => {
      game.destroy();
      gameRef.current = null;
    };
    // The engine is created once per mount; `onGameReady` is a construction hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------- shareable run codes
  // A link like `#seed=1A2B3C&level=veteran` prefills the start screen, so a
  // run can be handed to someone else and replayed exactly.
  useEffect(() => {
    const code = parseRunCode(window.location.hash);
    if (!code) return;
    setPendingCode(code);
    setSeedInput(code.seed);
    setDifficulty(code.difficulty);
    gameRef.current?.setDifficulty(code.difficulty);
  }, []);

  // ---------------------------------------------------------- input capability
  useEffect(() => {
    const query = (value: string) => (typeof window.matchMedia === "function" ? window.matchMedia(value) : null);
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    // Remembered as a capability for the settings toggle, which decides what it
    // flips to; it is deliberately not the same thing as "is a phone".
    setTouchCapable(hasTouch);
    const decide = () =>
      setTouchOverride(
        shouldShowTouchControls({
          coarsePointer: query("(pointer: coarse)")?.matches ?? false,
          finePointer: query("(pointer: fine)")?.matches ?? false,
          mobileUserAgent: isMobileUserAgent(navigator.userAgent ?? ""),
          viewportWidth: window.innerWidth ?? 0,
          touchEvents: hasTouch,
          userOverride: null
        })
      );
    decide();
    // Rotating a phone or resizing a window can change the answer, so re-decide
    // instead of latching the first guess.
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, []);

  const career = snapshot?.career ?? null;
  const activeLoadout = snapshot?.loadout ?? DEFAULT_LOADOUT;
  const showTouchControls = touchOverride === true;
  const uiState: UiState = useMemo(() => {
    // The profile is a screen, not a game state: it sits above the run whether
    // the run is standing by, paused or finished.
    if (screen === "profile") return "profile";
    if (!snapshot) return "start";
    if (snapshot.phase === "victory") return "victory";
    if (snapshot.phase === "defeat") return "defeat";
    if (!snapshot.started) return "start";
    return snapshot.paused ? "paused" : "playing";
  }, [snapshot, screen]);

  useEffect(() => {
    gameRef.current?.setTouchMovement(stick);
  }, [stick]);

  useEffect(() => {
    gameRef.current?.setTouchFiring(firing);
  }, [firing]);

  useEffect(() => {
    if (!firing) return;
    const release = () => setFiring(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [firing]);

  // Release the virtual stick if the pointer stream dies mid-drag.
  useEffect(() => {
    const release = () => setStick({ x: 0, y: 0 });
    window.addEventListener("blur", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("blur", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  const debugRef = useRef(false);
  useEffect(() => {
    debugRef.current = debug;
    gameRef.current?.setDebug(debug);
  }, [debug]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F3") {
        event.preventDefault();
        setDebug(!debugRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------------ actions
  const startRun = useCallback((seed?: string) => {
    setScreen("game");
    setResult(null);
    setFeed([]);
    setShareNotice(null);
    const game = gameRef.current;
    game?.beginRun(seed && seed.trim().length > 0 ? seed.trim() : undefined);
    if (!game) return;
    // Keep the address bar replayable: opening the link again starts the same fight.
    const code: RunCode = { seed: game.getSeedLabel(), difficulty: game.activeWorld.difficulty };
    setPendingCode(code);
    try {
      window.history.replaceState(null, "", buildShareUrl(window.location.href, code));
    } catch {
      /* History may be unavailable; the run itself is unaffected. */
    }
  }, []);

  /**
   * The seed field accepts three things: a seed, a run code, or a shared link.
   * Pasting `#seed=1A2B3C&level=veteran` unpacks into the seed *and* the
   * difficulty instead of being squashed into one long "seed".
   */
  const applySeedText = useCallback(
    (raw: string) => {
      if (looksLikeRunCode(raw)) {
        const code = parseRunCode(raw);
        if (code) {
          setSeedInput(code.seed);
          setDifficulty(code.difficulty);
          gameRef.current?.setDifficulty(code.difficulty);
          setShareNotice(`Run code loaded: ${describeRunCode(code)}`);
          return;
        }
      }
      setSeedInput(normalizeSeedText(raw));
      setShareNotice(null);
    },
    []
  );

  const copyShareLink = useCallback(async () => {
    const game = gameRef.current;
    if (!game) return;
    const code: RunCode = pendingCode ?? { seed: game.getSeedLabel(), difficulty: game.activeWorld.difficulty };
    const link = buildShareUrl(window.location.href, code);
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        copied = true;
      }
    } catch {
      copied = false;
    }
    setShareNotice(copied ? describeShare(code) : link);
  }, [pendingCode]);

  const resume = useCallback(() => gameRef.current?.resumeRun(), []);
  const togglePause = useCallback(() => gameRef.current?.togglePause(), []);

  const changeDifficulty = useCallback((next: DifficultyId) => {
    setDifficulty(next);
    gameRef.current?.setDifficulty(next);
  }, []);

  const chooseLoadout = useCallback((next: LoadoutId) => {
    gameRef.current?.setLoadout(next);
  }, []);

  const changeAimMode = useCallback((next: AimMode) => {
    setAimMode(next);
    gameRef.current?.setAimMode(next);
  }, []);

  const toggleMute = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const next = !game.isMuted();
    game.setMuted(next);
    setMuted(next);
  }, []);

  const toggleShake = useCallback(() => {
    const next = !shakeEnabled;
    setShakeEnabled(next);
    gameRef.current?.setShakeEnabled(next);
  }, [shakeEnabled]);

  const healthPercent = snapshot ? Math.round((snapshot.health / Math.max(1, snapshot.maxHealth)) * 100) : 100;
  /** Arena the typed seed will play in, shown on the command screen. */
  const seedArena = useMemo(
    () => (seedInput.trim().length > 0 ? layoutForSeed(normalizeSeed(seedInput)) : null),
    [seedInput]
  );
  // Number keys swap class on the command screen: the ribbon numbers itself, so
  // the fastest path to "the flamethrower this time" is one keystroke.
  useEffect(() => {
    if (screen !== "home") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const slot = Number.parseInt(event.key, 10);
      if (!Number.isFinite(slot) || slot < 1 || slot > LOADOUT_ORDER.length) return;
      event.preventDefault();
      chooseLoadout(LOADOUT_ORDER[slot - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, chooseLoadout]);

  const openProfile = useCallback((from: Exclude<Screen, "profile">) => {
    setProfileReturn(from);
    setScreen("profile");
  }, []);
  const closeProfile = useCallback(() => setScreen(profileReturn), [profileReturn]);
  const rollSeed = useCallback(() => {
    setSeedInput(formatSeed(createRandomSeed()));
    setShareNotice(null);
  }, []);
  const summaryRows = useMemo(
    () =>
      result
        ? buildRunSummary(result.stats, result.score, result.seedLabel, result.isBest, {
            endedBy: result.endedBy,
            killsByKind: result.killsByKind,
            perfect: result.perfect,
            arenaName: result.arenaName,
            bestScoreOnDifficulty: result.previousBestScore,
            isDifficultyBest: result.isDifficultyBest
          })
        : [],
    [result]
  );
  const mirrorSummary = useMemo(() => summarizeMirrorRead(snapshot?.mirrorRead ?? null), [snapshot?.mirrorRead]);
  // Screen readers get one short, meaningful sentence per state change instead of
  // every hit, frame counter and feed line.
  const topRuns = snapshot?.topRuns ?? [];
  const announcement = useMemo(
    () => describeAnnouncement(uiState, snapshot, result),
    [uiState, snapshot, result]
  );
  const dashReady = (snapshot?.dashCharge ?? 1) >= 0.999;
  const seedLabel = result?.seedLabel ?? snapshot?.seedLabel ?? "—";

  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  /** The lobby's deploy button, focused whenever the command screen is shown. */
  const deployButtonRef = useRef<HTMLButtonElement>(null);
  /** The way out of the profile, focused while it is open. */
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  // Keyboard players should never have to hunt for the button: focus the
  // primary action whenever an overlay appears, and the arena when a run starts.
  useEffect(() => {
    if (uiState === "playing") {
      canvasRef.current?.focus({ preventScroll: true });
      return;
    }
    if (uiState === "start") {
      deployButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    if (uiState === "profile") {
      profileButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    primaryButtonRef.current?.focus({ preventScroll: true });
  }, [uiState]);

  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const handleStickPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = stickRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setStick(
      stickVectorFromPointer(
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        { x: event.clientX, y: event.clientY },
        rect.width / 2
      )
    );
  }, []);
  const releaseStick = useCallback(() => {
    stickPointer.current = null;
    setStick({ x: 0, y: 0 });
  }, []);

  return (
    <main className={`shell screen-${screen}${showTouchControls ? " touch-mode" : ""}${uiState === "start" ? " has-overlay" : ""}`}>
      <header className="topbar">
        {screen === "home" ? (
          <button type="button" className="medallion" onClick={() => openProfile("home")}>
            <span className="medallion-rank" aria-hidden="true">{career?.rank.insignia ?? "I"}</span>
            <span className="medallion-copy">
              <strong>OPERATOR PROFILE</strong>
              <small>CAREER {(career?.score ?? 0).toLocaleString()} · {career?.runs ?? 0} RUNS</small>
            </span>
          </button>
        ) : (
          <div className="brand" aria-label="Last Brain Standing">
            <span className="brand-mark">LB<span>/</span>S</span>
            <span className="brand-copy"><strong>LAST BRAIN</strong><small>STANDING</small></span>
          </div>
        )}
        <div className="top-status">
          {screen === "home" ? (
            <>
              <span className="chip"><em>CAREER</em> <strong>{(career?.score ?? 0).toLocaleString()}</strong></span>
              <span className="chip"><em>RUNS</em> <strong>{career?.runs ?? 0}</strong></span>
              <span className="chip"><em>KILLS</em> <strong>{career?.kills ?? 0}</strong></span>
              <span className="chip"><em>BADGES</em> <strong>{career?.badgesEarned ?? 0}/{career?.badges.length ?? 0}</strong></span>
            </>
          ) : (
            <>
              <span className={`live-dot${uiState === "playing" ? " active" : uiState === "defeat" ? " danger" : ""}`} />
              <span aria-hidden="true">{statusLabel(uiState, snapshot)}</span>
              <span className="status-divider" aria-hidden="true" />
              <span aria-hidden="true">{debug && snapshot ? `${snapshot.fps} FPS · ${snapshot.frameMs} MS` : "BUILD 0.3"}</span>
              <span className="status-divider" aria-hidden="true" />
              <span aria-hidden="true">SEED {seedLabel}</span>
            </>
          )}
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
            aria-keyshortcuts="M"
            title={muted ? "Unmute (M)" : "Mute (M)"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            className={`icon-button${debug ? " active" : ""}`}
            type="button"
            onClick={() => setDebug((current) => !current)}
            aria-pressed={debug}
            aria-label="Toggle telemetry overlay"
            aria-keyshortcuts="F3"
            title="Telemetry overlay (F3)"
          >
            ⌗
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={togglePause}
            aria-label={uiState === "playing" ? "Pause game" : "Resume game"}
            aria-keyshortcuts="Escape"
            title={uiState === "playing" ? "Pause (Esc)" : "Resume (Esc)"}
            disabled={uiState === "start" || uiState === "victory" || uiState === "defeat"}
          >
            {uiState === "playing" ? "Ⅱ" : "▶"}
          </button>
          {screen !== "home" ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => setScreen("home")}
              disabled={uiState === "playing"}
              aria-label="Back to the command screen"
              title={uiState === "playing" ? "Finish the run first" : "Back to command"}
            >
              ⌂
            </button>
          ) : null}
        </div>
      </header>

      <section className={`game-layout${screen === "home" ? " offstage" : ""}`} aria-label="Game arena">
        <div className="arena-wrap">
          <canvas
            ref={canvasRef}
            id="game"
            width="960"
            height="600"
            tabIndex={0}
            aria-label="Top-down combat arena. Move with W A S D or the arrow keys, aim with the mouse or by dragging, fire with click or Space, dash with Shift, pause with Escape, restart with R."
          />
          <div className="arena-vignette" aria-hidden="true" />
          <div className="arena-label"><span className="tiny-square" /> SECTOR 01 <span className="label-separator">/</span> TEST CHAMBER</div>
          {snapshot && snapshot.combo > 1 ? (
            <div className="combo-badge" key={snapshot.combo}>CHAIN ×{snapshot.combo}</div>
          ) : null}
          <div className="arena-bottom" aria-hidden="true">
            <span id="arena-message">{messageFor(uiState, snapshot)}</span>
            <span className="arena-hints">WASD MOVE&nbsp; · &nbsp;MOUSE AIM&nbsp; · &nbsp;CLICK FIRE&nbsp; · &nbsp;SHIFT DASH&nbsp; · &nbsp;ESC PAUSE</span>
          </div>
          {problem ? <div className="problem-banner" role="alert">{problem}</div> : null}
          {showTouchControls && uiState === "playing" ? (
            <div className="touch-hint" aria-hidden="true">
              {aimMode === "assisted" ? "ASSISTED AIM TARGETS AUTOMATICALLY" : "DRAG THE ARENA TO AIM"}
            </div>
          ) : null}

          {showTouchControls ? (
            <div className="touch-layer" aria-hidden={uiState !== "playing"}>
              <div
                ref={stickRef}
                className="touch-stick"
                role="presentation"
                onPointerDown={(event) => {
                  stickPointer.current = event.pointerId;
                  if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
                  handleStickPointer(event);
                }}
                onPointerMove={(event) => {
                  if (stickPointer.current !== event.pointerId) return;
                  handleStickPointer(event);
                }}
                onPointerUp={releaseStick}
                onPointerCancel={releaseStick}
                onLostPointerCapture={releaseStick}
              >
                <span className="touch-stick-ring" />
                <span className="touch-stick-knob" style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }} />
              </div>
              <div className="touch-buttons">
                <button
                  type="button"
                  className={`touch-button dash-button${dashReady ? " ready" : ""}`}
                  aria-keyshortcuts="Shift"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    gameRef.current?.queueDash();
                  }}
                  disabled={uiState !== "playing"}
                >
                  <span className="dash-ring" style={{ ["--charge" as string]: `${(snapshot?.dashCharge ?? 1) * 360}deg` }} />
                  DASH
                </button>
                <button
                  type="button"
                  className={`touch-button fire-button${firing ? " active" : ""}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
                    setFiring(true);
                  }}
                  onPointerUp={() => setFiring(false)}
                  onPointerCancel={() => setFiring(false)}
                  onLostPointerCapture={() => setFiring(false)}
                  disabled={uiState !== "playing"}
                >
                  FIRE
                </button>
              </div>
            </div>
          ) : null}

          <div id="overlay" className={`overlay${uiState === "playing" || uiState === "start" ? " hidden" : ""}`}>
            <div className={`overlay-card${uiState === "victory" || uiState === "defeat" ? " result" : ""}`}>
              {uiState === "paused" ? (
                <>
                  <div className="eyebrow"><span className="live-dot" /> SIMULATION PAUSED</div>
                  <h1>TAKE A<br /><span>BREATHER.</span></h1>
                  <p>The bots are not going anywhere. Threat level {String(Math.max(1, snapshot?.wave ?? 1)).padStart(2, "0")} is live, {snapshot?.hostileCount ?? 0} hostile{(snapshot?.hostileCount ?? 0) === 1 ? "" : "s"} on the floor.</p>
                  <button ref={primaryButtonRef} className="primary-button" type="button" onClick={resume}>
                    <span>RESUME RUN</span><span aria-hidden="true">↗</span>
                  </button>
                  <button className="ghost-button wide" type="button" onClick={() => startRun(seedInput)}>RESTART FROM SCRATCH</button>
                  <button className="ghost-button wide" type="button" onClick={() => setScreen("home")}>RETURN TO COMMAND</button>
                  <div className="overlay-foot"><span>DIFFICULTY {DIFFICULTIES[difficulty].label}</span><span>SEED {seedLabel}</span></div>
                </>
              ) : null}

              {uiState === "victory" || uiState === "defeat" ? (
                <>
                  <div className="eyebrow">
                    <span className={`live-dot${uiState === "victory" ? " active" : " danger"}`} />
                    {uiState === "victory" ? "ARENA CONQUERED" : "RUN TERMINATED"}
                  </div>
                  <h1 className="result-title">
                    {uiState === "victory" ? <>ALL FIVE<br /><span>CLEARED.</span></> : <>RUN<br /><span>TERMINATED.</span></>}
                    <em className="grade">{result?.grade ?? "–"}</em>
                  </h1>
                  <p>
                    {uiState === "victory"
                      ? result?.perfect
                        ? "Clean sweep: all five threat levels cleared without taking a single point of damage. That is the hardest badge in the game."
                        : "Every profile outlasted. Faster clears and cleaner shooting push the score higher."
                      : "Watch the telegraph rings, keep your dash for the shot you cannot walk out of, and punish the wind-up."}
                  </p>
                  {uiState === "defeat" && result?.endedBy && result.endedBy !== "unknown" ? (
                    <p className="counter-hint">
                      <strong>{BOT_PROFILES[result.endedBy].name}</strong> ended that run. Next time: {BOT_PROFILES[result.endedBy].counter.toLowerCase()}.
                    </p>
                  ) : null}
                  <p className="score-breakdown" aria-label="Score breakdown">
                    KILLS {result?.score.kills ?? 0} · WAVES {result?.score.waves ?? 0} · ACCURACY {result?.score.accuracy ?? 0} · PACE {result?.score.speed ?? 0} · CUTS {result?.score.interrupts ?? 0}
                  </p>
                  <dl className="summary-grid">
                    {summaryRows.map((row) => (
                      <div key={row.label} className={row.emphasis ? "summary-row emphasis" : "summary-row"}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="loadout-row compact-row">
                    {LOADOUT_ORDER.map((id) => {
                      const weapon = LOADOUTS[id];
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`loadout-card${activeLoadout === id ? " selected" : ""}`}
                          aria-pressed={activeLoadout === id}
                          title={`${weapon.counter} ${weapon.traitName}: ${weapon.traitRule}`}
                          onClick={() => chooseLoadout(id)}
                        >
                          <span className="loadout-kind">SWAP</span>
                          <strong>{weapon.kind}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="overlay-actions">
                    <button ref={primaryButtonRef} className="primary-button" type="button" onClick={() => startRun(seedInput)}>
                      <span>RUN IT BACK</span><span aria-hidden="true">↻</span>
                    </button>
                    <button className="ghost-button wide" type="button" onClick={() => startRun(seedLabel)}>REPLAY SEED {seedLabel}</button>
                    <button className="ghost-button wide" type="button" onClick={copyShareLink}>COPY SEED LINK</button>
                    <button className="ghost-button wide" type="button" onClick={() => openProfile("game")}>
                      OPERATOR PROFILE
                    </button>
                    <button className="ghost-button wide" type="button" onClick={() => setScreen("home")}>
                      RETURN TO COMMAND
                    </button>
                    <div className="seed-preview">
                    <button
                      type="button"
                      className="ghost-button compact"
                      title="Pick a fresh random seed"
                      onClick={() => {
                        const fresh = formatSeed(createRandomSeed());
                        setSeedInput(fresh);
                        setShareNotice(null);
                      }}
                    >
                      RANDOM
                    </button>
                    <span className="seed-arena">
                      {seedInput.length > 0
                        ? `ARENA ${layoutRecordForSeed(normalizeSeed(seedInput)).name}`
                        : "TYPE OR PASTE A SEED TO SEE ITS ARENA"}
                    </span>
                  </div>
                  {shareNotice ? <p className="share-notice" role="status">{shareNotice}</p> : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="side-panel" aria-label="Run telemetry">
          <div className="panel-section run-section">
            <div className="section-kicker">CURRENT RUN <span className="kicker-line" /></div>
            <div className="score-row">
              <div><span className="stat-label">ELIMINATIONS</span><strong>{String(snapshot?.kills ?? 0).padStart(2, "0")}</strong></div>
              <div className="best-stat"><span className="stat-label">BEST</span><strong>{String(snapshot?.bestKills ?? 0).padStart(2, "0")}</strong></div>
            </div>
            <div className="wave-row">
              <span>THREAT LEVEL</span>
              <strong>{String(Math.max(1, snapshot?.wave ?? 1)).padStart(2, "0")} <i>/ 05</i></strong>
            </div>
            <div className="wave-track"><span style={{ width: `${Math.min(100, Math.max(0, ((snapshot?.wave ?? 0) / 5) * 100))}%` }} /></div>
            <div className="meta-row"><span>SCORE</span><strong>{snapshot?.score ?? 0}</strong></div>
            <div className="meta-row"><span>TIME</span><strong>{clock(snapshot?.stats.elapsed ?? 0)}</strong></div>
            <div className="meta-row"><span>ACCURACY</span><strong>{accuracy(snapshot)}</strong></div>
            <div className="meta-row briefing"><span>COMPOSITION</span><strong>{snapshot?.briefing ?? "—"}</strong></div>
            {snapshot?.waveState === "telegraph" ? (
              <div className="meta-row inbound">
                <span>INBOUND</span>
                <strong>{snapshot.waveTimer.toFixed(1)}s · {snapshot.briefing}</strong>
              </div>
            ) : null}
            {snapshot && snapshot.hint ? <p className="wave-hint">{snapshot.hint}</p> : null}
            {snapshot ? (
              <div className="meta-row">
                <span>ARENA</span>
                <strong>{snapshot.arenaName}</strong>
              </div>
            ) : null}
            {snapshot ? (
              <>
                <div className="meta-row">
                  <span>WEAPON</span>
                  <strong>{LOADOUTS[activeLoadout].name}</strong>
                </div>
                <div className="meta-row kit-row" data-class={activeLoadout}>
                  <span>CLASS KIT · {LOADOUTS[activeLoadout].traitName}</span>
                  <strong className={kitState(activeLoadout, snapshot).ready ? "ready" : ""}>
                    {kitState(activeLoadout, snapshot).label}
                  </strong>
                </div>
                {kitState(activeLoadout, snapshot).meter > 0 ? (
                  <div className="kit-track" aria-hidden="true">
                    <span style={{ width: `${Math.round(kitState(activeLoadout, snapshot).meter * 100)}%` }} />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="panel-section">
            <div className="section-kicker">YOUR STATUS <span className="kicker-line" /></div>
            <div className="health-heading"><span>INTEGRITY</span><strong>{healthPercent}%</strong></div>
            <div className="health-track"><span className={healthPercent <= 35 ? "low" : ""} style={{ width: `${healthPercent}%` }} /></div>
            <div className="dash-status">
              <span className="dash-icon">✳</span>
              <span>DASH CHARGE</span>
              <strong className={dashReady ? "ready" : ""}>{dashReady ? "READY" : `${Math.round((1 - (snapshot?.dashCharge ?? 1)) * 100)}%`}</strong>
            </div>
            <div className="dash-track"><span style={{ width: `${(snapshot?.dashCharge ?? 1) * 100}%` }} /></div>
            <div className="predictability">
              <span>MIRROR READ</span>
              <div className="predictability-track">
                <span
                  className={mirrorSummary.focus ? "live" : ""}
                  style={{
                    width: `${Math.round(
                      Math.max(snapshot?.mirrorRead?.movement ?? 0, snapshot?.mirrorRead?.firing ?? 0) * 100
                    )}%`
                  }}
                />
              </div>
              <strong>{mirrorSummary.focus ? "ADAPTING" : "LEARNING"}</strong>
            </div>
            <p className={`mirror-advice${mirrorSummary.focus ? " hot" : ""}`}>
              {snapshot?.mirrorEcho ? <em className="mirror-echo">ECHOING {snapshot.mirrorEcho}</em> : null}
              {mirrorSummary.label}
              {mirrorSummary.focus ? <em>{mirrorSummary.counter}</em> : null}
            </p>
          </div>

          <div className="panel-section history-section">
            <div className="section-kicker">BEST RUNS <span className="kicker-line" /></div>
            {topRuns.length === 0 ? (
              <p className="empty-feed">No finished runs on this device yet.</p>
            ) : (
              <ol className="history-list">
                {topRuns.map((run, index) => (
                  <li key={`${run.seed}-${run.score}-${index}`} className={index === 0 ? "best" : ""}>
                    <span className="history-rank">{index + 1}</span>
                    <span className="history-score">{run.score}</span>
                    <span className="history-meta">
                      {run.kills} kills · {DIFFICULTIES[run.difficulty].label}
                      {run.victory ? " · CLEARED" : ""}
                      {run.arenaName ? ` · ${run.arenaName}` : ""} · seed {run.seed}
                      <button
                        type="button"
                        className="history-replay"
                        title={`Replay seed ${run.seed} on ${DIFFICULTIES[run.difficulty].label}`}
                        onClick={() => {
                          setDifficulty(run.difficulty);
                          gameRef.current?.setDifficulty(run.difficulty);
                          startRun(run.seed);
                        }}
                      >
                        REPLAY
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="panel-section opponents-section">
            <div className="section-kicker">OPPONENT PROFILES <span className="kicker-line" /></div>
            {BOT_KINDS.map((kind) => {
              const alive = snapshot?.liveKinds[kind] ?? 0;
              return (
                <div className="opponent" key={kind} data-bot={kind} title={BOT_PROFILES[kind].counter}>
                  <span className={`opponent-symbol ${kind}-symbol`} aria-hidden="true">
                    {BOT_SYMBOLS[kind]}
                  </span>
                  <div className="opponent-copy">
                    <strong>{BOT_PROFILES[kind].name}</strong>
                    <small>
                      {BOT_PROFILES[kind].tactic} · <span className="opponent-attack">{BOT_PROFILES[kind].attackLabel}</span>
                    </small>
                    <em className="opponent-signature">{BOT_PROFILES[kind].signature}</em>
                  </div>
                  <span className={`opponent-state${alive > 0 ? "" : " down"}`}>{alive > 0 ? `×${alive}` : "DOWN"}</span>
                </div>
              );
            })}
            <div className="telegraph-legend">
              <span className="legend-rings" aria-hidden="true">
                <i className="legend-ring hunter" />
                <i className="legend-ring flanker" />
                <i className="legend-ring mirror" />
              </span>
              <span>
                A RING MEANS THAT PROFILE IS ABOUT TO FIRE. BREAK COVER OR DASH THE LINE.
              </span>
            </div>
          </div>

          {debug ? (
            <div className="panel-section debug-section">
              <div className="section-kicker">TELEMETRY <span className="kicker-line" /></div>
              <div className="meta-row"><span>FRAME</span><strong>{snapshot ? `${snapshot.frameMs} ms / ${snapshot.fps} fps` : "—"}</strong></div>
              <div className="meta-row"><span>HOSTILES</span><strong>{snapshot?.hostileCount ?? 0}</strong></div>
              <div className="meta-row"><span>INBOUND</span><strong>{snapshot?.waveState === "telegraph" ? "TELEGRAPHING" : "—"}</strong></div>
              <div className="meta-row"><span>SHOTS / HITS</span><strong>{snapshot ? `${snapshot.stats.shotsFired} / ${snapshot.stats.shotsHit}` : "—"}</strong></div>
              <div className="meta-row"><span>DODGES</span><strong>{snapshot?.stats.dodges ?? 0}</strong></div>
              <div className="meta-row"><span>WIND-UP CUTS</span><strong>{snapshot?.stats.interrupts ?? 0}</strong></div>
              <div className="meta-row"><span>DAMAGE OUT/IN</span><strong>{snapshot ? `${Math.round(snapshot.stats.damageDealt)} / ${Math.round(snapshot.stats.damageTaken)}` : "—"}</strong></div>
              <div className="meta-row"><span>HIT-STOP</span><strong>{snapshot ? `${Math.round(snapshot.hitStop * 1000)} ms` : "—"}</strong></div>
              <div className="meta-row"><span>FLASH / SHAKE</span><strong>{snapshot ? `${snapshot.flash.toFixed(2)} / ${snapshot.shakeEnabled ? "ON" : "CALM"}` : "—"}</strong></div>
              <div className="meta-row"><span>I-FRAMES</span><strong>{snapshot?.invulnerable ? "ACTIVE" : "—"}</strong></div>
              <div className="meta-row"><span>AIM ASSIST TARGET</span><strong>{snapshot?.assistTarget ? "LOCKED" : "—"}</strong></div>
            </div>
          ) : null}

          <SettingsPanel
            difficulty={difficulty}
            onDifficulty={changeDifficulty}
            bestScore={snapshot?.difficultyBestScore ?? 0}
            bestKills={snapshot?.difficultyBestKills ?? 0}
            aimMode={aimMode}
            onAimMode={changeAimMode}
            shakeEnabled={shakeEnabled}
            onShakeToggle={toggleShake}
            showTouchControls={showTouchControls}
            onTouchToggle={() => setTouchOverride((current) => !(current ?? touchCapable))}
            debug={debug}
            onDebugToggle={() => setDebug((current) => !current)}
          />
          <div className="panel-section log-section">
            <div className="section-kicker">COMBAT FEED <span className="kicker-line" /></div>
            <p className="sr-status" role="status" aria-live="polite">{announcement}</p>
            <div className="combat-feed" aria-live="off">
              {feed.length === 0 ? <p className="empty-feed"><span>--:--</span> Simulation standing by.</p> : null}
              {feed.map((line) => (
                <p key={line.id} className={`feed-${line.tone}`}>
                  <span>{line.time}</span> {TONE_GLYPH[line.tone]} {line.text}
                </p>
              ))}
            </div>
          </div>
          <div className="panel-footer"><span>AI DOESN'T MEAN OMNISCIENT.</span><span className="footer-signal">● ● ●</span></div>
        </aside>
      </section>

      {screen === "home" ? (
        <HomeScreen
          career={career}
          loadout={activeLoadout}
          onChooseLoadout={chooseLoadout}
          difficulty={difficulty}
          onDifficulty={changeDifficulty}
          bestScore={snapshot?.difficultyBestScore ?? 0}
          bestKills={snapshot?.difficultyBestKills ?? 0}
          aimMode={aimMode}
          onAimMode={changeAimMode}
          shakeEnabled={shakeEnabled}
          onShakeToggle={toggleShake}
          showTouchControls={showTouchControls}
          onTouchToggle={() => setTouchOverride((current) => !(current ?? touchCapable))}
          debug={debug}
          onDebugToggle={() => setDebug((current) => !current)}
          seedInput={seedInput}
          onSeedChange={applySeedText}
          onRandomSeed={rollSeed}
          seedArena={seedArena}
          onStart={() => startRun(seedInput)}
          onStartSeed={(seed) => {
            setSeedInput(seed);
            startRun(seed);
          }}
          onProfile={() => openProfile("home")}
          shareNotice={shareNotice}
          deployRef={deployButtonRef}
        />
      ) : null}

      {screen === "profile" ? (
        <div className="screen-layer profile-layer" role="dialog" aria-label="Operator profile">
          <div className="sheet-card profile-card">
            <div className="sheet-head">
              <div className="eyebrow"><span className="live-dot" /> OPERATOR PROFILE</div>
              <button type="button" className="icon-button" onClick={closeProfile} aria-label="Close profile">✕</button>
            </div>
            <div className="profile-head">
              <div className="insignia" aria-hidden="true">{career?.rank.insignia ?? "I"}</div>
              <div>
                <h1 className="profile-rank">{career?.rank.name ?? "RECRUIT"}</h1>
                <p className="profile-sub">
                  CAREER {career?.score ?? 0} · {career?.runs ?? 0} RUNS · {career?.kills ?? 0} KILLS
                  {career?.bestCombo ? ` · BEST CHAIN ×${career.bestCombo}` : ""}
                </p>
              </div>
            </div>
            <div className="profile-block">
              <h2>CLASS ROSTER · ALL ISSUED</h2>
              <ul className="unlock-list">
                {LOADOUT_ORDER.map((id) => {
                  const weapon = LOADOUTS[id];
                  return (
                    <li key={id} className="unlocked">
                      <span className="unlock-name">{weapon.name}</span>
                      <span className="unlock-note">ISSUED · {weapon.traitName}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="unlock-progress">
                ALL {LOADOUT_ORDER.length} CLASSES ISSUED · NOTHING TO UNLOCK, PICK ANY AT DEPLOY
              </p>
              {career?.nextRank ? (
                <p className="unlock-progress">
                  RANK {career.nextRank.name} AT {career.nextRank.threshold.toLocaleString()} CAREER
                </p>
              ) : null}
            </div>
            <div className="profile-block">
              <h2>SERVICE RECORD · {career?.badgesEarned ?? 0}/{career?.badges.length ?? 0} BADGES</h2>
              <ul className="badge-grid">
                {(career?.badges ?? []).map((badge) => (
                  <li
                    key={badge.id}
                    className={badge.earned ? "badge earned" : "badge locked"}
                    title={badge.requirement}
                  >
                    <span className="badge-name">{badge.earned ? badge.name : "???"}</span>
                    <span className="badge-req">{badge.earned ? "EARNED" : badge.requirement}</span>
                    {badge.earned ? null : (
                      <span className="badge-bar" aria-hidden="true">
                        <i style={{ width: `${Math.round(badge.progress * 100)}%` }} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="profile-block">
              <h2>THREAT DOSSIER</h2>
              <ul className="dossier-list">
                {BOT_KINDS.map((kind) => {
                  const profile = BOT_PROFILES[kind];
                  const ended = career?.deathsByKind[kind] ?? 0;
                  return (
                    <li key={kind} data-bot={kind}>
                      <div className="dossier-head">
                        <strong>{profile.name}</strong>
                        <span className="dossier-tally">
                          {career?.killsByKind[kind] ?? 0} KILLED
                          {ended > 0 ? ` · ENDED ${ended} RUN${ended === 1 ? "" : "S"}` : " · NEVER ENDED A RUN"}
                        </span>
                      </div>
                      <em className="dossier-signature">{profile.signature}</em>
                      <small>{profile.counter.toLowerCase()}.</small>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="profile-block">
              <h2>RECENT RUNS</h2>
              {(career?.recentRuns.length ?? 0) === 0 ? (
                <p className="profile-empty">Nothing finished yet. The dossier fills itself in as you play.</p>
              ) : (
                <ul className="recent-list">
                  {(career?.recentRuns ?? []).map((run, index) => (
                    <li key={`${run.seed}-${index}`} className={run.victory ? "won" : ""}>
                      <span className="recent-seed">{run.seed}</span>
                      <span className="recent-where">
                        {DIFFICULTIES[run.difficulty].label.toUpperCase()}
                        {run.weapon ? ` · ${LOADOUTS[run.weapon].kind}` : ""}
                        {run.arenaName ? ` · ${run.arenaName}` : ""}
                      </span>
                      <strong>{run.score}</strong>
                      <span className="recent-outcome">{run.victory ? "CLEARED" : "TERMINATED"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="profile-block">
              <h2>CLASS RECORDS</h2>
              <ul className="weapon-list">
                {(career?.weapons ?? []).map((weapon) => (
                  <li key={weapon.id}>
                    <span className="weapon-name">
                      {weapon.name} <em className="weapon-kit">{weapon.kind}</em>
                    </span>
                    <span className="weapon-stats">
                      {weapon.record.runs} runs · {weapon.record.kills} kills
                      {weapon.record.victories > 0 ? ` · ${weapon.record.victories} cleared` : ""}
                    </span>
                    <strong>{weapon.record.bestScore}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div className="profile-block">
              <h2>BEST RUN PER THREAT LEVEL</h2>
              <ul className="best-list">
                {(career?.bestByDifficulty ?? []).map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.label}</span>
                    <strong>{entry.score}</strong>
                    <small>{entry.kills} kills</small>
                  </li>
                ))}
              </ul>
            </div>
            <button ref={profileButtonRef} className="primary-button" type="button" onClick={closeProfile}>
              <span>{profileReturn === "home" ? "BACK TO COMMAND" : "BACK TO THE RUN"}</span>
              <span aria-hidden="true">↩</span>
            </button>
          </div>
        </div>
      ) : null}

      <footer className="page-footer">
        <span>LAST BRAIN STANDING <span className="muted">/ A SMALL COMBAT EXPERIMENT</span></span>
        <span className="footer-keys">M MUTE&nbsp; · &nbsp;F3 TELEMETRY&nbsp; · &nbsp;ESC PAUSE&nbsp; · &nbsp;R RESTART</span>
      </footer>
    </main>
  );
}

function describeAnnouncement(uiState: UiState, snapshot: GameSnapshot | null, result: RunResult | null): string {
  if (!snapshot || uiState === "start") return "Start screen. Press Enter the arena to begin a run.";
  if (uiState === "victory") return `Run complete. ${result ? `Score ${result.score.total}, grade ${result.grade}.` : "Arena conquered."}`;
  if (uiState === "defeat")
    return `Run over. ${result ? `Score ${result.score.total}, ${result.stats.kills} eliminations.` : "You were eliminated."}`;
  if (uiState === "paused") return `Paused at threat level ${Math.max(1, snapshot.wave)}.`;
  if (snapshot.waveState === "telegraph") return `Threat level ${snapshot.wave + 1} inbound: ${snapshot.briefing}.`;
  if (snapshot.hostileCount === 0 && snapshot.waveState === "cleared") return `Threat level ${snapshot.wave} clear.`;
  if (snapshot.health / Math.max(1, snapshot.maxHealth) <= 0.35) return `Integrity critical: ${Math.round((snapshot.health / Math.max(1, snapshot.maxHealth)) * 100)} percent.`;
  return "";
}

/**
 * One line describing what the equipped class's kit is doing right now, plus a
 * 0..1 meter where the kit charges. The simulation owns the truth; this only
 * reads the snapshot.
 */
function kitState(
  id: LoadoutId,
  snapshot: GameSnapshot
): { label: string; ready: boolean; meter: number } {
  const weapon = LOADOUTS[id];
  switch (weapon.trait) {
    case "focus":
      return snapshot.focusReady
        ? { label: "READY · +60% ROUND", ready: true, meter: 1 }
        : { label: `CHARGING ${Math.round(snapshot.focus * 100)}% · HOLD STILL`, ready: false, meter: snapshot.focus };
    case "phase":
      return snapshot.phaseTime > 0
        ? { label: `UNSEEN ${snapshot.phaseTime.toFixed(2)}S`, ready: true, meter: snapshot.phaseTime / 0.34 }
        : { label: "DASH BLANKS THEIR AIM", ready: false, meter: 0 };
    case "siege":
      return { label: "CHARGE TO STAGGER 1.1S", ready: false, meter: 0 };
    case "ignite":
      return { label: "BURN 3/S · SLOW 15%", ready: false, meter: 0 };
    case "arc":
      return { label: "SHELLS CLEAR 74 UNITS", ready: false, meter: 0 };
    case "steady":
      return { label: "KILLS RETURN 35% DASH", ready: false, meter: 0 };
    default:
      return { label: weapon.traitRule, ready: false, meter: 0 };
  }
}

function statusLabel(uiState: UiState, snapshot: GameSnapshot | null): string {
  if (!snapshot || uiState === "start") return "SIMULATION STANDBY";
  if (uiState === "victory") return "ARENA CONQUERED";
  if (uiState === "defeat") return "SIMULATION TERMINATED";
  if (uiState === "paused") return "SIMULATION PAUSED";
  return `SIMULATION ACTIVE · THREAT ${String(Math.max(1, snapshot.wave)).padStart(2, "0")}`;
}

function messageFor(uiState: UiState, snapshot: GameSnapshot | null): string {
  if (!snapshot || uiState === "start") return "ELIMINATE HOSTILES";
  if (uiState === "victory") return "SIMULATION COMPLETE";
  if (uiState === "defeat") return "SIMULATION TERMINATED";
  if (uiState === "paused") return "SIMULATION PAUSED";
  if (snapshot.waveState === "telegraph") {
    // First contact is the one moment a new player is guaranteed to be reading
    // the arena, so the first telegraph explains what the rings mean.
    if (snapshot.wave === 0) return "RINGS MARK INCOMING SHOTS — MOVE OR DASH";
    return `THREAT INBOUND · ${snapshot.waveTimer.toFixed(1)}S`;
  }
  if (snapshot.hostileCount === 0 && snapshot.waveState === "cleared") return "SECTOR CLEAR";
  if (snapshot.health / Math.max(1, snapshot.maxHealth) <= 0.35) return "INTEGRITY CRITICAL";
  return "ELIMINATE HOSTILES";
}

function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function accuracy(snapshot: GameSnapshot | null): string {
  if (!snapshot || snapshot.stats.shotsFired === 0) return "—";
  return `${Math.round((snapshot.stats.shotsHit / snapshot.stats.shotsFired) * 100)}%`;
}

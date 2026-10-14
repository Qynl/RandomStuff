import { useState, type RefObject } from "react";
import { DIFFICULTIES } from "./constants";
import { DEFAULT_LOADOUT, LOADOUTS, LOADOUT_ORDER, type LoadoutId } from "./loadouts";
import { ARENA_LAYOUTS, ARENA_ORDER, layoutForSeed, type ArenaLayoutId } from "./arena";
import { dailySeed, dailySeedLabel } from "./rng";
import type { CareerSummary } from "./game";
import SettingsPanel from "./SettingsPanel";
import type { AimMode, DifficultyId } from "./types";

/**
 * Command screen.
 *
 * The front door: one screen that answers "who am I, what am I flying, where am
 * I going" before a run starts. Laid out like a game lobby rather than a
 * document — a top status bar, a left rail of destinations, the operative
 * front and centre on a lit floor, the class ribbon under it, and a fat deploy
 * button. Everything the old start overlay held (class picker, seed, threat
 * level) still lives here, just arranged around the character instead of
 * stacked in a column.
 */

/** One accent per class, all from the existing muted palette. */
const CLASS_INK: Record<LoadoutId, string> = {
  vanguard: "#8fb0cf",
  breacher: "#d26e5e",
  marksman: "#cfa25f",
  ghost: "#a08ec0",
  cinder: "#c9975a",
  sapper: "#8fb48c"
};

type Sheet = "classes" | "arenas" | "help" | null;

export interface HomeScreenProps {
  career: CareerSummary | null;
  loadout: LoadoutId;
  onChooseLoadout: (id: LoadoutId) => void;
  difficulty: DifficultyId;
  onDifficulty: (id: DifficultyId) => void;
  bestScore: number;
  bestKills: number;
  aimMode: AimMode;
  onAimMode: (mode: AimMode) => void;
  shakeEnabled: boolean;
  onShakeToggle: () => void;
  showTouchControls: boolean;
  onTouchToggle: () => void;
  debug: boolean;
  onDebugToggle: () => void;
  seedInput: string;
  onSeedChange: (raw: string) => void;
  onRandomSeed: () => void;
  /** Arena layout the typed seed will play in, or null when the field is empty. */
  seedArena: ArenaLayoutId | null;
  onStart: () => void;
  /** Starts a run on a specific seed, used by the daily challenge card. */
  onStartSeed: (seed: string) => void;
  onProfile: () => void;
  shareNotice: string | null;
  /** Focused whenever the screen becomes the front door again. */
  deployRef: RefObject<HTMLButtonElement | null>;
}

export default function HomeScreen({
  career,
  loadout,
  onChooseLoadout,
  difficulty,
  onDifficulty,
  bestScore,
  bestKills,
  aimMode,
  onAimMode,
  shakeEnabled,
  onShakeToggle,
  showTouchControls,
  onTouchToggle,
  debug,
  onDebugToggle,
  seedInput,
  onSeedChange,
  onRandomSeed,
  seedArena,
  onStart,
  onStartSeed,
  onProfile,
  shareNotice,
  deployRef
}: HomeScreenProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const active = LOADOUTS[loadout] ?? LOADOUTS[DEFAULT_LOADOUT];
  const ink = CLASS_INK[loadout] ?? CLASS_INK[DEFAULT_LOADOUT];
  const level = DIFFICULTIES[difficulty];
  const recent = career?.recentRuns ?? [];
  // The daily challenge is derived from the calendar day, so everyone playing
  // today gets the same fight to compare against - no server involved.
  const today = new Date();
  const daily = dailySeedLabel(today);
  const dailyArena = ARENA_LAYOUTS[layoutForSeed(dailySeed(today))].name;
  // The account's own attempt at today's fight, if it has one.
  const dailyRun = recent.find((run) => run.seed === daily) ?? null;
  const badgesEarned = career?.badgesEarned ?? 0;
  const badgeTotal = career?.badges.length ?? 0;

  const statRow = (id: LoadoutId) => {
    const weapon = LOADOUTS[id];
    return [
      ["WEAPON", `${weapon.kind}`],
      ["DAMAGE", weapon.shots > 1 ? `${weapon.damage} × ${weapon.shots}` : `${weapon.damage}`],
      ["CADENCE", `${weapon.fireInterval.toFixed(2)} S`],
      ["HEALTH", `${weapon.maxHealth}`],
      ["SPEED", `${Math.round(weapon.speedScale * 100)}%`],
      ["DASH", `${weapon.dashKind === "charge" ? "CHARGE" : "DASH"} · ${weapon.dashDistance} U / ${weapon.dashCooldown.toFixed(1)} S`]
    ] as Array<[string, string]>;
  };

  return (
    <div className="home-screen" aria-label="Command screen">
      <div className="home-body">
        <nav className="home-rail" aria-label="Destinations">
          <button type="button" className="rail-button" onClick={() => setSheet("classes")}>
            <span className="rail-glyph" aria-hidden="true">❖</span>
            <span className="rail-copy">
              <strong>CLASSES</strong>
              <small>ALL {LOADOUT_ORDER.length} ISSUED</small>
            </span>
          </button>
          <button type="button" className="rail-button" onClick={onProfile}>
            <span className="rail-glyph" aria-hidden="true">▤</span>
            <span className="rail-copy">
              <strong>PROFILE</strong>
              <small>SERVICE RECORD</small>
            </span>
          </button>
          <button type="button" className="rail-button" onClick={() => setSheet("arenas")}>
            <span className="rail-glyph" aria-hidden="true">▦</span>
            <span className="rail-copy">
              <strong>ARENAS</strong>
              <small>{ARENA_ORDER.length} LAYOUTS</small>
            </span>
          </button>
          <button type="button" className="rail-button" onClick={() => setSheet("help")}>
            <span className="rail-glyph" aria-hidden="true">?</span>
            <span className="rail-copy">
              <strong>HOW TO PLAY</strong>
              <small>KEYS &amp; RULES</small>
            </span>
          </button>
        </nav>

        <section className="home-stage" aria-label="Operative">
          <div className="stage-floor" aria-hidden="true" />
          <div className="operator-figure" data-class={loadout} style={{ ["--class-ink" as string]: ink }} aria-hidden="true">
            <span className="fig-shadow" />
            <span className="fig-legs" />
            <span className="fig-boot left" />
            <span className="fig-boot right" />
            <span className="fig-torso" />
            <span className="fig-belt" />
            <span className="fig-shoulder left" />
            <span className="fig-shoulder right" />
            <span className="fig-arm left" />
            <span className="fig-arm right" />
            <span className="fig-weapon" />
            <span className="fig-helmet" />
            <span className="fig-visor" />
            <span className="fig-antenna" />
          </div>

          <div className="stage-plate">
            <span className="plate-rank" style={{ ["--class-ink" as string]: ink }}>
              {career?.rank.insignia ?? "I"}
            </span>
            <div className="plate-copy">
              <strong>{active.name}</strong>
              <small>
                {active.kind} · <b>{active.traitName}</b>
              </small>
            </div>
          </div>

          <div className="loadout-row" role="group" aria-label="Operative class">
            {LOADOUT_ORDER.map((id, index) => {
              const weapon = LOADOUTS[id];
              const selected = loadout === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`loadout-card${selected ? " selected" : ""}`}
                  aria-pressed={selected}
                  title={`${weapon.counter} ${weapon.traitName}: ${weapon.traitRule}`}
                  onClick={() => onChooseLoadout(id)}
                >
                  <span className="loadout-slot" aria-hidden="true">{index + 1}</span>
                  <span className="loadout-kind">{weapon.kind}</span>
                  <strong>{weapon.name}</strong>
                  <small>{weapon.tagline}</small>
                  <em className="loadout-trait">
                    <b>{weapon.traitName}</b> {weapon.traitRule}
                  </em>
                </button>
              );
            })}
          </div>
          <p className="loadout-hint">
            {active.counter} <b>{active.traitName}:</b> {active.traitRule}
          </p>
          <p className="loadout-keys" aria-hidden="true">
            PRESS 1–{LOADOUT_ORDER.length} TO SWAP CLASS
          </p>

          <div className="deploy-block">
            <button type="button" className="daily-card" onClick={() => onStartSeed(daily)}>
              <span className="daily-tag">TODAY&apos;S SEED</span>
              <span className="daily-copy">
                <strong>{daily}</strong>
                <small>
                  {dailyArena} · ONE ARENA, ONE FIGHT, EVERYONE
                </small>
                {dailyRun ? (
                  <small className="daily-result">
                    YOUR RUN: {dailyRun.score} · {dailyRun.victory ? "CLEARED" : "TERMINATED"}
                  </small>
                ) : null}
              </span>
              <span className="daily-play" aria-hidden="true">▶</span>
            </button>
            <div className="seed-row">
              <label htmlFor="seed-input">SEED</label>
              <input
                id="seed-input"
                value={seedInput}
                placeholder="RANDOM OR PASTE A LINK"
                maxLength={256}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => onSeedChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onStart();
                  }
                }}
              />
            </div>
            <div className="seed-preview">
              <button type="button" className="ghost-button compact" title="Pick a fresh random seed" onClick={onRandomSeed}>
                RANDOM
              </button>
              <span className="seed-arena">
                {seedInput.length > 0 && seedArena
                  ? `ARENA ${ARENA_LAYOUTS[seedArena].name}`
                  : "TYPE OR PASTE A SEED TO SEE ITS ARENA"}
              </span>
            </div>
            {shareNotice ? (
              <p className="share-notice" role="status">
                {shareNotice}
              </p>
            ) : null}
            <button ref={deployRef} className="primary-button deploy-button" type="button" onClick={onStart}>
              <span>ENTER THE ARENA</span>
              <span aria-hidden="true">↗</span>
            </button>
            <p className="deploy-note">
              {level.label} THREAT{seedArena ? ` · ${ARENA_LAYOUTS[seedArena].name}` : ""}
            </p>
          </div>
        </section>

        <aside className="home-side" aria-label="Briefing">
          <div className="side-card">
            <div className="side-kicker">NEXT DEPLOYMENT</div>
            <div className="brief-level">
              <span className="brief-name">{level.label}</span>
              <span className="brief-rule">{level.blurb}</span>
            </div>
            <ul className="brief-list">
              <li>
                <span>ARENA</span>
                <strong>{seedArena ? ARENA_LAYOUTS[seedArena].name : "ROLLED AT DEPLOY"}</strong>
              </li>
              <li>
                <span>HOSTILE PROFILES</span>
                <strong>4 SEEN · MORE LATER</strong>
              </li>
              <li>
                <span>BEST HERE</span>
                <strong>{bestScore > 0 ? bestScore : "—"}</strong>
              </li>
            </ul>
          </div>

          <div className="side-card">
            <div className="side-kicker">SERVICE RECORD · {badgesEarned}/{badgeTotal} BADGES</div>
            <div className="rank-track" aria-hidden="true">
              <i style={{ width: `${Math.round((career?.rankProgress ?? 0) * 100)}%` }} />
            </div>
            <p className="rank-line">
              {career?.nextRank
                ? `${career.nextRank.threshold.toLocaleString()} CAREER FOR ${career.nextRank.name}`
                : "TOP RANK REACHED"}
            </p>
            <ul className="mini-badges">
              {(career?.badges ?? []).slice(0, 6).map((badge) => (
                <li key={badge.id} className={badge.earned ? "won" : ""} title={badge.earned ? badge.name : badge.requirement}>
                  {badge.earned ? badge.name : "???"}
                </li>
              ))}
            </ul>
            <div className="side-kicker tight">RECENT RUNS</div>
            {recent.length === 0 ? (
              <p className="side-empty">Nothing finished yet. The record fills itself in as you play.</p>
            ) : (
              <ul className="mini-runs">
                {recent.slice(0, 3).map((run, index) => (
                  <li key={`${run.seed}-${index}`} className={run.victory ? "won" : ""}>
                    <span className="mini-seed">{run.seed}</span>
                    <span className="mini-where">
                      {DIFFICULTIES[run.difficulty].label}
                      {run.weapon ? ` · ${LOADOUTS[run.weapon].name}` : ""}
                    </span>
                    <strong>{run.score}</strong>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="ghost-button wide" onClick={onProfile}>
              OPERATOR PROFILE
            </button>
          </div>

          <SettingsPanel
            title="SETTINGS"
            difficulty={difficulty}
            onDifficulty={onDifficulty}
            bestScore={bestScore}
            bestKills={bestKills}
            aimMode={aimMode}
            onAimMode={onAimMode}
            shakeEnabled={shakeEnabled}
            onShakeToggle={onShakeToggle}
            showTouchControls={showTouchControls}
            onTouchToggle={onTouchToggle}
            debug={debug}
            onDebugToggle={onDebugToggle}
          />
        </aside>
      </div>

      <div className="home-strip">
        <div className="strip-chip">
          <span className="strip-label">CAREER SCORE</span>
          <strong>{(career?.score ?? 0).toLocaleString()}</strong>
          <span className="strip-meter" aria-hidden="true">
            <i style={{ width: `${Math.round((career?.rankProgress ?? 0) * 100)}%` }} />
          </span>
        </div>
        <div className="strip-chip">
          <span className="strip-label">RUNS / KILLS</span>
          <strong>
            {career?.runs ?? 0} <em>/</em> {career?.kills ?? 0}
          </strong>
          <span className="strip-note">BEST CHAIN ×{career?.bestCombo ?? 0}</span>
        </div>
        <div className="strip-chip">
          <span className="strip-label">THREAT LEVELS CLEARED</span>
          <strong>{career?.levelsClearedCount ?? 0} / 3</strong>
          <span className="strip-note">{DIFFICULTIES[difficulty].label} SELECTED</span>
        </div>
      </div>

      {sheet ? (
        <div className="home-sheet" role="dialog" aria-label={sheet === "classes" ? "Classes" : sheet === "arenas" ? "Arenas" : "How to play"}>
          <button type="button" className="sheet-scrim" aria-label="Close" onClick={() => setSheet(null)} />
          <div className="sheet-card">
            <div className="sheet-head">
              <h2>
                {sheet === "classes" ? `OPERATIVE CLASSES · ${LOADOUT_ORDER.length} ISSUED` : sheet === "arenas" ? "ARENA LAYOUTS" : "HOW TO PLAY"}
              </h2>
              <button type="button" className="icon-button" onClick={() => setSheet(null)} aria-label="Close">
                ✕
              </button>
            </div>

            {sheet === "classes" ? (
              <div className="class-grid">
                {LOADOUT_ORDER.map((id) => {
                  const weapon = LOADOUTS[id];
                  const selected = loadout === id;
                  return (
                    <article key={id} className={`class-card${selected ? " selected" : ""}`} data-class={id}>
                      <header>
                        <span className="class-swatch" style={{ ["--class-ink" as string]: CLASS_INK[id] }} aria-hidden="true" />
                        <strong>{weapon.name}</strong>
                        {selected ? <span className="class-eq">EQUIPPED</span> : null}
                      </header>
                      <p className="class-tagline">{weapon.tagline}</p>
                      <dl>
                        {statRow(id).map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="class-trait">
                        <b>{weapon.traitName}</b> {weapon.traitRule}
                      </p>
                      <p className="class-counter">{weapon.counter}</p>
                      <button type="button" className="ghost-button wide" onClick={() => onChooseLoadout(id)}>
                        {selected ? "EQUIPPED" : `EQUIP ${weapon.name}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {sheet === "arenas" ? (
              <div className="arena-grid">
                {ARENA_ORDER.map((id) => {
                  const layout = ARENA_LAYOUTS[id];
                  return (
                  <article key={id} className="arena-card">
                    <div className={`arena-figure ${id}`} aria-hidden="true">
                      {layout.obstacles.slice(0, 10).map((rect, index) => (
                        <i
                          key={index}
                          style={{
                            left: `${(rect.x / 960) * 100}%`,
                            top: `${(rect.y / 600) * 100}%`,
                            width: `${(rect.w / 960) * 100}%`,
                            height: `${(rect.h / 600) * 100}%`
                          }}
                        />
                      ))}
                    </div>
                    <strong>{layout.name}</strong>
                    <small>{layout.blurb}</small>
                  </article>
                  );
                })}
              </div>
            ) : null}

            {sheet === "help" ? (
              <div className="help-grid">
                <div>
                  <h3>OBJECTIVE</h3>
                  <p>
                    Five threat levels in one arena. Clear every hostile in a level to open the next. Lose all integrity
                    and the run is over — the score stands.
                  </p>
                  <h3>READ THE RINGS</h3>
                  <p>
                    Every hostile shot is telegraphed before it happens. A ring on the floor is a shot inbound: break
                    cover, step out of the line, or dash through it for the i-frames.
                  </p>
                  <h3>FOCUS FIRE</h3>
                  <p>
                    Cutting a wind-up staggers the attacker and pays combo. A chain multiplier climbs as long as you keep
                    killing without a gap.
                  </p>
                </div>
                <div>
                  <h3>CONTROLS</h3>
                  <ul className="help-keys">
                    <li><kbd>W A S D</kbd><span>MOVE</span></li>
                    <li><kbd>MOUSE</kbd><span>AIM</span></li>
                    <li><kbd>CLICK / SPACE</kbd><span>FIRE</span></li>
                    <li><kbd>SHIFT</kbd><span>DASH (I-FRAMES)</span></li>
                    <li><kbd>ESC</kbd><span>PAUSE</span></li>
                    <li><kbd>R</kbd><span>RESTART / REPLAY SEED</span></li>
                    <li><kbd>M / F3</kbd><span>MUTE / TELEMETRY</span></li>
                  </ul>
                  {showTouchControls ? <p className="help-note">Touch controls are on: left stick moves, right buttons fire and dash.</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

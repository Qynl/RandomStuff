import { DIFFICULTIES, DIFFICULTY_ORDER } from "./constants";
import type { AimMode, DifficultyId } from "./types";

/**
 * The tuning block.
 *
 * It used to live only in the side panel of the arena, which meant the home
 * screen had no way to pick a threat level before a run. Both places now render
 * this one component, so a setting can never drift between them.
 */
export interface SettingsPanelProps {
  difficulty: DifficultyId;
  onDifficulty: (id: DifficultyId) => void;
  /** Best score on the selected threat level, 0 when there is none yet. */
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
  /** Heading, so the home screen can call it something different. */
  title?: string;
}

export default function SettingsPanel({
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
  title = "SETTINGS"
}: SettingsPanelProps) {
  return (
    <div className="panel-section settings-section">
      <div className="section-kicker">
        {title} <span className="kicker-line" />
      </div>
      <div className="setting-row" role="group" aria-label="Difficulty">
        <span>DIFFICULTY</span>
        <div className="segmented">
          {DIFFICULTY_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={difficulty === id ? "segment active" : "segment"}
              aria-pressed={difficulty === id}
              onClick={() => onDifficulty(id)}
            >
              {DIFFICULTIES[id].label}
            </button>
          ))}
        </div>
      </div>
      <p className="setting-hint">{DIFFICULTIES[difficulty].blurb}</p>
      <p className="setting-hint best-line">
        BEST ON {DIFFICULTIES[difficulty].label}:{" "}
        <strong>{bestScore > 0 ? bestScore : "—"}</strong>
        {bestKills > 0 ? ` · ${bestKills} KILLS` : ""}
      </p>
      <div className="setting-row" role="group" aria-label="Aiming mode">
        <span>AIMING</span>
        <div className="segmented">
          <button
            type="button"
            className={aimMode === "mouse" ? "segment active" : "segment"}
            aria-pressed={aimMode === "mouse"}
            onClick={() => onAimMode("mouse")}
          >
            MOUSE
          </button>
          <button
            type="button"
            className={aimMode === "assisted" ? "segment active" : "segment"}
            aria-pressed={aimMode === "assisted"}
            onClick={() => onAimMode("assisted")}
          >
            ASSISTED
          </button>
        </div>
      </div>
      <p className="setting-hint">
        Assisted aiming slowly tracks the closest visible hostile in front of you — for keyboard-only and touch play.
      </p>
      <p className="setting-hint">Screen shake off is also calm mode: no full-screen damage flash and no hit-stop stutter.</p>
      <div className="setting-row">
        <span>SCREEN SHAKE</span>
        <button type="button" className="toggle" aria-pressed={shakeEnabled} onClick={onShakeToggle}>
          {shakeEnabled ? "ON" : "OFF"}
        </button>
      </div>
      <div className="setting-row">
        <span>TOUCH CONTROLS</span>
        <button type="button" className="toggle" aria-pressed={showTouchControls} onClick={onTouchToggle}>
          {showTouchControls ? "ON" : "OFF"}
        </button>
      </div>
      <div className="setting-row">
        <span>TELEMETRY</span>
        <button type="button" className="toggle" aria-pressed={debug} onClick={onDebugToggle}>
          {debug ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}

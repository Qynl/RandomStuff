import { useEffect, useRef } from "react";
import { ArenaGame } from "./game";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new ArenaGame(canvas);
    return () => game.destroy();
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Last Brain Standing home">
          <span className="brand-mark">LB<span>/</span>S</span>
          <span className="brand-copy"><strong>LAST BRAIN</strong><small>STANDING</small></span>
        </a>
        <div className="top-status"><span className="live-dot" /><span>SIMULATION ACTIVE</span><span className="status-divider" /><span>BUILD 0.2</span></div>
        <button id="pause-button" className="icon-button" aria-label="Pause game" title="Pause (Esc)">Ⅱ</button>
      </header>

      <section className="game-layout" aria-label="Game arena">
        <div className="arena-wrap">
          <canvas ref={canvasRef} id="game" width="960" height="600" aria-label="Top-down arena. Move with WASD, aim with mouse, fire with click or Space, dash with Shift." />
          <div className="arena-vignette" />
          <div className="arena-label"><span className="tiny-square" /> SECTOR 01 <span className="label-separator">/</span> TEST CHAMBER</div>
          <div className="arena-bottom"><span id="arena-message">ELIMINATE HOSTILES</span><span>WASD MOVE&nbsp; · &nbsp;MOUSE AIM&nbsp; · &nbsp;CLICK FIRE&nbsp; · &nbsp;SHIFT DASH</span></div>
          <div id="overlay" className="overlay">
            <div className="overlay-card">
              <div className="eyebrow"><span className="live-dot" /> COMBAT SIMULATION // 001</div>
              <h1 id="overlay-title">OUTTHINK.<br /><span>OUTLAST.</span></h1>
              <p id="overlay-copy">Four minds enter. Only one gets to call itself intelligent. The bots have different tactics. Learn their patterns before they learn yours.</p>
              <button id="start-button" className="primary-button"><span>ENTER THE ARENA</span><span aria-hidden="true">↗</span></button>
              <div className="overlay-foot"><span>NO LOADOUTS. NO EXCUSES.</span><span>BEST RUN WINS.</span></div>
            </div>
          </div>
        </div>

        <aside className="side-panel">
          <div className="panel-section run-section">
            <div className="section-kicker">CURRENT RUN <span className="kicker-line" /></div>
            <div className="score-row"><div><span className="stat-label">ELIMINATIONS</span><strong id="kills">00</strong></div><div className="best-stat"><span className="stat-label">BEST</span><strong id="best">00</strong></div></div>
            <div className="wave-row"><span>THREAT LEVEL</span><strong id="wave">01 <i>/ 05</i></strong></div>
            <div className="wave-track"><span id="wave-progress" /></div>
          </div>
          <div className="panel-section">
            <div className="section-kicker">YOUR STATUS <span className="kicker-line" /></div>
            <div className="health-heading"><span>INTEGRITY</span><strong id="health-text">100%</strong></div>
            <div className="health-track"><span id="health-bar" /></div>
            <div className="dash-status"><span className="dash-icon">✳</span><span>DASH CHARGE</span><strong id="dash-text">READY</strong></div>
          </div>
          <div className="panel-section opponents-section">
            <div className="section-kicker">OPPONENT PROFILES <span className="kicker-line" /></div>
            <div className="opponent" data-bot="hunter"><span className="opponent-symbol hunter-symbol">+</span><div className="opponent-copy"><strong>THE HUNTER</strong><small>DIRECT PRESSURE</small></div><span className="opponent-state" id="state-hunter">WAITING</span></div>
            <div className="opponent" data-bot="flanker"><span className="opponent-symbol flanker-symbol">◇</span><div className="opponent-copy"><strong>THE FLANKER</strong><small>ANGLE CONTROL</small></div><span className="opponent-state" id="state-flanker">WAITING</span></div>
            <div className="opponent" data-bot="mirror"><span className="opponent-symbol mirror-symbol">⌁</span><div className="opponent-copy"><strong>THE MIRROR</strong><small>HABIT PUNISHER</small></div><span className="opponent-state" id="state-mirror">WAITING</span></div>
          </div>
          <div className="panel-section log-section">
            <div className="section-kicker">COMBAT FEED <span className="kicker-line" /></div>
            <div id="combat-feed" className="combat-feed" aria-live="polite"><p><span>00:00</span> Simulation standing by.</p><p><span>00:00</span> Three distinct AI profiles loaded.</p></div>
          </div>
          <div className="panel-footer"><span>AI DOESN'T MEAN OMNISCIENT.</span><span className="footer-signal">● ● ●</span></div>
        </aside>
      </section>
      <footer className="page-footer"><span>LAST BRAIN STANDING <span className="muted">/ A SMALL COMBAT EXPERIMENT</span></span><span>MADE TO BE MASTERED.</span></footer>
    </main>
  );
}

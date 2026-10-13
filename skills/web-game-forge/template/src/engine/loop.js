// Fixed-timestep game loop.
//
// Gameplay (physics, AI, timers) runs in constant-size steps so the game behaves the
// same at 60Hz, 120Hz or 144Hz monitors and never "tunnels" through walls on a slow frame.
// Rendering runs once per animation frame.

export function startLoop({ update, render, step = 1 / 120, maxFrame = 0.25 }) {
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let running = true;

  function frame(now) {
    if (!running) return;
    // Clamp huge gaps (tab switched, debugger paused) so the game doesn't try to
    // simulate minutes of time in one go - the "spiral of death".
    const frameDt = Math.min((now - last) / 1000, maxFrame);
    last = now;
    acc += frameDt;

    while (acc >= step) {
      update(step);
      acc -= step;
    }

    render(acc / step, frameDt);
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}

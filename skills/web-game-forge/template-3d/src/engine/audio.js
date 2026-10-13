// Procedural audio with the Web Audio API. No audio files needed: every sound
// is synthesised, so the game ships with zero downloads and zero licensing risk.
//
// Browsers only allow audio after a user gesture, so call `sound.unlock()` from an
// input handler (main.js already does this).

const BPM = 96;
const BASS = [0, 0, 12, 0, 7, 0, 10, 12];          // semitone offsets per 8th note
const BAR_ROOTS = [0, -4, -2, -5];                 // Am - F - G - Em
const SCALE = [0, 3, 5, 7, 10, 12, 15];            // minor pentatonic-ish

export class Sound {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.noiseBuf = null;
    this.volume = 0.5;
    this.muted = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      // Gentle bus compressor: stops stacked explosions from clipping and getting harsh.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.out = ctx.createGain();
      this.out.gain.value = this.muted ? 0 : this.volume;
      this.out.connect(comp).connect(ctx.destination);

      // One shared second of white noise, reused by every noise burst.
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  // Low-level building blocks. `at` is an absolute AudioContext time (defaults to now).
  tone({ freq, to = null, dur = 0.1, type = 'square', vol = 0.2, attack = 0.004, at }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = at ?? c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.1, vol = 0.2, at, filter = 4000, filterTo = null, q = 0.7 }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = at ?? c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(filter, t);
    if (filterTo) f.frequency.exponentialRampToValueAtTime(filterTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.8, dur);
    src.stop(t + dur + 0.05);
  }

  // Named sound effects. Each preset gets a small random pitch "jitter" so repeated
  // sounds never sound identical - a cheap trick that makes audio feel alive.
  play(name, { n = 0 } = {}) {
    const preset = SFX[name];
    if (!preset || !this.ready) return;
    preset(this, 1 + (Math.random() - 0.5) * 0.1, n);
  }
}

const SFX = {
  swing: (s, j) => s.noise({ dur: 0.16, vol: 0.14, filter: 6000 * j, filterTo: 800 }),
  swingHeavy: (s, j) => {
    s.noise({ dur: 0.3, vol: 0.2, filter: 4000 * j, filterTo: 300 });
    s.tone({ freq: 160 * j, to: 80, dur: 0.25, type: 'sine', vol: 0.15 });
  },
  hit: (s, j) => {
    s.noise({ dur: 0.07, vol: 0.25, filter: 2200 * j, filterTo: 300 });
    s.tone({ freq: 320 * j, to: 120, dur: 0.1, type: 'square', vol: 0.09 });
  },
  hitHeavy: (s, j) => {
    s.noise({ dur: 0.14, vol: 0.32, filter: 1600 * j, filterTo: 200 });
    s.tone({ freq: 140 * j, to: 45, dur: 0.22, type: 'sine', vol: 0.3 });
  },
  block: (s, j) => {
    s.tone({ freq: 1800 * j, to: 1500, dur: 0.18, type: 'triangle', vol: 0.14 });
    s.tone({ freq: 2700 * j, dur: 0.12, type: 'sine', vol: 0.06 });
    s.noise({ dur: 0.05, vol: 0.12, filter: 3500, filterTo: 1500 });
  },
  dodge: (s) => s.noise({ dur: 0.3, vol: 0.12, filter: 900, filterTo: 2600 }),
  step: (s, j) => s.noise({ dur: 0.05, vol: 0.05, filter: 600 * j, filterTo: 200 }),
  hurt: (s, j) => {
    s.tone({ freq: 220 * j, to: 70, dur: 0.3, type: 'sawtooth', vol: 0.18 });
    s.noise({ dur: 0.2, vol: 0.2, filter: 1200, filterTo: 150 });
  },
  telegraph: (s, j) => s.tone({ freq: 300 * j, to: 900, dur: 0.4, type: 'sine', vol: 0.06 }),
  slam: (s) => {
    s.noise({ dur: 0.8, vol: 0.42, filter: 320, filterTo: 60 });
    s.tone({ freq: 85, to: 32, dur: 0.6, type: 'sine', vol: 0.32 });
  },
  shockwave: (s) => s.tone({ freq: 140, to: 40, dur: 0.5, type: 'sine', vol: 0.22 }),
  roar: (s) => {
    s.tone({ freq: 90, to: 170, dur: 0.9, type: 'sawtooth', vol: 0.13 });
    s.tone({ freq: 95, to: 180, dur: 0.9, type: 'square', vol: 0.05 });
  },
  kill: (s, j) => {
    s.tone({ freq: 600 * j, to: 200, dur: 0.25, type: 'triangle', vol: 0.14 });
    s.noise({ dur: 0.2, vol: 0.16, filter: 3000, filterTo: 300 });
  },
  death: (s) => {
    s.tone({ freq: 200, to: 40, dur: 0.8, type: 'sawtooth', vol: 0.16 });
    s.noise({ dur: 0.6, vol: 0.2, filter: 1000, filterTo: 80 });
  },
  ui: (s) => s.tone({ freq: 660, dur: 0.06, type: 'sine', vol: 0.1 }),
  start: (s) => {
    const t = s.now();
    [0, 4, 7, 12].forEach((semi, i) =>
      s.tone({ at: t + i * 0.07, freq: 220 * 2 ** (semi / 12), dur: 0.2, type: 'square', vol: 0.06 }));
  },
  win: (s) => {
    const t = s.now();
    [0, 4, 7, 12, 16].forEach((semi, i) =>
      s.tone({ at: t + i * 0.12, freq: 330 * 2 ** (semi / 12), dur: 0.35, type: 'triangle', vol: 0.1 }));
  },
  over: (s) => {
    const t = s.now();
    [0, -3, -7, -12].forEach((semi, i) =>
      s.tone({ at: t + i * 0.2, freq: 220 * 2 ** (semi / 12), dur: 0.4, type: 'sawtooth', vol: 0.07 }));
  },
};

// A tiny look-ahead step sequencer for background music. Scheduling notes slightly
// ahead of time (instead of in the render loop) keeps the beat locked even when the
// frame rate dips.
export class Music {
  constructor(sound) {
    this.s = sound;
    this.timer = null;
    this.step = 0;
    this.nextT = 0;
  }

  start() {
    if (!this.s.ready || this.timer) return;
    this.step = 0;
    this.nextT = this.s.now() + 0.1;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  _schedule() {
    const stepDur = 60 / BPM / 4; // sixteenth notes
    while (this.nextT < this.s.now() + 0.15) {
      this._play(this.step, this.nextT);
      this.nextT += stepDur;
      this.step++;
    }
  }

  _play(n, t) {
    const s = this.s;
    const bar = Math.floor(n / 16) % 4;
    const root = 55 * 2 ** (BAR_ROOTS[bar] / 12); // A1 shifted per bar
    if (n % 2 === 0) {
      const semi = BASS[(n / 2) % BASS.length];
      s.tone({ at: t, freq: root * 2 ** (semi / 12), dur: 0.2, type: 'triangle', vol: 0.14, attack: 0.01 });
    }
    if (n % 4 === 0) {
      s.tone({ at: t, freq: 120, to: 40, dur: 0.15, type: 'sine', vol: 0.3 });
    }
    if (n % 2 === 1) {
      s.noise({ at: t, dur: 0.03, vol: 0.04, filter: 7000 });
    }
    if (n % 8 === 2 || n % 8 === 5 || n % 8 === 7) {
      const idx = (n * 3 + bar) % SCALE.length;
      s.tone({ at: t, freq: root * 4 * 2 ** (SCALE[idx] / 12), dur: 0.12, type: 'square', vol: 0.035 });
    }
  }
}

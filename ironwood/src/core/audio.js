/**
 * IRONWOOD - procedural audio engine.
 * Every sound in the game is synthesised at runtime with the Web Audio API:
 * no audio files, no downloads, no licensing questions.
 *
 * The engine is deliberately forgiving - if the browser refuses an
 * AudioContext (or the user never clicks) every call becomes a no-op.
 */

import { clamp, rand, choice } from './math.js';

const MAX_VOICES = 28;

export class Audio {
  constructor(opts = {}) {
    this.ctx = null;
    this.enabled = opts.enabled !== false;
    this.voices = 0;
    this.masterVolume = opts.volume ?? 0.8;
    this.sfxVolume = 1.0;
    this.ambienceVolume = 0.55;
    this._noise = new Map();
    this._ambience = [];
    this._listeners = [];
    this.muted = false;
    this._lastFootstep = 0;
  }

  /* ------------------------------------------------------------ */
  /* Setup                                                        */
  /* ------------------------------------------------------------ */

  ensure() {
    if (this.ctx || !this.enabled) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return null;
    }
    try {
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    } catch (err) {
      this.enabled = false;
      return null;
    }
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.masterVolume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 22;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);

    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.ambienceVolume;
    this.ambBus.connect(this.master);

    // Small outdoor reverb (jungle slapback) built from a synthesised IR.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeIR(0.85, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.7;
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.5;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(reverbOut);
    reverbOut.connect(this.master);

    this.listener = ctx.listener;
    return ctx;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  setMasterVolume(v) {
    this.masterVolume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVolume;
  }
  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVolume;
  }
  setSfxVolume(v) {
    this.sfxVolume = clamp(v, 0, 1);
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
  }
  setAmbienceVolume(v) {
    this.ambienceVolume = clamp(v, 0, 1);
    if (this.ambBus) this.ambBus.gain.value = this.ambienceVolume;
  }

  /* ------------------------------------------------------------ */
  /* Low level helpers                                            */
  /* ------------------------------------------------------------ */

  _makeIR(duration, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        // sparse early reflections + diffuse tail = "outdoor jungle" character
        const early = i < rate * 0.05 ? 0.6 : 0;
        data[i] = ((Math.random() * 2 - 1) * env + (Math.random() < 0.004 ? early : 0)) * 0.7;
      }
    }
    return buf;
  }

  _noiseBuffer(kind = 'white') {
    if (this._noise.has(kind)) return this._noise.get(kind);
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this._noise.set(kind, buf);
    return buf;
  }

  _voice() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 1;
    g.connect(send);
    send.connect(this.reverbSend);
    let panner = null;
    this.voices++;
    return {
      gain: g,
      send,
      panner,
      ctx,
      start(t) {
        return this;
      },
    };
  }

  _pan(node, position, opts = {}) {
    if (!position) return node;
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = opts.hrtf === false ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = opts.refDistance ?? 4;
    p.rolloffFactor = opts.rolloff ?? 1.15;
    p.maxDistance = 320;
    if (p.positionX) {
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
    } else {
      p.setPosition(position.x, position.y, position.z);
    }
    node.connect(p);
    return p;
  }

  _connect(output, opts = {}) {
    if (opts.position) {
      const p = this._pan(output, opts.position, opts);
      p.connect(this.sfxBus);
      if (opts.send !== false) {
        const s = this.ctx.createGain();
        s.gain.value = clamp(1 - (opts.distance ?? 8) / 60, 0.05, 0.8) * (opts.reverb ?? 0.5);
        output.connect(s);
        s.connect(this.reverbSend);
      }
      return p;
    }
    output.connect(this.sfxBus);
    if (opts.send !== false) {
      const s = this.ctx.createGain();
      s.gain.value = opts.reverb ?? 0.5;
      output.connect(s);
      s.connect(this.reverbSend);
    }
    return output;
  }

  _noiseSource(kind = 'white', opts = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(kind);
    src.loop = true;
    if (opts.rate) src.playbackRate.value = opts.rate;
    return src;
  }

  /**
   * Core transient synth: filtered noise burst with an exponential envelope.
   * opts: { dur, gain, type, f0, f1, q, attack, kind, position, reverb }
   */
  burst(opts = {}) {
    if (!this.ctx || this.voices > MAX_VOICES) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const dur = opts.dur ?? 0.14;
    const kind = opts.kind ?? 'white';
    const src = this._noiseSource(kind, { rate: opts.rate });
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.f0 ?? 1200, t0);
    if (opts.f1) filter.frequency.exponentialRampToValueAtTime(Math.max(30, opts.f1), t0 + dur);
    filter.Q.value = opts.q ?? 1.1;

    const g = ctx.createGain();
    const peak = opts.gain ?? 0.5;
    const atk = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(g);

    const out = this._connect(g, opts);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    this.voices++;
    setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1);
    }, (dur + 0.1) * 1000);
    void out;
    return g;
  }

  /** Tone helper: { freq, dur, type, gain, freq1, position, attack } */
  tone(opts = {}) {
    if (!this.ctx || this.voices > MAX_VOICES) return null;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const dur = opts.dur ?? 0.12;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq ?? 440, t0);
    if (opts.freq1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freq1), t0 + dur);
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (opts.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    this._connect(g, opts);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    this.voices++;
    setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1);
    }, (dur + 0.05) * 1000);
    return osc;
  }

  /* ------------------------------------------------------------ */
  /* Game sounds                                                  */
  /* ------------------------------------------------------------ */

  /** Firearm report. kind: rifle | smg | sniper | pistol | lmg */
  gunshot(kind = 'rifle', opts = {}) {
    if (!this.ctx) return;
    const cfg = {
      rifle: { body: 0.30, low: 320, crack: 4200, gain: 0.55 },
      smg: { body: 0.2, low: 420, crack: 5200, gain: 0.42 },
      sniper: { body: 0.62, low: 190, crack: 3600, gain: 0.75 },
      pistol: { body: 0.16, low: 520, crack: 5600, gain: 0.34 },
      lmg: { body: 0.34, low: 260, crack: 4000, gain: 0.6 },
    }[kind] || { body: 0.3, low: 320, crack: 4200, gain: 0.55 };

    const base = { position: opts.position, distance: opts.distance ?? 4, reverb: opts.suppressed ? 0.25 : 0.9 };
    if (opts.suppressed) {
      this.burst({ ...base, kind: 'white', type: 'lowpass', f0: 1800, f1: 500, dur: 0.09, gain: cfg.gain * 0.45, q: 0.7 });
      this.tone({ ...base, freq: 200, freq1: 90, dur: 0.11, gain: cfg.gain * 0.25, type: 'triangle' });
      this.burst({ ...base, kind: 'white', f0: 3000, f1: 1400, dur: 0.05, gain: cfg.gain * 0.2, q: 0.6 });
      return;
    }
    // mechanical action
    this.burst({ ...base, kind: 'white', f0: 6000, f1: 2500, dur: 0.03, gain: cfg.gain * 0.22, q: 0.5, reverb: 0.1 });
    // muzzle crack
    this.burst({ ...base, kind: 'white', type: 'highpass', f0: cfg.crack, dur: 0.05, gain: cfg.gain * 0.55, q: 0.6 });
    // chamber boom
    this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: cfg.low * 3, f1: cfg.low * 0.7, dur: cfg.body, gain: cfg.gain, q: 1.0 });
    // pressure thump
    this.tone({ ...base, freq: cfg.low * 0.7, freq1: cfg.low * 0.28, dur: cfg.body * 0.8, gain: cfg.gain * 0.3, type: 'sine' });
    // jungles answer back: two discrete slapbacks
    if (!opts.position || opts.distance < 45) {
      this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 900, dur: 0.22, gain: cfg.gain * 0.16, delay: 0.075, q: 0.8, position: opts.position, distance: opts.distance });
      this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 700, dur: 0.34, gain: cfg.gain * 0.1, delay: 0.19, q: 0.8, position: opts.position, distance: opts.distance });
    }
  }

  /** A very distant firefight (ambience flavour). */
  distantShot(opts = {}) {
    if (!this.ctx) return;
    this.burst({ kind: 'brown', type: 'lowpass', f0: 420, f1: 160, dur: rand(0.28, 0.5), gain: rand(0.05, 0.12), q: 0.7, reverb: 1.1, position: opts.position });
    this.burst({ kind: 'white', type: 'bandpass', f0: rand(700, 1400), dur: 0.06, gain: 0.03, q: 0.8, delay: 0.02, position: opts.position });
  }

  dryFire() {
    this.burst({ kind: 'white', f0: 3400, f1: 1600, dur: 0.035, gain: 0.16, q: 1.4, reverb: 0.1 });
    this.tone({ freq: 1800, freq1: 900, dur: 0.03, gain: 0.05, type: 'square' });
  }

  magOut() {
    this.burst({ kind: 'white', f0: 2200, f1: 1000, dur: 0.09, gain: 0.14, q: 1.2, reverb: 0.15 });
    this.tone({ freq: 420, freq1: 220, dur: 0.07, gain: 0.07, type: 'square' });
  }
  magIn() {
    this.burst({ kind: 'white', f0: 1600, f1: 700, dur: 0.11, gain: 0.2, q: 1.0, reverb: 0.15 });
    this.tone({ freq: 260, freq1: 140, dur: 0.09, gain: 0.1, type: 'triangle' });
  }
  bolt() {
    this.burst({ kind: 'white', f0: 4200, f1: 1800, dur: 0.07, gain: 0.16, q: 1.6, reverb: 0.2 });
    this.burst({ kind: 'white', f0: 3000, f1: 1400, dur: 0.06, gain: 0.12, q: 1.6, delay: 0.1, reverb: 0.2 });
  }
  chargeHandle() {
    this.burst({ kind: 'white', f0: 5200, f1: 2200, dur: 0.06, gain: 0.14, q: 1.5, reverb: 0.2 });
    this.burst({ kind: 'white', f0: 2800, f1: 1200, dur: 0.05, gain: 0.14, q: 1.5, delay: 0.055, reverb: 0.15 });
  }
  shellDrop() {
    for (let i = 0; i < 3; i++) {
      this.tone({
        freq: rand(2400, 4200),
        freq1: rand(1200, 2200),
        dur: 0.06,
        gain: 0.035,
        type: 'square',
        delay: i * rand(0.06, 0.14),
      });
    }
  }

  footstep(surface = 'dirt', opts = {}) {
    if (!this.ctx) return;
    // Rate limit: the world is noisy enough already.
    const now = this.ctx.currentTime;
    if (now - this._lastFootstep < 0.16 && !opts.force) return;
    this._lastFootstep = now;
    const base = { position: opts.position, distance: opts.distance ?? 1.6, refDistance: 2, reverb: 0.35, rolloff: 1.5 };
    const g = opts.gain ?? 0.24;
    switch (surface) {
      case 'grass':
      case 'leaf':
        this.burst({ ...base, kind: 'white', type: 'bandpass', f0: rand(3800, 5200), dur: 0.07, gain: g * 0.5, q: 0.8 });
        this.burst({ ...base, kind: 'pink', type: 'highpass', f0: 1400, dur: 0.12, gain: g * 0.5, q: 0.5 });
        break;
      case 'wood':
        this.burst({ ...base, kind: 'white', type: 'bandpass', f0: rand(420, 700), dur: 0.1, gain: g * 0.7, q: 2.4 });
        this.burst({ ...base, kind: 'white', f0: 2400, dur: 0.04, gain: g * 0.35, q: 0.8 });
        break;
      case 'metal':
        this.burst({ ...base, kind: 'white', type: 'bandpass', f0: rand(900, 1600), dur: 0.14, gain: g * 0.6, q: 3.5 });
        this.tone({ ...base, freq: rand(1200, 2100), freq1: rand(700, 1100), dur: 0.16, gain: g * 0.16, type: 'triangle' });
        break;
      case 'water':
        this.burst({ ...base, kind: 'white', type: 'bandpass', f0: rand(1600, 2600), f1: 700, dur: 0.22, gain: g * 0.8, q: 0.7 });
        break;
      case 'concrete':
      case 'stone':
        this.burst({ ...base, kind: 'white', type: 'bandpass', f0: rand(1800, 3000), dur: 0.06, gain: g * 0.6, q: 1.4 });
        this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 400, dur: 0.1, gain: g * 0.5, q: 0.7 });
        break;
      default: // dirt / sand
        this.burst({ ...base, kind: 'pink', type: 'bandpass', f0: rand(900, 1500), dur: 0.11, gain: g * 0.7, q: 0.9 });
        this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 600, dur: 0.13, gain: g * 0.4, q: 0.6 });
    }
  }

  jump() {
    this.burst({ kind: 'pink', f0: 700, f1: 300, dur: 0.16, gain: 0.1, q: 0.7, reverb: 0.2 });
  }
  land(hard = 0.4) {
    this.burst({ kind: 'brown', type: 'lowpass', f0: 520, f1: 180, dur: 0.24, gain: 0.18 + hard * 0.3, q: 0.8 });
    this.tone({ freq: 160, freq1: 70, dur: 0.2, gain: 0.1 + hard * 0.16, type: 'sine' });
  }

  /** Bullet passing close by: a snap + a whizz. */
  bulletWhizz(opts = {}) {
    const side = opts.side ?? (Math.random() < 0.5 ? -1 : 1);
    this.burst({ kind: 'white', type: 'bandpass', f0: rand(2600, 5200), f1: 900, dur: 0.09, gain: 0.13 * (opts.gain ?? 1), q: 3.0, position: opts.position, reverb: 0.2 });
    this.tone({ freq: rand(700, 1300) * side, freq1: rand(200, 500), dur: 0.11, gain: 0.05, type: 'sine', position: opts.position });
  }

  impact(surface = 'dirt', opts = {}) {
    const base = { position: opts.position, distance: opts.distance ?? 2, reverb: 0.5 };
    switch (surface) {
      case 'metal':
        this.burst({ ...base, kind: 'white', type: 'bandpass', f0: rand(2200, 3600), f1: 900, dur: 0.12, gain: 0.24, q: 4 });
        this.tone({ ...base, freq: rand(1400, 2600), freq1: 500, dur: 0.2, gain: 0.1, type: 'triangle' });
        break;
      case 'wood':
        this.burst({ ...base, kind: 'white', f0: rand(600, 1100), f1: 300, dur: 0.1, gain: 0.22, q: 2.2 });
        this.tone({ ...base, freq: rand(300, 520), freq1: 140, dur: 0.14, gain: 0.08, type: 'square' });
        break;
      case 'stone':
      case 'concrete':
        this.burst({ ...base, kind: 'white', f0: rand(1600, 2800), f1: 700, dur: 0.09, gain: 0.22, q: 1.6 });
        this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 800, dur: 0.14, gain: 0.14, q: 0.8 });
        break;
      case 'flesh':
        this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 900, f1: 260, dur: 0.12, gain: 0.26, q: 0.9 });
        this.burst({ ...base, kind: 'pink', f0: 1400, dur: 0.07, gain: 0.12, q: 1.0 });
        break;
      case 'water':
        this.burst({ ...base, kind: 'white', type: 'bandpass', f0: rand(900, 1800), dur: 0.3, gain: 0.2, q: 0.6 });
        break;
      default:
        this.burst({ ...base, kind: 'pink', f0: rand(800, 1500), f1: 400, dur: 0.12, gain: 0.2, q: 0.9 });
        this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 500, dur: 0.2, gain: 0.16, q: 0.7 });
    }
  }

  /** Layers the player hears when *they* are hit. */
  hurt(severity = 0.5) {
    this.burst({ kind: 'brown', type: 'lowpass', f0: 400, f1: 140, dur: 0.3, gain: 0.2 + severity * 0.3, q: 0.7 });
    this.tone({ freq: 90, freq1: 60, dur: 0.35, gain: 0.12 + severity * 0.2, type: 'sine' });
    this.burst({ kind: 'pink', f0: 2200, dur: 0.12, gain: 0.08 + severity * 0.1, q: 0.8 });
  }

  hitmarker(head = false) {
    if (head) {
      this.tone({ freq: 1900, freq1: 2400, dur: 0.07, gain: 0.14, type: 'triangle' });
      this.tone({ freq: 2800, freq1: 3200, dur: 0.05, gain: 0.08, type: 'sine', delay: 0.03 });
    } else {
      this.tone({ freq: 1250, freq1: 1500, dur: 0.055, gain: 0.1, type: 'triangle' });
    }
  }
  kill() {
    this.tone({ freq: 900, freq1: 620, dur: 0.16, gain: 0.1, type: 'triangle' });
    this.tone({ freq: 1350, freq1: 900, dur: 0.18, gain: 0.06, type: 'sine', delay: 0.05 });
  }
  streak() {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 700 + i * 320, freq1: 900 + i * 380, dur: 0.14, gain: 0.09, type: 'square', delay: i * 0.07 });
    }
  }

  explosion(opts = {}) {
    const base = { position: opts.position, distance: opts.distance ?? 8, reverb: 1.2, refDistance: 8 };
    this.tone({ ...base, freq: 120, freq1: 32, dur: 0.9, gain: 0.55, type: 'sine' });
    this.burst({ ...base, kind: 'brown', type: 'lowpass', f0: 900, f1: 120, dur: 1.1, gain: 0.6, q: 0.7 });
    this.burst({ ...base, kind: 'white', type: 'highpass', f0: 1800, dur: 0.3, gain: 0.35, q: 0.5 });
    for (let i = 0; i < 5; i++) {
      this.burst({ ...base, kind: 'white', f0: rand(1800, 4200), dur: rand(0.05, 0.14), gain: 0.08, q: 2.5, delay: rand(0.15, 0.9), position: opts.position });
    }
  }

  flashbang(opts = {}) {
    this.burst({ ...opts, kind: 'white', type: 'highpass', f0: 2400, dur: 0.16, gain: 0.5 });
    this.tone({ freq: 4200, freq1: 3600, dur: 2.4, gain: 0.1, type: 'sine' });
    this.tone({ freq: 3100, freq1: 2900, dur: 2.0, gain: 0.07, type: 'sine', delay: 0.05 });
  }

  grenadeBounce(opts = {}) {
    this.tone({ freq: rand(600, 1200), freq1: rand(200, 420), dur: 0.14, gain: 0.12, type: 'triangle', position: opts.position });
    this.burst({ ...opts, kind: 'white', f0: 1600, dur: 0.06, gain: 0.08, q: 1.5 });
  }
  grenadePin() {
    this.burst({ kind: 'white', f0: 5200, f1: 2600, dur: 0.05, gain: 0.08, q: 2.0 });
  }
  throwWhoosh() {
    this.burst({ kind: 'pink', type: 'bandpass', f0: 900, f1: 300, dur: 0.22, gain: 0.09, q: 1.1 });
  }

  meleeSwing() {
    this.burst({ kind: 'pink', type: 'bandpass', f0: 1400, f1: 500, dur: 0.14, gain: 0.1, q: 1.4 });
  }
  meleeHit() {
    this.burst({ kind: 'brown', type: 'lowpass', f0: 900, f1: 200, dur: 0.16, gain: 0.28, q: 0.9 });
    this.tone({ freq: 180, freq1: 90, dur: 0.18, gain: 0.12, type: 'square' });
  }

  /* -------------------- UI -------------------- */

  uiClick() {
    this.tone({ freq: 1100, freq1: 1500, dur: 0.045, gain: 0.07, type: 'square' });
  }
  uiHover() {
    this.tone({ freq: 1900, dur: 0.025, gain: 0.035, type: 'sine' });
  }
  uiBack() {
    this.tone({ freq: 700, freq1: 420, dur: 0.07, gain: 0.07, type: 'square' });
  }
  uiTick() {
    this.tone({ freq: 2400, dur: 0.02, gain: 0.04, type: 'sine' });
  }
  notify() {
    this.tone({ freq: 880, freq1: 1320, dur: 0.16, gain: 0.07, type: 'sine' });
  }
  radioStatic() {
    this.burst({ kind: 'white', type: 'bandpass', f0: 2600, f1: 1800, dur: 0.16, gain: 0.05, q: 0.8, reverb: 0.1 });
  }

  /**
   * Garbled radio voice - formant-ish synth that reads as a squad callout
   * without using any recorded speech.
   */
  callout(kind = 'contact', opts = {}) {
    if (!this.ctx) return;
    if (opts.radio) this.radioStatic();
    const line = {
      contact: [0.16, 0.13, 0.2, 0.15, 0.18],
      grenade: [0.22, 0.16, 0.2],
      reloading: [0.16, 0.14, 0.2, 0.15],
      moving: [0.14, 0.2, 0.16],
      hostile_down: [0.14, 0.12, 0.22, 0.16],
      taking_fire: [0.2, 0.12, 0.14, 0.22],
      push: [0.15, 0.13, 0.2],
      status: [0.16, 0.2, 0.14],
    }[kind] || [0.15, 0.15, 0.2];
    const base = { position: opts.position, distance: opts.distance ?? 6, reverb: 0.4, refDistance: 6 };
    let t = 0;
    for (let i = 0; i < line.length; i++) {
      const dur = line[i] * (opts.speed ?? 1);
      const f = rand(110, 165);
      this.burst({ ...base, kind: 'pink', type: 'bandpass', f0: rand(500, 900), q: 3.2, dur, gain: 0.16, delay: t, attack: 0.01 });
      this.burst({ ...base, kind: 'pink', type: 'bandpass', f0: rand(1300, 2000), q: 4.5, dur, gain: 0.1, delay: t, attack: 0.01 });
      this.tone({ ...base, freq: f, freq1: f * rand(0.8, 1.25), dur: dur * 0.9, gain: 0.06, type: 'sawtooth', delay: t });
      t += dur * rand(0.75, 1.0);
    }
    void base;
  }

  /* ------------------------------------------------------------ */
  /* Ambience                                                     */
  /* ------------------------------------------------------------ */

  startAmbience() {
    if (!this.ctx || this._ambience.length) return;
    const ctx = this.ctx;

    // wind: brown noise through a slow-moving bandpass
    const wind = this._noiseSource('brown');
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 420;
    wf.Q.value = 0.55;
    const wg = ctx.createGain();
    wg.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(wg.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.031;
    const lfo2g = ctx.createGain();
    lfo2g.gain.value = 160;
    lfo2.connect(lfo2g);
    lfo2g.connect(wf.frequency);
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.ambBus);
    wind.start();
    lfo.start();
    lfo2.start();

    // cicadas: high band noise with chatter gating
    const cic = this._noiseSource('white');
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 5200;
    cf.Q.value = 7;
    const cg = ctx.createGain();
    cg.gain.value = 0.012;
    const chatter = ctx.createOscillator();
    chatter.type = 'square';
    chatter.frequency.value = 11;
    const chatterGain = ctx.createGain();
    chatterGain.gain.value = 0.012;
    chatter.connect(chatterGain);
    chatterGain.connect(cg.gain);
    cic.connect(cf);
    cf.connect(cg);
    cg.connect(this.ambBus);
    cic.start();
    chatter.start();

    // low distant rumble of a war two valleys over
    const rumble = this._noiseSource('brown');
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 140;
    const rg = ctx.createGain();
    rg.gain.value = 0.1;
    rumble.connect(rf);
    rf.connect(rg);
    rg.connect(this.ambBus);
    rumble.start();

    this._ambience.push({ wind, lfo, lfo2, cic, chatter, rumble, nodes: [wg, cg, rg] });
    this._ambienceTimer = 0;
    this._startBirdTimer();
  }

  _startBirdTimer() {
    clearTimeout(this._birdTimer);
    const schedule = () => {
      if (!this.ctx) return;
      if (Math.random() < 0.7) {
        const n = 2 + Math.floor(Math.random() * 4);
        const base = rand(1800, 3600);
        for (let i = 0; i < n; i++) {
          this.tone({
            freq: base * rand(0.9, 1.2),
            freq1: base * rand(1.3, 1.9),
            dur: rand(0.05, 0.12),
            gain: 0.045,
            type: 'sine',
            delay: i * rand(0.08, 0.22),
          });
        }
      }
      this._birdTimer = setTimeout(schedule, rand(3500, 11000));
    };
    this._birdTimer = setTimeout(schedule, rand(2000, 6000));
  }

  /** Occasional far-off firefight to sell the scale of the place. */
  updateAmbience(dt, camera) {
    if (!this.ctx) return;
    this._ambienceTimer = (this._ambienceTimer ?? 0) - dt;
    if (this._ambienceTimer <= 0) {
      this._ambienceTimer = rand(6, 22);
      const n = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        setTimeout(() => this.distantShot(), i * rand(60, 240));
      }
      if (Math.random() < 0.35) {
        setTimeout(() => {
          this.burst({ kind: 'brown', type: 'lowpass', f0: 180, f1: 60, dur: rand(0.6, 1.2), gain: 0.14, q: 0.5, reverb: 1.4 });
        }, rand(200, 900));
      }
    }
    if (camera) {
      // three cameras expose worldPositionLookAt/matrixWorld, not .forward
      const forward = this._listenerForward || (this._listenerForward = { x: 0, y: 0, z: -1 });
      const m = camera.matrixWorld?.elements;
      if (m) {
        forward.x = -m[8];
        forward.y = -m[9];
        forward.z = -m[10];
      } else if (camera.forward) {
        forward.x = camera.forward.x;
        forward.y = camera.forward.y;
        forward.z = camera.forward.z;
      }
      const position = camera.position || camera.worldPosition;
      if (position) this.setListener(position, forward);
    }
  }

  setListener(position, forward, up = { x: 0, y: 1, z: 0 }) {
    if (!this.ctx || !this.listener) return;
    if (!position || !forward) return;
    const fx = Number.isFinite(forward.x) ? forward.x : 0;
    const fy = Number.isFinite(forward.y) ? forward.y : 0;
    const fz = Number.isFinite(forward.z) ? forward.z : -1;
    forward = { x: fx, y: fy, z: fz };
    const l = this.listener;
    if (l.positionX) {
      l.positionX.value = position.x;
      l.positionY.value = position.y;
      l.positionZ.value = position.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      l.setPosition(position.x, position.y, position.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  stopAmbience() {
    for (const a of this._ambience) {
      for (const [key, node] of Object.entries(a)) {
        if (key === 'nodes') continue;
        try {
          node.stop();
        } catch (err) {
          void err;
        }
      }
    }
    this._ambience.length = 0;
    clearTimeout(this._birdTimer);
  }

  /** Distance attenuation helper used by the game before calling play(). */
  static attenuation(distance, ref = 12, max = 220) {
    if (distance <= ref) return 1;
    return clamp(Math.pow(ref / distance, 1.35), 0, 1) * (distance > max ? 0 : 1);
  }

  pickFootstepSurface(surfaces = []) {
    return choice(surfaces.length ? surfaces : ['dirt', 'grass']);
  }
}

export function createAudio(opts) {
  return new Audio(opts);
}

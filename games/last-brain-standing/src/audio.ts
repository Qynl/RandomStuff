/**
 * Tiny procedural sound engine.
 *
 * The project has no external assets and must keep working offline, so every
 * sound is synthesised from oscillators and a shared noise buffer. Nothing is
 * created until the first real user gesture, which keeps autoplay policies and
 * headless tests happy.
 */
export type SoundName =
  | "player-shot"
  | "bot-shot"
  | "telegraph"
  | "impact"
  | "enemy-impact"
  | "elimination"
  | "damage"
  | "dash"
  | "dive"
  | "wave-incoming"
  | "spawn"
  | "victory"
  | "defeat"
  | "ui";

interface Voice {
  startedAt: number;
}

const MAX_VOICES = 22;

export class SoundEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private muted = false;
  private volume = 0.7;
  private unavailable = false;

  get isMuted(): boolean {
    return this.muted;
  }

  get isAvailable(): boolean {
    return !this.unavailable;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.context.currentTime, 0.02);
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.context && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
    }
  }

  /** Must be called from a user gesture (click, keydown, touch) at least once. */
  resume(): void {
    if (this.unavailable) return;
    try {
      if (!this.context) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          this.unavailable = true;
          return;
        }
        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.context.destination);
        this.noise = this.createNoiseBuffer(this.context);
      }
      if (this.context.state === "suspended") void this.context.resume();
    } catch {
      this.unavailable = true;
    }
  }

  /**
   * Plays a synthesised cue. `pitch` transposes it (and shifts noise filters
   * with it), which is how the three profiles end up sounding like themselves
   * even when they use the same cue.
   */
  play(name: SoundName, intensity = 1, pitch = 1): void {
    if (this.muted || this.unavailable) return;
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.noise) return;
    if (context.state !== "running") return;

    const now = context.currentTime;
    this.voices = this.voices.filter((voice) => now - voice.startedAt < 0.6);
    if (this.voices.length >= MAX_VOICES) return;
    this.voices.push({ startedAt: now });

    const level = Math.max(0.1, Math.min(1.6, intensity));
    try {
      switch (name) {
        case "player-shot":
          this.blip(context, master, { type: "square", from: 880, to: 300, duration: 0.075, gain: 0.075, level });
          break;
        case "bot-shot":
          this.blip(context, master, { type: "sawtooth", from: 420 * pitch, to: 190 * pitch, duration: 0.11, gain: 0.05, level });
          break;
        case "telegraph":
          this.blip(context, master, { type: "triangle", from: 240 * pitch, to: 520 * pitch, duration: 0.14, gain: 0.035, level });
          break;
        case "impact":
          this.noiseBurst(context, master, { duration: 0.07, gain: 0.11, filterFrom: 2600, filterTo: 700, level });
          break;
        case "enemy-impact":
          this.noiseBurst(context, master, { duration: 0.16, gain: 0.13, filterFrom: 1400 * pitch, filterTo: 320 * pitch, level });
          break;
        case "elimination":
          this.blip(context, master, { type: "triangle", from: 300, to: 90, duration: 0.32, gain: 0.11, level });
          this.noiseBurst(context, master, { duration: 0.24, gain: 0.08, filterFrom: 1800, filterTo: 200, level });
          break;
        case "damage":
          this.blip(context, master, { type: "sawtooth", from: 180, to: 70, duration: 0.3, gain: 0.13, level });
          this.noiseBurst(context, master, { duration: 0.22, gain: 0.1, filterFrom: 900, filterTo: 160, level });
          break;
        case "dash":
          this.noiseBurst(context, master, { duration: 0.2, gain: 0.075, filterFrom: 400, filterTo: 3200, level });
          break;
        case "dive":
          // A committed dive: a whoosh that falls away, plus a low thump.
          this.noiseBurst(context, master, { duration: 0.28, gain: 0.07, filterFrom: 2800 * pitch, filterTo: 260 * pitch, level });
          this.blip(context, master, { type: "sine", from: 190 * pitch, to: 90 * pitch, duration: 0.24, gain: 0.05, level });
          break;
        case "wave-incoming":
          this.blip(context, master, { type: "sine", from: 200, to: 420, duration: 0.5, gain: 0.06, level });
          break;
        case "spawn":
          this.blip(context, master, { type: "triangle", from: 640 * pitch, to: 200 * pitch, duration: 0.22, gain: 0.07, level });
          break;
        case "victory":
          [523, 659, 784, 1046].forEach((frequency, index) => {
            this.blip(context, master, {
              type: "triangle",
              from: frequency,
              to: frequency,
              duration: 0.3,
              gain: 0.075,
              level,
              delay: index * 0.13
            });
          });
          break;
        case "defeat":
          [330, 262, 196, 147].forEach((frequency, index) => {
            this.blip(context, master, {
              type: "sawtooth",
              from: frequency,
              to: frequency * 0.9,
              duration: 0.42,
              gain: 0.07,
              level,
              delay: index * 0.16
            });
          });
          break;
        case "ui":
          this.blip(context, master, { type: "square", from: 660, to: 880, duration: 0.05, gain: 0.04, level });
          break;
        default:
          break;
      }
    } catch {
      this.unavailable = true;
    }
  }

  private blip(
    context: AudioContext,
    master: GainNode,
    options: { type: OscillatorType; from: number; to: number; duration: number; gain: number; level: number; delay?: number }
  ): void {
    const start = context.currentTime + (options.delay ?? 0);
    const end = start + options.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.from, start);
    if (options.to !== options.from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain * options.level, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private noiseBurst(
    context: AudioContext,
    master: GainNode,
    options: { duration: number; gain: number; filterFrom: number; filterTo: number; level: number }
  ): void {
    if (!this.noise) return;
    const start = context.currentTime;
    const end = start + options.duration;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(options.filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, options.filterTo), end);
    const gain = context.createGain();
    gain.gain.setValueAtTime(options.gain * options.level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(end + 0.02);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 0.5);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

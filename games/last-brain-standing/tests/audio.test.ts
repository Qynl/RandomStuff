// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundEngine, type SoundName } from "../src/audio";

/**
 * The sound engine is synthesised from WebAudio and jsdom has no WebAudio at
 * all, so these tests install a minimal fake `AudioContext` and check the
 * behaviour that matters: nothing is created before a user gesture, nothing
 * throws when WebAudio is missing or broken, muting is honoured, and the voice
 * budget actually caps polyphony.
 */

interface FakeParam {
  value: number;
  setValueAtTime: (value: number, time: number) => void;
  exponentialRampToValueAtTime: (value: number, time: number) => void;
  setTargetAtTime: (value: number, time: number, constant: number) => void;
}

function parameter(initial = 0): FakeParam {
  return {
    value: initial,
    setValueAtTime(value: number) {
      this.value = value;
    },
    exponentialRampToValueAtTime(value: number) {
      this.value = value;
    },
    setTargetAtTime(value: number) {
      this.value = value;
    }
  };
}

interface FakeGraph {
  context: AudioContext;
  /** Moves the fake clock forward, which is how the voice window is aged. */
  advanceTime: (seconds: number) => void;
  oscillators: number;
  buffers: number;
  gains: number;
  masterGain: FakeParam;
  state: () => AudioContextState;
}

function installFakeAudio(options: { failOnConnect?: boolean } = {}): FakeGraph {
  const graph: FakeGraph = {
    context: null as unknown as AudioContext,
    advanceTime: (seconds) => {
      clock += seconds;
    },
    oscillators: 0,
    buffers: 0,
    gains: 0,
    masterGain: parameter(0),
    state: () => graph.context.state
  };
  let state: AudioContextState = "suspended";
  let clock = 0;

  const node = () => ({
    connect(target: unknown) {
      if (options.failOnConnect) throw new Error("audio graph unavailable");
      return target;
    },
    disconnect() {
      return undefined;
    }
  });

  const context = {
    sampleRate: 48000,
    get currentTime() {
      return clock;
    },
    get state() {
      return state;
    },
    destination: node(),
    createGain: () => {
      graph.gains += 1;
      // The first gain node the engine creates is its master.
      const gain = graph.gains === 1 ? graph.masterGain : parameter(0);
      return { ...node(), gain };
    },
    createOscillator: () => {
      graph.oscillators += 1;
      return {
        ...node(),
        type: "sine" as OscillatorType,
        frequency: parameter(0),
        start: () => undefined,
        stop: () => undefined
      };
    },
    createBufferSource: () => {
      graph.buffers += 1;
      return { ...node(), buffer: null, start: () => undefined, stop: () => undefined };
    },
    createBiquadFilter: () => ({ ...node(), type: "bandpass" as BiquadFilterType, Q: parameter(1), frequency: parameter(0) }),
    createBuffer: (_channels: number, length: number) => ({ length, duration: length / 48000, getChannelData: () => new Float32Array(length) }),
    resume: () => {
      state = "running";
      return Promise.resolve();
    }
  };

  graph.context = context as unknown as AudioContext;
  (window as unknown as { AudioContext?: unknown }).AudioContext = function FakeAudioContext(this: unknown) {
    return context;
  };
  return graph;
}

const ALL_SOUNDS: SoundName[] = [
  "player-shot",
  "bot-shot",
  "telegraph",
  "impact",
  "enemy-impact",
  "elimination",
  "damage",
  "dash",
  "dive",
  "wave-incoming",
  "spawn",
  "victory",
  "defeat",
  "contract",
  "ui"
];

// Every sound in the union has to be named above: adding one without listing it
// is a type error, so the audit below cannot silently skip the new sound.
const everySoundListed: Exclude<SoundName, (typeof ALL_SOUNDS)[number]> extends never ? true : never = true;
void everySoundListed;

describe("sound engine", () => {
  let graph: FakeGraph | null = null;

  beforeEach(() => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext = undefined;
    graph = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates nothing until a user gesture asks for it", () => {
    const engine = new SoundEngine();
    // No context has been created, so playing is a silent no-op - not a crash.
    expect(() => engine.play("player-shot")).not.toThrow();
    expect(engine.isAvailable).toBe(true);
    expect(graph).toBeNull();

    graph = installFakeAudio();
    engine.resume();
    expect(graph.gains).toBe(1);
    expect(engine.isAvailable).toBe(true);
  });

  it("stays silent and available when the browser has no WebAudio at all", () => {
    const engine = new SoundEngine();
    engine.resume();
    expect(engine.isAvailable).toBe(false);
    for (const name of ALL_SOUNDS) expect(() => engine.play(name)).not.toThrow();
    expect(() => engine.setVolume(0.5)).not.toThrow();
    expect(() => engine.setMuted(true)).not.toThrow();
  });

  it("reports itself unavailable instead of looping on a broken audio graph", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    graph = installFakeAudio({ failOnConnect: true });
    const engine = new SoundEngine();
    engine.resume();
    expect(engine.isAvailable).toBe(false);
    expect(() => engine.play("impact")).not.toThrow();
  });

  it("plays every sound effect through the graph once the context is running", () => {
    graph = installFakeAudio();
    const engine = new SoundEngine();
    engine.resume();
    graph.context.resume();
    for (const name of ALL_SOUNDS) {
      engine.play(name);
    }
    expect(graph.oscillators).toBeGreaterThan(0);
    expect(graph.buffers).toBeGreaterThan(0);
  });

  it("honours the mute switch without touching the graph again", () => {
    graph = installFakeAudio();
    const engine = new SoundEngine();
    engine.resume();
    graph.context.resume();
    engine.setMuted(true);
    expect(engine.isMuted).toBe(true);
    expect(graph.masterGain.value).toBe(0);
    const oscillatorsBefore = graph.oscillators;
    engine.play("elimination");
    engine.play("damage");
    expect(graph.oscillators).toBe(oscillatorsBefore);

    engine.setMuted(false);
    engine.play("elimination");
    expect(graph.oscillators).toBeGreaterThan(oscillatorsBefore);
    expect(graph.masterGain.value).toBeGreaterThan(0);
    expect(graph.masterGain.value).toBeLessThanOrEqual(1);
  });

  it("clamps the volume setting into range", () => {
    graph = installFakeAudio();
    const engine = new SoundEngine();
    engine.resume();
    engine.setVolume(4);
    expect(graph.masterGain.value).toBe(1);
    engine.setVolume(-3);
    expect(graph.masterGain.value).toBe(0);
    engine.setVolume(0.42);
    expect(graph.masterGain.value).toBeCloseTo(0.42, 5);
  });

  it("caps polyphony so a firefight cannot pile up voices", () => {
    graph = installFakeAudio();
    const engine = new SoundEngine();
    engine.resume();
    graph.context.resume();
    // The engine allows 22 voices inside its half-second window.
    for (let i = 0; i < 90; i += 1) engine.play("player-shot");
    expect(graph.oscillators).toBe(22);

    // Once the window has moved on, voices are recycled instead of leaking.
    graph.advanceTime(1);
    const before = graph.oscillators;
    for (let i = 0; i < 3; i += 1) engine.play("player-shot");
    expect(graph.oscillators).toBe(before + 3);
  });

  it("asks the context to resume on the first gesture, then plays only when running", () => {
    graph = installFakeAudio();
    const engine = new SoundEngine();
    engine.resume();
    // resume() pulled the fake context out of "suspended", so sound is live.
    expect(graph.state()).toBe("running");
    engine.play("player-shot");
    expect(graph.oscillators).toBe(1);

    // If a browser refuses to resume, the engine plays nothing rather than
    // scheduling work into a dead context.
    const stuck = installFakeAudio();
    stuck.context.resume = () => Promise.resolve(); // never changes state
    const stuckEngine = new SoundEngine();
    stuckEngine.resume();
    stuckEngine.play("player-shot");
    expect(stuck.oscillators).toBe(0);
  });
});

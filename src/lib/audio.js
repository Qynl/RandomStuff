/* Sound.
 *
 * Everything is synthesised: room tone, the tension drone that rises when
 * something is following you, and one-shot cues for doors, slams, whispers and
 * stings. No files, no loading, no network.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const MASTER = 0.9;

export function useAudio() {
  const [soundOn, setSoundOn] = useState(false);
  const graph = useRef(null);
  const audible = useRef(false);
  const touched = useRef(false);

  // Every callback below is stable: callers put them in effect dependency
  // arrays, and an identity change there would tear down live timers (which is
  // how a flicker used to get stuck at 8% brightness).
  const build = useCallback(() => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();

    const master = ctx.createGain();
    master.gain.value = 0.02 * MASTER;
    master.connect(ctx.destination);

    const fx = ctx.createGain();
    fx.gain.value = 0.34;
    fx.connect(ctx.destination);

    // --- room tone -------------------------------------------------------
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 46;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.55;
    low.connect(lowGain);
    lowGain.connect(master);
    low.start();

    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 59.4;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.14;
    hum.connect(humGain);
    humGain.connect(master);
    hum.start();

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 420;
    airFilter.Q.value = 0.7;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.05;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(master);
    air.start();

    // --- tension drone ---------------------------------------------------
    const tension = ctx.createGain();
    tension.gain.value = 0;
    tension.connect(master);

    const tensionOsc = ctx.createOscillator();
    tensionOsc.type = 'sawtooth';
    tensionOsc.frequency.value = 33;
    const tensionFilter = ctx.createBiquadFilter();
    tensionFilter.type = 'lowpass';
    tensionFilter.frequency.value = 240;
    const tensionOscGain = ctx.createGain();
    tensionOscGain.gain.value = 0.5;
    tensionOsc.connect(tensionFilter);
    tensionFilter.connect(tensionOscGain);
    tensionOscGain.connect(tension);
    tensionOsc.start();

    const tensionShimmer = ctx.createOscillator();
    tensionShimmer.type = 'sine';
    tensionShimmer.frequency.value = 1470;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.05;
    tensionShimmer.connect(shimmerGain);
    shimmerGain.connect(tension);
    tensionShimmer.start();

    graph.current = { ctx, master, fx, noise, tension, tensionOsc, tensionShimmer };
    return graph.current;
  }, []);

  const start = useCallback(async () => {
    const audio = graph.current || build();
    if (!audio) return false;
    try {
      await audio.ctx.resume();
    } catch {
      return false;
    }
    audible.current = true;
    setSoundOn(true);
    return true;
  }, [build]);

  const stop = useCallback(async () => {
    if (!graph.current) return;
    audible.current = false;
    setSoundOn(false);
    try {
      await graph.current.ctx.suspend();
    } catch {
      /* the browser refused; the toggle state still reflects intent */
    }
  }, []);

  const toggle = useCallback(() => {
    touched.current = true;
    if (audible.current) stop();
    else start();
  }, [start, stop]);

  const autoStart = useCallback(() => {
    if (!touched.current) start();
  }, [start]);

  const setTension = useCallback((value) => {
    const audio = graph.current;
    if (!audio) return;
    const now = audio.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, value));
    audio.tension.gain.cancelScheduledValues(now);
    audio.tension.gain.linearRampToValueAtTime(clamped * 0.5, now + 0.45);
    audio.tensionOsc.frequency.setTargetAtTime(31 + clamped * 22, now, 0.6);
    audio.tensionShimmer.frequency.setTargetAtTime(1380 + clamped * 720, now, 0.8);
  }, []);

  const cue = useCallback((kind) => {
    const audio = graph.current;
    if (!audio || !audible.current) return;
    const { ctx, fx, noise } = audio;
    const now = ctx.currentTime;

    const burst = (duration, gainValue, type, frequency, q = 1, sweep = null) => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(frequency, now);
      if (sweep) filter.frequency.exponentialRampToValueAtTime(sweep, now + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainValue, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(fx);
      source.start(now, Math.random() * 0.8);
      source.stop(now + duration + 0.05);
    };

    const tone = (from, to, duration, gainValue, type = 'sine') => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(to, now + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainValue, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + duration);
      osc.connect(gain);
      gain.connect(fx);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    };

    switch (kind) {
      case 'door':
        burst(1.15, 0.5, 'bandpass', 720, 5, 180);
        tone(96, 58, 0.7, 0.16, 'triangle');
        return;

      case 'close':
        burst(0.55, 0.34, 'bandpass', 340, 3, 120);
        return;

      case 'slam':
        burst(0.9, 0.85, 'lowpass', 2400, 0.8, 160);
        tone(78, 34, 0.9, 0.5, 'sine');
        return;

      case 'step':
        burst(0.22, 0.18, 'bandpass', 260 + Math.random() * 180, 1.4, 90);
        return;

      case 'drip':
        tone(1400 + Math.random() * 500, 420, 0.16, 0.12, 'sine');
        return;

      case 'whisper':
        burst(2.2, 0.2, 'bandpass', 1500, 6, 700);
        return;

      case 'creak':
        // Hinge: narrow resonance sliding down, plus a little wood under it.
        burst(1.7, 0.3, 'bandpass', 1350, 13, 380);
        tone(180, 120, 1.4, 0.07, 'triangle');
        return;

      case 'breath':
        // Two exhales, the second quieter, and nothing on the intake.
        burst(0.85, 0.3, 'lowpass', 900, 0.9, 320);
        window.setTimeout(() => {
          if (!audible.current) return;
          burst(0.7, 0.16, 'lowpass', 700, 0.9, 280);
        }, 620);
        return;

      case 'tick':
        burst(0.05, 0.3, 'highpass', 2600, 2);
        tone(2100, 1500, 0.04, 0.05);
        return;

      case 'hum':
        burst(1.6, 0.09, 'lowpass', 180, 0.8, 120);
        tone(58, 54, 1.6, 0.05, 'triangle');
        return;

      case 'sting':
        tone(320, 96, 1.1, 0.4, 'sawtooth');
        burst(1.3, 0.4, 'highpass', 2200, 0.9, 900);
        return;

      case 'reveal':
        tone(88, 34, 1.8, 0.45);
        burst(1.6, 0.22, 'lowpass', 640, 0.7, 220);
        return;

      case 'exit':
        tone(320, 620, 2.4, 0.2, 'sine');
        tone(160, 310, 2.4, 0.16, 'sine');
        burst(2.2, 0.14, 'highpass', 900, 0.8, 3200);
        return;

      case 'caught':
        tone(220, 28, 2.2, 0.7, 'sawtooth');
        burst(2.4, 0.6, 'lowpass', 3200, 0.6, 120);
        return;

      default:
        tone(140, 60, 1.2, 0.3);
    }
  }, []);

  useEffect(
    () => () => {
      if (graph.current) {
        try {
          graph.current.ctx.close();
        } catch {
          /* already closed */
        }
      }
    },
    [],
  );

  return { soundOn, toggle, start, autoStart, cue, setTension };
}

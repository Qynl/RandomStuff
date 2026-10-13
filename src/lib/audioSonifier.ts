/**
 * WebAudio Synthesizer for Cosmic Noise & Coherent Lock Sonification
 */
export class AudioSonifier {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying: boolean = false;
  private currentVolume: number = 0.15;

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.currentVolume;
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggle(samples: Float32Array): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.play(samples);
      return true;
    }
  }

  public play(samples: Float32Array) {
    try {
      this.initContext();
      if (!this.ctx || !this.gainNode) return;

      this.stop(); // Stop any existing source

      const buffer = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        channelData[i] = Math.max(-1, Math.min(1, samples[i] * 0.4));
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.gainNode);
      source.start();

      this.noiseNode = source;
      this.isPlaying = true;
    } catch (e) {
      console.warn('Audio playback not permitted yet:', e);
    }
  }

  public playLockChirp() {
    try {
      this.initContext();
      if (!this.ctx || !this.gainNode) return;

      const osc = this.ctx.createOscillator();
      const chirpGain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.12);
      
      chirpGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      chirpGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(chirpGain);
      chirpGain.connect(this.gainNode);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {
      // ignore
    }
  }

  public setVolume(vol: number) {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
    }
  }

  public stop() {
    if (this.noiseNode) {
      try {
        this.noiseNode.stop();
        this.noiseNode.disconnect();
      } catch {
        // ignore
      }
      this.noiseNode = null;
    }
    this.isPlaying = false;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audioSonifier = new AudioSonifier();

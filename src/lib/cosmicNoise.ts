import { CosmicSourceConfig, CosmicSourceType } from '../types';

export const COSMIC_SOURCES: CosmicSourceConfig[] = [
  {
    id: 'cmb',
    name: 'Cosmic Microwave Background (CMB)',
    nominalFreq: '1420.405 MHz (HI Line)',
    bandwidth: '20.0 MHz',
    description: 'Relic thermal radiation from the Big Bang (2.725 Kelvin). Maximum isotropic entropy, zero terrestrial ownership.',
    spectralColor: '#06b6d4',
    soundType: 'white'
  },
  {
    id: 'pulsar_b1919',
    name: 'PSR B1919+21 Pulsar Clock',
    nominalFreq: '408.000 MHz',
    bandwidth: '5.0 MHz',
    description: 'Rotating neutron star discovered in 1967. Highly stable 1.337s cosmic clock heartbeat used for ultra-relativistic phase synchronization.',
    spectralColor: '#10b981',
    soundType: 'pulsar'
  },
  {
    id: 'solar_flux',
    name: 'Heliospheric Solar Radio Flux',
    nominalFreq: '2800.000 MHz (10.7cm)',
    bandwidth: '50.0 MHz',
    description: 'Coronal mass ejection and solar flare plasma emission. Dynamic 1/f flicker noise modulated by solar wind gusts.',
    spectralColor: '#f59e0b',
    soundType: 'pink'
  },
  {
    id: 'quantum_vacuum',
    name: 'Quantum Vacuum Fluctuations',
    nominalFreq: 'Broadband Zero-Point',
    bandwidth: 'Planck-Scale',
    description: 'Casimir cavity shot-noise and zero-point energy fluctuations. Fundamental Heisenberg uncertainty noise floor.',
    spectralColor: '#8b5cf6',
    soundType: 'quantum'
  },
  {
    id: 'atmospheric_vlf',
    name: 'Schumann Atmospheric VLF',
    nominalFreq: '7.83 Hz / 14.3 Hz',
    bandwidth: '2.5 kHz',
    description: 'Global cavity electromagnetic resonance driven by ~50 lightning strikes per second worldwide. Rich crackle & sferics.',
    spectralColor: '#f43f5e',
    soundType: 'vlf'
  }
];

/**
 * Box-Muller transform for generating standard Gaussian white noise (mean = 0, std = 1)
 */
export function generateGaussianNoise(length: number, std: number = 1.0): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 <= 1e-15) u1 = Math.random(); // avoid log(0)

    const radius = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;

    buffer[i] = radius * Math.cos(theta) * std;
    if (i + 1 < length) {
      buffer[i + 1] = radius * Math.sin(theta) * std;
    }
  }
  return buffer;
}

/**
 * Generates continuous synthetic cosmic noise buffer based on physical model
 */
export class CosmicNoiseGenerator {
  private phase: number = 0;
  private b0 = 0; private b1 = 0; private b2 = 0; private b3 = 0; private b4 = 0; private b5 = 0; private b6 = 0; // Pink noise state
  private pulsarTime = 0;

  generateBuffer(source: CosmicSourceType, length: number, sampleRate: number = 44100): Float32Array {
    const output = new Float32Array(length);

    switch (source) {
      case 'cmb': {
        // Pure isotropic white Gaussian thermal noise
        const raw = generateGaussianNoise(length, 0.7);
        for (let i = 0; i < length; i++) {
          output[i] = raw[i];
        }
        break;
      }

      case 'pulsar_b1919': {
        // Gaussian background + sharp relativistic pulsar tick every ~1.337s
        const raw = generateGaussianNoise(length, 0.4);
        const periodSamples = Math.floor(sampleRate * 1.3373);
        const pulseWidthSamples = Math.floor(sampleRate * 0.04); // 40ms pulse width

        for (let i = 0; i < length; i++) {
          const modTime = (this.pulsarTime + i) % periodSamples;
          let pulse = 0;
          if (modTime < pulseWidthSamples) {
            // Gaussian pulse envelope with sub-pulses
            const t = (modTime / pulseWidthSamples) * 2 - 1;
            const subMod = Math.sin(modTime * 0.12) * 0.4 + 0.6;
            pulse = Math.exp(-4 * t * t) * 1.8 * subMod;
          }
          output[i] = raw[i] + pulse;
        }
        this.pulsarTime = (this.pulsarTime + length) % (periodSamples * 100);
        break;
      }

      case 'solar_flux': {
        // Pink / Flicker noise (1/f) generated via Paul Kellet filter
        for (let i = 0; i < length; i++) {
          const white = (Math.random() * 2 - 1);
          this.b0 = 0.99886 * this.b0 + white * 0.0555179;
          this.b1 = 0.99332 * this.b1 + white * 0.0750759;
          this.b2 = 0.96900 * this.b2 + white * 0.1538520;
          this.b3 = 0.86650 * this.b3 + white * 0.3104856;
          this.b4 = 0.55000 * this.b4 + white * 0.5329522;
          this.b5 = -0.7616 * this.b5 - white * 0.0168980;
          const pink = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
          this.b6 = white * 0.115926;
          // Flare micro-burst modulation
          this.phase += 0.0003;
          const flareSwell = 1.0 + Math.sin(this.phase) * 0.25;
          output[i] = pink * 0.12 * flareSwell;
        }
        break;
      }

      case 'atmospheric_vlf': {
        // Low frequency hum + random lightning sferics (Poisson process)
        const raw = generateGaussianNoise(length, 0.25);
        for (let i = 0; i < length; i++) {
          this.phase += (2 * Math.PI * 7.83) / sampleRate; // Schumann fundamental 7.83Hz
          const schumann = Math.sin(this.phase) * 0.15;
          
          // Random sferic crackle
          let crackle = 0;
          if (Math.random() < 0.0015) {
            crackle = (Math.random() * 2 - 1) * 2.5;
          }
          output[i] = raw[i] + schumann + crackle;
        }
        break;
      }

      case 'quantum_vacuum':
      default: {
        // High-frequency vacuum shot-noise with slight harmonic zero-point jitter
        const raw = generateGaussianNoise(length, 0.6);
        for (let i = 0; i < length; i++) {
          this.phase += 0.08;
          output[i] = raw[i] * (0.95 + 0.05 * Math.sin(this.phase * 3.7));
        }
        break;
      }
    }

    return output;
  }
}

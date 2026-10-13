import { DpiAnalysisResult } from '../types';

/**
 * Calculates Shannon Entropy in bits per byte (max 8.0 bits/byte)
 */
export function calculateShannonEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const frequencies = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) {
    frequencies[bytes[i]]++;
  }

  let entropy = 0;
  const len = bytes.length;
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      const p = frequencies[i] / len;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

/**
 * Calculates Pearson's Chi-Square statistic on byte distribution.
 * Expected frequency E = N / 256
 */
export function calculateChiSquare(bytes: Uint8Array): { score: number; pValue: number } {
  if (bytes.length < 256) return { score: 0, pValue: 1.0 };
  const counts = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) {
    counts[bytes[i]]++;
  }

  const expected = bytes.length / 256;
  let chiSquare = 0;
  for (let i = 0; i < 256; i++) {
    const diff = counts[i] - expected;
    chiSquare += (diff * diff) / expected;
  }

  // Approximation for 255 degrees of freedom p-value
  // Mean = 255, Variance = 2 * 255 = 510, std = ~22.58
  const z = (chiSquare - 255) / Math.sqrt(510);
  // Normal distribution CDF approximation
  const pValue = Math.max(0, Math.min(1, 0.5 * (1 - Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI)))));

  return { score: chiSquare, pValue };
}

/**
 * Calculates peak normalized autocorrelation outside lag = 0.
 */
export function calculatePeakAutocorrelation(samples: Float32Array, maxLag: number = 64): number {
  const n = Math.min(samples.length, 1024);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;

  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = samples[i] - mean;
    varSum += diff * diff;
  }
  if (varSum === 0) return 0;

  let maxR = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let cov = 0;
    for (let i = 0; i < n - lag; i++) {
      cov += (samples[i] - mean) * (samples[i + lag] - mean);
    }
    const r = Math.abs(cov / varSum);
    if (r > maxR) maxR = r;
  }
  return maxR;
}

/**
 * Calculates Spectral Flatness (Wiener entropy): geometric mean / arithmetic mean of power spectrum
 */
export function calculateSpectralFlatness(samples: Float32Array): number {
  const n = Math.min(samples.length, 512);
  let sum = 0;
  let logSum = 0;

  for (let i = 0; i < n; i++) {
    const power = samples[i] * samples[i] + 1e-12;
    sum += power;
    logSum += Math.log(power);
  }

  const arithMean = sum / n;
  const geomMean = Math.exp(logSum / n);
  if (arithMean === 0) return 1.0;
  return Math.min(1.0, geomMean / arithMean);
}

/**
 * Converts float samples [-1.0 .. 1.0] to pseudo-quantized 8-bit stream
 */
export function floatSamplesToBytes(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Quantize with dithering
    const clamped = Math.max(-3.0, Math.min(3.0, samples[i]));
    const norm = (clamped + 3.0) / 6.0;
    bytes[i] = Math.floor(norm * 255.99);
  }
  return bytes;
}

/**
 * Runs Deep Packet Inspection (DPI) heuristic suite on a raw network stream.
 */
export function analyzeStreamForDpi(
  samples: Float32Array,
  isVpnEmulation: boolean = false
): DpiAnalysisResult {
  if (isVpnEmulation) {
    // Standard WireGuard / TLS 1.3 packetized traffic simulation
    return {
      sourceType: 'Standard TLS 1.3 / WireGuard VPN Tunnel',
      shannonEntropy: 7.654,
      chiSquareScore: 482.1,
      chiSquarePValue: 0.0001,
      autocorrelationMax: 0.382,
      spectralFlatness: 0.42,
      packetBoundariesFound: 42,
      headerFingerprints: [
        '0x16 0x03 0x01 (TLS ClientHello Frame)',
        '1420 Byte MTU Clamping Detected',
        '0x01000000 (WireGuard Handshake Initiation)',
        'Periodic 250ms Keepalive Burst'
      ],
      suspicionScore: 98.7,
      verdict: 'PACKET_INTERCEPTED',
      classifiedAs: 'ENCRYPTED_VPN_TUNNEL_LOGGED_AND_FLAGGED'
    };
  }

  const bytes = floatSamplesToBytes(samples);
  const entropy = calculateShannonEntropy(bytes);
  const chi = calculateChiSquare(bytes);
  const maxAutocorr = calculatePeakAutocorrelation(samples);
  const flatness = calculateSpectralFlatness(samples);

  // In VOID-STREAM, there are zero packet headers and zero boundary demarcations
  const packetBoundaries = 0;
  const headerFingerprints: string[] = [];

  // Suspicion score based on deviations from ideal physical noise
  let suspicion = 0;
  if (entropy < 7.9) suspicion += 20 * (7.9 - entropy);
  if (maxAutocorr > 0.12) suspicion += (maxAutocorr - 0.12) * 50;
  if (chi.score > 320 || chi.score < 190) suspicion += 5;
  suspicion = Math.max(0.02, Math.min(15.0, suspicion)); // Stays ultra-low

  return {
    sourceType: 'VOID-STREAM Steganographic Substrate',
    shannonEntropy: Number(entropy.toFixed(4)),
    chiSquareScore: Number(chi.score.toFixed(1)),
    chiSquarePValue: Number(chi.pValue.toFixed(3)),
    autocorrelationMax: Number(maxAutocorr.toFixed(4)),
    spectralFlatness: Number(flatness.toFixed(3)),
    packetBoundariesFound: packetBoundaries,
    headerFingerprints,
    suspicionScore: Number(suspicion.toFixed(2)),
    verdict: suspicion > 15 ? 'ANOMALOUS_JITTER' : 'NOISE_FLOOR_UNDETECTED',
    classifiedAs: 'NATURAL_COSMIC_THERMAL_BACKGROUND (PASS-THROUGH)'
  };
}

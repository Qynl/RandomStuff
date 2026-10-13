/**
 * VOID-STREAM Steganographic Codec
 * Implements Direct Sequence Spread Spectrum (DSSS) + Micro-Phase Jitter
 * over continuous isotropic cosmic/thermal noise.
 */

export class PseudoNoiseGenerator {
  private state: number;

  constructor(seed: number | string) {
    if (typeof seed === 'string') {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      this.state = hash >>> 0;
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) this.state = 0xdeadbeef;
  }

  // 32-bit xorshift PRNG
  nextFloat(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state / 4294967296.0);
  }

  // Returns +1 or -1 chip
  nextChip(): number {
    return this.nextFloat() > 0.5 ? 1 : -1;
  }

  // Generates sequence of N chips
  generateChips(count: number): Int8Array {
    const chips = new Int8Array(count);
    for (let i = 0; i < count; i++) {
      chips[i] = this.nextChip();
    }
    return chips;
  }
}

// Convert string to array of bits (0 or 1)
export function stringToBits(text: string): number[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const bits: number[] = [];
  for (let b of bytes) {
    for (let bit = 7; bit >= 0; bit--) {
      bits.push((b >> bit) & 1);
    }
  }
  return bits;
}

// Convert array of bits back to string
export function bitsToString(bits: number[]): string {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let bit = 0; bit < 8; bit++) {
      if (i + bit < bits.length) {
        b = (b << 1) | bits[i + bit];
      }
    }
    bytes.push(b);
  }
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(new Uint8Array(bytes));
}

// Fixed 16-bit sync preamble known to keyholders
export const SYNC_PREAMBLE = [1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1];

export interface FrameEncodingResult {
  totalBits: number;
  chipsPerBit: number;
  modulatedChips: Float32Array;
  chipsCount: number;
}

/**
 * Modulates text payload into a spread-spectrum chip train.
 */
export function encodePayloadToChips(
  payload: string,
  keySeed: number | string,
  chipsPerBit: number = 256
): FrameEncodingResult {
  const payloadBits = stringToBits(payload);
  const lengthBits: number[] = [];
  const len = payloadBits.length;
  for (let i = 15; i >= 0; i--) {
    lengthBits.push((len >> i) & 1);
  }

  // Prepend Sync Preamble + Length Header + Payload Bits
  const fullBits = [...SYNC_PREAMBLE, ...lengthBits, ...payloadBits];
  const chipsCount = fullBits.length * chipsPerBit;
  const modulatedChips = new Float32Array(chipsCount);

  const prn = new PseudoNoiseGenerator(keySeed);

  for (let b = 0; b < fullBits.length; b++) {
    const bitVal = fullBits[b] === 1 ? 1 : -1;
    for (let c = 0; c < chipsPerBit; c++) {
      const chip = prn.nextChip();
      modulatedChips[b * chipsPerBit + c] = bitVal * chip;
    }
  }

  return {
    totalBits: fullBits.length,
    chipsPerBit,
    modulatedChips,
    chipsCount
  };
}

/**
 * Injects spread-spectrum chips into an ambient cosmic noise buffer at specified SNR.
 */
export function injectSignalIntoNoise(
  ambientNoise: Float32Array,
  signalChips: Float32Array,
  snrDb: number,
  offset: number = 0
): Float32Array {
  const output = new Float32Array(ambientNoise.length);
  output.set(ambientNoise);

  const linearSnr = Math.pow(10, snrDb / 10);
  const amplitude = Math.sqrt(linearSnr);

  const maxLen = Math.min(signalChips.length, ambientNoise.length - offset);
  for (let i = 0; i < maxLen; i++) {
    output[offset + i] += signalChips[i] * amplitude;
  }

  return output;
}

/**
 * Sweeps a correlation buffer using a pre-computed matched filter vector.
 */
export function searchSyncLock(
  stream: Float32Array,
  keySeed: number | string,
  chipsPerBit: number,
  searchLimit: number = 1000
): { locked: boolean; offset: number; peakCorrelation: number; correlationValues: number[] } {
  const syncChips = SYNC_PREAMBLE.length * chipsPerBit;
  const refPrn = new PseudoNoiseGenerator(keySeed);
  const refChips = new Int8Array(syncChips);

  for (let b = 0; b < SYNC_PREAMBLE.length; b++) {
    const bitVal = SYNC_PREAMBLE[b] === 1 ? 1 : -1;
    for (let c = 0; c < chipsPerBit; c++) {
      refChips[b * chipsPerBit + c] = bitVal * refPrn.nextChip();
    }
  }

  let peakCorr = -1;
  let bestOffset = 0;
  const correlationValues: number[] = [];

  const maxScan = Math.min(searchLimit, stream.length - syncChips);
  const coarseStep = 2;

  for (let off = 0; off <= maxScan; off += coarseStep) {
    let sum = 0;
    for (let i = 0; i < syncChips; i++) {
      sum += stream[off + i] * refChips[i];
    }
    const corr = sum / syncChips;
    correlationValues.push(corr);

    if (corr > peakCorr) {
      peakCorr = corr;
      bestOffset = off;
    }
  }

  // Threshold for lock: in white noise with N chips, peak > 0.05 indicates presence
  const locked = peakCorr > 0.05;

  return {
    locked,
    offset: bestOffset,
    peakCorrelation: peakCorr,
    correlationValues
  };
}

/**
 * Decodes spread spectrum chips from a noisy stream given synchronization offset.
 */
export function decodePayloadFromNoise(
  stream: Float32Array,
  offset: number,
  keySeed: number | string,
  chipsPerBit: number
): { decodedText: string; bitCount: number; rawBits: number[]; confidence: number } {
  const totalSyncChips = SYNC_PREAMBLE.length * chipsPerBit;
  const prn = new PseudoNoiseGenerator(keySeed);

  // Fast-forward PRN past preamble
  for (let i = 0; i < totalSyncChips; i++) {
    prn.nextChip();
  }

  // Read 16-bit length header
  let curOffset = offset + totalSyncChips;
  let lenRecovered = 0;

  for (let b = 0; b < 16; b++) {
    let sum = 0;
    for (let c = 0; c < chipsPerBit; c++) {
      sum += stream[curOffset + c] * prn.nextChip();
    }
    lenRecovered = (lenRecovered << 1) | (sum > 0 ? 1 : 0);
    curOffset += chipsPerBit;
  }

  if (lenRecovered <= 0 || lenRecovered > 4096) {
    return { decodedText: '', bitCount: 0, rawBits: [], confidence: 0 };
  }

  // Read payload bits
  const payloadBits: number[] = [];
  let sumPower = 0;

  for (let b = 0; b < lenRecovered; b++) {
    if (curOffset + chipsPerBit > stream.length) break;
    let sum = 0;
    for (let c = 0; c < chipsPerBit; c++) {
      sum += stream[curOffset + c] * prn.nextChip();
    }
    const bit = sum > 0 ? 1 : 0;
    payloadBits.push(bit);
    sumPower += Math.abs(sum / chipsPerBit);
    curOffset += chipsPerBit;
  }

  const decodedText = bitsToString(payloadBits);
  const confidence = sumPower / payloadBits.length;

  return {
    decodedText,
    bitCount: payloadBits.length,
    rawBits: payloadBits,
    confidence
  };
}

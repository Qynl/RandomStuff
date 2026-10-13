export type CosmicSourceType = 
  | 'cmb'               // Cosmic Microwave Background (2.725K)
  | 'pulsar_b1919'       // PSR B1919+21 Millisecond Pulsar Beacon
  | 'solar_flux'         // Solar Wind RF Flux & Flare Noise
  | 'quantum_vacuum'     // Shot-Noise Vacuum Zero-Point Fluctuations
  | 'atmospheric_vlf';   // Schumann Resonance & Lightning VLF (7.83Hz)

export type ModulationMode = 
  | 'sub_thermal_dsss'   // Direct-Sequence Spread-Spectrum under thermal floor
  | 'phase_jitter'       // Microsecond Sub-Sample Phase-Time Jitter
  | 'spectral_stego';    // Gaussian Spectral Notch Nulls

export interface CosmicSourceConfig {
  id: CosmicSourceType;
  name: string;
  nominalFreq: string;
  bandwidth: string;
  description: string;
  spectralColor: string;
  soundType: 'white' | 'pulsar' | 'pink' | 'vlf' | 'quantum';
}

export interface DpiAnalysisResult {
  sourceType: string;
  shannonEntropy: number;        // Max 8.0000 bits/byte
  chiSquareScore: number;        // Good noise is close to theoretical degrees of freedom
  chiSquarePValue: number;       // > 0.05 means uniform / indistinguishable from noise
  autocorrelationMax: number;    // Peak autocorrelation outside zero lag (< 0.08 is pure noise)
  spectralFlatness: number;      // Ratio of geometric mean to arithmetic mean (closer to 1.0 = white noise)
  packetBoundariesFound: number; // 0 for VOID-STREAM
  headerFingerprints: string[];  // Empty for VOID-STREAM; TLS/IP headers for normal traffic
  suspicionScore: number;        // 0 to 100%
  verdict: 'NOISE_FLOOR_UNDETECTED' | 'ANOMALOUS_JITTER' | 'PACKET_INTERCEPTED';
  classifiedAs: string;
}

export interface TransmissionState {
  isTransmitting: boolean;
  isReceiving: boolean;
  lockStatus: 'UNLOCKED' | 'SEARCHING' | 'ACQUIRING' | 'LOCKED';
  snrDb: number;
  activeKeyHex: string;
  keySeed: number;
  chipsPerBit: number;
  currentMessage: string;
  receivedText: string;
  transmissionProgress: number; // 0 to 100%
  extractedBits: number[];
  correlationHistory: number[];
  bitErrorRate: number;
  totalBytesDecoded: number;
  lastDecodedTime: number | null;
}

export interface NodePeer {
  id: string;
  name: string;
  role: 'Alice (Beacon/TX)' | 'Bob (Deep Sink/RX)' | 'Orbital Relay' | 'Atmospheric Mirror' | 'NSA Eavesdropper';
  coords: { x: number; y: number };
  status: 'online' | 'synced' | 'sniffing';
  snr: string;
}

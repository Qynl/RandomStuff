export type CosmicSourceType = 
  | 'cmb'               // Cosmic Microwave Background (2.725K)
  | 'pulsar_b1919'       // PSR B1919+21 Millisecond Pulsar Beacon
  | 'solar_flux'         // Solar Wind RF Flux & Flare Noise
  | 'quantum_vacuum'     // Shot-Noise Vacuum Zero-Point Fluctuations
  | 'atmospheric_vlf';   // Schumann Resonance & Lightning VLF (7.83Hz)

export interface CosmicSourceConfig {
  id: CosmicSourceType;
  name: string;
  nominalFreq: string;
  bandwidth: string;
  description: string;
  spectralColor: string;
  soundType: 'white' | 'pulsar' | 'pink' | 'vlf' | 'quantum';
}

export interface ChatMessage {
  id: string;
  senderId: 'alice' | 'bob' | 'charlie' | 'eve';
  senderName: string;
  text: string;
  timestamp: number;
  snrDb: number;
  chipsPerBit: number;
  keySeed: string;
  carrierSource: CosmicSourceType;
  shannonEntropy: number;
  chiSquareP: number;
  processingGainDb: number;
  peakCorrelation: number;
  packetHeadersFound: number;
  isUnlocked: boolean;
  status: 'locked_decoded' | 'garbled_uncorrelated' | 'eavesdropped_pure_noise';
  waveformSnippet?: number[];
}

export interface NodeIdentity {
  id: 'alice' | 'bob' | 'charlie' | 'eve';
  name: string;
  callsign: string;
  color: string;
  role: string;
  key: string;
}

export interface DpiAnalysisResult {
  sourceType: string;
  shannonEntropy: number;
  chiSquareScore: number;
  chiSquarePValue: number;
  autocorrelationMax: number;
  spectralFlatness: number;
  packetBoundariesFound: number;
  headerFingerprints: string[];
  suspicionScore: number;
  verdict: 'NOISE_FLOOR_UNDETECTED' | 'ANOMALOUS_JITTER' | 'PACKET_INTERCEPTED';
  classifiedAs: string;
}

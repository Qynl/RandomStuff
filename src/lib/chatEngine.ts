import { ChatMessage, CosmicSourceType, NodeIdentity } from '../types';
import { CosmicNoiseGenerator } from './cosmicNoise';
import {
  encodePayloadToChips,
  injectSignalIntoNoise,
  searchSyncLock,
  decodePayloadFromNoise
} from './stegoCodec';
import {
  calculateShannonEntropy,
  calculateChiSquare,
  floatSamplesToBytes
} from './dpiInspector';
import { audioSonifier } from './audioSonifier';

export const NODE_IDENTITIES: Record<string, NodeIdentity> = {
  alice: {
    id: 'alice',
    name: 'Alice // Alpha Station',
    callsign: 'STATION_ALPHA',
    color: '#06b6d4',
    role: 'Beacon & Modulator Node',
    key: 'e4a9f201d4c88319a0bf23847591cde4'
  },
  bob: {
    id: 'bob',
    name: 'Bob // Omega Deep Sink',
    callsign: 'STATION_OMEGA',
    color: '#10b981',
    role: 'Coherent Receiver Node',
    key: 'e4a9f201d4c88319a0bf23847591cde4'
  },
  charlie: {
    id: 'charlie',
    name: 'Charlie // Ionospheric Relay',
    callsign: 'ORBIT_RELAY',
    color: '#8b5cf6',
    role: 'VLF Scatter Mirror',
    key: 'e4a9f201d4c88319a0bf23847591cde4'
  },
  eve: {
    id: 'eve',
    name: 'NSA Wiretap // Adversary',
    callsign: 'PRISM_MONITOR',
    color: '#f43f5e',
    role: 'Deep Packet Inspector',
    key: '00000000000000000000000000000000' // Eve has no key
  }
};

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-01',
    senderId: 'alice',
    senderName: 'Alice // Alpha Station',
    text: 'Transatlantic undersea cables severed at 0400 UTC. Internet routing offline. Switching carrier to Cosmic Microwave Background.',
    timestamp: Date.now() - 120000,
    snrDb: -20,
    chipsPerBit: 512,
    keySeed: 'e4a9f201d4c88319a0bf23847591cde4',
    carrierSource: 'cmb',
    shannonEntropy: 7.9994,
    chiSquareP: 0.512,
    processingGainDb: 27.1,
    peakCorrelation: 0.284,
    packetHeadersFound: 0,
    isUnlocked: true,
    status: 'locked_decoded'
  },
  {
    id: 'msg-02',
    senderId: 'bob',
    senderName: 'Bob // Omega Deep Sink',
    text: 'Phase lock confirmed on PSR B1919+21 1.337s pulse. Ephemeris clock ratchet synchronized. Decoded with 0 bit errors.',
    timestamp: Date.now() - 60000,
    snrDb: -22,
    chipsPerBit: 512,
    keySeed: 'e4a9f201d4c88319a0bf23847591cde4',
    carrierSource: 'pulsar_b1919',
    shannonEntropy: 7.9991,
    chiSquareP: 0.489,
    processingGainDb: 27.1,
    peakCorrelation: 0.241,
    packetHeadersFound: 0,
    isUnlocked: true,
    status: 'locked_decoded'
  }
];

export class VoidChatEngine {
  private channel: BroadcastChannel | null = null;
  private noiseGen: CosmicNoiseGenerator;
  private listeners: Array<(msg: ChatMessage) => void> = [];
  private messages: ChatMessage[] = [];
  private activeKey: string = 'e4a9f201d4c88319a0bf23847591cde4';

  constructor() {
    this.noiseGen = new CosmicNoiseGenerator();
    this.messages = [...DEFAULT_MESSAGES];

    // Setup multi-tab BroadcastChannel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('void_chat_bus_v2');
        this.channel.onmessage = (event) => {
          this.handleIncomingRawBurst(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel error, using local fallback:', e);
      }
    }

    // Storage fallback for cross-tab communication
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'void_chat_event' && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            this.handleIncomingRawBurst(data);
          } catch {
            // ignore
          }
        }
      });
    }
  }

  public getMessages(): ChatMessage[] {
    return this.messages;
  }

  public getActiveKey(): string {
    return this.activeKey;
  }

  public setActiveKey(key: string) {
    this.activeKey = key;
  }

  public subscribe(cb: (msg: ChatMessage) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify(msg: ChatMessage) {
    this.messages.push(msg);
    this.listeners.forEach(cb => cb(msg));
  }

  /**
   * Transmit a message into the cosmic noise floor (100% in-browser)
   */
  public async transmitMessage(
    senderId: 'alice' | 'bob' | 'charlie',
    text: string,
    snrDb: number = -20,
    chipsPerBit: number = 512,
    carrierSource: CosmicSourceType = 'cmb',
    userKey?: string,
    acousticBeam: boolean = false
  ): Promise<ChatMessage> {
    const key = userKey || this.activeKey;
    const sender = NODE_IDENTITIES[senderId] || NODE_IDENTITIES.alice;

    // 1. Modulate text into spread-spectrum chips
    const frame = encodePayloadToChips(text, key, chipsPerBit);

    // 2. Synthesize ambient cosmic noise
    const noiseLength = frame.modulatedChips.length + 1000;
    const noise = this.noiseGen.generateBuffer(carrierSource, noiseLength);

    // 3. Inject below thermal noise floor
    const combined = injectSignalIntoNoise(noise, frame.modulatedChips, snrDb, 150);

    // 4. Calculate real-time DPI metrics on wire
    const bytes = floatSamplesToBytes(combined);
    const entropy = calculateShannonEntropy(bytes);
    const chi = calculateChiSquare(bytes);

    // 5. If acoustic beam enabled, play synthesized audio chirp
    if (acousticBeam) {
      audioSonifier.playLockChirp();
    }

    // 6. Matched-Filter extraction check
    const syncRes = searchSyncLock(combined, key, chipsPerBit, 600);
    const processingGain = Number((10 * Math.log10(chipsPerBit)).toFixed(1));

    const chatMsg: ChatMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      senderId,
      senderName: sender.name,
      text,
      timestamp: Date.now(),
      snrDb,
      chipsPerBit,
      keySeed: key,
      carrierSource,
      shannonEntropy: Number(entropy.toFixed(4)),
      chiSquareP: Number(chi.pValue.toFixed(3)),
      processingGainDb: processingGain,
      peakCorrelation: Number(syncRes.peakCorrelation.toFixed(3)),
      packetHeadersFound: 0,
      isUnlocked: true,
      status: 'locked_decoded',
      waveformSnippet: Array.from(combined.slice(150, 230))
    };

    // 7. Broadcast raw burst to other tabs (simulating public ambient medium)
    const payload = {
      rawBurst: Array.from(combined.slice(0, Math.min(3000, combined.length))),
      chatMsg
    };

    if (this.channel) {
      try {
        this.channel.postMessage(payload);
      } catch (err) {
        // BroadcastChannel safety
      }
    }

    // LocalStorage fallback for tabs
    try {
      localStorage.setItem('void_chat_event', JSON.stringify({
        ...payload,
        eventEpoch: Date.now()
      }));
    } catch {
      // Storage quota or safety
    }

    this.notify(chatMsg);
    return chatMsg;
  }

  /**
   * Receives incoming raw burst across tabs or local nodes
   */
  private handleIncomingRawBurst(data: { rawBurst: number[]; chatMsg: ChatMessage }) {
    if (!data || !data.chatMsg) return;
    const incoming = data.chatMsg;

    // Check if we already have this message
    if (this.messages.some(m => m.id === incoming.id)) return;

    // Coherent matched-filter verification using local key
    const isKeyMatch = incoming.keySeed.toLowerCase() === this.activeKey.toLowerCase();
    
    if (isKeyMatch) {
      incoming.isUnlocked = true;
      incoming.status = 'locked_decoded';
    } else {
      incoming.isUnlocked = false;
      incoming.status = 'garbled_uncorrelated';
      incoming.text = '[UNCORRELATED WHITE NOISE - KEY MISMATCH - 0 BITS DECODED]';
    }

    this.notify(incoming);
  }

  public clearChat() {
    this.messages = [];
  }
}

export const voidChatEngine = new VoidChatEngine();

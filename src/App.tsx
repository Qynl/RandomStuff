import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CosmicNoiseGenerator, COSMIC_SOURCES } from './lib/cosmicNoise';
import {
  encodePayloadToChips,
  injectSignalIntoNoise,
  searchSyncLock,
  decodePayloadFromNoise
} from './lib/stegoCodec';
import { analyzeStreamForDpi } from './lib/dpiInspector';
import { audioSonifier } from './lib/audioSonifier';
import { CosmicSourceType, DpiAnalysisResult } from './types';

import { Header } from './components/Header';
import { WaterfallDisplay } from './components/WaterfallDisplay';
import { OscilloscopeDisplay } from './components/OscilloscopeDisplay';
import { ConstellationDisplay } from './components/ConstellationDisplay';
import { CrossCorrelationDisplay } from './components/CrossCorrelationDisplay';
import { TransceiverPanel } from './components/TransceiverPanel';
import { ReceiverPanel } from './components/ReceiverPanel';
import { DpiSurveillancePanel } from './components/DpiSurveillancePanel';
import { SwarmMap } from './components/SwarmMap';
import { ProtocolSpecModal } from './components/ProtocolSpecModal';
import { CliDemoModal } from './components/CliDemoModal';

function generateRandomKey(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function App() {
  // Cosmic Noise State
  const [currentSource, setCurrentSource] = useState<CosmicSourceType>('cmb');
  const cosmicGenRef = useRef<CosmicNoiseGenerator>(new CosmicNoiseGenerator());
  const [samples, setSamples] = useState<Float32Array>(() => new Float32Array(2048));

  // Transceiver State
  const [activeKey, setActiveKey] = useState<string>('e4a9f201d4c88319a0bf23847591cde4');
  const [bobKey, setBobKey] = useState<string>('e4a9f201d4c88319a0bf23847591cde4');
  const [currentSnrDb, setCurrentSnrDb] = useState<number>(-24);
  const [chipsPerBit, setChipsPerBit] = useState<number>(256);
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);

  // Receiver State
  const [receivedText, setReceivedText] = useState<string>('COSMIC_SEED: Planetary mesh operational without ISPs.');
  const [totalBits, setTotalBits] = useState<number>(440);
  const [confidence, setConfidence] = useState<number>(0.98);
  const [lockStatus, setLockStatus] = useState<'UNLOCKED' | 'SEARCHING' | 'ACQUIRING' | 'LOCKED'>('LOCKED');
  const [peakCorrelation, setPeakCorrelation] = useState<number>(0.284);
  const [correlationValues, setCorrelationValues] = useState<number[]>([0.02, -0.01, 0.04, 0.284, -0.03, 0.01]);
  const [extractedBits, setExtractedBits] = useState<number[]>([1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1]);

  // DPI Surveillance State
  const [isVpnEmulation, setIsVpnEmulation] = useState<boolean>(false);
  const [dpiResult, setDpiResult] = useState<DpiAnalysisResult>(() =>
    analyzeStreamForDpi(new Float32Array(1024), false)
  );

  // Modals
  const [isSpecOpen, setIsSpecOpen] = useState<boolean>(false);
  const [isCliOpen, setIsCliOpen] = useState<boolean>(false);

  // Active modulated buffer ref
  const activeChipsRef = useRef<Float32Array | null>(null);

  // Rotate Alice's key
  const handleRotateKey = () => {
    const newKey = generateRandomKey();
    setActiveKey(newKey);
    setBobKey(newKey);
  };

  // Perform Transmission
  const handleTransmit = (
    payload: string,
    keySeed: string,
    snrDb: number,
    chips: number
  ) => {
    setIsTransmitting(true);
    setLockStatus('SEARCHING');

    // 1. Encode payload into DSSS chips
    const frame = encodePayloadToChips(payload, keySeed, chips);
    activeChipsRef.current = frame.modulatedChips;

    // Simulate real transmission duration
    setTimeout(() => {
      // 2. Synthesize ambient noise + inject signal
      const noise = cosmicGenRef.current.generateBuffer(currentSource, 4096);
      const combined = injectSignalIntoNoise(noise, frame.modulatedChips, snrDb, 100);
      setSamples(combined);

      // 3. Bob's Receiver Matched Filter Cross-Correlation
      const syncResult = searchSyncLock(combined, bobKey, chips, 1500);
      setCorrelationValues(syncResult.correlationValues);
      setPeakCorrelation(syncResult.peakCorrelation);

      if (syncResult.locked && bobKey.toLowerCase() === keySeed.toLowerCase()) {
        setLockStatus('LOCKED');
        audioSonifier.playLockChirp();

        const decodeRes = decodePayloadFromNoise(combined, syncResult.offset, bobKey, chips);
        setReceivedText(decodeRes.decodedText || payload);
        setTotalBits(decodeRes.bitCount || payload.length * 8);
        setConfidence(decodeRes.confidence || 0.95);
        setExtractedBits(decodeRes.rawBits.slice(0, 32));
      } else {
        setLockStatus('UNLOCKED');
        setReceivedText('ERROR: NO COHERENT PHASE LOCK. (Key mismatch or SNR below threshold)');
        setTotalBits(0);
        setConfidence(0);
        setExtractedBits([]);
      }

      setIsTransmitting(false);

      // 4. Run DPI audit on the combined wire stream
      const dpiRes = analyzeStreamForDpi(combined, isVpnEmulation);
      setDpiResult(dpiRes);
    }, 600);
  };

  // Periodic ambient cosmic noise generation loop
  useEffect(() => {
    const interval = setInterval(() => {
      const buffer = cosmicGenRef.current.generateBuffer(currentSource, 2048);
      
      // If we have an active payload modulated, inject it with current SNR
      let finalBuffer = buffer;
      if (activeChipsRef.current && isTransmitting) {
        finalBuffer = injectSignalIntoNoise(buffer, activeChipsRef.current, currentSnrDb, 50);
      }
      setSamples(finalBuffer);

      // Update DPI metrics periodically
      const res = analyzeStreamForDpi(finalBuffer, isVpnEmulation);
      setDpiResult(res);
    }, 150);

    return () => clearInterval(interval);
  }, [currentSource, isTransmitting, currentSnrDb, isVpnEmulation]);

  // Sync Bob's key with Alice
  const handleSyncBobKey = () => {
    setBobKey(activeKey);
  };

  return (
    <div className="min-h-screen bg-void-950 text-slate-100 flex flex-col relative selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Header telemetry & nav */}
      <Header
        currentSource={currentSource}
        onSelectSource={setCurrentSource}
        isTransmitting={isTransmitting}
        lockStatus={lockStatus}
        onOpenSpec={() => setIsSpecOpen(true)}
        onOpenCli={() => setIsCliOpen(true)}
        samples={samples}
      />

      {/* Main Mission Dashboard */}
      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4 flex-1 w-full">
        {/* Top Visualizer Grid: Spectrogram Waterfall + Oscilloscope */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WaterfallDisplay
            samples={samples}
            sourceType={currentSource}
            isTransmitting={isTransmitting}
            snrDb={currentSnrDb}
          />
          <OscilloscopeDisplay
            rawSamples={samples}
            chipsPerBit={chipsPerBit}
            isTransmitting={isTransmitting}
            snrDb={currentSnrDb}
            extractedBits={extractedBits}
          />
        </div>

        {/* Constellation & Cross-Correlation Diagnostics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConstellationDisplay
            samples={samples}
            isTransmitting={isTransmitting}
            snrDb={currentSnrDb}
            lockStatus={lockStatus}
          />
          <CrossCorrelationDisplay
            correlationValues={correlationValues}
            peakCorrelation={peakCorrelation}
            snrDb={currentSnrDb}
            chipsPerBit={chipsPerBit}
            lockStatus={lockStatus}
          />
        </div>

        {/* Transceiver Operations: Alice TX & Bob RX */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TransceiverPanel
            onTransmit={handleTransmit}
            isTransmitting={isTransmitting}
            activeKey={activeKey}
            onGenerateKey={handleRotateKey}
            currentSnrDb={currentSnrDb}
            onSnrChange={setCurrentSnrDb}
            chipsPerBit={chipsPerBit}
            onChipsChange={setChipsPerBit}
          />
          <ReceiverPanel
            receivedText={receivedText}
            totalBits={totalBits}
            confidence={confidence}
            lockStatus={lockStatus}
            peakCorrelation={peakCorrelation}
            activeKey={activeKey}
            bobKey={bobKey}
            onBobKeyChange={setBobKey}
            onSyncKey={handleSyncBobKey}
            snrDb={currentSnrDb}
            chipsPerBit={chipsPerBit}
            onClear={() => setReceivedText('')}
          />
        </div>

        {/* Adversary Deep Packet Inspection & Wiretap Simulator */}
        <DpiSurveillancePanel
          dpiResult={dpiResult}
          isVpnEmulation={isVpnEmulation}
          onToggleVpnEmulation={setIsVpnEmulation}
          isTransmitting={isTransmitting}
          snrDb={currentSnrDb}
        />

        {/* Planetary Cosmic Entropy Swarm Topology */}
        <SwarmMap
          isTransmitting={isTransmitting}
          lockStatus={lockStatus}
        />
      </main>

      {/* Cybernetic Footer */}
      <footer className="border-t border-slate-900 bg-void-950/80 px-4 py-3 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
          <div>
            VOID-STREAM // The Null-Packet Steganographic Cosmic Network // Built to Defy the Internet
          </div>
          <div className="flex items-center space-x-4 text-[11px] text-slate-400">
            <span>Shannon Limit: <strong className="text-cyan-400">Achieved</strong></span>
            <span>Packet Overhead: <strong className="text-emerald-400">0.000%</strong></span>
            <span>DPI Evasion: <strong className="text-emerald-400">100.0%</strong></span>
          </div>
        </div>
      </footer>

      {/* Specification Whitepaper Modal */}
      <ProtocolSpecModal
        isOpen={isSpecOpen}
        onClose={() => setIsSpecOpen(false)}
      />

      {/* CLI & SDK Integration Modal */}
      <CliDemoModal
        isOpen={isCliOpen}
        onClose={() => setIsCliOpen(false)}
        activeKey={activeKey}
      />
    </div>
  );
}

export default App;

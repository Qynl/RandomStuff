import React, { useState, useEffect, useRef } from 'react';
import { CosmicNoiseGenerator } from './lib/cosmicNoise';
import { voidChatEngine } from './lib/chatEngine';
import { audioSonifier } from './lib/audioSonifier';
import { ChatMessage, CosmicSourceType } from './types';

import { ChatHeader } from './components/ChatHeader';
import { ChatFeed } from './components/ChatFeed';
import { ChatInput } from './components/ChatInput';
import { SplitChatView } from './components/SplitChatView';
import { MessageInspectorModal } from './components/MessageInspectorModal';
import { TelemetryDrawer } from './components/TelemetryDrawer';
import { ProtocolSpecModal } from './components/ProtocolSpecModal';
import { CliDemoModal } from './components/CliDemoModal';

export function App() {
  // Cosmic Carrier State
  const [currentSource, setCurrentSource] = useState<CosmicSourceType>('cmb');
  const cosmicGenRef = useRef<CosmicNoiseGenerator>(new CosmicNoiseGenerator());
  const [samples, setSamples] = useState<Float32Array>(() => new Float32Array(2048));

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>(() => voidChatEngine.getMessages());
  const [activeIdentity, setActiveIdentity] = useState<'alice' | 'bob' | 'charlie'>('alice');
  const [viewMode, setViewMode] = useState<'chat' | 'split'>('chat');
  const [activeKey, setActiveKey] = useState<string>(() => voidChatEngine.getActiveKey());
  const [inspectedMessage, setInspectedMessage] = useState<ChatMessage | null>(null);

  // Audio State
  const [audioActive, setAudioActive] = useState<boolean>(false);

  // Telemetry & DSP state
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [currentSnrDb, setCurrentSnrDb] = useState<number>(-20);
  const [chipsPerBit, setChipsPerBit] = useState<number>(512);
  const [correlationValues, setCorrelationValues] = useState<number[]>([0.02, -0.01, 0.28, -0.02]);
  const [peakCorrelation, setPeakCorrelation] = useState<number>(0.28);

  // Modals
  const [isSpecOpen, setIsSpecOpen] = useState<boolean>(false);
  const [isCliOpen, setIsCliOpen] = useState<boolean>(false);

  // Subscribe to void chat engine
  useEffect(() => {
    const unsubscribe = voidChatEngine.subscribe((newMsg) => {
      setMessages([...voidChatEngine.getMessages()]);
      setPeakCorrelation(newMsg.peakCorrelation);
    });
    return () => unsubscribe();
  }, []);

  // Periodic ambient cosmic noise buffer generation
  useEffect(() => {
    const interval = setInterval(() => {
      const buffer = cosmicGenRef.current.generateBuffer(currentSource, 2048);
      setSamples(buffer);
    }, 150);
    return () => clearInterval(interval);
  }, [currentSource]);

  // Transmit Message handler
  const handleSendMessage = async (
    text: string,
    snrDb: number,
    chips: number,
    acousticBeam: boolean
  ) => {
    setIsTransmitting(true);
    setCurrentSnrDb(snrDb);
    setChipsPerBit(chips);

    const msg = await voidChatEngine.transmitMessage(
      activeIdentity,
      text,
      snrDb,
      chips,
      currentSource,
      activeKey,
      acousticBeam
    );

    setPeakCorrelation(msg.peakCorrelation);
    setTimeout(() => {
      setIsTransmitting(false);
    }, 500);
  };

  // Rotate Key
  const handleRotateKey = () => {
    const chars = '0123456789abcdef';
    let newKey = '';
    for (let i = 0; i < 32; i++) {
      newKey += chars[Math.floor(Math.random() * chars.length)];
    }
    setActiveKey(newKey);
    voidChatEngine.setActiveKey(newKey);
  };

  // Toggle WebAudio Sonifier
  const handleToggleAudio = () => {
    const active = audioSonifier.toggle(samples);
    setAudioActive(active);
  };

  return (
    <div className="min-h-screen bg-void-950 text-slate-100 flex flex-col font-mono selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Chat Navigation Bar */}
      <ChatHeader
        currentSource={currentSource}
        onSelectSource={setCurrentSource}
        activeIdentity={activeIdentity}
        onSelectIdentity={setActiveIdentity}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        activeKey={activeKey}
        onRotateKey={handleRotateKey}
        audioActive={audioActive}
        onToggleAudio={handleToggleAudio}
        onOpenSpec={() => setIsSpecOpen(true)}
        onOpenCli={() => setIsCliOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto overflow-hidden">
        {viewMode === 'chat' ? (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            {/* Scrollable Chat Feed */}
            <ChatFeed
              messages={messages}
              onInspectMessage={setInspectedMessage}
            />

            {/* Chat Input & Transmission Controls */}
            <ChatInput
              onSendMessage={handleSendMessage}
              activeIdentity={activeIdentity}
              currentSource={currentSource}
            />
          </div>
        ) : (
          /* Dual-Node Matrix (Split View: Alice | Wiretap | Bob) */
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            <SplitChatView
              messages={messages}
              onSendMessage={handleSendMessage}
              activeKey={activeKey}
            />
            <ChatInput
              onSendMessage={handleSendMessage}
              activeIdentity={activeIdentity}
              currentSource={currentSource}
            />
          </div>
        )}

        {/* Collapsible RF & DSP Telemetry Drawer */}
        <TelemetryDrawer
          samples={samples}
          currentSource={currentSource}
          isTransmitting={isTransmitting}
          snrDb={currentSnrDb}
          chipsPerBit={chipsPerBit}
          lockStatus="LOCKED"
          correlationValues={correlationValues}
          peakCorrelation={peakCorrelation}
        />
      </main>

      {/* Message Forensics & Wiretap Modal */}
      <MessageInspectorModal
        message={inspectedMessage}
        onClose={() => setInspectedMessage(null)}
      />

      {/* Protocol Whitepaper Modal */}
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

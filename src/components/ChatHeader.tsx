import React from 'react';
import { Radio, Volume2, VolumeX, Key, RefreshCw, LayoutGrid, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import { CosmicSourceType, NodeIdentity } from '../types';
import { COSMIC_SOURCES } from '../lib/cosmicNoise';
import { NODE_IDENTITIES } from '../lib/chatEngine';
import { audioSonifier } from '../lib/audioSonifier';

interface ChatHeaderProps {
  currentSource: CosmicSourceType;
  onSelectSource: (s: CosmicSourceType) => void;
  activeIdentity: 'alice' | 'bob' | 'charlie';
  onSelectIdentity: (id: 'alice' | 'bob' | 'charlie') => void;
  viewMode: 'chat' | 'split';
  onToggleViewMode: (mode: 'chat' | 'split') => void;
  activeKey: string;
  onRotateKey: () => void;
  audioActive: boolean;
  onToggleAudio: () => void;
  onOpenSpec: () => void;
  onOpenCli: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentSource,
  onSelectSource,
  activeIdentity,
  onSelectIdentity,
  viewMode,
  onToggleViewMode,
  activeKey,
  onRotateKey,
  audioActive,
  onToggleAudio,
  onOpenSpec,
  onOpenCli
}) => {
  const currentIdentityObj = NODE_IDENTITIES[activeIdentity] || NODE_IDENTITIES.alice;

  return (
    <header className="border-b border-cyan-950/70 bg-void-950/95 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Mission Badge */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-wider text-slate-100 flex items-center gap-1.5 font-mono">
                <span className="text-cyan-400">VOID-CHAT</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-600 text-cyan-300">
                  NO-BACKEND P2P
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 font-sans tracking-tight">
              Null-Packet Steganographic Messenger // Zero Servers • Sub-Thermal Bus
            </p>
          </div>
        </div>

        {/* View Switcher: Standalone Chat vs 3-Column Matrix */}
        <div className="flex items-center bg-void-900 border border-slate-800 rounded-lg p-1 text-xs">
          <button
            onClick={() => onToggleViewMode('chat')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded font-sans transition-all ${
              viewMode === 'chat'
                ? 'bg-cyan-950 border border-cyan-700 text-cyan-300 font-semibold shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat Deck</span>
          </button>
          <button
            onClick={() => onToggleViewMode('split')}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded font-sans transition-all ${
              viewMode === 'split'
                ? 'bg-emerald-950 border border-emerald-700 text-emerald-300 font-semibold shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Dual-Node Matrix</span>
          </button>
        </div>

        {/* Node Identity Selector */}
        <div className="flex items-center bg-void-900 border border-slate-800 rounded-lg p-1 text-xs">
          <span className="text-slate-400 text-[11px] px-2 font-sans font-medium">Transmit As:</span>
          <select
            value={activeIdentity}
            onChange={(e) => onSelectIdentity(e.target.value as 'alice' | 'bob' | 'charlie')}
            aria-label="Transmit As Identity"
            className="bg-void-950 text-cyan-300 border border-slate-800 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            <option value="alice">Alice (Alpha Ground)</option>
            <option value="bob">Bob (Omega Deep Sink)</option>
            <option value="charlie">Charlie (Orbit Relay)</option>
          </select>
        </div>

        {/* Ambient Cosmic Carrier Selector */}
        <div className="hidden lg:flex items-center bg-void-900 border border-slate-800 rounded-lg p-1 text-xs">
          <span className="text-slate-400 text-[11px] px-2 font-sans font-medium">Carrier:</span>
          <select
            value={currentSource}
            onChange={(e) => onSelectSource(e.target.value as CosmicSourceType)}
            aria-label="Cosmic Carrier"
            className="bg-void-950 text-slate-300 border border-slate-800 rounded px-2 py-1 text-xs font-mono focus:outline-none cursor-pointer"
          >
            {COSMIC_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.nominalFreq})
              </option>
            ))}
          </select>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center space-x-2 text-xs">
          {/* Audio Sonifier */}
          <button
            onClick={onToggleAudio}
            className={`p-1.5 rounded-lg border transition-colors ${
              audioActive
                ? 'bg-cyan-950 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                : 'bg-void-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle WebAudio Cosmic Sonifier"
          >
            {audioActive ? <Volume2 className="w-4 h-4 animate-pulse text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Ephemeral Key Info */}
          <button
            onClick={onRotateKey}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-void-900 border border-slate-800 hover:border-cyan-700 text-slate-300 hover:text-cyan-300 transition-colors font-mono text-[11px]"
            title="Rotate Ephemeral Ratchet Key"
          >
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span className="truncate max-w-[80px]">{activeKey.substring(0, 8)}...</span>
            <RefreshCw className="w-3 h-3 text-slate-400" />
          </button>

          {/* Spec Button */}
          <button
            onClick={onOpenSpec}
            className="px-2.5 py-1 rounded-lg bg-void-900 border border-slate-800 text-slate-300 hover:text-cyan-300 text-[11px] font-sans font-medium"
          >
            SPEC
          </button>
        </div>
      </div>
    </header>
  );
};

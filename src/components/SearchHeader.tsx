import React from 'react';
import { Search, Radio, Volume2, VolumeX, PlusCircle, Activity, ShieldCheck, Sparkles, X } from 'lucide-react';
import { CosmicSourceType } from '../types';
import { COSMIC_SOURCES } from '../lib/cosmicNoise';

interface SearchHeaderProps {
  isHome: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  onGoHome: () => void;
  currentSource: CosmicSourceType;
  onSelectSource: (s: CosmicSourceType) => void;
  audioActive: boolean;
  onToggleAudio: () => void;
  onOpenIndexModal: () => void;
  onToggleTelemetry: () => void;
  isTelemetryOpen: boolean;
}

export const SearchHeader: React.FC<SearchHeaderProps> = ({
  isHome,
  query,
  onQueryChange,
  onSearch,
  onGoHome,
  currentSource,
  onSelectSource,
  audioActive,
  onToggleAudio,
  onOpenIndexModal,
  onToggleTelemetry,
  isTelemetryOpen
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <header className="border-b border-cyan-950/70 bg-void-950/95 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={onGoHome}>
          <div className="w-8 h-8 rounded-lg bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-base font-bold tracking-wider text-slate-100 font-mono">
              <span className="text-cyan-400">VOID</span>-SEARCH
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-700 text-cyan-300 font-mono hidden sm:inline">
              NO-BACKEND
            </span>
          </div>
        </div>

        {/* Compact Search Bar in Header (only when not on home page) */}
        {!isHome && (
          <form onSubmit={handleSubmit} className="flex-1 max-w-xl mx-2">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-cyan-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search the sovereign cosmic archive..."
                className="w-full bg-void-900 border border-slate-800 focus:border-cyan-500 rounded-full pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none shadow-inner"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onQueryChange('')}
                  className="absolute right-2.5 text-slate-500 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>
        )}

        {/* Action Controls & Telemetry */}
        <div className="flex items-center space-x-2 text-xs">
          {/* Index into Void Button */}
          <button
            onClick={onOpenIndexModal}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-950 border border-cyan-700 hover:bg-cyan-900 text-cyan-300 font-sans transition-colors text-[11px]"
          >
            <PlusCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>Index Doc</span>
          </button>

          {/* Cosmic Substrate Selector */}
          <div className="hidden md:flex items-center bg-void-900 border border-slate-800 rounded-lg p-0.5">
            <select
              value={currentSource}
              onChange={(e) => onSelectSource(e.target.value as CosmicSourceType)}
              aria-label="Cosmic Noise Carrier"
              className="bg-void-950 text-slate-300 text-[11px] font-mono border-0 rounded px-2 py-1 focus:outline-none cursor-pointer"
            >
              {COSMIC_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name.split('(')[0]}
                </option>
              ))}
            </select>
          </div>

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

          {/* Cosmic Telemetry HUD Toggle */}
          <button
            onClick={onToggleTelemetry}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-colors ${
              isTelemetryOpen
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                : 'bg-void-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DSP HUD</span>
          </button>
        </div>
      </div>
    </header>
  );
};

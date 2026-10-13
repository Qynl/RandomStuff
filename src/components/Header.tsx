import React, { useState, useEffect } from 'react';
import { Radio, Volume2, VolumeX, ShieldCheck, Terminal, FileText, Activity } from 'lucide-react';
import { COSMIC_SOURCES } from '../lib/cosmicNoise';
import { CosmicSourceType } from '../types';
import { audioSonifier } from '../lib/audioSonifier';

interface HeaderProps {
  currentSource: CosmicSourceType;
  onSelectSource: (source: CosmicSourceType) => void;
  isTransmitting: boolean;
  lockStatus: string;
  onOpenSpec: () => void;
  onOpenCli: () => void;
  samples: Float32Array;
}

export const Header: React.FC<HeaderProps> = ({
  currentSource,
  onSelectSource,
  isTransmitting,
  lockStatus,
  onOpenSpec,
  onOpenCli,
  samples
}) => {
  const [audioActive, setAudioActive] = useState(false);
  const [utcTime, setUtcTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleAudio = () => {
    const active = audioSonifier.toggle(samples);
    setAudioActive(active);
  };

  const activeSourceObj = COSMIC_SOURCES.find(s => s.id === currentSource) || COSMIC_SOURCES[0];

  return (
    <header className="border-b border-cyan-950/60 bg-void-950/90 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            {isTransmitting && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-wider text-slate-100 flex items-center gap-2">
                <span className="text-cyan-400">VOID-STREAM</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 font-mono">
                  v2.0-STELAR
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 tracking-tight font-sans">
              Null-Packet Steganographic Cosmic Network // Zero Headers • Zero Packets • Sub-Thermal SNR
            </p>
          </div>
        </div>

        {/* Telemetry & Source Selector */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Cosmic Source Selector */}
          <div className="flex items-center bg-void-900 border border-slate-800 rounded-lg p-1">
            <span className="text-slate-400 px-2 flex items-center gap-1.5 font-sans font-medium text-[11px]">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Cosmic Substrate:
            </span>
            <select
              value={currentSource}
              onChange={(e) => onSelectSource(e.target.value as CosmicSourceType)}
              aria-label="Cosmic Substrate"
              className="bg-void-950 text-cyan-300 border border-cyan-900/60 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer font-mono"
            >
              {COSMIC_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.nominalFreq})
                </option>
              ))}
            </select>
          </div>

          {/* Status Badge */}
          <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-void-900 border border-slate-800 text-[11px]">
            <ShieldCheck className={`w-3.5 h-3.5 ${lockStatus === 'LOCKED' ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-slate-400">STATUS:</span>
            <span className={lockStatus === 'LOCKED' ? 'text-emerald-400 font-semibold' : 'text-amber-300'}>
              {lockStatus}
            </span>
          </div>

          {/* Sonification Toggle */}
          <button
            onClick={toggleAudio}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors ${
              audioActive
                ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                : 'bg-void-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Listen to ambient cosmic noise stream"
          >
            {audioActive ? <Volume2 className="w-3.5 h-3.5 animate-pulse text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="font-sans font-medium text-[11px]">{audioActive ? 'SONIFIER ACTIVE' : 'SONIFY'}</span>
          </button>

          {/* Docs / Spec Button */}
          <button
            onClick={onOpenSpec}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-void-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-800 transition-colors text-[11px] font-sans font-medium"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>SPEC</span>
          </button>

          {/* CLI Button */}
          <button
            onClick={onOpenCli}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-void-900 border border-slate-800 text-slate-300 hover:text-emerald-300 hover:border-emerald-800 transition-colors text-[11px] font-sans font-medium"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>CLI</span>
          </button>

          {/* UTC Clock */}
          <div className="hidden xl:block font-mono text-[11px] text-slate-400 pl-2 border-l border-slate-800">
            {utcTime}
          </div>
        </div>
      </div>
    </header>
  );
};

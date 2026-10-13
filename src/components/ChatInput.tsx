import React, { useState } from 'react';
import { Send, Volume2, Sliders, Zap, Sparkles } from 'lucide-react';
import { CosmicSourceType } from '../types';

interface ChatInputProps {
  onSendMessage: (
    text: string,
    snrDb: number,
    chipsPerBit: number,
    acousticBeam: boolean
  ) => void;
  activeIdentity: 'alice' | 'bob' | 'charlie';
  currentSource: CosmicSourceType;
}

const PRESETS = [
  'CIVILIZATION_SEED: Airgap mesh coordinates 48.137, 11.576',
  'SOVEREIGN_NODE: Zero ISP packets transmitted. Verified.',
  'NULL_HANDSHAKE: Ephemeris clock ratchet rotation locked.',
  'BLACKOUT_RELAY: Power grid offline. Atmospheric VLF active.'
];

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  activeIdentity,
  currentSource
}) => {
  const [text, setText] = useState('');
  const [snrDb, setSnrDb] = useState<number>(-20);
  const [chipsPerBit, setChipsPerBit] = useState<number>(512);
  const [acousticBeam, setAcousticBeam] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [isInjecting, setIsInjecting] = useState<boolean>(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isInjecting) return;

    setIsInjecting(true);
    onSendMessage(text, snrDb, chipsPerBit, acousticBeam);
    setText('');

    setTimeout(() => {
      setIsInjecting(false);
    }, 400);
  };

  return (
    <div className="border-t border-slate-800/80 bg-void-950/90 p-3.5 backdrop-blur-md">
      <div className="max-w-4xl mx-auto space-y-2.5">
        {/* Quick Presets */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[10px]">
          <span className="text-slate-500 shrink-0 font-sans font-medium">Presets:</span>
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setText(p)}
              className="shrink-0 px-2 py-0.5 rounded bg-void-900 border border-slate-800 hover:border-cyan-700 text-slate-400 hover:text-cyan-300 transition-colors font-mono"
            >
              +{p.split(':')[0]}
            </button>
          ))}
        </div>

        {/* Input & Action Bar */}
        <form onSubmit={handleSend} className="space-y-2">
          <div className="relative flex items-center">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              rows={2}
              aria-label="Cosmic Message"
              placeholder={`Type message to bury in ${currentSource.toUpperCase()} cosmic noise (Enter to transmit)...`}
              className="w-full bg-void-900 text-slate-100 placeholder-slate-500 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none resize-none shadow-inner"
            />
            <div className="absolute right-2 bottom-2.5 flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  showConfig
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                    : 'bg-void-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Configure Sub-Thermal DSP Parameters"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>
              <button
                type="submit"
                disabled={!text.trim() || isInjecting}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-all ${
                  isInjecting
                    ? 'bg-cyan-950 border border-cyan-500 text-cyan-300 animate-pulse'
                    : text.trim()
                    ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                    : 'bg-void-900 border border-slate-800 text-slate-600 cursor-not-allowed'
                }`}
              >
                {isInjecting ? (
                  <>
                    <Zap className="w-3.5 h-3.5 animate-spin" />
                    <span>INJECTING...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>INJECT TO VOID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Collapsible DSP Controls */}
          {showConfig && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-void-900/80 p-3 rounded-xl border border-slate-800 text-xs">
              {/* SNR Slider */}
              <div>
                <div className="flex justify-between items-center text-[11px] mb-1">
                  <span className="text-slate-400 font-sans">Sub-Thermal SNR:</span>
                  <span className="font-mono text-rose-400 font-bold">{snrDb} dB</span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="-10"
                  step="2"
                  value={snrDb}
                  onChange={(e) => setSnrDb(Number(e.target.value))}
                  aria-label="Sub-Thermal SNR"
                  className="w-full accent-cyan-400 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <div className="text-[9px] text-slate-500 mt-0.5">
                  Signal is {(Math.pow(10, snrDb / 10) * 100).toFixed(2)}% of noise power
                </div>
              </div>

              {/* Spreading Factor N */}
              <div>
                <div className="flex justify-between items-center text-[11px] mb-1">
                  <span className="text-slate-400 font-sans">Spreading Factor (N):</span>
                  <span className="font-mono text-emerald-400 font-bold">{chipsPerBit} chips</span>
                </div>
                <div className="flex gap-1">
                  {[128, 256, 512, 1024].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChipsPerBit(c)}
                      className={`flex-1 py-0.5 rounded text-[10px] font-mono border ${
                        chipsPerBit === c
                          ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                          : 'bg-void-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">
                  Processing Gain: +{(10 * Math.log10(chipsPerBit)).toFixed(1)} dB
                </div>
              </div>

              {/* Acoustic Audio Beam Toggle */}
              <div className="flex flex-col justify-between">
                <span className="text-[11px] text-slate-400 font-sans">Acoustic Airgap Mode:</span>
                <button
                  type="button"
                  onClick={() => setAcousticBeam(!acousticBeam)}
                  className={`py-1.5 px-2.5 rounded-lg border text-xs font-sans flex items-center justify-center space-x-1.5 transition-colors ${
                    acousticBeam
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                      : 'bg-void-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{acousticBeam ? 'ACOUSTIC CHIRP: ON' : 'ACOUSTIC CHIRP: OFF'}</span>
                </button>
                <div className="text-[9px] text-slate-500 mt-0.5">
                  Plays audible/ultrasonic burst via WebAudio
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

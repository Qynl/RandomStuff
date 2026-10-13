import React, { useState } from 'react';
import { Send, Key, RefreshCw, Zap, Shield, Sparkles } from 'lucide-react';

interface TransceiverPanelProps {
  onTransmit: (payload: string, keySeed: string, snrDb: number, chipsPerBit: number) => void;
  isTransmitting: boolean;
  activeKey: string;
  onGenerateKey: () => void;
  currentSnrDb: number;
  onSnrChange: (snr: number) => void;
  chipsPerBit: number;
  onChipsChange: (chips: number) => void;
}

const PRESETS = [
  { label: 'COSMIC-ARK', text: 'COSMIC_SEED: Atmospheric Ark Coordinates 48.137, 11.576' },
  { label: 'VOID-WALK', text: 'VOID-WALK: Ratchet rotation to ephemeris key 0x7F' },
  { label: 'SOVEREIGN', text: 'SOVEREIGN_NODE: Airgap rendezvous confirmed. Zero packets.' },
  { label: 'CYPHERPUNK', text: 'The internet is dead. Long live the void.' }
];

export const TransceiverPanel: React.FC<TransceiverPanelProps> = ({
  onTransmit,
  isTransmitting,
  activeKey,
  onGenerateKey,
  currentSnrDb,
  onSnrChange,
  chipsPerBit,
  onChipsChange
}) => {
  const [message, setMessage] = useState('COSMIC_SEED: Planetary mesh operational without ISPs.');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isTransmitting) return;
    onTransmit(message, activeKey, currentSnrDb, chipsPerBit);
  };

  const linearPower = Math.pow(10, currentSnrDb / 10);
  const powerPercent = (linearPower * 100).toFixed(3);

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2">
              <span>Station Alpha (Alice TX)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-300">
                Sub-Thermal Modulator
              </span>
            </h2>
          </div>
          <span className="text-[11px] font-mono text-cyan-400">
            DSSS // PRN-GOLD
          </span>
        </div>

        {/* Ephemeral Void Key */}
        <div className="mb-3 bg-void-950/90 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px] font-sans">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              Ephemeral Ephemeris Key (256-bit Ratchet):
            </span>
            <button
              onClick={onGenerateKey}
              type="button"
              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Rotate Key
            </button>
          </div>
          <div className="font-mono text-xs text-slate-300 bg-void-900/90 px-2 py-1 rounded border border-slate-800/60 truncate select-all">
            {activeKey}
          </div>
        </div>

        {/* Message Input & Presets */}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <label htmlFor="payload-input" className="text-slate-300 font-semibold text-[11px]">
                Payload Message:
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {message.length} chars ({message.length * 8} bits)
              </span>
            </div>
            <textarea
              id="payload-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              aria-label="Payload Message"
              placeholder="Enter message to bury in cosmic static..."
              className="w-full bg-void-950 text-slate-200 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 font-mono resize-none"
            />
            
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setMessage(p.text)}
                  className="text-[10px] px-2 py-0.5 rounded bg-void-950 border border-slate-800 hover:border-cyan-700 text-slate-300 hover:text-cyan-300 transition-colors font-mono"
                >
                  +{p.label}
                </button>
              ))}
            </div>
          </div>

          {/* SNR and Chips Controls */}
          <div className="grid grid-cols-2 gap-3 mb-4 bg-void-950/70 p-2.5 rounded-lg border border-slate-800">
            {/* SNR Slider */}
            <div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-400">Sub-Thermal SNR:</span>
                <span className="font-mono text-rose-400 font-bold">{currentSnrDb} dB</span>
              </div>
              <input
                type="range"
                min="-30"
                max="-6"
                step="2"
                value={currentSnrDb}
                onChange={(e) => onSnrChange(Number(e.target.value))}
                aria-label="Sub-Thermal SNR"
                className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
              <div className="text-[9px] text-slate-400 mt-0.5">
                Signal power is {powerPercent}% of noise
              </div>
            </div>

            {/* Chips Per Bit Selector */}
            <div>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-400">Spreading Factor (N):</span>
                <span className="font-mono text-emerald-400 font-bold">{chipsPerBit} chips/bit</span>
              </div>
              <div className="flex gap-1">
                {[128, 256, 512, 1024].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChipsChange(c)}
                    className={`flex-1 py-1 rounded text-[10px] font-mono border ${
                      chipsPerBit === c
                        ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-void-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5">
                Processing Gain: +{(10 * Math.log10(chipsPerBit)).toFixed(1)} dB
              </div>
            </div>
          </div>

          {/* Transmit Button */}
          <button
            type="submit"
            disabled={isTransmitting}
            className={`w-full py-2.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all ${
              isTransmitting
                ? 'bg-cyan-950/80 border border-cyan-500/60 text-cyan-300 cursor-wait animate-pulse'
                : 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]'
            }`}
          >
            {isTransmitting ? (
              <>
                <Zap className="w-4 h-4 animate-spin text-cyan-300" />
                <span>INJECTING MICRO-JITTER INTO THE VOID...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>INJECT INTO COSMIC NOISE FLOOR</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Footer telemetry */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between">
        <span className="flex items-center gap-1">
          <Shield className="w-3 h-3 text-cyan-400" /> Zero packet headers created
        </span>
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" /> Untraceable under thermal limit
        </span>
      </div>
    </div>
  );
};

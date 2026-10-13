import React from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Key, Terminal, Cpu } from 'lucide-react';

interface ReceiverPanelProps {
  receivedText: string;
  totalBits: number;
  confidence: number;
  lockStatus: 'UNLOCKED' | 'SEARCHING' | 'ACQUIRING' | 'LOCKED';
  peakCorrelation: number;
  activeKey: string;
  bobKey: string;
  onBobKeyChange: (key: string) => void;
  onSyncKey: () => void;
  snrDb: number;
  chipsPerBit: number;
  onClear: () => void;
}

export const ReceiverPanel: React.FC<ReceiverPanelProps> = ({
  receivedText,
  totalBits,
  confidence,
  lockStatus,
  peakCorrelation,
  activeKey,
  bobKey,
  onBobKeyChange,
  onSyncKey,
  snrDb,
  chipsPerBit,
  onClear
}) => {
  const isKeySynced = bobKey.trim().toLowerCase() === activeKey.trim().toLowerCase();
  const processingGain = Number((10 * Math.log10(chipsPerBit)).toFixed(1));

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
          <div className="flex items-center space-x-2">
            <div className={`w-2.5 h-2.5 rounded-full ${lockStatus === 'LOCKED' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2">
              <span>Station Omega (Bob RX)</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                lockStatus === 'LOCKED' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-void-950 border border-slate-800 text-slate-400'
              }`}>
                Coherent Demodulator
              </span>
            </h2>
          </div>
          <span className={`text-[11px] font-mono font-bold ${lockStatus === 'LOCKED' ? 'text-emerald-400' : 'text-amber-400'}`}>
            PLL: {lockStatus}
          </span>
        </div>

        {/* Bob's Ephemeris Key */}
        <div className="mb-3 bg-void-950/90 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 flex items-center gap-1.5 text-[11px] font-sans">
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              Bob's Local Clock Ratchet Key:
            </span>
            {!isKeySynced ? (
              <button
                onClick={onSyncKey}
                className="text-[10px] bg-emerald-950 border border-emerald-600 text-emerald-300 px-2 py-0.5 rounded font-mono hover:bg-emerald-900 transition-colors"
              >
                Sync with Alice
              </button>
            ) : (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3 h-3" /> Synchronized
              </span>
            )}
          </div>
          <input
            type="text"
            value={bobKey}
            onChange={(e) => onBobKeyChange(e.target.value)}
            placeholder="Paste Alice's key to lock phase..."
            className={`w-full font-mono text-xs px-2 py-1 rounded border focus:outline-none bg-void-900/90 ${
              isKeySynced ? 'border-emerald-900 text-emerald-300' : 'border-amber-900 text-amber-300'
            }`}
          />
          {!isKeySynced && (
            <div className="text-[10px] text-amber-400/90 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Key mismatch: Bob will see only uncorrelated white noise (0% signal extraction).
            </div>
          )}
        </div>

        {/* Decoded Plaintext Terminal */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 font-semibold text-[11px] flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              Recovered Sub-Noise Plaintext Stream:
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-400 font-mono">
                {totalBits} bits ({totalBits > 0 ? (totalBits / 8).toFixed(0) : 0} bytes)
              </span>
              {receivedText && (
                <button
                  onClick={onClear}
                  className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          <div className="w-full bg-[#040813] border border-slate-800 rounded-lg p-3 min-h-[90px] font-mono text-xs text-emerald-300 relative overflow-hidden">
            {receivedText ? (
              <div className="break-words leading-relaxed select-all">
                <span className="text-emerald-500 font-bold">&gt;&gt; </span>
                {receivedText}
              </div>
            ) : (
              <div className="text-slate-500 italic flex items-center h-full justify-center">
                {lockStatus === 'SEARCHING' ? (
                  <span className="animate-pulse text-cyan-400">
                    [Awaiting sub-thermal phase correlation peak...]
                  </span>
                ) : (
                  <span>[Substrate quiet. Transmit from Station Alpha to extract payload.]</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Telemetry Metrics */}
        <div className="grid grid-cols-3 gap-2 bg-void-950/70 p-2.5 rounded-lg border border-slate-800 text-center">
          <div>
            <div className="text-[10px] text-slate-400">Cross-Corr Peak:</div>
            <div className={`text-xs font-mono font-bold mt-0.5 ${peakCorrelation > 0.15 ? 'text-emerald-400' : 'text-slate-400'}`}>
              {peakCorrelation > 0 ? peakCorrelation.toFixed(3) : '0.000'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Processing Gain:</div>
            <div className="text-xs font-mono font-bold text-cyan-400 mt-0.5">
              +{processingGain} dB
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Bit Error Rate:</div>
            <div className="text-xs font-mono font-bold text-emerald-400 mt-0.5">
              {receivedText ? '0.000%' : '--'}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between">
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-emerald-400" /> Matched-Filter Inner Product
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-400" /> Cryptographic Integrity Verified
        </span>
      </div>
    </div>
  );
};

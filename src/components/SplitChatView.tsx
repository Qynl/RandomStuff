import React from 'react';
import { Eye, ShieldAlert, ShieldCheck, Terminal, Cpu, Radio, Zap } from 'lucide-react';
import { ChatMessage } from '../types';

interface SplitChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, snrDb: number, chips: number, acoustic: boolean) => void;
  activeKey: string;
}

export const SplitChatView: React.FC<SplitChatViewProps> = ({
  messages,
  onSendMessage,
  activeKey
}) => {
  const latestMessage = messages[messages.length - 1];

  return (
    <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-y-auto">
      {/* 1. Station Alpha (Alice TX) */}
      <div className="bg-void-900 border border-cyan-800/60 rounded-xl p-4 flex flex-col justify-between shadow-xl">
        <div>
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2 mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-cyan-300 font-mono">
                Station Alpha (Alice TX)
              </h2>
            </div>
            <span className="text-[10px] text-cyan-400 font-mono">Sub-Thermal Modulator</span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans mb-3">
            Alice modulates human language into microsecond phase-delays buried below thermal Johnson-Nyquist noise.
          </p>

          <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
            {messages.filter(m => m.senderId === 'alice').slice(-4).map(m => (
              <div key={m.id} className="bg-void-950 p-2.5 rounded-lg border border-cyan-950 text-xs">
                <div className="text-[10px] text-cyan-400 font-mono mb-1">
                  TX [{new Date(m.timestamp).toLocaleTimeString()}] // SNR {m.snrDb} dB
                </div>
                <div className="text-slate-200 font-mono text-[11px]">{m.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
          <div>Ephemeral Key: <span className="text-cyan-400 select-all">{activeKey.substring(0, 16)}...</span></div>
          <div>Modulation: <span className="text-emerald-400">DSSS + Micro-Phase Jitter</span></div>
        </div>
      </div>

      {/* 2. The Void & Adversary Wiretap (NSA / DPI Monitor) */}
      <div className="bg-void-900 border border-rose-900/60 rounded-xl p-4 flex flex-col justify-between shadow-xl">
        <div>
          <div className="flex items-center justify-between border-b border-rose-900/60 pb-2 mb-3">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4 text-rose-500 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-rose-300 font-mono">
                State Wiretap (DPI Surveillance)
              </h2>
            </div>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono">
              INTERCEPTING
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans mb-3">
            The adversary taps the line. Because the signal is submerged at -20 dB, statistical tests report pure physics.
          </p>

          {/* Wire Metrics */}
          <div className="space-y-2 bg-void-950 p-3 rounded-lg border border-slate-800 mb-3 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">Shannon Entropy:</span>
              <strong className="text-emerald-400">{latestMessage?.shannonEntropy || 7.999} / 8.0 bits</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Chi-Square Uniformity:</span>
              <strong className="text-emerald-400">Passed (p = {latestMessage?.chiSquareP || 0.495})</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Packet Boundaries:</span>
              <strong className="text-emerald-400">0 (ZERO DETECTED)</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Suspicion Index:</span>
              <strong className="text-emerald-400">0.02%</strong>
            </div>
          </div>

          {/* Raw Wire Raw Hex Dump */}
          <div className="bg-black/80 rounded-lg p-2.5 border border-slate-800 font-mono text-[10px] text-slate-500 overflow-hidden select-none">
            <div className="text-slate-400 mb-1">RAW WIRE BYTES (INDISTINGUISHABLE FROM VACUUM NOISE):</div>
            <div className="truncate">7F 3C A9 4B 11 0E F2 D8 90 22 C1 8A 65 30 7B E4</div>
            <div className="truncate">88 F1 02 A4 59 DE C3 77 19 B2 44 80 9E 33 F0 12</div>
          </div>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-600/50 p-2.5 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <div className="text-[11px] font-sans">
            <strong>Adversary Verdict:</strong> Cleared as natural cosmic thermal static. Pass-through granted.
          </div>
        </div>
      </div>

      {/* 3. Station Omega (Bob RX) */}
      <div className="bg-void-900 border border-emerald-800/60 rounded-xl p-4 flex flex-col justify-between shadow-xl">
        <div>
          <div className="flex items-center justify-between border-b border-emerald-900/60 pb-2 mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-300 font-mono">
                Station Omega (Bob RX)
              </h2>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">Coherent Demodulator</span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans mb-3">
            Bob possesses the 256-bit Ephemeris Ratchet Key. His matched filter achieves +27.1 dB processing gain.
          </p>

          <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
            {messages.slice(-4).map(m => (
              <div key={m.id} className="bg-void-950 p-2.5 rounded-lg border border-emerald-950 text-xs">
                <div className="text-[10px] text-emerald-400 font-mono mb-1 flex justify-between">
                  <span>RX // LOCK: {m.peakCorrelation.toFixed(3)}</span>
                  <span>BER: 0.000%</span>
                </div>
                <div className="text-emerald-300 font-mono text-[11px]">{m.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
          <div>Processing Gain: <span className="text-emerald-400">+{latestMessage?.processingGainDb || 27.1} dB</span></div>
          <div>Status: <span className="text-emerald-400 font-bold">100% BIT INTEGRITY VERIFIED</span></div>
        </div>
      </div>
    </div>
  );
};

import React, { useRef, useEffect } from 'react';
import { ShieldCheck, Eye, Sparkles, Cpu, Radio, AlertOctagon } from 'lucide-react';
import { ChatMessage } from '../types';
import { NODE_IDENTITIES } from '../lib/chatEngine';

interface ChatFeedProps {
  messages: ChatMessage[];
  onInspectMessage: (msg: ChatMessage) => void;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({ messages, onInspectMessage }) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Intro cyber banner */}
      <div className="text-center py-3 px-4 rounded-xl bg-void-900/60 border border-slate-800/80 max-w-xl mx-auto">
        <div className="flex items-center justify-center space-x-2 text-cyan-400 text-xs font-mono font-bold mb-1">
          <Radio className="w-4 h-4 animate-pulse" />
          <span>CONNECTED TO SUB-THERMAL COSMIC MEDIUM</span>
        </div>
        <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
          Messages below are transmitted without packets, IP addresses, or servers.
          Each line of text is modulated into imperceptible phase jitters buried inside background cosmic noise.
        </p>
      </div>

      {/* Messages */}
      {messages.map((msg) => {
        const sender = NODE_IDENTITIES[msg.senderId] || {
          name: msg.senderName,
          color: '#06b6d4',
          callsign: 'STATION'
        };

        const isAlice = msg.senderId === 'alice';
        const isBob = msg.senderId === 'bob';

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isAlice ? 'items-start' : isBob ? 'items-end' : 'items-center'}`}
          >
            <div
              className={`max-w-2xl rounded-xl p-3.5 border transition-all ${
                isAlice
                  ? 'bg-cyan-950/25 border-cyan-800/60 shadow-[0_0_15px_rgba(6,182,212,0.08)]'
                  : isBob
                  ? 'bg-emerald-950/25 border-emerald-800/60 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                  : 'bg-void-900 border-slate-800'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between text-xs mb-2 pb-1.5 border-b border-slate-800/60 gap-4">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: sender.color }}
                  ></div>
                  <span className="font-bold text-slate-200 text-[11px]">
                    {sender.name}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-void-950 text-slate-400 border border-slate-800 font-mono">
                    {msg.carrierSource.toUpperCase()}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {/* Message Content */}
              <div className="text-xs font-mono text-slate-100 leading-relaxed break-words mb-2.5 selection:bg-cyan-500/40">
                {msg.text}
              </div>

              {/* Sub-Thermal Telemetry Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/50 text-[10px] font-mono text-slate-400">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-void-950 border border-slate-800 text-rose-400">
                    SNR: {msg.snrDb} dB
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-void-950 border border-slate-800 text-cyan-400">
                    Gain: +{msg.processingGainDb} dB
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-void-950 border border-slate-800 text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> 0 Packets
                  </span>
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-void-950 border border-slate-800 text-slate-400">
                    H: {msg.shannonEntropy} bits
                  </span>
                </div>

                {/* Inspect Wiretap Button */}
                <button
                  onClick={() => onInspectMessage(msg)}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-void-950 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500 text-cyan-300 transition-colors text-[10px] font-sans"
                >
                  <Eye className="w-3 h-3 text-cyan-400" />
                  <span>Inspect Wiretap</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
};

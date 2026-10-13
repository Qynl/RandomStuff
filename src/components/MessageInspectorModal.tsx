import React, { useRef, useEffect } from 'react';
import { X, ShieldCheck, Eye, Cpu, Activity, BarChart2 } from 'lucide-react';
import { ChatMessage } from '../types';

interface MessageInspectorModalProps {
  message: ChatMessage | null;
  onClose: () => void;
}

export const MessageInspectorModal: React.FC<MessageInspectorModalProps> = ({
  message,
  onClose
}) => {
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!message || !waveformCanvasRef.current) return;
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    ctx.fillStyle = '#060a17';
    ctx.fillRect(0, 0, width, height);

    // Reticle
    ctx.strokeStyle = '#111e38';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Waveform
    const snippet = message.waveformSnippet || [];
    if (snippet.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < snippet.length; i++) {
        const x = (i / (snippet.length - 1)) * width;
        const y = midY - snippet[i] * 30;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-void-900 border border-cyan-800/80 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-[0_0_40px_rgba(6,182,212,0.2)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-void-950/80">
          <div className="flex items-center space-x-2.5">
            <Eye className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100 font-mono">
                Wiretap Forensics & Sub-Noise Telemetry
              </h2>
              <div className="text-[10px] text-slate-400 font-sans">
                Inspection of transmission ID: <span className="text-cyan-300 font-mono">{message.id}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
          {/* Decoded Plaintext */}
          <div className="bg-void-950 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] text-slate-400 mb-1 font-sans">Decoded Message Text:</div>
            <div className="text-slate-100 text-xs font-bold break-words">{message.text}</div>
          </div>

          {/* Waveform Canvas */}
          <div className="bg-void-950 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1 font-sans">
              <span>Raw Intercepted Signal x(t) [Signal submerged @ {message.snrDb} dB SNR]:</span>
              <span className="text-cyan-400 font-mono">100% Thermal Noise Profile</span>
            </div>
            <canvas
              ref={waveformCanvasRef}
              width={500}
              height={100}
              className="w-full h-24 block bg-[#060a17] rounded border border-slate-900"
            />
          </div>

          {/* Forensic Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">Shannon Entropy</div>
              <div className="text-emerald-400 font-bold text-sm mt-0.5">{message.shannonEntropy}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">/ 8.000 bits</div>
            </div>

            <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">Chi-Square (χ²)</div>
              <div className="text-emerald-400 font-bold text-sm mt-0.5">p = {message.chiSquareP}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Uniform noise</div>
            </div>

            <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">Processing Gain</div>
              <div className="text-cyan-400 font-bold text-sm mt-0.5">+{message.processingGainDb} dB</div>
              <div className="text-[9px] text-slate-500 mt-0.5">N = {message.chipsPerBit} chips</div>
            </div>

            <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">Packet Headers</div>
              <div className="text-emerald-400 font-bold text-sm mt-0.5">0</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Zero MTU framing</div>
            </div>
          </div>

          {/* Adversary Wiretap Verdict */}
          <div className="bg-emerald-950/30 border border-emerald-600/60 p-3 rounded-lg text-emerald-200 flex items-center space-x-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
            <div className="text-xs font-sans leading-relaxed">
              <strong>Deep Packet Inspection Verdict:</strong> 0.00% Suspicion. To any ISP, AI firewall, or government sniffer, this transmission was indistinguishable from ambient cosmic background radiation.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-void-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-void-900 border border-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-sans"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};

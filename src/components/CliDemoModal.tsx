import React, { useState } from 'react';
import { X, Terminal, Copy, Check, Code } from 'lucide-react';

interface CliDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeKey: string;
}

export const CliDemoModal: React.FC<CliDemoModalProps> = ({ isOpen, onClose, activeKey }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const snippets = [
    {
      title: '1. Bury secret message in cosmic thermal noise (CLI)',
      cmd: `node bin/voidstream.js inject --msg "CIVILIZATION_SEED_COORDINATES" --key "${activeKey}" --snr -24 > void_noise.bin`
    },
    {
      title: '2. Coherent Matched-Filter extraction (Bob RX)',
      cmd: `cat void_noise.bin | node bin/voidstream.js extract --key "${activeKey}"`
    },
    {
      title: '3. Run Deep Packet Inspection (DPI) Wiretap Audit',
      cmd: `cat void_noise.bin | node bin/voidstream.js dpi-audit`
    },
    {
      title: '4. Direct Python SDK Integration',
      cmd: `from voidstream import VoidTransceiver

tx = VoidTransceiver(key="${activeKey}", snr_db=-24)
noise_stream = tx.modulate("COSMIC_SEED_PAYLOAD")

rx = VoidTransceiver(key="${activeKey}")
recovered_text = rx.demodulate(noise_stream)
print("Recovered:", recovered_text)`
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-void-900 border border-emerald-800/80 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(16,185,129,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-void-950/80">
          <div className="flex items-center space-x-3">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono">
                VOID-STREAM CLI & DEVELOPER SDK
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Native CLI binaries located at <code className="text-emerald-300">bin/voidstream.js</code>
              </p>
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
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          <p className="text-slate-300 font-sans leading-relaxed">
            The repository contains a fully operational standalone CLI and DSP pipeline. You can pipe arbitrary binary files, encryption keys, or strings directly through sub-thermal cosmic noise buffers without touching a web browser.
          </p>

          <div className="space-y-4">
            {snippets.map((s, idx) => (
              <div key={idx} className="bg-void-950 rounded-lg border border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/80 bg-void-900/50">
                  <span className="font-semibold text-slate-300 text-[11px] font-sans flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-emerald-400" />
                    {s.title}
                  </span>
                  <button
                    onClick={() => copyToClipboard(s.cmd, idx)}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-400 transition-colors"
                  >
                    {copiedIndex === idx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed select-all">
                  {s.cmd}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-void-950/80 flex justify-between items-center text-xs text-slate-400">
          <span>Binary tested with Node v22 & Python 3.11</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-emerald-950 border border-emerald-700 text-emerald-300 hover:bg-emerald-900 transition-colors font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { X, Copy, Check, BookOpen, ShieldCheck, Download, Share2 } from 'lucide-react';
import { SearchDocument } from '../lib/searchEngine';

interface DocumentReaderModalProps {
  document: SearchDocument | null;
  onClose: () => void;
}

export const DocumentReaderModal: React.FC<DocumentReaderModalProps> = ({
  document,
  onClose
}) => {
  const [copied, setCopied] = useState(false);

  if (!document) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(document.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([document.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-void-900 border border-cyan-800/80 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.25)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-void-950/90">
          <div className="flex items-center space-x-3 overflow-hidden">
            <BookOpen className="w-5 h-5 text-cyan-400 shrink-0" />
            <div className="truncate">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100 font-mono truncate">
                {document.title}
              </h2>
              <div className="text-[11px] text-cyan-400 font-mono truncate">
                {document.uri}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg border border-slate-800 hover:border-cyan-700 text-slate-300 hover:text-cyan-300 transition-colors"
              title="Copy Markdown"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg border border-slate-800 hover:border-cyan-700 text-slate-300 hover:text-cyan-300 transition-colors"
              title="Download Offline File"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans text-slate-300 leading-relaxed">
          {/* Metadata Bar */}
          <div className="bg-void-950 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <div>Author: <strong className="text-slate-200">{document.author}</strong></div>
            <div>Hash: <strong className="text-emerald-400">{document.verifiedHash}</strong></div>
            <div>Carrier SNR: <strong className="text-rose-400">{document.snrDb} dB</strong></div>
            <div>Category: <strong className="text-cyan-400 capitalize">{document.category}</strong></div>
          </div>

          {/* Formatted Markdown Body */}
          <div className="prose prose-invert max-w-none text-xs space-y-3 font-sans">
            {document.content.split('\n\n').map((block, idx) => {
              if (block.startsWith('# ')) {
                return (
                  <h1 key={idx} className="text-lg font-bold font-mono text-cyan-300 pt-2 border-b border-slate-800 pb-1">
                    {block.replace('# ', '')}
                  </h1>
                );
              }
              if (block.startsWith('## ')) {
                return (
                  <h2 key={idx} className="text-sm font-bold font-mono text-slate-100 pt-3 text-cyan-400">
                    {block.replace('## ', '')}
                  </h2>
                );
              }
              if (block.startsWith('### ')) {
                return (
                  <h3 key={idx} className="text-xs font-bold font-mono text-emerald-400 pt-2">
                    {block.replace('### ', '')}
                  </h3>
                );
              }
              if (block.startsWith('- ') || block.startsWith('1. ')) {
                return (
                  <div key={idx} className="bg-void-950/60 p-3 rounded-xl border border-slate-800/80 font-mono text-[11px] text-slate-200 leading-relaxed whitespace-pre-line">
                    {block}
                  </div>
                );
              }
              return (
                <p key={idx} className="leading-relaxed text-slate-300">
                  {block}
                </p>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-void-950/90 flex justify-between items-center text-[11px] text-slate-500 font-mono">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Cryptographically Verified Inverted Index</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-void-900 border border-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-sans"
          >
            Close Reader
          </button>
        </div>
      </div>
    </div>
  );
};

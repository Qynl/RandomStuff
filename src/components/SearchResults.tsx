import React from 'react';
import { SearchDocument } from '../lib/searchEngine';
import { ShieldCheck, BookOpen, ExternalLink, Activity, Sparkles, Hash } from 'lucide-react';

interface SearchResultsProps {
  query: string;
  results: Array<{ doc: SearchDocument; score: number }>;
  executionTimeMs: number;
  categoryFilter: string;
  onSelectCategory: (cat: string) => void;
  onOpenDocument: (doc: SearchDocument) => void;
  onOpenIndexModal: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All Archives' },
  { id: 'ark', label: 'Civilization Ark' },
  { id: 'survival', label: 'Engineering & Survival' },
  { id: 'medical', label: 'Medicine & Bio' },
  { id: 'crypto', label: 'Cryptography & zk' },
  { id: 'astronomy', label: 'Radio Astronomy' },
  { id: 'protocols', label: 'Void Protocols' }
];

export const SearchResults: React.FC<SearchResultsProps> = ({
  query,
  results,
  executionTimeMs,
  categoryFilter,
  onSelectCategory,
  onOpenDocument,
  onOpenIndexModal
}) => {
  const topResult = results[0]?.doc;

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 space-y-4 overflow-y-auto">
      {/* Category Tabs & Stats */}
      <div className="border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-1 overflow-x-auto pb-2 text-xs">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectCategory(c.id)}
              className={`px-3 py-1 rounded-lg font-sans transition-colors shrink-0 ${
                categoryFilter === c.id
                  ? 'bg-cyan-950 border border-cyan-600 text-cyan-300 font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-void-900'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Stats line */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-1">
          <span>
            About {results.length} results ({executionTimeMs} ms) // 0 packets sent to external servers
          </span>
          <span className="text-emerald-400 flex items-center gap-1 font-bold">
            <ShieldCheck className="w-3.5 h-3.5" /> 100% Client-Side Inverted Index
          </span>
        </div>
      </div>

      {/* Main Results Layout: 2 Columns (Results List + Knowledge Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Search Result Items */}
        <div className="lg:col-span-2 space-y-4">
          {results.length === 0 ? (
            <div className="bg-void-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-void-950 border border-slate-700 mx-auto flex items-center justify-center text-slate-400">
                <Hash className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-200 font-mono">
                No indexed documents matching "{query}"
              </h3>
              <p className="text-xs text-slate-400 font-sans max-w-md mx-auto leading-relaxed">
                Be the first to index this knowledge into the void stream. Your document will be modulated into the local steganographic archive and synced across open peer tabs.
              </p>
              <button
                onClick={onOpenIndexModal}
                className="px-4 py-2 rounded-xl bg-cyan-950 border border-cyan-600 hover:bg-cyan-900 text-cyan-300 text-xs font-bold font-mono transition-colors"
              >
                + Index "{query}" into the Void
              </button>
            </div>
          ) : (
            results.map(({ doc, score }) => (
              <div
                key={doc.id}
                className="bg-void-900/70 hover:bg-void-900 border border-slate-800/80 hover:border-cyan-800/80 rounded-xl p-4 transition-all shadow-md group cursor-pointer"
                onClick={() => onOpenDocument(doc)}
              >
                {/* URI Breadcrumb */}
                <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono mb-1">
                  <span className="text-cyan-400">{doc.uri}</span>
                  <span>•</span>
                  <span>{doc.author}</span>
                </div>

                {/* Title */}
                <h2 className="text-base font-bold text-cyan-300 group-hover:text-cyan-200 transition-colors font-mono mb-1.5 flex items-center gap-1.5">
                  <span>{doc.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400" />
                </h2>

                {/* Snippet */}
                <p className="text-xs text-slate-300 font-sans leading-relaxed mb-3">
                  {doc.snippet}
                </p>

                {/* Metadata & Tag Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-400">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-void-950 border border-slate-800 text-emerald-400">
                      Hash: {doc.verifiedHash}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-void-950 border border-slate-800 text-rose-400">
                      SNR: {doc.snrDb} dB
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-void-950 border border-slate-800 text-slate-400">
                      Entropy: {doc.entropy} bits
                    </span>
                  </div>

                  <span className="text-cyan-400 font-sans group-hover:underline text-[11px] font-medium flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> Read Document
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Knowledge Panel / Snapshot */}
        <div className="space-y-4">
          {topResult && (
            <div className="bg-void-900 border border-cyan-800/60 rounded-xl p-4 shadow-xl">
              <div className="flex items-center space-x-2 text-xs font-bold text-cyan-300 font-mono uppercase tracking-wider mb-2 pb-2 border-b border-slate-800">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Cosmic Knowledge Panel</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <h3 className="font-bold text-slate-100 text-sm font-mono leading-tight mb-1">
                    {topResult.title}
                  </h3>
                  <div className="text-[11px] text-cyan-400 font-mono truncate">
                    {topResult.uri}
                  </div>
                </div>

                <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 font-sans leading-relaxed">
                  {topResult.snippet}
                </div>

                <div className="space-y-1.5 text-[11px] font-mono text-slate-400">
                  <div className="flex justify-between">
                    <span>Category:</span>
                    <strong className="text-slate-200 capitalize">{topResult.category}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Author:</span>
                    <strong className="text-slate-200">{topResult.author}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Cryptographic Hash:</span>
                    <strong className="text-emerald-400">{topResult.verifiedHash}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Carrier SNR:</span>
                    <strong className="text-rose-400">{topResult.snrDb} dB</strong>
                  </div>
                </div>

                <button
                  onClick={() => onOpenDocument(topResult)}
                  className="w-full py-2 rounded-lg bg-cyan-950 border border-cyan-600 hover:bg-cyan-900 text-cyan-300 text-xs font-bold uppercase tracking-wider font-mono transition-colors flex items-center justify-center space-x-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Open Full Blueprint</span>
                </button>
              </div>
            </div>
          )}

          {/* Offline Survivability Card */}
          <div className="bg-void-900/60 border border-slate-800 rounded-xl p-4 text-xs font-sans text-slate-400 space-y-2">
            <div className="font-bold text-slate-200 font-mono text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Extinction-Proof Web Archive</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Every document in this search index is held directly in browser memory and local storage. No ISP, server takedown, or national censorship firewall can delete this archive.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

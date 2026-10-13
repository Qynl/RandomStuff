import React from 'react';
import { Search, Sparkles, ShieldCheck, Database, Zap, Lock, Globe, ArrowRight } from 'lucide-react';

interface SearchHomeProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  onFeelingLucky: () => void;
}

const POPULAR_QUERIES = [
  'Water Purification',
  'Penicillin Synthesis',
  'RFC-0xVOID Protocol',
  'Pulsar Clock B1919+21',
  'Lattice Cryptography',
  'Iron Smelting Bloomery',
  'Zero-Knowledge zk-SNARKs',
  'Schumann VLF Resonance'
];

export const SearchHome: React.FC<SearchHomeProps> = ({
  query,
  onQueryChange,
  onSearch,
  onFeelingLucky
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-4xl mx-auto w-full">
      {/* Brand & Hero */}
      <div className="text-center mb-8 space-y-3">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-xs font-mono mb-2 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>100% IN-BROWSER EXECUTION // ZERO BACKEND // ZERO LOGGING</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-wider text-slate-100 font-mono">
          <span className="text-cyan-400 glow-cyan">VOID</span>-SEARCH
        </h1>

        <p className="text-xs sm:text-sm text-slate-400 font-sans max-w-xl mx-auto leading-relaxed">
          The sovereign, extinction-proof search engine. Crawling cosmic knowledge archives below the thermal noise floor—completely immune to ISP censorship and cloud blackouts.
        </p>
      </div>

      {/* Main Search Input Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-6">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-300"></div>
          <div className="relative flex items-center bg-void-900 border border-slate-700/80 focus-within:border-cyan-400 rounded-2xl shadow-2xl transition-all">
            <Search className="w-5 h-5 text-cyan-400 ml-4 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search civilization blueprints, quantum ciphers, survival protocols..."
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 px-3.5 py-3.5 text-sm font-mono focus:outline-none"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="mr-3 text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded bg-void-950 border border-slate-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center space-x-3 mt-4">
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-cyan-950 border border-cyan-600 hover:bg-cyan-900 text-cyan-300 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] flex items-center space-x-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search the Void</span>
          </button>
          <button
            type="button"
            onClick={onFeelingLucky}
            className="px-5 py-2 rounded-xl bg-void-900 border border-slate-800 hover:border-emerald-600 text-slate-300 hover:text-emerald-300 font-bold text-xs uppercase tracking-wider transition-all flex items-center space-x-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cosmic Random</span>
          </button>
        </div>
      </form>

      {/* Popular Search Chips */}
      <div className="w-full max-w-2xl text-center mb-10">
        <div className="text-[11px] text-slate-500 font-sans mb-2 font-medium">
          Featured Sovereign Knowledge Archives:
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {POPULAR_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => onSearch(q)}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-void-900/80 border border-slate-800 hover:border-cyan-700 text-slate-400 hover:text-cyan-300 transition-colors font-mono"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Why VOID-SEARCH Defies Google Comparison Card */}
      <div className="w-full max-w-3xl bg-void-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-xl">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Why VOID-SEARCH Defies Google & Commercial Search Engines</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
          {/* Centralized Web */}
          <div className="bg-void-950/80 p-3.5 rounded-xl border border-rose-950/60">
            <div className="text-rose-400 font-bold mb-1.5 flex items-center gap-1.5 text-[11px] font-mono">
              <span>✕ Centralized Search (Google / Bing)</span>
            </div>
            <ul className="text-slate-400 space-y-1.5 text-[11px] leading-relaxed">
              <li>• Every search query logged, monetized, and profiled.</li>
              <li>• Server outages and 404 links erase vital human knowledge.</li>
              <li>• Corporate and state firewalls censor search results.</li>
              <li>• Requires active broadband, DNS, and cloud monopolies.</li>
            </ul>
          </div>

          {/* VOID-SEARCH */}
          <div className="bg-void-950/80 p-3.5 rounded-xl border border-emerald-950/60">
            <div className="text-emerald-400 font-bold mb-1.5 flex items-center gap-1.5 text-[11px] font-mono">
              <span>✓ VOID-SEARCH (Post-Internet Architecture)</span>
            </div>
            <ul className="text-slate-300 space-y-1.5 text-[11px] leading-relaxed">
              <li>• <strong>100% In-Browser:</strong> Zero queries ever leave your machine.</li>
              <li>• <strong>Zero Backend:</strong> Runs on bare metal, offline, forever.</li>
              <li>• <strong>Civilization Ark:</strong> Pre-indexed essential survival knowledge.</li>
              <li>• <strong>Sub-Thermal Steganography:</strong> Search and index below noise floor.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

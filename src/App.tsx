import React, { useState, useEffect, useRef } from 'react';
import { CosmicNoiseGenerator } from './lib/cosmicNoise';
import { voidSearchEngine, SearchDocument } from './lib/searchEngine';
import { audioSonifier } from './lib/audioSonifier';
import { CosmicSourceType } from './types';

import { SearchHeader } from './components/SearchHeader';
import { SearchHome } from './components/SearchHome';
import { SearchResults } from './components/SearchResults';
import { DocumentReaderModal } from './components/DocumentReaderModal';
import { IndexDocumentModal } from './components/IndexDocumentModal';
import { TelemetryDrawer } from './components/TelemetryDrawer';
import { ProtocolSpecModal } from './components/ProtocolSpecModal';
import { CliDemoModal } from './components/CliDemoModal';

export function App() {
  // Navigation & Search State
  const [isHome, setIsHome] = useState(true);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchResults, setSearchResults] = useState<Array<{ doc: SearchDocument; score: number }>>([]);
  const [executionTimeMs, setExecutionTimeMs] = useState(0);

  // Document Reader & Modal State
  const [selectedDoc, setSelectedDoc] = useState<SearchDocument | null>(null);
  const [isIndexModalOpen, setIsIndexModalOpen] = useState(false);
  const [isSpecOpen, setIsSpecOpen] = useState(false);
  const [isCliOpen, setIsCliOpen] = useState(false);

  // Cosmic Carrier & Audio State
  const [currentSource, setCurrentSource] = useState<CosmicSourceType>('cmb');
  const cosmicGenRef = useRef<CosmicNoiseGenerator>(new CosmicNoiseGenerator());
  const [samples, setSamples] = useState<Float32Array>(() => new Float32Array(2048));
  const [audioActive, setAudioActive] = useState(false);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);

  // Execute Search
  const performSearch = (searchQuery: string, category: string = categoryFilter) => {
    const q = searchQuery.trim();
    if (!q) {
      setIsHome(true);
      return;
    }

    const { results, executionTimeMs: timeMs } = voidSearchEngine.search(q, category);
    setSearchResults(results);
    setExecutionTimeMs(timeMs);
    setIsHome(false);
  };

  // Category filter changes
  const handleSelectCategory = (cat: string) => {
    setCategoryFilter(cat);
    performSearch(query, cat);
  };

  // Cosmic Random (Feeling Lucky)
  const handleFeelingLucky = () => {
    const allDocs = voidSearchEngine.getAllDocuments();
    const randomDoc = allDocs[Math.floor(Math.random() * allDocs.length)];
    if (randomDoc) {
      setSelectedDoc(randomDoc);
    }
  };

  // Periodic ambient noise loop for live DSP
  useEffect(() => {
    const interval = setInterval(() => {
      const buffer = cosmicGenRef.current.generateBuffer(currentSource, 2048);
      setSamples(buffer);
    }, 150);
    return () => clearInterval(interval);
  }, [currentSource]);

  // Toggle WebAudio Sonifier
  const handleToggleAudio = () => {
    const active = audioSonifier.toggle(samples);
    setAudioActive(active);
  };

  // Document indexed callback
  const handleDocumentIndexed = (newDoc: SearchDocument) => {
    setSelectedDoc(newDoc);
    if (!isHome) {
      performSearch(query);
    }
  };

  return (
    <div className="min-h-screen bg-void-950 text-slate-100 flex flex-col font-mono selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Search Header */}
      <SearchHeader
        isHome={isHome}
        query={query}
        onQueryChange={setQuery}
        onSearch={(q) => performSearch(q)}
        onGoHome={() => {
          setIsHome(true);
          setQuery('');
        }}
        currentSource={currentSource}
        onSelectSource={setCurrentSource}
        audioActive={audioActive}
        onToggleAudio={handleToggleAudio}
        onOpenIndexModal={() => setIsIndexModalOpen(true)}
        onToggleTelemetry={() => setIsTelemetryOpen(!isTelemetryOpen)}
        isTelemetryOpen={isTelemetryOpen}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-between overflow-hidden">
        {isHome ? (
          <SearchHome
            query={query}
            onQueryChange={setQuery}
            onSearch={(q) => performSearch(q)}
            onFeelingLucky={handleFeelingLucky}
          />
        ) : (
          <SearchResults
            query={query}
            results={searchResults}
            executionTimeMs={executionTimeMs}
            categoryFilter={categoryFilter}
            onSelectCategory={handleSelectCategory}
            onOpenDocument={(doc) => setSelectedDoc(doc)}
            onOpenIndexModal={() => setIsIndexModalOpen(true)}
          />
        )}

        {/* Telemetry Drawer */}
        <TelemetryDrawer
          samples={samples}
          currentSource={currentSource}
          isTransmitting={false}
          snrDb={-22}
          chipsPerBit={512}
          lockStatus="LOCKED"
          correlationValues={[0.02, 0.28, -0.01, 0.04]}
          peakCorrelation={0.28}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-void-950/90 px-4 py-2 text-center text-[11px] text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            VOID-SEARCH // The Sovereign Cosmic Search Engine // 100% In-Browser // Zero Backend
          </div>
          <div className="flex items-center space-x-3 text-slate-400">
            <button onClick={() => setIsSpecOpen(true)} className="hover:text-cyan-300">
              Protocol Spec
            </button>
            <span>•</span>
            <button onClick={() => setIsCliOpen(true)} className="hover:text-emerald-300">
              CLI & SDK
            </button>
            <span>•</span>
            <span>External Packets: <strong className="text-emerald-400">0</strong></span>
          </div>
        </div>
      </footer>

      {/* Document Reader Modal */}
      <DocumentReaderModal
        document={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />

      {/* Index Document Modal */}
      <IndexDocumentModal
        isOpen={isIndexModalOpen}
        onClose={() => setIsIndexModalOpen(false)}
        onDocumentIndexed={handleDocumentIndexed}
      />

      {/* Protocol Whitepaper Modal */}
      <ProtocolSpecModal
        isOpen={isSpecOpen}
        onClose={() => setIsSpecOpen(false)}
      />

      {/* CLI Modal */}
      <CliDemoModal
        isOpen={isCliOpen}
        onClose={() => setIsCliOpen(false)}
        activeKey="e4a9f201d4c88319a0bf23847591cde4"
      />
    </div>
  );
}

export default App;

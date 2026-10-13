import React, { useState } from 'react';
import { Activity, ChevronUp, ChevronDown, Sliders } from 'lucide-react';
import { WaterfallDisplay } from './WaterfallDisplay';
import { OscilloscopeDisplay } from './OscilloscopeDisplay';
import { ConstellationDisplay } from './ConstellationDisplay';
import { CrossCorrelationDisplay } from './CrossCorrelationDisplay';
import { EntropyHistogramDisplay } from './EntropyHistogramDisplay';
import { CosmicSourceType } from '../types';

interface TelemetryDrawerProps {
  samples: Float32Array;
  currentSource: CosmicSourceType;
  isTransmitting: boolean;
  snrDb: number;
  chipsPerBit: number;
  lockStatus: string;
  correlationValues: number[];
  peakCorrelation: number;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  samples,
  currentSource,
  isTransmitting,
  snrDb,
  chipsPerBit,
  lockStatus,
  correlationValues,
  peakCorrelation
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t border-slate-800 bg-void-950/95 transition-all">
      {/* Drawer Toggle Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-1.5 px-4 flex items-center justify-between text-xs text-slate-400 hover:text-cyan-300 hover:bg-void-900/50 transition-colors border-b border-slate-800/60"
      >
        <div className="flex items-center space-x-2">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold uppercase tracking-wider font-mono text-[11px]">
            Real-Time RF & DSP Telemetry Suite (Waterfall • Oscilloscope • Constellation)
          </span>
          {isTransmitting && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-700 text-cyan-300 animate-pulse font-mono">
              TRANSMITTING @ {snrDb} dB
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1.5 text-[11px]">
          <span>{isOpen ? 'COLLAPSE' : 'EXPAND TELEMETRY'}</span>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isOpen && (
        <div className="p-4 max-w-7xl mx-auto space-y-4 max-h-[500px] overflow-y-auto">
          {/* Top row: Waterfall + Oscilloscope */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WaterfallDisplay
              samples={samples}
              sourceType={currentSource}
              isTransmitting={isTransmitting}
              snrDb={snrDb}
            />
            <OscilloscopeDisplay
              rawSamples={samples}
              chipsPerBit={chipsPerBit}
              isTransmitting={isTransmitting}
              snrDb={snrDb}
              extractedBits={[1, 0, 1, 1, 0, 1, 0, 0, 1]}
            />
          </div>

          {/* Bottom row: Constellation + Cross-Correlation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConstellationDisplay
              samples={samples}
              isTransmitting={isTransmitting}
              snrDb={snrDb}
              lockStatus={lockStatus}
            />
            <CrossCorrelationDisplay
              correlationValues={correlationValues}
              peakCorrelation={peakCorrelation}
              snrDb={snrDb}
              chipsPerBit={chipsPerBit}
              lockStatus={lockStatus}
            />
          </div>

          {/* 256-Bucket Entropy Histogram */}
          <EntropyHistogramDisplay
            samples={samples}
            isVpnEmulation={false}
          />
        </div>
      )}
    </div>
  );
};

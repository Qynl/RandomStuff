import React, { useRef, useEffect, useState } from 'react';

interface OscilloscopeDisplayProps {
  rawSamples: Float32Array;
  chipsPerBit: number;
  isTransmitting: boolean;
  snrDb: number;
  extractedBits: number[];
}

export const OscilloscopeDisplay: React.FC<OscilloscopeDisplayProps> = ({
  rawSamples,
  chipsPerBit,
  isTransmitting,
  snrDb,
  extractedBits
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [timebase, setTimebase] = useState<number>(1);
  const [gain, setGain] = useState<number>(1.2);
  const [showExtracted, setShowExtracted] = useState<boolean>(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    // Clear background
    ctx.fillStyle = '#060a17';
    ctx.fillRect(0, 0, width, height);

    // Draw phosphor oscilloscope reticle / grid
    ctx.strokeStyle = '#111e38';
    ctx.lineWidth = 1;

    // Horizontal graticule lines
    for (let y = 0; y <= height; y += height / 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical graticule lines
    for (let x = 0; x <= width; x += width / 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Center crosshairs
    ctx.strokeStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    // 1. Draw Channel 1 (Cyan): Raw Time-Domain Signal (Ambient Noise + Sub-Thermal Payload)
    ctx.beginPath();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 4;

    const sampleStep = Math.max(1, Math.floor(timebase));
    const renderLen = Math.min(rawSamples.length, Math.floor(width * sampleStep));

    for (let i = 0; i < width; i++) {
      const sampleIdx = Math.floor(i * sampleStep);
      const val = rawSamples[sampleIdx] || 0;
      const y = midY - val * 35 * gain;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. Draw Channel 2 (Emerald): Reconstructed Digital Phase Waveform (after Matched-Filtering)
    if (showExtracted && extractedBits.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 6;

      const bitPixelWidth = Math.max(12, Math.floor(width / Math.min(32, extractedBits.length)));
      const startX = 0;

      for (let b = 0; b < extractedBits.length && b * bitPixelWidth < width; b++) {
        const bit = extractedBits[b];
        const bitY = bit === 1 ? midY - 45 : midY + 45;
        const x1 = startX + b * bitPixelWidth;
        const x2 = x1 + bitPixelWidth;

        if (b === 0) {
          ctx.moveTo(x1, bitY);
        } else {
          // Digital vertical transition
          ctx.lineTo(x1, bitY);
        }
        ctx.lineTo(x2, bitY);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Readout text overlay
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('CH1 (CYAN): Raw Wire Voltage x(t) [Signal submerged @ ' + snrDb + ' dB]', 12, 18);
    if (showExtracted) {
      ctx.fillStyle = '#10b981';
      ctx.fillText('CH2 (GREEN): Coherent Matched-Filter Extracted Waveform', 12, 32);
    }
  }, [rawSamples, chipsPerBit, isTransmitting, snrDb, extractedBits, timebase, gain, showExtracted]);

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-void-950/80">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Dual-Channel Deep Phase Oscilloscope
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300">
            CH1 + CH2
          </span>
        </div>
        
        {/* Oscilloscope controls */}
        <div className="flex items-center space-x-3 text-xs">
          <label className="flex items-center space-x-1 cursor-pointer">
            <span className="text-[11px] text-slate-400">Timebase:</span>
            <input
              type="range"
              min="1"
              max="6"
              step="1"
              value={timebase}
              onChange={(e) => setTimebase(Number(e.target.value))}
              aria-label="Timebase"
              className="w-16 accent-cyan-400 cursor-pointer h-1 bg-slate-800 rounded"
            />
          </label>
          <label className="flex items-center space-x-1 cursor-pointer">
            <span className="text-[11px] text-slate-400">Gain:</span>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={gain}
              onChange={(e) => setGain(Number(e.target.value))}
              aria-label="Gain"
              className="w-16 accent-cyan-400 cursor-pointer h-1 bg-slate-800 rounded"
            />
          </label>
          <button
            onClick={() => setShowExtracted(!showExtracted)}
            className={`px-2 py-0.5 rounded text-[11px] border font-sans ${
              showExtracted ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-void-950 border-slate-800 text-slate-400'
            }`}
          >
            {showExtracted ? 'CH2: ON' : 'CH2: OFF'}
          </button>
        </div>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={640}
          height={200}
          className="w-full h-44 block bg-[#060a17]"
        />
      </div>
    </div>
  );
};

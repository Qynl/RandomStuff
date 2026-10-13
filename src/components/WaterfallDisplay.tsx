import React, { useRef, useEffect } from 'react';
import { CosmicSourceType } from '../types';
import { COSMIC_SOURCES } from '../lib/cosmicNoise';

interface WaterfallDisplayProps {
  samples: Float32Array;
  sourceType: CosmicSourceType;
  isTransmitting: boolean;
  snrDb: number;
}

export const WaterfallDisplay: React.FC<WaterfallDisplayProps> = ({
  samples,
  sourceType,
  isTransmitting,
  snrDb
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const waterfallHistoryRef = useRef<ImageData | null>(null);

  const activeSource = COSMIC_SOURCES.find(s => s.id === sourceType) || COSMIC_SOURCES[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const fftHeight = 65; // Height reserved for the top spectrum graph
    const waterfallHeight = height - fftHeight;

    const fftSize = 128;
    const magnitudes = new Float32Array(fftSize);

    const render = () => {
      // 1. Simple real FFT / Hartley approximation for visual spectrum
      const n = Math.min(samples.length, 512);
      for (let k = 0; k < fftSize; k++) {
        let real = 0;
        let imag = 0;
        const step = Math.floor(n / fftSize);
        for (let t = 0; t < n; t += step) {
          const angle = (2 * Math.PI * k * t) / n;
          const s = samples[t] || 0;
          real += s * Math.cos(angle);
          imag -= s * Math.sin(angle);
        }
        const mag = Math.sqrt(real * real + imag * imag) / Math.sqrt(n);
        // Exponential smoothing
        magnitudes[k] = magnitudes[k] * 0.7 + mag * 0.3;
      }

      // 2. Clear Spectrum area
      ctx.fillStyle = '#060a17';
      ctx.fillRect(0, 0, width, fftHeight);

      // Draw grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += width / 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, fftHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= fftHeight; y += fftHeight / 3) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 3. Draw Real-time Power Spectrum Density curve
      ctx.beginPath();
      ctx.strokeStyle = isTransmitting ? '#06b6d4' : '#64748b';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < fftSize; i++) {
        const x = (i / (fftSize - 1)) * width;
        const normVal = Math.min(1.0, magnitudes[i] / 8.0);
        const y = fftHeight - normVal * (fftHeight - 10) - 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Subtle gradient fill under curve
      const grad = ctx.createLinearGradient(0, 0, 0, fftHeight);
      grad.addColorStop(0, isTransmitting ? 'rgba(6, 182, 212, 0.25)' : 'rgba(100, 116, 139, 0.1)');
      grad.addColorStop(1, 'transparent');
      ctx.lineTo(width, fftHeight);
      ctx.lineTo(0, fftHeight);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 4. Waterfall Shift: grab previous image and copy down by 1px
      try {
        const prevData = ctx.getImageData(0, fftHeight, width, waterfallHeight - 1);
        ctx.putImageData(prevData, 0, fftHeight + 1);
      } catch {
        // canvas buffer safety
      }

      // Draw new 1-pixel row at the top of the waterfall
      const rowImage = ctx.createImageData(width, 1);
      const rowData = rowImage.data;

      for (let x = 0; x < width; x++) {
        const binIndex = Math.floor((x / width) * fftSize);
        const intensity = Math.min(1.0, magnitudes[binIndex] / 7.0);

        const idx = x * 4;
        if (sourceType === 'cmb') {
          // Deep cosmic cyan-blue gradient
          rowData[idx] = Math.floor(intensity * 12);       // R
          rowData[idx + 1] = Math.floor(intensity * 182);   // G
          rowData[idx + 2] = Math.floor(intensity * 212);   // B
        } else if (sourceType === 'pulsar_b1919') {
          // Neutron star emerald gradient
          rowData[idx] = Math.floor(intensity * 16);
          rowData[idx + 1] = Math.floor(intensity * 215);
          rowData[idx + 2] = Math.floor(intensity * 129);
        } else if (sourceType === 'solar_flux') {
          // Amber solar plasma gradient
          rowData[idx] = Math.floor(intensity * 245);
          rowData[idx + 1] = Math.floor(intensity * 158);
          rowData[idx + 2] = Math.floor(intensity * 11);
        } else {
          // Quantum violet gradient
          rowData[idx] = Math.floor(intensity * 160);
          rowData[idx + 1] = Math.floor(intensity * 92);
          rowData[idx + 2] = Math.floor(intensity * 246);
        }
        rowData[idx + 3] = 255; // Alpha
      }
      ctx.putImageData(rowImage, 0, fftHeight);

      // Draw watermark and telemetry on waterfall
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`CENTER: ${activeSource.nominalFreq}`, 10, 16);
      ctx.fillText(`BW: ${activeSource.bandwidth}`, 10, 28);
      
      if (isTransmitting) {
        ctx.fillStyle = '#06b6d4';
        ctx.fillText(`[NULL-CARRIER BURST: ${snrDb} dB SNR - SPECTRAL FLATNESS 0.99]`, width - 360, 16);
      } else {
        ctx.fillStyle = '#64748b';
        ctx.fillText(`[SUBSTRATE: QUIESCENT COSMIC BACKGROUND]`, width - 260, 16);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [samples, sourceType, isTransmitting, snrDb, activeSource]);

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-void-950/80">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            RF Spectrogram & Waterfall Analyzer
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
            FFT-128
          </span>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center space-x-3">
          <span>Resolution: <strong className="text-slate-300">30 Hz</strong></span>
          <span>Sweep: <strong className="text-cyan-400">60 FPS</strong></span>
        </div>
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          className="w-full h-48 block bg-[#060a17]"
        />
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-void-950/80 border border-slate-800 text-[10px] text-slate-400 font-mono">
          Y: Time Elapsed (↓) | X: Frequency
        </div>
      </div>
    </div>
  );
};

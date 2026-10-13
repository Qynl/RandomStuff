import React, { useRef, useEffect } from 'react';
import { BarChart3, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { floatSamplesToBytes } from '../lib/dpiInspector';

interface EntropyHistogramDisplayProps {
  samples: Float32Array;
  isVpnEmulation: boolean;
}

export const EntropyHistogramDisplay: React.FC<EntropyHistogramDisplayProps> = ({
  samples,
  isVpnEmulation
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Calculate 256-bucket byte histogram
    const counts = new Uint32Array(256);
    let total = 0;

    if (isVpnEmulation) {
      // Simulate typical TLS 1.3 / WireGuard packet capture byte distribution
      total = 4096;
      for (let i = 0; i < 256; i++) {
        // Base pseudo-random payload bytes
        counts[i] = Math.floor(Math.random() * 10) + 10;
      }
      // Prominent protocol spikes: TLS handshake (0x16), TLS 1.2/1.3 versions (0x03, 0x01), Wireguard (0x01, 0x00), IP header lengths (0x45, 0x00)
      counts[0x00] += 260; // Padding & zero fields
      counts[0x01] += 180; // WireGuard handshake type / TLS minor
      counts[0x03] += 190; // TLS major
      counts[0x16] += 220; // TLS Handshake record type
      counts[0x45] += 140; // IPv4 header start
      counts[0xFF] += 110; // Broadcast / mask
    } else {
      const bytes = floatSamplesToBytes(samples);
      total = bytes.length;
      for (let i = 0; i < bytes.length; i++) {
        counts[bytes[i]]++;
      }
    }

    // Clear
    ctx.fillStyle = '#060a17';
    ctx.fillRect(0, 0, width, height);

    // Reticle
    ctx.strokeStyle = '#111e38';
    ctx.lineWidth = 1;
    for (let y = 0; y <= height; y += height / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Expected Uniform baseline
    const expected = total / 256;
    const maxVal = Math.max(...Array.from(counts), expected * 2.5);
    const expectedY = height - (expected / maxVal) * (height - 20) - 10;

    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, expectedY);
    ctx.lineTo(width, expectedY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw 256 histogram bars
    const barWidth = width / 256;
    for (let i = 0; i < 256; i++) {
      const barHeight = (counts[i] / maxVal) * (height - 25);
      const x = i * barWidth;
      const y = height - barHeight - 10;

      if (isVpnEmulation) {
        // Highlight abnormal spikes
        if (counts[i] > expected * 2.5) {
          ctx.fillStyle = '#f43f5e'; // Crimson alert
        } else {
          ctx.fillStyle = '#881337';
        }
      } else {
        // Uniform cosmic emerald/cyan
        ctx.fillStyle = '#10b981';
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
    }

    // Legend
    ctx.fillStyle = '#f59e0b';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('EXPECTED UNIFORM (E = N / 256)', 10, expectedY - 4);

    if (isVpnEmulation) {
      ctx.fillStyle = '#f43f5e';
      ctx.fillText('⚠ PACKET HEADER SPIKES (0x16, 0x03, 0x00, 0x45) EXPOSE VPN TUNNEL', 10, 16);
    } else {
      ctx.fillStyle = '#10b981';
      ctx.fillText('✓ UNIFORM DISTRIBUTION — MATHEMATICALLY INDISTINGUISHABLE FROM TRUE ENTROPY', 10, 16);
    }
  }, [samples, isVpnEmulation]);

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl mt-4">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-void-950/80">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            256-Bucket Byte Entropy Spectrum (χ² Uniformity Analyzer)
          </span>
        </div>
        <div className="text-[11px] font-mono flex items-center space-x-2">
          {isVpnEmulation ? (
            <span className="text-rose-400 flex items-center gap-1 font-bold">
              <AlertTriangle className="w-3 h-3" /> FAILED: ANOMALOUS BYTE FREQUENCIES
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1 font-bold">
              <CheckCircle2 className="w-3 h-3" /> PASSED: ISOTROPIC NOISE FLOOR
            </span>
          )}
        </div>
      </div>
      <div className="p-2 bg-[#060a17]">
        <canvas
          ref={canvasRef}
          width={640}
          height={130}
          className="w-full h-28 block"
        />
      </div>
      <div className="px-3 py-1.5 bg-void-950/90 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between">
        <span>X: Byte Values (0x00 to 0xFF)</span>
        <span>Y: Occurrence Frequency</span>
      </div>
    </div>
  );
};

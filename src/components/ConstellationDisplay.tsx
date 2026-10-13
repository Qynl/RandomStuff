import React, { useRef, useEffect } from 'react';

interface ConstellationDisplayProps {
  samples: Float32Array;
  isTransmitting: boolean;
  snrDb: number;
  lockStatus: string;
}

export const ConstellationDisplay: React.FC<ConstellationDisplayProps> = ({
  samples,
  isTransmitting,
  snrDb,
  lockStatus
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.42;

    // Background
    ctx.fillStyle = '#060a17';
    ctx.fillRect(0, 0, width, height);

    // Coordinate grid & Unit circles
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Circles
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Cross axes
    ctx.beginPath();
    ctx.moveTo(centerX - radius - 15, centerY);
    ctx.lineTo(centerX + radius + 15, centerY);
    ctx.moveTo(centerX, centerY - radius - 15);
    ctx.lineTo(centerX, centerY + radius + 15);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('+Q (Quadrature)', centerX + 6, centerY - radius - 6);
    ctx.fillText('+I (In-Phase)', centerX + radius - 30, centerY - 6);

    // Plot raw cloud points (Eavesdropper view: pure thermal Gaussian cloud)
    const pointsCount = Math.min(300, Math.floor(samples.length / 2));
    ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';

    for (let i = 0; i < pointsCount; i++) {
      const iVal = samples[i * 2] || 0;
      const qVal = samples[i * 2 + 1] || 0;
      const x = centerX + iVal * (radius * 0.45);
      const y = centerY - qVal * (radius * 0.45);

      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // If locked and transmitting, draw Bob's matched-filter decoded constellation centroids
    if (lockStatus === 'LOCKED') {
      // BPSK Constellation nodes at (-1, 0) and (+1, 0)
      const targetI = radius * 0.75;
      
      // Node 0
      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(centerX - targetI, centerY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Node 1
      ctx.beginPath();
      ctx.arc(centerX + targetI, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Concentric lock rings
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
      ctx.beginPath();
      ctx.arc(centerX - targetI, centerY, 12, 0, Math.PI * 2);
      ctx.arc(centerX + targetI, centerY, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [samples, isTransmitting, snrDb, lockStatus]);

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-void-950/80">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
          I/Q Phase Constellation
        </span>
        <span className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${
          lockStatus === 'LOCKED' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-void-950 text-slate-400 border-slate-800'
        }`}>
          {lockStatus === 'LOCKED' ? 'BPSK CONVERGED' : 'ISOTROPIC GAUSSIAN'}
        </span>
      </div>
      <div className="p-2 flex items-center justify-center bg-[#060a17]">
        <canvas
          ref={canvasRef}
          width={240}
          height={200}
          className="w-full h-44 block"
        />
      </div>
      <div className="px-3 py-1.5 bg-void-950/90 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between">
        <span>Cloud: <strong className="text-cyan-400">Gaussian σ=1.0</strong></span>
        <span>EVM: <strong className="text-emerald-400">{lockStatus === 'LOCKED' ? '4.2%' : '88.9%'}</strong></span>
      </div>
    </div>
  );
};

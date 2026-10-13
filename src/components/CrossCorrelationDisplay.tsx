import React, { useRef, useEffect } from 'react';

interface CrossCorrelationDisplayProps {
  correlationValues: number[];
  peakCorrelation: number;
  snrDb: number;
  chipsPerBit: number;
  lockStatus: string;
}

export const CrossCorrelationDisplay: React.FC<CrossCorrelationDisplayProps> = ({
  correlationValues,
  peakCorrelation,
  snrDb,
  chipsPerBit,
  lockStatus
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const processingGain = Number((10 * Math.log10(chipsPerBit)).toFixed(1));
  const postSnr = Number((snrDb + processingGain).toFixed(1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    // Background
    ctx.fillStyle = '#060a17';
    ctx.fillRect(0, 0, width, height);

    // Reticle
    ctx.strokeStyle = '#111e38';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Detection Threshold Line (+0.15)
    const threshY = midY - 0.15 * (midY - 10);
    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(width, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f59e0b';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('DETECTION THRESHOLD (+0.15)', 10, threshY - 4);

    // Plot Correlation trace R_xy(tau)
    if (correlationValues.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = lockStatus === 'LOCKED' ? '#10b981' : '#06b6d4';
      ctx.lineWidth = 1.6;

      const n = correlationValues.length;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * width;
        const val = correlationValues[i];
        const y = midY - val * (midY - 15);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Highlight the peak
      if (peakCorrelation > 0.15 && lockStatus === 'LOCKED') {
        const maxIdx = correlationValues.indexOf(peakCorrelation);
        if (maxIdx >= 0) {
          const peakX = (maxIdx / (n - 1)) * width;
          const peakY = midY - peakCorrelation * (midY - 15);

          ctx.fillStyle = '#10b981';
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(peakX, peakY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.fillStyle = '#10b981';
          ctx.fillText(`PEAK LOCK: R(τ)=${peakCorrelation.toFixed(3)}`, peakX + 8, peakY + 3);
        }
      }
    }
  }, [correlationValues, peakCorrelation, lockStatus]);

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-void-950/80">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
          Coherent Cross-Correlation R_xy(τ)
        </span>
        <div className="flex items-center space-x-2 text-[10px]">
          <span className="text-slate-400">Gain (Gp):</span>
          <span className="text-emerald-400 font-bold">+{processingGain} dB</span>
        </div>
      </div>
      <div className="p-2 flex items-center justify-center bg-[#060a17]">
        <canvas
          ref={canvasRef}
          width={280}
          height={200}
          className="w-full h-44 block"
        />
      </div>
      <div className="px-3 py-1.5 bg-void-950/90 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between">
        <span>Raw SNR: <strong className="text-rose-400">{snrDb} dB</strong></span>
        <span>Post-Gain SNR: <strong className={postSnr > 0 ? 'text-emerald-400' : 'text-amber-400'}>{postSnr > 0 ? `+${postSnr}` : postSnr} dB</strong></span>
      </div>
    </div>
  );
};

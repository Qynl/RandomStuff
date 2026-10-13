import React, { useRef, useEffect } from 'react';
import { Globe, Radio, Shield, Satellite } from 'lucide-react';

interface SwarmMapProps {
  isTransmitting: boolean;
  lockStatus: string;
}

export const SwarmMap: React.FC<SwarmMapProps> = ({ isTransmitting, lockStatus }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const width = canvas.width;
    const height = canvas.height;

    // Node coordinates on canvas
    const nodes = [
      { name: 'PULSAR BEACON (PSR B1919+21)', x: width * 0.5, y: 35, type: 'cosmic', color: '#06b6d4' },
      { name: 'ORBITAL RELAY SAT-01', x: width * 0.28, y: 85, type: 'satellite', color: '#10b981' },
      { name: 'IONOSPHERIC SCATTER VLF', x: width * 0.72, y: 85, type: 'satellite', color: '#10b981' },
      { name: 'STATION ALPHA (ALICE)', x: width * 0.2, y: 155, type: 'ground', color: '#06b6d4' },
      { name: 'STATE INTERCEPT CABLE (NSA)', x: width * 0.5, y: 155, type: 'eavesdropper', color: '#f43f5e' },
      { name: 'STATION OMEGA (BOB)', x: width * 0.8, y: 155, type: 'ground', color: '#10b981' }
    ];

    const particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }> = [];

    const render = () => {
      t += 0.03;
      ctx.fillStyle = '#060a17';
      ctx.fillRect(0, 0, width, height);

      // Starfield background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 123 + 45) % width;
        const sy = (i * 97 + 12) % height;
        ctx.fillRect(sx, sy, 1, 1);
      }

      // Earth curve line at bottom
      ctx.beginPath();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.ellipse(width * 0.5, height + 120, width * 0.65, 170, 0, Math.PI, 0);
      ctx.stroke();

      // Atmospheric glow arc
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.lineWidth = 4;
      ctx.ellipse(width * 0.5, height + 120, width * 0.68, 178, 0, Math.PI, 0);
      ctx.stroke();

      // Draw links between nodes
      ctx.lineWidth = 1;
      const links = [
        [0, 1], [0, 2], [1, 3], [2, 5], [3, 4], [4, 5]
      ];

      for (let [fromIdx, toIdx] of links) {
        const fromNode = nodes[fromIdx];
        const toNode = nodes[toIdx];

        ctx.beginPath();
        if (fromIdx === 3 && toIdx === 4) {
          // Link through adversary
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)';
          ctx.setLineDash([3, 3]);
        } else {
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
          ctx.setLineDash([]);
        }
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Spawn ambient entropy particles
      if (Math.random() < 0.4) {
        const link = links[Math.floor(Math.random() * links.length)];
        const fromNode = nodes[link[0]];
        const toNode = nodes[link[1]];
        particles.push({
          x: fromNode.x,
          y: fromNode.y,
          vx: (toNode.x - fromNode.x) / 40,
          vy: (toNode.y - fromNode.y) / 40,
          life: 0,
          maxLife: 40,
          color: isTransmitting ? '#06b6d4' : '#64748b'
        });
      }

      // Update & render particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        const alpha = 1.0 - p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, isTransmitting ? 2 : 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        }
      }

      // Render Nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Outer glow pulse
        const pulseR = 8 + Math.sin(t * 2 + i) * 3;
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        // Node center
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Node label
        ctx.fillStyle = '#94a3b8';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(node.name, node.x, node.y + 16);
      }

      // Overlay text
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('TOPOLOGY: Atmospheric & Deep Space Sub-Layer Mesh', 10, 16);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isTransmitting, lockStatus]);

  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-void-950/80">
        <div className="flex items-center space-x-2">
          <Globe className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Planetary Cosmic Entropy Mesh
          </span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono flex items-center space-x-2">
          <span>Relay: <strong className="text-emerald-400">Zero-Hop Steganography</strong></span>
          <span>Mesh Status: <strong className="text-cyan-400">Synchronized</strong></span>
        </div>
      </div>
      <div className="p-2 bg-[#060a17]">
        <canvas
          ref={canvasRef}
          width={640}
          height={180}
          className="w-full h-40 block"
        />
      </div>
    </div>
  );
};

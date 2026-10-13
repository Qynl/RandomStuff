import React, { useState } from 'react';
import { Eye, ShieldAlert, ShieldCheck, AlertCircle, FileSearch, CheckCircle } from 'lucide-react';
import { DpiAnalysisResult } from '../types';

interface DpiSurveillancePanelProps {
  dpiResult: DpiAnalysisResult;
  isVpnEmulation: boolean;
  onToggleVpnEmulation: (enable: boolean) => void;
  isTransmitting: boolean;
  snrDb: number;
}

export const DpiSurveillancePanel: React.FC<DpiSurveillancePanelProps> = ({
  dpiResult,
  isVpnEmulation,
  onToggleVpnEmulation,
  isTransmitting,
  snrDb
}) => {
  return (
    <div className="bg-void-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800/80 pb-3 mb-4 gap-2">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2">
            <Eye className="w-4 h-4 text-rose-400" />
            <span>Adversary Deep Packet Inspector (DPI Wiretap Engine)</span>
          </h2>
        </div>

        {/* Wiretap Source Switcher */}
        <div className="flex items-center bg-void-950 p-1 rounded-lg border border-slate-800 text-xs">
          <span className="text-slate-400 text-[10px] px-2 font-sans font-medium">Intercept Target:</span>
          <button
            onClick={() => onToggleVpnEmulation(false)}
            className={`px-2.5 py-1 rounded text-[11px] font-sans transition-all ${
              !isVpnEmulation
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700 font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            VOID-STREAM (Null-Packets)
          </button>
          <button
            onClick={() => onToggleVpnEmulation(true)}
            className={`px-2.5 py-1 rounded text-[11px] font-sans transition-all ${
              isVpnEmulation
                ? 'bg-rose-950 text-rose-300 border border-rose-700 font-bold shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Standard VPN / TLS / Tor
          </button>
        </div>
      </div>

      {/* Target Description */}
      <div className="mb-4 text-xs text-slate-300 bg-void-950/70 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-slate-400">Target Line: </span>
          <strong className="text-slate-100">{dpiResult.sourceType}</strong>
        </div>
        {isTransmitting && !isVpnEmulation && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
            Active payload buried at {snrDb} dB SNR
          </span>
        )}
      </div>

      {/* Surveillance Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {/* Metric 1: Shannon Entropy */}
        <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-sans">Shannon Entropy</div>
          <div className="text-base font-mono font-bold text-slate-100 mt-0.5 flex items-baseline gap-1">
            <span>{dpiResult.shannonEntropy}</span>
            <span className="text-[10px] text-slate-500 font-normal">/ 8.000 bits</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {dpiResult.shannonEntropy > 7.95 ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Ideal Noise
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Packet Structure
              </span>
            )}
          </div>
        </div>

        {/* Metric 2: Chi-Square P-Value */}
        <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-sans">Chi-Square Test (χ²)</div>
          <div className="text-base font-mono font-bold text-slate-100 mt-0.5 flex items-baseline gap-1">
            <span>p = {dpiResult.chiSquarePValue}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {dpiResult.chiSquarePValue > 0.05 ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Uniform Distribution
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Non-Random (p &lt; 0.05)
              </span>
            )}
          </div>
        </div>

        {/* Metric 3: Autocorrelation */}
        <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-sans">Peak Autocorrelation</div>
          <div className="text-base font-mono font-bold text-slate-100 mt-0.5 flex items-baseline gap-1">
            <span>{dpiResult.autocorrelationMax}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {dpiResult.autocorrelationMax < 0.1 ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Zero Clock / Periodic
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Frame Clock Exposed
              </span>
            )}
          </div>
        </div>

        {/* Metric 4: Packet Slices Found */}
        <div className="bg-void-950 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase font-sans">Packet Boundaries</div>
          <div className="text-base font-mono font-bold text-slate-100 mt-0.5 flex items-baseline gap-1">
            <span className={dpiResult.packetBoundariesFound === 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {dpiResult.packetBoundariesFound}
            </span>
            <span className="text-[10px] text-slate-500 font-normal">headers found</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {dpiResult.packetBoundariesFound === 0 ? (
              <span className="text-emerald-400">Zero packet framing</span>
            ) : (
              <span className="text-rose-400">MTU Framing Detected</span>
            )}
          </div>
        </div>
      </div>

      {/* Adversary Final Verdict Banner */}
      <div className={`p-3 rounded-lg border flex flex-col md:flex-row items-center justify-between gap-3 ${
        dpiResult.verdict === 'PACKET_INTERCEPTED'
          ? 'bg-rose-950/40 border-rose-600 text-rose-200'
          : 'bg-emerald-950/30 border-emerald-600/60 text-emerald-200'
      }`}>
        <div className="flex items-center space-x-3">
          {dpiResult.verdict === 'PACKET_INTERCEPTED' ? (
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
          ) : (
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
          )}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider">
              {dpiResult.verdict === 'PACKET_INTERCEPTED'
                ? 'STATE SURVEILLANCE VERDICT: HIGH-CONFIDENCE INTERCEPTION'
                : 'STATE SURVEILLANCE VERDICT: 0.00% SUSPICION - NO TRAFFIC DETECTED'}
            </div>
            <div className="text-[11px] opacity-80 mt-0.5">
              Wire classification: <strong>{dpiResult.classifiedAs}</strong>
            </div>
          </div>
        </div>

        {/* Suspicion Index Gauge */}
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <div className="text-[10px] uppercase opacity-75 font-sans">Suspicion Index</div>
            <div className={`text-base font-mono font-bold ${
              dpiResult.suspicionScore > 50 ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {dpiResult.suspicionScore}%
            </div>
          </div>
          <div className="w-24 bg-void-950 rounded-full h-3 border border-slate-700 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                dpiResult.suspicionScore > 50 ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(3, dpiResult.suspicionScore))}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Fingerprints list if standard VPN */}
      {dpiResult.headerFingerprints.length > 0 && (
        <div className="mt-3 bg-rose-950/20 border border-rose-900/60 p-2.5 rounded-lg text-xs">
          <div className="font-semibold text-rose-300 text-[11px] mb-1 flex items-center gap-1.5">
            <FileSearch className="w-3.5 h-3.5" />
            Signatures Exposed by Standard VPN / Tor on the Wire:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[10px] text-rose-200/80 font-mono">
            {dpiResult.headerFingerprints.map((f, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="text-rose-500">⚠</span> {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

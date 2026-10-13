import React from 'react';
import { X, BookOpen, ShieldCheck, Cpu, Terminal, Key } from 'lucide-react';

interface ProtocolSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProtocolSpecModal: React.FC<ProtocolSpecModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-void-900 border border-cyan-800/80 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-void-950/80">
          <div className="flex items-center space-x-3">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
                VOID-STREAM PROTOCOL SPECIFICATION // RFC-0xVOID
              </h2>
              <p className="text-[11px] text-slate-400 font-sans">
                Theoretical Physics, Mathematical Steganography & Null-Packet Networking
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300 font-sans leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold font-mono text-cyan-400 flex items-center gap-2">
              <span className="text-slate-500">§ 1.0</span> The Fatal Achilles' Heel of the Modern Internet
            </h3>
            <p>
              Since DARPA laid down ARPANET in 1969, every protocol on the internet (IP, TCP, UDP, WireGuard, TLS 1.3, Tor) makes a foundational assumption:
              <strong className="text-slate-100"> communication requires transmitting packets with discrete boundaries, MTU blocks, and routing headers.</strong>
            </p>
            <p>
              Even when a packet's payload is encrypted with 256-bit AES or ChaCha20, its <em>envelope</em> is fully visible: packet length, arrival microsecond, burst cadence, and handshake flags.
              Adversaries (national intelligence agencies, Great Firewalls, corporate telecoms) do not need to crack the cipher; they simply run traffic flow analysis and correlation attacks to identify and block connections instantly.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold font-mono text-cyan-400 flex items-center gap-2">
              <span className="text-slate-500">§ 2.0</span> The Void-Carrier Architecture
            </h3>
            <p>
              VOID-STREAM inverts this model. Instead of sending packets, nodes tap into an ambient public source of high-entropy noise:
              the <strong>Cosmic Microwave Background (2.725K)</strong>, <strong>astrophysical pulsar timing beacons (e.g. PSR B1919+21)</strong>, or atmospheric VLF static.
            </p>
            <p>
              Communication occurs not by injecting distinct packets, but by introducing <strong>imperceptible sub-thermal phase jitters</strong> into the ambient entropy field:
            </p>
            <div className="bg-void-950 p-3 rounded-lg border border-slate-800 font-mono text-cyan-300 text-center">
              x(t) = n(t) + α · c(t), &nbsp;&nbsp; where α &lt;&lt; σ_noise &nbsp; (SNR &lt; -24 dB)
            </div>
            <p>
              To any spectrum analyzer, oscilloscope, or deep packet inspector, the wire voltage <code className="text-cyan-300">x(t)</code> has a Gaussian distribution and Shannon entropy (<code className="text-emerald-400">H = 7.9999 bits/byte</code>) mathematically indistinguishable from Johnson-Nyquist thermal resistor noise.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold font-mono text-cyan-400 flex items-center gap-2">
              <span className="text-slate-500">§ 3.0</span> Mathematical Foundation: Negative-SNR Shannon Capacity
            </h3>
            <p>
              According to the Shannon-Hartley Theorem, the channel capacity in the presence of additive white Gaussian noise is:
            </p>
            <div className="bg-void-950 p-3 rounded-lg border border-slate-800 font-mono text-cyan-300 text-center">
              C = B · log₂(1 + S/N) ≈ 1.4427 · B · (S/N) &nbsp; [for S/N &lt;&lt; 1]
            </div>
            <p>
              Even when Signal-to-Noise Ratio (S/N) is -24 dB (where signal power is only 0.398% of the noise power), channel capacity <code className="text-cyan-300">C &gt; 0</code> remains mathematically positive.
              By applying a Spreading Factor <code className="text-emerald-400">N = 512</code> or <code className="text-emerald-400">1024 chips/bit</code>, Bob's coherent matched-filter cross-correlator achieves a processing gain:
            </p>
            <div className="bg-void-950 p-3 rounded-lg border border-slate-800 font-mono text-emerald-300 text-center">
              G_p = 10 · log₁₀(N) = +30.1 dB
            </div>
            <p>
              This lifts the effective post-correlation SNR from <code className="text-rose-400">-24 dB</code> up to <code className="text-emerald-400">+6.1 dB</code>, allowing error-free reconstruction without exposing any detectable energy on the physical channel.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold font-mono text-cyan-400 flex items-center gap-2">
              <span className="text-slate-500">§ 4.0</span> Why It Defies the Internet
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li><strong>Zero Routing Headers:</strong> No IP addresses, no port numbers, no MAC addresses, no DNS lookups.</li>
              <li><strong>Zero Packet Demarcations:</strong> No TCP segment flags, no UDP length fields, no MTU chunking.</li>
              <li><strong>Immunity to Deep Packet Inspection:</strong> Chi-square p-values remain uniform (&gt;0.05), and Kolmogorov complexity matches true cosmic randomness.</li>
              <li><strong>Air-Gap & Sub-Layer Transport:</strong> Operates over fiber taps, radio static, audio ultrasonic emissions, or optical screen-flickers.</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-void-950/80 flex justify-between items-center text-xs text-slate-400">
          <span>VOID-STREAM Engineering Group (VSEG)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-300 hover:bg-cyan-900 transition-colors font-mono"
          >
            Close Spec
          </button>
        </div>
      </div>
    </div>
  );
};

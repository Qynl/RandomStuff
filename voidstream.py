#!/usr/bin/env python3
"""
VOID-STREAM Python Reference Implementation & SDK
The Null-Packet Steganographic Cosmic Network Transceiver
"""

import math
import random
import struct
import sys

SYNC_PREAMBLE = [1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1]

class PseudoNoiseGenerator:
    """Deterministic XorShift PRNG for spreading code generation."""
    def __init__(self, seed):
        if isinstance(seed, str):
            h = 0
            for ch in seed:
                h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
            self.state = h
        else:
            self.state = int(seed) & 0xFFFFFFFF
        if self.state == 0:
            self.state = 0xDEADBEEF

    def next_chip(self) -> int:
        x = self.state
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= (x >> 17) & 0xFFFFFFFF
        x ^= (x << 5) & 0xFFFFFFFF
        self.state = x
        return 1 if (self.state / 4294967296.0) > 0.5 else -1


def generate_gaussian_noise(length: int, std: float = 1.0):
    """Generates standard normal Gaussian white noise via Box-Muller transform."""
    buf = []
    for _ in range(0, length, 2):
        u1 = random.random()
        u2 = random.random()
        while u1 <= 1e-15:
            u1 = random.random()
        r = math.sqrt(-2.0 * math.log(u1)) * std
        theta = 2.0 * math.pi * u2
        buf.append(r * math.cos(theta))
        if len(buf) < length:
            buf.append(r * math.sin(theta))
    return buf[:length]


class VoidTransceiver:
    """High-level transceiver for modulating and demodulating void streams."""
    def __init__(self, key: str, chips_per_bit: int = 512, snr_db: float = -18.0):
        self.key = key
        self.chips_per_bit = chips_per_bit
        self.snr_db = snr_db

    def modulate(self, message: str) -> list:
        """Modulates text payload into a continuous white noise stream."""
        raw_bytes = message.encode('utf-8')
        payload_bits = []
        for b in raw_bytes:
            for bit_idx in range(7, -1, -1):
                payload_bits.append((b >> bit_idx) & 1)

        length_bits = []
        length = len(payload_bits)
        for bit_idx in range(15, -1, -1):
            length_bits.append((length >> bit_idx) & 1)

        full_bits = SYNC_PREAMBLE + length_bits + payload_bits
        total_chips = len(full_bits) * self.chips_per_bit
        stream = generate_gaussian_noise(total_chips + 1000, 1.0)

        prn = PseudoNoiseGenerator(self.key)
        linear_snr = math.pow(10, self.snr_db / 10.0)
        amplitude = math.sqrt(linear_snr)

        offset = 200
        for b_idx, bit in enumerate(full_bits):
            bit_val = 1 if bit == 1 else -1
            for c_idx in range(self.chips_per_bit):
                chip = prn.next_chip()
                stream[offset + b_idx * self.chips_per_bit + c_idx] += bit_val * chip * amplitude

        return stream

    def demodulate(self, stream: list) -> str:
        """Coherent matched-filter demodulation from noisy stream."""
        sync_chips = len(SYNC_PREAMBLE) * self.chips_per_bit
        ref_prn = PseudoNoiseGenerator(self.key)
        ref_chips = []
        for bit in SYNC_PREAMBLE:
            bit_val = 1 if bit == 1 else -1
            for _ in range(self.chips_per_bit):
                ref_chips.append(bit_val * ref_prn.next_chip())

        # Cross-correlation sweep
        best_offset = 0
        max_corr = -1.0
        test_limit = min(800, len(stream) - sync_chips)

        for off in range(test_limit + 1):
            s = 0.0
            for i in range(sync_chips):
                s += stream[off + i] * ref_chips[i]
            corr = s / sync_chips
            if corr > max_corr:
                max_corr = corr
                best_offset = off

        if max_corr < 0.04:
            raise ValueError(f"No coherent phase lock found (R_peak = {max_corr:.4f}). Check key or SNR.")

        # Demodulate length header
        rx_prn = PseudoNoiseGenerator(self.key)
        for _ in range(sync_chips):
            rx_prn.next_chip()

        cur_offset = best_offset + sync_chips
        length = 0
        for _ in range(16):
            s = 0.0
            for _ in range(self.chips_per_bit):
                s += stream[cur_offset] * rx_prn.next_chip()
                cur_offset += 1
            bit = 1 if s > 0 else 0
            length = (length << 1) | bit

        if length <= 0 or length > 8192:
            raise ValueError("Corrupt frame length header decoded.")

        # Demodulate payload
        payload_bits = []
        for _ in range(length):
            s = 0.0
            for _ in range(self.chips_per_bit):
                s += stream[cur_offset] * rx_prn.next_chip()
                cur_offset += 1
            payload_bits.append(1 if s > 0 else 0)

        byte_vals = []
        for i in range(0, len(payload_bits), 8):
            val = 0
            for bit in payload_bits[i:i+8]:
                val = (val << 1) | bit
            byte_vals.append(val)

        return bytes(byte_vals).decode('utf-8', errors='ignore')


if __name__ == '__main__':
    print("🌌 VOID-STREAM Python SDK Verification")
    tx = VoidTransceiver(key="cosmic_secret_42", chips_per_bit=512, snr_db=-18.0)
    msg = "CIVILIZATION_SEED_EXTINCTION_PROOF_42"
    print(f"[TX] Injecting '{msg}' at SNR = {tx.snr_db} dB...")
    stream = tx.modulate(msg)
    print(f"[TX] Modulated stream length: {len(stream)} samples")

    rx = VoidTransceiver(key="cosmic_secret_42", chips_per_bit=512)
    recovered = rx.demodulate(stream)
    print(f"[RX] Recovered Plaintext: '{recovered}'")
    assert recovered == msg, f"Expected {msg}, got {recovered}"
    print("🎉 SUCCESS: 100% Python DSP Matched Filter Bit Integrity Verified!")

#!/usr/bin/env python3
"""
Decode VBUS payload for Resol BS 2 (source 0x4278).
Use to verify Collector and Boiler byte positions and formulas.
Input: optional hex string or use built-in sample payload from log.
"""

# Sample payload from log (bytes at buffer positions 9..49, i.e. payload indices 0..40)
SAMPLE_PAYLOAD = bytes([
    0x1D, 0x50, 0x7F, 0x00, 0x00, 0x07, 0x29, 0x38,
    0x22, 0x38, 0x22, 0x05, 0x46, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x7F, 0x5F, 0x14, 0x00, 0x00, 0x01,
    0x0B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7F, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x7E, 0x64, 0x00, 0x00, 0x00,
])

# Expected display values for this sample (for matching)
EXPECTED_COLLECTOR = -4.8
EXPECTED_BOILER = 12.8


def decode_collector(payload: bytes, offset_adj: float = 33.9) -> float:
    """Collector: payload[0] - offset_adj."""
    if len(payload) < 1:
        return float("nan")
    return payload[0] - offset_adj


def decode_boiler_byte_div10(payload: bytes, offset: int, byte_offset: int = 0) -> float:
    """Boiler: (payload[offset] + byte_offset) / 10.0."""
    if offset < 0 or offset >= len(payload):
        return float("nan")
    return (payload[offset] + byte_offset) / 10.0


def decode_byte_div2(payload: bytes, offset: int) -> float:
    """Temperature as byte/2 (e.g. 0x19 -> 12.5)."""
    if offset < 0 or offset >= len(payload):
        return float("nan")
    return payload[offset] / 2.0


def decode_byte_div2_minus40(payload: bytes, offset: int) -> float:
    """Temperature as (byte/2) - 40."""
    if offset < 0 or offset >= len(payload):
        return float("nan")
    return (payload[offset] / 2.0) - 40.0


def decode_two_bytes_le_01(payload: bytes, offset: int) -> float:
    """Two bytes little-endian * 0.1 (e.g. 0x80 0x00 -> 12.8)."""
    if offset + 1 >= len(payload):
        return float("nan")
    raw = payload[offset] | (payload[offset + 1] << 8)
    return raw * 0.1


def main():
    import sys
    if len(sys.argv) > 1:
        hex_str = "".join(sys.argv[1:]).replace(" ", "")
        try:
            payload = bytes.fromhex(hex_str)
        except ValueError:
            print("Invalid hex. Using built-in sample payload.")
            payload = SAMPLE_PAYLOAD
    else:
        payload = SAMPLE_PAYLOAD
        print("Using built-in sample payload (from log).")
    print(f"Payload length: {len(payload)} bytes")
    print()

    # Collector
    for adj in (33.9, 33.8):
        c = decode_collector(payload, adj)
        print(f"Collector (payload[0] - {adj}): {c:.1f} °C  (expected ~{EXPECTED_COLLECTOR})")
    print()

    # Boiler: which offset + formula gives ~12.8?
    print("Boiler candidates (single byte / 10):")
    for i in range(len(payload)):
        t = decode_boiler_byte_div10(payload, i)
        if 0 <= t <= 150 and abs(t - EXPECTED_BOILER) < 2.0:
            print(f"  payload[{i}] = 0x{payload[i]:02X} -> {t:.1f} °C")
    print()

    # Boiler with byte offset: (payload[36] + k) / 10 to hit exactly 12.8 (0x7E=126 -> 126+2=128 -> 12.8)
    print("Boiler payload[36] with byte_offset (byte + k) / 10:")
    idx = 36
    if idx < len(payload):
        b = payload[idx]
        for k in range(-5, 6):
            t = (b + k) / 10.0
            match = " <-- 12.8" if abs(t - EXPECTED_BOILER) < 0.01 else ""
            print(f"  (0x{b:02X} + {k:+d}) / 10 = {t:.1f} °C{match}")
    print()

    print("Boiler candidates (byte/2):")
    for i in range(len(payload)):
        t = decode_byte_div2(payload, i)
        if 0 <= t <= 150 and abs(t - EXPECTED_BOILER) < 2.0:
            print(f"  payload[{i}] = 0x{payload[i]:02X} -> {t:.1f} °C")
    print()

    print("Boiler candidates (two bytes LE * 0.1):")
    for i in range(len(payload) - 1):
        t = decode_two_bytes_le_01(payload, i)
        if 0 <= t <= 150 and abs(t - EXPECTED_BOILER) < 2.0:
            print(f"  payload[{i},{i+1}] -> {t:.1f} °C")
    print()

    # Summary
    c = decode_collector(payload, 33.9)
    b_raw = decode_boiler_byte_div10(payload, 36, 0)
    b_adj = decode_boiler_byte_div10(payload, 36, 2)
    print(f"Recommended: Collector = payload[0] - 33.9 = {c:.1f} °C")
    print(f"Recommended: Boiler    = (payload[36] + 2) / 10 = {b_adj:.1f} °C  (buf[s+45] in config, byte_offset=2 for display 12.8)")


if __name__ == "__main__":
    main()

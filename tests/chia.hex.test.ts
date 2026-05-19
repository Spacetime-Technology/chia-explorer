import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes, isHex32, stripHexPrefix } from '../src/chia/hex.js';

describe('hex utilities', () => {
  it('strips 0x prefix', () => {
    expect(stripHexPrefix('0xabcd')).toBe('abcd');
    expect(stripHexPrefix('abcd')).toBe('abcd');
  });

  it('round-trips bytes <-> hex', () => {
    const hex = '00deadbeef';
    expect(bytesToHex(hexToBytes(hex))).toBe(hex);
  });

  it('rejects odd-length hex', () => {
    expect(() => hexToBytes('abc')).toThrow();
  });

  it('rejects non-hex characters', () => {
    expect(() => hexToBytes('zz')).toThrow();
  });

  it('isHex32 checks 32-byte hex (with optional 0x)', () => {
    const ph = 'a'.repeat(64);
    expect(isHex32(ph)).toBe(true);
    expect(isHex32('0x' + ph)).toBe(true);
    expect(isHex32(ph.slice(1))).toBe(false);
    expect(isHex32('z'.repeat(64))).toBe(false);
  });
});

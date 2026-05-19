import { describe, expect, it } from 'vitest';
import { MOJOS_PER_XCH, formatNetspace, mojoToXch } from '../src/chia/amounts.js';

describe('mojoToXch', () => {
  it('returns "0" for zero', () => {
    expect(mojoToXch(0n)).toBe('0');
  });

  it('formats exactly 1 XCH', () => {
    expect(mojoToXch(MOJOS_PER_XCH)).toBe('1');
  });

  it('formats fractional XCH and trims trailing zeros', () => {
    expect(mojoToXch(1_500_000_000_000n)).toBe('1.5');
    expect(mojoToXch(1n)).toBe('0.000000000001');
  });

  it('accepts numbers and strings', () => {
    expect(mojoToXch(1_000_000_000_000)).toBe('1');
    expect(mojoToXch('2500000000000')).toBe('2.5');
  });

  it('formats negative values', () => {
    expect(mojoToXch(-MOJOS_PER_XCH)).toBe('-1');
  });
});

describe('formatNetspace', () => {
  it('formats a 30 EiB netspace', () => {
    const thirtyEib = 30n * 2n ** 60n;
    const res = formatNetspace(thirtyEib);
    expect(res.bytes).toBe(thirtyEib.toString());
    expect(res.eib).toBe('30');
    expect(res.human).toMatch(/EiB$/);
  });

  it('shows PiB when below 1 EiB', () => {
    const halfEib = 2n ** 59n;
    const res = formatNetspace(halfEib);
    expect(res.human).toMatch(/PiB$/);
    expect(res.eib).toMatch(/^0\./);
  });
});

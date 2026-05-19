import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bigIntToBytes, coinName } from '../src/chia/coin-name.js';
import { bytesToHex } from '../src/chia/hex.js';

const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const ALL_ONES = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

describe('bigIntToBytes (Chia int_to_bytes signed minimal)', () => {
  it('encodes 0 as empty', () => {
    expect(bigIntToBytes(0n).length).toBe(0);
  });

  it('encodes small positives without sign padding', () => {
    expect(bytesToHex(bigIntToBytes(1n))).toBe('01');
    expect(bytesToHex(bigIntToBytes(127n))).toBe('7f');
  });

  it('adds a 0x00 sign byte when the high bit would set', () => {
    expect(bytesToHex(bigIntToBytes(128n))).toBe('0080');
    expect(bytesToHex(bigIntToBytes(255n))).toBe('00ff');
  });

  it('encodes multibyte values big-endian', () => {
    expect(bytesToHex(bigIntToBytes(256n))).toBe('0100');
    expect(bytesToHex(bigIntToBytes(1_000_000_000_000n))).toBe('00e8d4a51000');
  });

  it('throws on negative input', () => {
    expect(() => bigIntToBytes(-1n)).toThrow();
  });
});

describe('coinName', () => {
  it('matches sha256(parent || puzzle_hash || amount_bytes)', () => {
    const amount = 1_000_000n;
    const expected = createHash('sha256')
      .update(Buffer.from(ZERO_HASH, 'hex'))
      .update(Buffer.from(ALL_ONES, 'hex'))
      .update(Buffer.from(bigIntToBytes(amount)))
      .digest('hex');
    const name = coinName({
      parent_coin_info: ZERO_HASH,
      puzzle_hash: ALL_ONES,
      amount,
    });
    expect(name).toBe(expected);
  });

  it('treats amount 0 as empty bytes', () => {
    const expected = createHash('sha256')
      .update(Buffer.from(ZERO_HASH, 'hex'))
      .update(Buffer.from(ZERO_HASH, 'hex'))
      .digest('hex');
    expect(coinName({ parent_coin_info: ZERO_HASH, puzzle_hash: ZERO_HASH, amount: 0 })).toBe(
      expected
    );
  });

  it('accepts string and number amounts', () => {
    const a = coinName({ parent_coin_info: ZERO_HASH, puzzle_hash: ZERO_HASH, amount: 1 });
    const b = coinName({
      parent_coin_info: ZERO_HASH,
      puzzle_hash: ZERO_HASH,
      amount: '1',
    });
    const c = coinName({ parent_coin_info: ZERO_HASH, puzzle_hash: ZERO_HASH, amount: 1n });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('rejects malformed hashes', () => {
    expect(() =>
      coinName({ parent_coin_info: 'abc', puzzle_hash: ZERO_HASH, amount: 0 })
    ).toThrow();
    expect(() =>
      coinName({ parent_coin_info: ZERO_HASH, puzzle_hash: 'abc', amount: 0 })
    ).toThrow();
  });
});

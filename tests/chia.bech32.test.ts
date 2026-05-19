import { describe, expect, it } from 'vitest';
import { addressToPuzzleHash, looksLikeAddress, puzzleHashToAddress } from '../src/chia/bech32.js';

const PUZZLE_HASH = '7faa3253bfddd1e0debb883ab8ac733c272b6e6c9e7e9d5c44e1d59ed1b3eb18';

describe('bech32m address <-> puzzle hash', () => {
  it('round-trips a mainnet address', () => {
    const addr = puzzleHashToAddress(PUZZLE_HASH, 'mainnet');
    expect(addr.startsWith('xch1')).toBe(true);
    const back = addressToPuzzleHash(addr);
    expect(back.puzzleHash).toBe(PUZZLE_HASH);
    expect(back.network).toBe('mainnet');
  });

  it('round-trips a testnet11 address', () => {
    const addr = puzzleHashToAddress(PUZZLE_HASH, 'testnet11');
    expect(addr.startsWith('txch1')).toBe(true);
    const back = addressToPuzzleHash(addr);
    expect(back.puzzleHash).toBe(PUZZLE_HASH);
    expect(back.network).toBe('testnet11');
  });

  it('accepts a 0x-prefixed puzzle hash', () => {
    const addr1 = puzzleHashToAddress(PUZZLE_HASH, 'mainnet');
    const addr2 = puzzleHashToAddress('0x' + PUZZLE_HASH, 'mainnet');
    expect(addr1).toBe(addr2);
  });

  it('rejects a non-32-byte hex string', () => {
    expect(() => puzzleHashToAddress('abcd', 'mainnet')).toThrow();
  });

  it('rejects an address with an unknown prefix', () => {
    const addr = puzzleHashToAddress(PUZZLE_HASH, 'mainnet').replace(/^xch/, 'btc');
    expect(() => addressToPuzzleHash(addr)).toThrow();
  });

  it('rejects a malformed address', () => {
    expect(() => addressToPuzzleHash('xch1notavalidaddress')).toThrow();
  });

  it('looksLikeAddress recognises xch and txch prefixes only', () => {
    expect(looksLikeAddress(puzzleHashToAddress(PUZZLE_HASH, 'mainnet'))).toBe(true);
    expect(looksLikeAddress(puzzleHashToAddress(PUZZLE_HASH, 'testnet11'))).toBe(true);
    expect(looksLikeAddress(PUZZLE_HASH)).toBe(false);
    expect(looksLikeAddress('bc1qsomething')).toBe(false);
  });
});

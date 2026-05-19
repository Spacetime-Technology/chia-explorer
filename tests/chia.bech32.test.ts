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

  it('decodes the known mainnet address xch1nsxjau8...j7xuuv to its expected puzzle hash', () => {
    const address = 'xch1nsxjau8ktcus23e89vz49kt7w3y4wx8s9q6np939c4g6gphpvj5qj7xuuv';
    const expected = '9c0d2ef0f65e390547272b0552d97e74495718f02835309625c551a406e164a8';
    const decoded = addressToPuzzleHash(address);
    expect(decoded.puzzleHash).toBe(expected);
    expect(decoded.network).toBe('mainnet');
  });

  it('looksLikeAddress recognises xch and txch prefixes only', () => {
    expect(looksLikeAddress(puzzleHashToAddress(PUZZLE_HASH, 'mainnet'))).toBe(true);
    expect(looksLikeAddress(puzzleHashToAddress(PUZZLE_HASH, 'testnet11'))).toBe(true);
    expect(looksLikeAddress(PUZZLE_HASH)).toBe(false);
    expect(looksLikeAddress('bc1qsomething')).toBe(false);
  });
});

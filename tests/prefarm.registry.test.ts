import { describe, expect, it } from 'vitest';
import { MOJOS_PER_XCH } from '../src/chia/amounts.js';
import { addressToPuzzleHash } from '../src/chia/bech32.js';
import {
  KNOWN_DESTINATIONS,
  PREFARM_WALLETS,
  TOTAL_PREFARM_ALLOCATION_MOJO,
  isPopulated,
  lookupDestination,
  lookupPrefarmWallet,
} from '../src/prefarm/registry.js';

describe('prefarm registry', () => {
  it('exposes exactly the four strategic-reserve wallets', () => {
    const ids = PREFARM_WALLETS.map((w) => w.id).sort();
    expect(ids).toEqual(['ch-cold', 'ch-warm', 'us-cold', 'us-warm']);
  });

  it('genesis total constant equals 21M XCH', () => {
    expect(TOTAL_PREFARM_ALLOCATION_MOJO).toBe(21_000_000n * MOJOS_PER_XCH);
  });

  it('populated wallet addresses round-trip to their puzzle hash on mainnet', () => {
    for (const w of PREFARM_WALLETS) {
      if (!isPopulated(w)) continue;
      const decoded = addressToPuzzleHash(w.address);
      expect(decoded.network).toBe('mainnet');
      expect(decoded.puzzleHash).toBe(w.puzzleHash);
    }
  });

  it('unpopulated wallets have null address and puzzleHash together', () => {
    for (const w of PREFARM_WALLETS) {
      if (w.address === null) expect(w.puzzleHash).toBeNull();
      if (w.puzzleHash === null) expect(w.address).toBeNull();
    }
  });

  it('lookupPrefarmWallet finds populated wallets by puzzle hash', () => {
    for (const w of PREFARM_WALLETS) {
      if (!isPopulated(w)) continue;
      expect(lookupPrefarmWallet(w.puzzleHash)?.id).toBe(w.id);
      expect(lookupPrefarmWallet(w.puzzleHash.toUpperCase())?.id).toBe(w.id);
    }
  });

  it('every destination round-trips on mainnet and has a unique entity slug', () => {
    const seen = new Set<string>();
    for (const d of KNOWN_DESTINATIONS) {
      const decoded = addressToPuzzleHash(d.address);
      expect(decoded.network).toBe('mainnet');
      expect(decoded.puzzleHash).toBe(d.puzzleHash);
      const key = `${d.entity}|${d.puzzleHash}`;
      expect(seen.has(key), `duplicate destination entry ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('lookupDestination returns undefined for an unknown puzzle hash', () => {
    expect(lookupDestination('0'.repeat(64))).toBeUndefined();
  });
});

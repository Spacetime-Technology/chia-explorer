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

  it('every populated wallet address round-trips to a matching mainnet puzzle hash', () => {
    for (const w of PREFARM_WALLETS) {
      if (!isPopulated(w)) continue;
      expect(w.addresses.length).toBe(w.puzzleHashes.length);
      w.addresses.forEach((addr, i) => {
        const decoded = addressToPuzzleHash(addr);
        expect(decoded.network).toBe('mainnet');
        expect(decoded.puzzleHash).toBe(w.puzzleHashes[i]);
      });
    }
  });

  it('unpopulated wallets have empty puzzleHashes', () => {
    for (const w of PREFARM_WALLETS) {
      if (w.addresses.length === 0) expect(w.puzzleHashes.length).toBe(0);
    }
  });

  it('lookupPrefarmWallet finds every populated wallet via every one of its puzzle hashes', () => {
    for (const w of PREFARM_WALLETS) {
      if (!isPopulated(w)) continue;
      for (const ph of w.puzzleHashes) {
        expect(lookupPrefarmWallet(ph)?.id).toBe(w.id);
        expect(lookupPrefarmWallet(ph.toUpperCase())?.id).toBe(w.id);
      }
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

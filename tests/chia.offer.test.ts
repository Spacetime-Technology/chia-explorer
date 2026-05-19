import { describe, expect, it } from 'vitest';
import { catPuzzleHash, Clvm, Constants, fromHex, toHex } from 'chia-wallet-sdk';
import {
  classifyPuzzle,
  decodeOfferString,
  parseConditions,
  summarizeSpendBundleHex,
} from '../src/chia/offer.js';
import { buildCatRequestedOffer, buildXchForXchOffer } from './fixtures/offers.js';

describe('decodeOfferString', () => {
  it('decodes a synthetic XCH-requested offer into offered + requested arrays', () => {
    const fx = buildXchForXchOffer();
    const summary = decodeOfferString(fx.offer);

    expect(summary.coin_spends_count).toBe(2);
    expect(summary.offered).toHaveLength(fx.expected.offered_count);
    expect(summary.requested).toHaveLength(fx.expected.requested_count);
    expect(summary.requested[0]?.asset_kind).toBe('xch');
    expect(summary.requested[0]?.amount_mojo).toBe('500');
    expect(summary.requested[0]?.destination_puzzle_hash).toBe('22'.repeat(32));
    expect(summary.requested[0]?.nonce).toBe('11'.repeat(32));
  });

  it('decodes a synthetic CAT-requested offer and extracts the asset_id', () => {
    const fx = buildCatRequestedOffer();
    const summary = decodeOfferString(fx.offer);

    expect(summary.requested).toHaveLength(1);
    const req = summary.requested[0]!;
    expect(req.asset_kind).toBe('cat');
    expect(req.asset_id).toBe(fx.expected.requested_asset_ids[0]);
    expect(req.amount_mojo).toBe(fx.expected.requested_total_mojo.toString());
  });

  it('throws a useful error for an invalid offer string', () => {
    expect(() => decodeOfferString('offer1notavalidoffer')).toThrow(/invalid offer string/);
  });

  it('throws for an empty string', () => {
    expect(() => decodeOfferString('')).toThrow(/invalid offer string/);
  });
});

describe('summarizeSpendBundleHex', () => {
  it('decodes a raw spend bundle hex (non-offer) into the same shape', () => {
    const fx = buildXchForXchOffer();
    const summary = summarizeSpendBundleHex(fx.bundleHex);
    expect(summary.coin_spends_count).toBe(2);
    expect(summary.requested[0]?.amount_mojo).toBe('500');
  });

  it('accepts 0x prefix on the hex input', () => {
    const fx = buildXchForXchOffer();
    const summary = summarizeSpendBundleHex('0x' + fx.bundleHex);
    expect(summary.coin_spends_count).toBe(2);
  });

  it('throws on invalid hex', () => {
    expect(() => summarizeSpendBundleHex('notvalidhex')).toThrow();
  });
});

describe('classifyPuzzle', () => {
  it('classifies the settlement-payments puzzle as xch + is_settlement=true', () => {
    const puzzleHex = toHex(Constants.settlementPayment());
    const c = classifyPuzzle(puzzleHex);
    expect(c.kind).toBe('xch');
    expect(c.is_settlement).toBe(true);
    expect(c.puzzle_hash).toBe(toHex(Constants.settlementPaymentHash()));
  });

  it('classifies a curried CAT puzzle as cat with the right asset_id', () => {
    const clvm = new Clvm();
    const assetId = fromHex('aa'.repeat(32));
    const inner = clvm.nil();
    const curried = clvm
      .catPuzzle()
      .curry([clvm.atom(Constants.catPuzzleHash()), clvm.atom(assetId), inner]);
    const c = classifyPuzzle(toHex(curried.serialize()));
    expect(c.kind).toBe('cat');
    expect(c.asset_id).toBe('aa'.repeat(32));
    expect(c.puzzle_hash).toBe(toHex(catPuzzleHash(assetId, inner.treeHash())));
    expect(c.is_settlement).toBe(false);
  });

  it('classifies a CAT-wrapping-settlement puzzle as cat with is_settlement=true', () => {
    const clvm = new Clvm();
    const assetId = fromHex('bb'.repeat(32));
    const settlement = clvm.deserialize(Constants.settlementPayment());
    const curried = clvm
      .catPuzzle()
      .curry([clvm.atom(Constants.catPuzzleHash()), clvm.atom(assetId), settlement]);
    const c = classifyPuzzle(toHex(curried.serialize()));
    expect(c.kind).toBe('cat');
    expect(c.is_settlement).toBe(true);
  });

  it('classifies a nil puzzle as unknown', () => {
    const clvm = new Clvm();
    const c = classifyPuzzle(toHex(clvm.nil().serialize()));
    expect(c.kind).toBe('unknown');
    expect(c.is_settlement).toBe(false);
  });

  it('accepts 0x prefix', () => {
    const puzzleHex = '0x' + toHex(Constants.settlementPayment());
    const c = classifyPuzzle(puzzleHex);
    expect(c.kind).toBe('xch');
  });
});

describe('parseConditions', () => {
  it('parses CREATE_COIN and RESERVE_FEE out of a delegated-puzzle run', () => {
    // Build a tiny puzzle that, when run with nil solution, emits CREATE_COIN + RESERVE_FEE.
    // Easiest path: use clvm.delegatedSpend conditions and run them against the standard
    // delegated puzzle. But since we only want to exercise parseConditions, construct a
    // puzzle program that is just `(q . conditions_list)` so it returns the conditions
    // list verbatim when run.
    const clvm = new Clvm();
    const conds = [
      clvm.createCoin(fromHex('11'.repeat(32)), 100n, null),
      clvm.createCoin(fromHex('22'.repeat(32)), 200n, null),
      clvm.reserveFee(50n),
    ];
    const condsList = clvm.list(conds);
    // (q . X) — quote
    const quoted = clvm.pair(clvm.int(1n), condsList);
    const nil = clvm.nil();

    const parsed = parseConditions(toHex(quoted.serialize()), toHex(nil.serialize()));
    expect(parsed.create_coins).toHaveLength(2);
    expect(parsed.create_coins[0]?.puzzle_hash).toBe('11'.repeat(32));
    expect(parsed.create_coins[0]?.amount).toBe('100');
    expect(parsed.create_coins[1]?.amount).toBe('200');
    expect(parsed.reserve_fee_mojo).toBe('50');
  });
});

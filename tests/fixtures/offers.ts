import {
  Clvm,
  Coin,
  CoinSpend,
  Constants,
  Signature,
  SpendBundle,
  catPuzzleHash,
  encodeOffer,
  fromHex,
  toHex,
} from 'chia-wallet-sdk';

const ZERO_PARENT = fromHex('00'.repeat(32));

function settlementProgram(clvm: Clvm) {
  return clvm.deserialize(Constants.settlementPayment());
}

function settlementSolution(
  clvm: Clvm,
  payments: Array<{ nonce: Uint8Array; puzzleHash: Uint8Array; amount: bigint }>
) {
  // Solution to the settlement-payments puzzle is a list of notarized payments.
  // Notarized payment shape: (nonce . (payment_1 payment_2 ...))
  // Payment shape: (puzzle_hash amount memos)
  const items = payments.map((p) => {
    const payment = clvm.list([clvm.atom(p.puzzleHash), clvm.int(p.amount), clvm.list([])]);
    return clvm.pair(clvm.atom(p.nonce), clvm.list([payment]));
  });
  return clvm.list(items);
}

function makerOfferedSpend(
  clvm: Clvm,
  coin: Coin,
  puzzleRevealBytes: Uint8Array,
  solutionBytes: Uint8Array
) {
  return new CoinSpend(coin, puzzleRevealBytes, solutionBytes);
}

export interface OfferFixture {
  offer: string;
  bundleHex: string;
  expected: {
    offered_count: number;
    requested_count: number;
    requested_total_mojo: bigint;
    offered_kinds: string[];
    requested_kinds: string[];
    requested_asset_ids: Array<string | undefined>;
  };
}

/**
 * Build a synthetic offer where the maker offers a (synthetic) XCH coin and requests
 * 500 mojo XCH. Uses the canonical settlement-payments puzzle so the decoder must
 * recognise it and pull notarized payments out of the solution.
 */
export function buildXchForXchOffer(): OfferFixture {
  const clvm = new Clvm();
  const settlement = settlementProgram(clvm);

  const nonce = fromHex('11'.repeat(32));
  const destPh = fromHex('22'.repeat(32));
  const requestedAmount = 500n;

  const solution = settlementSolution(clvm, [
    { nonce, puzzleHash: destPh, amount: requestedAmount },
  ]);

  const requestedCoin = new Coin(ZERO_PARENT, settlement.treeHash(), 0n);
  const requestedSpend = new CoinSpend(requestedCoin, settlement.serialize(), solution.serialize());

  // Maker side: a coin with an unknown puzzle reveal (in real offers it would be the
  // standard p2 of synthetic key, which we can't construct without a key — but the
  // classifier path for unknown puzzles is also part of what we want to exercise).
  const makerCoin = new Coin(fromHex('bb'.repeat(32)), fromHex('33'.repeat(32)), 1000n);
  const nil = clvm.nil();
  const makerSpend = makerOfferedSpend(clvm, makerCoin, nil.serialize(), nil.serialize());

  const bundle = new SpendBundle([makerSpend, requestedSpend], Signature.infinity());
  return {
    offer: encodeOffer(bundle),
    bundleHex: toHex(bundle.toBytes()),
    expected: {
      offered_count: 1,
      requested_count: 1,
      requested_total_mojo: 500n,
      offered_kinds: ['unknown'],
      requested_kinds: ['xch'],
      requested_asset_ids: [undefined],
    },
  };
}

/**
 * Build a synthetic offer where the maker requests a CAT (settlement-payments wrapped
 * in a CAT layer for a specific asset id). Exercises the CAT-requested code path.
 */
export function buildCatRequestedOffer(): OfferFixture {
  const clvm = new Clvm();
  const settlement = settlementProgram(clvm);
  const settlementHash = Constants.settlementPaymentHash();

  const assetId = fromHex('cc'.repeat(32));

  // CAT outer puzzle, curried with [mod_hash, asset_id, inner_puzzle = settlement_payment]
  const catBase = clvm.catPuzzle();
  const catWrappingSettlement = catBase.curry([
    clvm.atom(Constants.catPuzzleHash()),
    clvm.atom(assetId),
    settlement,
  ]);
  const catWrappedSettlementHash = catPuzzleHash(assetId, settlementHash);

  const nonce = fromHex('33'.repeat(32));
  const destPh = fromHex('44'.repeat(32));
  const requestedAmount = 1234n;
  const innerSolution = settlementSolution(clvm, [
    { nonce, puzzleHash: destPh, amount: requestedAmount },
  ]);

  // CAT solution layout requires the inner solution be embedded somewhere; the
  // decoder walks the whole solution tree looking for notarized payments, so we
  // can wrap the inner solution loosely. Real CAT solutions are a 9-element list;
  // here we just supply the inner_solution as the outer solution so the walker
  // finds it. That's enough to exercise the CAT-requested path.
  const catRequestedCoin = new Coin(ZERO_PARENT, catWrappedSettlementHash, 0n);
  const catRequestedSpend = new CoinSpend(
    catRequestedCoin,
    catWrappingSettlement.serialize(),
    innerSolution.serialize()
  );

  // Maker offers an unknown coin again (synthetic XCH stand-in).
  const makerCoin = new Coin(fromHex('ee'.repeat(32)), fromHex('55'.repeat(32)), 1n);
  const nil = clvm.nil();
  const makerSpend = makerOfferedSpend(clvm, makerCoin, nil.serialize(), nil.serialize());

  const bundle = new SpendBundle([makerSpend, catRequestedSpend], Signature.infinity());
  return {
    offer: encodeOffer(bundle),
    bundleHex: toHex(bundle.toBytes()),
    expected: {
      offered_count: 1,
      requested_count: 1,
      requested_total_mojo: requestedAmount,
      offered_kinds: ['unknown'],
      requested_kinds: ['cat'],
      requested_asset_ids: [toHex(assetId)],
    },
  };
}

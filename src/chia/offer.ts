import {
  Clvm,
  Constants,
  Program,
  SpendBundle,
  bytesEqual,
  decodeOffer,
  toHex,
} from 'chia-wallet-sdk';
import { hexToBytes, stripHexPrefix } from './hex.js';
import { mojoToXch } from './amounts.js';

export type AssetKind = 'xch' | 'cat' | 'nft' | 'singleton' | 'did' | 'unknown';

export interface OfferedAsset {
  asset_kind: AssetKind;
  asset_id?: string | undefined;
  nft_launcher_id?: string | undefined;
  amount_mojo: string;
  amount_xch?: string | undefined;
  source_puzzle_hash: string;
  source_coin_id: string;
}

export interface RequestedAsset {
  asset_kind: AssetKind;
  asset_id?: string | undefined;
  nft_launcher_id?: string | undefined;
  amount_mojo: string;
  amount_xch?: string | undefined;
  destination_puzzle_hash: string;
  nonce: string;
}

export interface TradeSummary {
  offered: OfferedAsset[];
  requested: RequestedAsset[];
  fee_mojo: string;
  coin_spends_count: number;
  aggregated_signature: string;
}

export interface ClassifiedSpend {
  kind: AssetKind;
  asset_id?: string | undefined;
  launcher_id?: string | undefined;
  inner_puzzle_hash?: string | undefined;
  puzzle_hash: string;
  /** True when the inner puzzle is the settlement-payments mod (i.e. this coin holds requested payments). */
  is_settlement: boolean;
}

export interface ParsedCondition {
  opcode: string;
  data: Record<string, unknown>;
}

export interface ParsedConditions {
  create_coins: Array<{ puzzle_hash: string; amount: string; memos: string[] }>;
  reserve_fee_mojo: string;
  agg_sigs_count: number;
  announcements: Array<{ kind: 'create_coin' | 'create_puzzle'; message: string }>;
  asserts: ParsedCondition[];
  other: ParsedCondition[];
}

function memosToStrings(memos: Program | null): string[] {
  if (!memos) return [];
  const list = memos.toList();
  if (!list) return [];
  const out: string[] = [];
  for (const m of list) {
    const atom = m.toAtom();
    if (atom) out.push(toHex(atom));
  }
  return out;
}

interface PuzzleClassification {
  kind: AssetKind;
  asset_id?: string;
  launcher_id?: string;
  inner_puzzle_hash?: string;
  /** True if the puzzle (or its inner p2) is the settlement-payments mod. */
  is_settlement_outer: boolean;
  is_settlement_inner: boolean;
  puzzle_hash: string;
}

function classifyProgram(clvm: Clvm, puzzleProgram: Program): PuzzleClassification {
  const puzzle = puzzleProgram.puzzle();
  const puzzleHash = toHex(puzzle.puzzleHash);
  const settlementHash = Constants.settlementPaymentHash();

  if (bytesEqual(puzzle.puzzleHash, settlementHash)) {
    return {
      kind: 'xch',
      is_settlement_outer: true,
      is_settlement_inner: false,
      puzzle_hash: puzzleHash,
    };
  }

  const catInfo = puzzle.parseCatInfo();
  if (catInfo) {
    const inner = catInfo.info.p2PuzzleHash;
    const inner_puzzle_hash = toHex(inner);
    return {
      kind: 'cat',
      asset_id: toHex(catInfo.info.assetId),
      inner_puzzle_hash,
      is_settlement_outer: false,
      is_settlement_inner: bytesEqual(inner, settlementHash),
      puzzle_hash: puzzleHash,
    };
  }

  const nftInfo = puzzle.parseNftInfo();
  if (nftInfo) {
    const inner = nftInfo.info.p2PuzzleHash;
    return {
      kind: 'nft',
      launcher_id: toHex(nftInfo.info.launcherId),
      inner_puzzle_hash: toHex(inner),
      is_settlement_outer: false,
      is_settlement_inner: bytesEqual(inner, settlementHash),
      puzzle_hash: puzzleHash,
    };
  }

  const didInfo = puzzle.parseDidInfo();
  if (didInfo) {
    return {
      kind: 'did',
      launcher_id: toHex(didInfo.info.launcherId),
      inner_puzzle_hash: toHex(didInfo.info.p2PuzzleHash),
      is_settlement_outer: false,
      is_settlement_inner: false,
      puzzle_hash: puzzleHash,
    };
  }

  // Singleton-shaped puzzles without a recognised inner layer.
  if (bytesEqual(puzzle.modHash, Constants.singletonTopLayerHash())) {
    return {
      kind: 'singleton',
      is_settlement_outer: false,
      is_settlement_inner: false,
      puzzle_hash: puzzleHash,
    };
  }

  return {
    kind: 'unknown',
    is_settlement_outer: false,
    is_settlement_inner: false,
    puzzle_hash: puzzleHash,
  };
}

export function classifyPuzzle(puzzleRevealHex: string): ClassifiedSpend {
  const bytes = hexToBytes(stripHexPrefix(puzzleRevealHex));
  const clvm = new Clvm();
  const program = clvm.deserialize(bytes);
  const c = classifyProgram(clvm, program);
  return {
    kind: c.kind,
    asset_id: c.asset_id,
    launcher_id: c.launcher_id,
    inner_puzzle_hash: c.inner_puzzle_hash,
    puzzle_hash: c.puzzle_hash,
    is_settlement: c.is_settlement_outer || c.is_settlement_inner,
  };
}

function safeCall<T>(fn: () => T | null): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function parseConditions(puzzleRevealHex: string, solutionHex: string): ParsedConditions {
  const clvm = new Clvm();
  const puzzle = clvm.deserialize(hexToBytes(stripHexPrefix(puzzleRevealHex)));
  const solution = clvm.deserialize(hexToBytes(stripHexPrefix(solutionHex)));

  const output = puzzle.run(solution, 11_000_000_000n, false);
  const conditions = output.value.toList() ?? [];

  const create_coins: ParsedConditions['create_coins'] = [];
  let reserve_fee = 0n;
  let agg_sigs_count = 0;
  const announcements: ParsedConditions['announcements'] = [];
  const asserts: ParsedCondition[] = [];
  const other: ParsedCondition[] = [];

  for (const cond of conditions) {
    const cc = safeCall(() => cond.parseCreateCoin());
    if (cc) {
      create_coins.push({
        puzzle_hash: toHex(cc.puzzleHash),
        amount: cc.amount.toString(),
        memos: memosToStrings(cc.memos),
      });
      continue;
    }

    const rf = safeCall(() => cond.parseReserveFee());
    if (rf) {
      reserve_fee += rf.amount;
      continue;
    }

    const cca = safeCall(() => cond.parseCreateCoinAnnouncement());
    if (cca) {
      announcements.push({ kind: 'create_coin', message: toHex(cca.message) });
      continue;
    }
    const cpa = safeCall(() => cond.parseCreatePuzzleAnnouncement());
    if (cpa) {
      announcements.push({ kind: 'create_puzzle', message: toHex(cpa.message) });
      continue;
    }

    if (
      safeCall(() => cond.parseAggSigMe()) ||
      safeCall(() => cond.parseAggSigParent()) ||
      safeCall(() => cond.parseAggSigPuzzle()) ||
      safeCall(() => cond.parseAggSigAmount()) ||
      safeCall(() => cond.parseAggSigParentAmount()) ||
      safeCall(() => cond.parseAggSigParentPuzzle()) ||
      safeCall(() => cond.parseAggSigPuzzleAmount()) ||
      safeCall(() => cond.parseAggSigUnsafe())
    ) {
      agg_sigs_count++;
      continue;
    }

    const opcodeProgram = safeCall(() => cond.first());
    const opcode = opcodeProgram?.toInt() ?? null;
    const opcodeStr = opcode === null ? 'unknown' : opcode.toString();

    const assertParsers: Array<() => unknown> = [
      () => cond.parseAssertMyCoinId(),
      () => cond.parseAssertMyParentId(),
      () => cond.parseAssertMyPuzzleHash(),
      () => cond.parseAssertMyAmount(),
      () => cond.parseAssertCoinAnnouncement(),
      () => cond.parseAssertPuzzleAnnouncement(),
      () => cond.parseAssertSecondsRelative(),
      () => cond.parseAssertSecondsAbsolute(),
      () => cond.parseAssertHeightRelative(),
      () => cond.parseAssertHeightAbsolute(),
      () => cond.parseAssertBeforeSecondsRelative(),
      () => cond.parseAssertBeforeSecondsAbsolute(),
      () => cond.parseAssertBeforeHeightRelative(),
      () => cond.parseAssertBeforeHeightAbsolute(),
    ];
    let matchedAssert = false;
    for (const p of assertParsers) {
      if (safeCall(p)) {
        asserts.push({ opcode: opcodeStr, data: {} });
        matchedAssert = true;
        break;
      }
    }
    if (matchedAssert) continue;

    other.push({ opcode: opcodeStr, data: {} });
  }

  return {
    create_coins,
    reserve_fee_mojo: reserve_fee.toString(),
    agg_sigs_count,
    announcements,
    asserts,
    other,
  };
}

interface NotarizedPaymentRow {
  nonce: string;
  puzzle_hash: string;
  amount: bigint;
}

function extractNotarizedPayments(solution: Program): NotarizedPaymentRow[] {
  const list = solution.toList();
  if (!list) return [];
  const rows: NotarizedPaymentRow[] = [];
  for (const item of list) {
    const np = safeCall(() => item.parseNotarizedPayment());
    if (!np) continue;
    const nonceHex = toHex(np.nonce);
    for (const p of np.payments) {
      rows.push({
        nonce: nonceHex,
        puzzle_hash: toHex(p.puzzleHash),
        amount: p.amount,
      });
    }
  }
  return rows;
}

function summarizeBundle(bundle: SpendBundle): TradeSummary {
  const clvm = new Clvm();
  const offered: OfferedAsset[] = [];
  const requested: RequestedAsset[] = [];
  let fee = 0n;

  for (const cs of bundle.coinSpends) {
    let puzzleProgram: Program;
    let solutionProgram: Program;
    try {
      puzzleProgram = clvm.deserialize(cs.puzzleReveal);
      solutionProgram = clvm.deserialize(cs.solution);
    } catch {
      // Unparseable spend — record it as unknown offered and continue.
      offered.push({
        asset_kind: 'unknown',
        amount_mojo: cs.coin.amount.toString(),
        source_puzzle_hash: toHex(cs.coin.puzzleHash),
        source_coin_id: toHex(cs.coin.coinId()),
      });
      continue;
    }

    const c = classifyProgram(clvm, puzzleProgram);

    if (c.is_settlement_outer) {
      // Pure XCH settlement-payments coin → requested XCH payments.
      for (const row of extractNotarizedPayments(solutionProgram)) {
        requested.push({
          asset_kind: 'xch',
          amount_mojo: row.amount.toString(),
          amount_xch: mojoToXch(row.amount),
          destination_puzzle_hash: row.puzzle_hash,
          nonce: row.nonce,
        });
      }
      continue;
    }

    if (c.is_settlement_inner) {
      // Settlement wrapped in CAT/NFT — requested CAT or NFT side.
      // The CAT/NFT solution contains the inner (settlement) solution as one of its members.
      // For CAT: solution = (inner_puzzle_reveal inner_solution ...). We extract the second.
      // For NFT: solution = (inner_solution ...). For a singleton-layer NFT the inner_solution is the first.
      // Robust strategy: walk the solution looking for any sub-program that parses as a list of notarized payments.
      const candidates: Program[] = [];
      const stack: Program[] = [solutionProgram];
      while (stack.length) {
        const node = stack.pop()!;
        candidates.push(node);
        if (node.isPair()) {
          const f = safeCall(() => node.first());
          const r = safeCall(() => node.rest());
          if (f) stack.push(f);
          if (r) stack.push(r);
        }
      }
      let found: NotarizedPaymentRow[] = [];
      for (const cand of candidates) {
        const rows = extractNotarizedPayments(cand);
        if (rows.length > 0) {
          found = rows;
          break;
        }
      }
      for (const row of found) {
        requested.push({
          asset_kind: c.kind,
          asset_id: c.asset_id,
          nft_launcher_id: c.kind === 'nft' ? c.launcher_id : undefined,
          amount_mojo: row.amount.toString(),
          amount_xch: c.kind === 'xch' ? mojoToXch(row.amount) : undefined,
          destination_puzzle_hash: row.puzzle_hash,
          nonce: row.nonce,
        });
      }
      if (found.length === 0) {
        // Couldn't extract — still record the requested-side kind with a 0 amount placeholder
        // so the caller knows something was requested. Use the coin's amount as a best-effort.
        requested.push({
          asset_kind: c.kind,
          asset_id: c.asset_id,
          nft_launcher_id: c.kind === 'nft' ? c.launcher_id : undefined,
          amount_mojo: cs.coin.amount.toString(),
          destination_puzzle_hash: toHex(cs.coin.puzzleHash),
          nonce: '',
        });
      }
      continue;
    }

    // Non-settlement spend → maker's offered asset.
    offered.push({
      asset_kind: c.kind,
      asset_id: c.asset_id,
      nft_launcher_id: c.kind === 'nft' ? c.launcher_id : undefined,
      amount_mojo: cs.coin.amount.toString(),
      amount_xch: c.kind === 'xch' ? mojoToXch(cs.coin.amount) : undefined,
      source_puzzle_hash: toHex(cs.coin.puzzleHash),
      source_coin_id: toHex(cs.coin.coinId()),
    });

    // Best-effort reserve-fee extraction from this spend's conditions.
    try {
      const out = puzzleProgram.run(solutionProgram, 11_000_000_000n, false);
      const conds = out.value.toList() ?? [];
      for (const cond of conds) {
        const rf = safeCall(() => cond.parseReserveFee());
        if (rf) fee += rf.amount;
      }
    } catch {
      // ignore — running an offer's maker spend can fail without full chain context
    }
  }

  return {
    offered,
    requested,
    fee_mojo: fee.toString(),
    coin_spends_count: bundle.coinSpends.length,
    aggregated_signature: toHex(bundle.aggregatedSignature.toBytes()),
  };
}

export function decodeOfferString(offer: string): TradeSummary {
  let bundle: SpendBundle;
  try {
    bundle = decodeOffer(offer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid offer string: ${msg}`, { cause: err });
  }
  return summarizeBundle(bundle);
}

export function summarizeSpendBundleHex(bundleHex: string): TradeSummary {
  const bytes = hexToBytes(stripHexPrefix(bundleHex));
  let bundle: SpendBundle;
  try {
    bundle = SpendBundle.fromBytes(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid spend bundle hex: ${msg}`, { cause: err });
  }
  return summarizeBundle(bundle);
}

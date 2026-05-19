import { RPCAgent } from 'chia-agent';
import { mojoToXch, toBigInt } from '../chia/amounts.js';
import { puzzleHashToAddress } from '../chia/bech32.js';
import { coinName } from '../chia/coin-name.js';
import {
  CoinRecordLike,
  fetchCoinRecordsByParentIds,
  fetchCoinRecordsByPuzzleHash,
} from '../coinset/pagination.js';
import {
  KnownDestination,
  PrefarmWallet,
  isPopulated,
  lookupDestination,
  lookupPrefarmWallet,
} from './registry.js';

export interface DestinationOutflow {
  puzzle_hash: string;
  address: string;
  amount_mojo: string;
  amount_xch: string;
  entity: string | null;
  label: string | null;
  category: KnownDestination['category'] | 'internal-rotation' | 'unknown';
  internal_wallet_id?: PrefarmWallet['id'];
}

export interface PrefarmSpend {
  wallet_id: PrefarmWallet['id'];
  source_address: string;
  source_puzzle_hash: string;
  parent_coin_name: string;
  spent_amount_mojo: string;
  spent_amount_xch: string;
  spent_height: number;
  confirmed_height: number;
  timestamp: number;
  destinations: DestinationOutflow[];
  outflow_mojo: string;
  outflow_xch: string;
}

function labelDestination(
  puzzleHash: string,
  address: string,
  amountMojo: bigint
): DestinationOutflow {
  const internal = lookupPrefarmWallet(puzzleHash);
  if (internal) {
    return {
      puzzle_hash: puzzleHash,
      address,
      amount_mojo: amountMojo.toString(),
      amount_xch: mojoToXch(amountMojo),
      entity: 'prefarm',
      label: internal.label,
      category: 'internal-rotation',
      internal_wallet_id: internal.id,
    };
  }
  const known = lookupDestination(puzzleHash);
  if (known) {
    return {
      puzzle_hash: puzzleHash,
      address,
      amount_mojo: amountMojo.toString(),
      amount_xch: mojoToXch(amountMojo),
      entity: known.entity,
      label: known.label,
      category: known.category,
    };
  }
  return {
    puzzle_hash: puzzleHash,
    address,
    amount_mojo: amountMojo.toString(),
    amount_xch: mojoToXch(amountMojo),
    entity: null,
    label: null,
    category: 'unknown',
  };
}

export async function getWalletSpends(
  agent: RPCAgent,
  wallet: PrefarmWallet,
  options: { sinceHeight?: number } = {}
): Promise<PrefarmSpend[]> {
  if (!isPopulated(wallet)) return [];

  const ownPuzzleHashes = new Set(wallet.puzzleHashes.map((ph) => ph.toLowerCase()));

  const recordGroups = await Promise.all(
    wallet.puzzleHashes.map((ph) =>
      fetchCoinRecordsByPuzzleHash(agent, ph, {
        includeSpent: true,
        ...(options.sinceHeight !== undefined ? { startHeight: options.sinceHeight } : {}),
      })
    )
  );
  const records = recordGroups.flat();
  const spent = records.filter((r) => r.spent_block_index > 0);
  if (spent.length === 0) return [];

  const parentByName = new Map<string, CoinRecordLike>();
  for (const r of spent) {
    const name = coinName({
      parent_coin_info: r.coin.parent_coin_info,
      puzzle_hash: r.coin.puzzle_hash,
      amount: toBigInt(r.coin.amount),
    });
    parentByName.set(name, r);
  }

  const children = await fetchCoinRecordsByParentIds(agent, [...parentByName.keys()], {
    includeSpent: true,
  });
  const childrenByParent = new Map<string, CoinRecordLike[]>();
  for (const child of children) {
    const key = child.coin.parent_coin_info.toLowerCase().replace(/^0x/, '');
    const list = childrenByParent.get(key) ?? [];
    list.push(child);
    childrenByParent.set(key, list);
  }

  const out: PrefarmSpend[] = [];
  for (const [parentName, parent] of parentByName) {
    const childCoins = childrenByParent.get(parentName) ?? [];
    // Filter out children that land back on one of *this* wallet's own puzzle hashes:
    // those are singleton bookkeeping (e.g. the singleton recreating itself, or
    // moving between a wallet's primary p2 and its clawback intermediate). Children
    // landing on a different prefarm wallet are real inter-custody rotations.
    const meaningful = childCoins.filter((c) => {
      const ph = c.coin.puzzle_hash.toLowerCase().replace(/^0x/, '');
      return !ownPuzzleHashes.has(ph);
    });
    if (meaningful.length === 0) continue;
    const destinations: DestinationOutflow[] = meaningful.map((c) => {
      const ph = c.coin.puzzle_hash.toLowerCase().replace(/^0x/, '');
      const addr = puzzleHashToAddress(ph, 'mainnet');
      return labelDestination(ph, addr, toBigInt(c.coin.amount));
    });
    const outflow = destinations
      .filter((d) => d.category !== 'internal-rotation')
      .reduce((acc, d) => acc + BigInt(d.amount_mojo), 0n);
    const sourcePh = parent.coin.puzzle_hash.toLowerCase().replace(/^0x/, '');
    out.push({
      wallet_id: wallet.id,
      source_puzzle_hash: sourcePh,
      source_address: puzzleHashToAddress(sourcePh, 'mainnet'),
      parent_coin_name: parentName,
      spent_amount_mojo: toBigInt(parent.coin.amount).toString(),
      spent_amount_xch: mojoToXch(toBigInt(parent.coin.amount)),
      spent_height: parent.spent_block_index,
      confirmed_height: parent.confirmed_block_index,
      timestamp: Number(parent.timestamp),
      destinations,
      outflow_mojo: outflow.toString(),
      outflow_xch: mojoToXch(outflow),
    });
  }

  out.sort((a, b) => b.spent_height - a.spent_height);
  return out;
}

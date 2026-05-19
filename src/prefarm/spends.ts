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
  const records = await fetchCoinRecordsByPuzzleHash(agent, wallet.puzzleHash, {
    includeSpent: true,
    ...(options.sinceHeight !== undefined ? { startHeight: options.sinceHeight } : {}),
  });
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
    const list = childrenByParent.get(child.coin.parent_coin_info) ?? [];
    list.push(child);
    childrenByParent.set(child.coin.parent_coin_info, list);
  }

  const out: PrefarmSpend[] = [];
  for (const [parentName, parent] of parentByName) {
    const childCoins = childrenByParent.get(parentName) ?? [];
    const destinations: DestinationOutflow[] = childCoins.map((c) => {
      const ph = c.coin.puzzle_hash.toLowerCase().replace(/^0x/, '');
      const addr = puzzleHashToAddress(ph, 'mainnet');
      return labelDestination(ph, addr, toBigInt(c.coin.amount));
    });
    const outflow = destinations
      .filter((d) => d.category !== 'internal-rotation')
      .reduce((acc, d) => acc + BigInt(d.amount_mojo), 0n);
    out.push({
      wallet_id: wallet.id,
      source_address: wallet.address,
      source_puzzle_hash: wallet.puzzleHash,
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

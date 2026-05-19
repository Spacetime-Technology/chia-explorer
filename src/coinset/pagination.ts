import { RPCAgent } from 'chia-agent';
import { get_coin_records_by_puzzle_hash } from 'chia-agent/api/rpc/full_node/index.js';

type PuzzleHashRequest = Parameters<typeof get_coin_records_by_puzzle_hash>[1];

export interface CoinRecordLike {
  coin: {
    parent_coin_info: string;
    puzzle_hash: string;
    amount: bigint | number | string;
  };
  confirmed_block_index: number;
  spent_block_index: number;
  coinbase: boolean;
  timestamp: bigint | number;
  spent?: boolean;
}

const PAGE_SIZE_LIMIT = 5_000;

/**
 * Fetch coin records by puzzle hash, paginating by height window if the response
 * looks capped. Coinset returns up to a fixed number of records per call; when
 * we see exactly that many, we re-query the range above the highest confirmed
 * height we've seen so far.
 *
 * Only include start_height / end_height in the payload when the caller asked
 * for them. coinset.org treats end_height literally as a block height, so the
 * full-node convention of passing 0xffffffff to mean "no upper bound" returns
 * zero records.
 */
export async function fetchCoinRecordsByPuzzleHash(
  agent: RPCAgent,
  puzzleHashHex: string,
  options: { includeSpent?: boolean; startHeight?: number; endHeight?: number } = {}
): Promise<CoinRecordLike[]> {
  const includeSpent = options.includeSpent ?? false;
  let start = options.startHeight;
  const end = options.endHeight;
  const all: CoinRecordLike[] = [];
  const seen = new Set<string>();

  while (true) {
    if (start !== undefined && end !== undefined && start > end) break;
    const payload: Partial<PuzzleHashRequest> = {
      puzzle_hash: puzzleHashHex,
      include_spent_coins: includeSpent,
    };
    if (start !== undefined) payload.start_height = start;
    if (end !== undefined) payload.end_height = end;
    const res = await get_coin_records_by_puzzle_hash(agent, payload as PuzzleHashRequest);
    const records = (res.coin_records ?? []) as CoinRecordLike[];
    let maxHeight = start ?? 0;
    for (const r of records) {
      const key = `${r.coin.parent_coin_info}|${r.coin.puzzle_hash}|${r.coin.amount.toString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(r);
      if (r.confirmed_block_index > maxHeight) maxHeight = r.confirmed_block_index;
    }
    if (records.length < PAGE_SIZE_LIMIT) break;
    if (start !== undefined && maxHeight <= start) break;
    start = maxHeight + 1;
  }

  return all;
}

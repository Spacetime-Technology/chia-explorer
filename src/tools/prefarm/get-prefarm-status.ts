import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mojoToXch, toBigInt } from '../../chia/amounts.js';
import { getAgent } from '../../coinset/agent.js';
import { fetchCoinRecordsByPuzzleHash } from '../../coinset/pagination.js';
import {
  PREFARM_WALLETS,
  PrefarmWallet,
  TOTAL_PREFARM_ALLOCATION_MOJO,
  isPopulated,
} from '../../prefarm/registry.js';
import { errorText, jsonText } from '../shared/response.js';

interface WalletStatus {
  id: PrefarmWallet['id'];
  label: string;
  region: PrefarmWallet['region'];
  temperature: PrefarmWallet['temperature'];
  addresses: readonly string[];
  puzzle_hashes: readonly string[];
  balance_mojo: string | null;
  balance_xch: string | null;
  unspent_coin_count: number | null;
  pending: boolean;
}

async function statusForWallet(wallet: PrefarmWallet): Promise<WalletStatus> {
  const base = {
    id: wallet.id,
    label: wallet.label,
    region: wallet.region,
    temperature: wallet.temperature,
    addresses: wallet.addresses,
    puzzle_hashes: wallet.puzzleHashes,
  };
  if (!isPopulated(wallet)) {
    return {
      ...base,
      balance_mojo: null,
      balance_xch: null,
      unspent_coin_count: null,
      pending: true,
    };
  }
  const agent = getAgent('mainnet');
  const groups = await Promise.all(
    wallet.puzzleHashes.map((ph) =>
      fetchCoinRecordsByPuzzleHash(agent, ph, { includeSpent: false })
    )
  );
  let balance = 0n;
  let coinCount = 0;
  for (const records of groups) {
    coinCount += records.length;
    for (const r of records) balance += toBigInt(r.coin.amount);
  }
  return {
    ...base,
    balance_mojo: balance.toString(),
    balance_xch: mojoToXch(balance),
    unspent_coin_count: coinCount,
    pending: false,
  };
}

export function register(server: McpServer): void {
  server.tool(
    'get_prefarm_status',
    'Aggregate status of the Chia strategic reserve (21M XCH across four custody wallets: US/CH × cold/warm). Per-wallet balances are read live from coinset.org; the only hardcoded amount is the 21M XCH genesis total. Mainnet only.',
    {},
    async () => {
      try {
        const wallets = await Promise.all(PREFARM_WALLETS.map(statusForWallet));

        const trackedBalance = wallets
          .filter((w) => !w.pending)
          .reduce((acc, w) => acc + BigInt(w.balance_mojo ?? '0'), 0n);
        const walletsPending = wallets.filter((w) => w.pending).length;
        const totalAllocation = TOTAL_PREFARM_ALLOCATION_MOJO;
        const trackedSpent = totalAllocation - trackedBalance;
        const spentPct =
          walletsPending > 0 ? null : Number((trackedSpent * 10000n) / totalAllocation) / 100;

        return jsonText({
          wallets,
          totals: {
            allocation_mojo: totalAllocation.toString(),
            allocation_xch: mojoToXch(totalAllocation),
            tracked_balance_mojo: trackedBalance.toString(),
            tracked_balance_xch: mojoToXch(trackedBalance),
            tracked_spent_mojo: trackedSpent.toString(),
            tracked_spent_xch: mojoToXch(trackedSpent),
            tracked_spent_pct: spentPct,
          },
          wallets_configured: wallets.filter((w) => !w.pending).length,
          wallets_pending: walletsPending,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

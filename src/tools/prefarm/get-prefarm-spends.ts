import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mojoToXch } from '../../chia/amounts.js';
import { getAgent } from '../../coinset/agent.js';
import { PREFARM_WALLETS, WalletId, getWalletById, isPopulated } from '../../prefarm/registry.js';
import { PrefarmSpend, getWalletSpends } from '../../prefarm/spends.js';
import { errorText, jsonText } from '../shared/response.js';

const WALLET_IDS = [
  'us-cold',
  'us-warm',
  'ch-cold',
  'ch-warm',
] as const satisfies readonly WalletId[];

export function register(server: McpServer): void {
  server.tool(
    'get_prefarm_spends',
    'List outflows from the Chia strategic reserve. For each spent coin: the source wallet, the destination addresses (labelled when they map to a known partner / market maker / exchange), and amounts. Internal rotations between custody wallets are flagged and excluded from total outflow. Mainnet only.',
    {
      wallet_id: z
        .enum(WALLET_IDS)
        .optional()
        .describe('Restrict to one wallet. Omit to query all four.'),
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe('Maximum spends to return, sorted newest first. Default 50.'),
      since_height: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Only include spends at or after this block height.'),
    },
    async ({ wallet_id, limit, since_height }) => {
      try {
        const targets = wallet_id
          ? (() => {
              const w = getWalletById(wallet_id);
              if (!w) throw new Error(`unknown wallet_id: ${wallet_id}`);
              return [w];
            })()
          : [...PREFARM_WALLETS];

        const populated = targets.filter(isPopulated);
        const pending = targets.filter((w) => !isPopulated(w)).map((w) => w.id);

        const agent = getAgent('mainnet');
        const grouped = await Promise.all(
          populated.map((w) =>
            getWalletSpends(agent, w, {
              ...(since_height !== undefined ? { sinceHeight: since_height } : {}),
            })
          )
        );
        const all: PrefarmSpend[] = grouped.flat();
        all.sort((a, b) => b.spent_height - a.spent_height);
        const cap = limit ?? 50;
        const trimmed = all.slice(0, cap);

        const totalOutflow = all.reduce((acc, s) => acc + BigInt(s.outflow_mojo), 0n);

        return jsonText({
          spends: trimmed,
          total_spend_count: all.length,
          returned_count: trimmed.length,
          total_outflow_mojo: totalOutflow.toString(),
          total_outflow_xch: mojoToXch(totalOutflow),
          wallets_queried: populated.map((w) => w.id),
          wallets_pending: pending,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

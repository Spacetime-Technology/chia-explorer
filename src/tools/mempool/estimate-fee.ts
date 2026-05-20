import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { get_fee_estimate } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { networkSchema } from '../../schemas/common.js';
import { mojoToXch, toBigInt } from '../../chia/amounts.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

const SPEND_TYPES = [
  'send_xch_transaction',
  'cat_spend',
  'take_offer',
  'cancel_offer',
  'nft_set_nft_did',
  'nft_transfer_nft',
  'create_new_pool_wallet',
  'pw_absorb_rewards',
  'create_new_did_wallet',
] as const;

// Approximate CLVM cost of one standard XCH spend.
const DEFAULT_SPEND_COST = 11_000_000;

// coinset's get_fee_estimate accepts only `cost` + `target_times` (it rejects `spend_type`),
// so a spend_type hint is translated into an approximate cost here. These are rough multiples
// of one standard spend, meant only to bias the estimate — pass an explicit `cost` for precision.
const SPEND_TYPE_COST: Record<(typeof SPEND_TYPES)[number], number> = {
  send_xch_transaction: DEFAULT_SPEND_COST,
  cat_spend: DEFAULT_SPEND_COST * 3,
  take_offer: DEFAULT_SPEND_COST * 4,
  cancel_offer: DEFAULT_SPEND_COST * 2,
  nft_set_nft_did: DEFAULT_SPEND_COST * 5,
  nft_transfer_nft: DEFAULT_SPEND_COST * 5,
  create_new_pool_wallet: DEFAULT_SPEND_COST * 5,
  pw_absorb_rewards: DEFAULT_SPEND_COST * 4,
  create_new_did_wallet: DEFAULT_SPEND_COST * 4,
};

export function register(server: McpServer): void {
  server.tool(
    'estimate_fee',
    'Estimate the recommended mojo fee for inclusion in the next block within each target time (in seconds). Default target_times = [60, 300, 900] (1, 5, 15 minutes). Optionally bias the estimate by passing `spend_type` and `spend_count`, or supply an explicit CLVM `cost`.',
    {
      target_times: z
        .array(z.number().int().positive())
        .min(1)
        .max(20)
        .default([60, 300, 900])
        .describe('Target inclusion times in seconds. Non-empty array, max 20 entries.'),
      cost: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional CLVM cost of the spend bundle you plan to send.'),
      spend_type: z
        .enum(SPEND_TYPES)
        .optional()
        .describe('Optional hint about the kind of spend (biases the estimate).'),
      spend_count: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional hint: number of spends in the bundle.'),
      network: networkSchema,
    },
    async ({ target_times, cost, spend_type, spend_count, network }) => {
      try {
        const agent = getAgent(network as Network);
        // coinset's get_fee_estimate accepts only `cost` + `target_times`. Resolve to a cost:
        // an explicit `cost`, else the spend_type's approximate cost (or a standard spend)
        // scaled by spend_count. This avoids the "missing field cost" / "unknown field
        // spend_type" errors coinset returns for the raw payload.
        let effectiveCost: number;
        if (cost !== undefined) {
          effectiveCost = cost;
        } else {
          const perSpend = spend_type ? SPEND_TYPE_COST[spend_type] : DEFAULT_SPEND_COST;
          effectiveCost = perSpend * (spend_count ?? 1);
        }
        const res = await get_fee_estimate(agent, { target_times, cost: effectiveCost });

        const estimates_mojo = (res.estimates ?? []).map((e) => toBigInt(e).toString());
        const estimates_xch = estimates_mojo.map((m) => mojoToXch(m));

        return jsonText({
          network,
          target_times: res.target_times,
          estimates_mojo,
          estimates_xch,
          current_fee_rate: res.current_fee_rate,
          mempool_size: res.mempool_size,
          mempool_fees: res.mempool_fees,
          full_node_synced: res.full_node_synced,
          peak_height: res.peak_height,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

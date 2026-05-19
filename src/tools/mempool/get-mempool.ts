import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  get_all_mempool_items,
  get_all_mempool_tx_ids,
} from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { networkSchema } from '../../schemas/common.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_mempool',
    'List transaction ids currently in the full node mempool. By default returns the first `limit` ids (default 100, max 1000) plus a `truncated` flag. Pass `include_items: true` to also return the full mempool items (warning: can be large on a busy mempool).',
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe('Maximum number of tx_ids (and items) to return. 1..1000.'),
      include_items: z
        .boolean()
        .default(false)
        .describe('If true, also fetch full mempool items via get_all_mempool_items.'),
      network: networkSchema,
    },
    async ({ limit, include_items, network }) => {
      try {
        const agent = getAgent(network as Network);
        const idsRes = await get_all_mempool_tx_ids(agent);
        const allIds = idsRes.tx_ids ?? [];
        const truncated = allIds.length > limit;
        const tx_ids = allIds.slice(0, limit);

        const out: Record<string, unknown> = {
          network,
          count: allIds.length,
          tx_ids,
          truncated,
          limit,
        };

        if (include_items) {
          const itemsRes = await get_all_mempool_items(agent);
          const all = itemsRes.mempool_items ?? {};
          const items: Record<string, unknown> = {};
          for (const id of tx_ids) {
            if (id in all) items[id] = all[id];
          }
          out.items = items;
        }

        return jsonText(out);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

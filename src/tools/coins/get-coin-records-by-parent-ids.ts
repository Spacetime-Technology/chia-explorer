import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAgent } from '../../coinset/agent.js';
import { fetchCoinRecordsByParentIds } from '../../coinset/pagination.js';
import { hex32Schema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_coin_records_by_parent_ids',
    'Return raw coin records for the given parent coin names. Use this to find the children produced by spending a coin. include_spent_coins defaults to true.',
    {
      parent_ids: z
        .array(hex32Schema)
        .min(1)
        .max(1000)
        .describe('32-byte coin names (parent ids), 0x-prefixed or bare hex'),
      include_spent_coins: z.boolean().optional().describe('Include spent children (default true)'),
      start_height: z.number().int().nonnegative().optional(),
      end_height: z.number().int().nonnegative().optional(),
      network: networkSchema,
    },
    async ({ parent_ids, include_spent_coins, start_height, end_height, network }) => {
      try {
        const agent = getAgent(network as Network);
        const normalized = parent_ids.map((id) => stripHexPrefix(id).toLowerCase());
        const records = await fetchCoinRecordsByParentIds(agent, normalized, {
          includeSpent: include_spent_coins ?? true,
          ...(start_height !== undefined ? { startHeight: start_height } : {}),
          ...(end_height !== undefined ? { endHeight: end_height } : {}),
        });
        return jsonText({
          network,
          parent_ids: normalized,
          parent_count: normalized.length,
          coin_count: records.length,
          coin_records: records,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

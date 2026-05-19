import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  get_additions_and_removals,
  get_block_record_by_height,
  get_block_spends,
} from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { hex32Schema, heightSchema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'count_block_transactions',
    "Count the 'transactions' in a Chia block. Returns coin_spends_count (the canonical analogue), plus additions_count and removals_count. Pass either height OR header_hash.",
    {
      height: heightSchema.optional(),
      header_hash: hex32Schema.optional(),
      network: networkSchema,
    },
    async ({ height, header_hash, network }) => {
      try {
        if (height === undefined && header_hash === undefined) {
          throw new Error('provide either height or header_hash');
        }
        const agent = getAgent(network as Network);
        let resolvedHash: string;
        let resolvedHeight: number | null = null;
        let isTransactionBlock = true;
        if (header_hash !== undefined) {
          resolvedHash = stripHexPrefix(header_hash).toLowerCase();
        } else {
          const rec = await get_block_record_by_height(agent, { height: height as number });
          if (!rec.block_record) throw new Error(`no block record at height ${height!}`);
          resolvedHash = rec.block_record.header_hash;
          resolvedHeight = rec.block_record.height;
          isTransactionBlock = rec.block_record.timestamp != null;
        }

        const [spendsRes, addRemRes] = await Promise.all([
          get_block_spends(agent, { header_hash: resolvedHash }),
          get_additions_and_removals(agent, { header_hash: resolvedHash }),
        ]);

        return jsonText({
          network,
          height: resolvedHeight,
          header_hash: resolvedHash,
          is_transaction_block: isTransactionBlock,
          coin_spends_count: spendsRes.block_spends?.length ?? 0,
          additions_count: addRemRes.additions?.length ?? 0,
          removals_count: addRemRes.removals?.length ?? 0,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

void z;

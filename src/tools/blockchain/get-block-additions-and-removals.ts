import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  get_additions_and_removals,
  get_block_record_by_height,
} from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { hex32Schema, heightSchema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_block_additions_and_removals',
    'List every coin created (additions) and destroyed (removals) in a single block. Pass either height OR header_hash. Use this when a singleton control coin and funds coin spend together — direct parent-id lookup misses the funds child but this tool surfaces it.',
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
        if (height !== undefined && header_hash !== undefined) {
          throw new Error('provide only one of height or header_hash, not both');
        }
        const agent = getAgent(network as Network);
        let resolvedHash: string;
        let resolvedHeight: number | null = null;
        if (header_hash !== undefined) {
          resolvedHash = stripHexPrefix(header_hash).toLowerCase();
        } else {
          const rec = await get_block_record_by_height(agent, { height: height as number });
          if (!rec.block_record) throw new Error(`no block record at height ${height!}`);
          resolvedHash = rec.block_record.header_hash;
          resolvedHeight = rec.block_record.height;
        }
        const res = await get_additions_and_removals(agent, { header_hash: resolvedHash });
        const additions = res.additions ?? [];
        const removals = res.removals ?? [];
        return jsonText({
          network,
          height: resolvedHeight,
          header_hash: resolvedHash,
          additions_count: additions.length,
          removals_count: removals.length,
          additions,
          removals,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

void z;

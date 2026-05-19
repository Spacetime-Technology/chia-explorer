import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { get_block_record_by_height } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { heightSchema, networkSchema } from '../../schemas/common.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_block_by_height',
    'Get the block record (including header hash, timestamp and previous hash) for a block at the given height.',
    {
      height: heightSchema,
      network: networkSchema,
    },
    async ({ height, network }) => {
      try {
        const agent = getAgent(network as Network);
        const res = await get_block_record_by_height(agent, { height });
        return jsonText({
          network,
          height,
          block_record: res.block_record,
          header_hash: res.block_record?.header_hash ?? null,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

// Silence unused-import warning in some configurations.
void z;

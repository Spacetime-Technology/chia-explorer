import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_block_record } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { hex32Schema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_block_by_hash',
    'Get the block record for a given header hash (32-byte hex, optional 0x prefix).',
    {
      header_hash: hex32Schema,
      network: networkSchema,
    },
    async ({ header_hash, network }) => {
      try {
        const agent = getAgent(network as Network);
        const normalized = stripHexPrefix(header_hash).toLowerCase();
        const res = await get_block_record(agent, { header_hash: normalized });
        return jsonText({
          network,
          header_hash: normalized,
          block_record: res.block_record,
          height: res.block_record?.height ?? null,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

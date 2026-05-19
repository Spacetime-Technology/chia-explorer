import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_puzzle_and_solution } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { hex32Schema, heightSchema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_puzzle_and_solution',
    'Fetch the CLVM puzzle reveal and solution for a coin at its spent block height. Reveals what a spend actually did — required for decoding singleton state transitions.',
    {
      coin_id: hex32Schema.describe('32-byte coin name'),
      height: heightSchema.describe(
        'The spent_block_index of the coin (the block where the coin was spent)'
      ),
      network: networkSchema,
    },
    async ({ coin_id, height, network }) => {
      try {
        const agent = getAgent(network as Network);
        const normalized = stripHexPrefix(coin_id).toLowerCase();
        const res = await get_puzzle_and_solution(agent, {
          coin_id: normalized,
          height,
        });
        return jsonText({
          network,
          coin_id: normalized,
          height,
          coin_solution: res.coin_solution,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

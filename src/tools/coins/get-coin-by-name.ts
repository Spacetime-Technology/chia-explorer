import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_coin_record_by_name } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { hex32Schema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { mojoToXch, toBigInt } from '../../chia/amounts.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_coin_by_name',
    'Look up a coin record by its coin name (the 32-byte sha256 of parent_coin_info || puzzle_hash || amount).',
    {
      name: hex32Schema,
      network: networkSchema,
    },
    async ({ name, network }) => {
      try {
        const agent = getAgent(network as Network);
        const normalized = stripHexPrefix(name).toLowerCase();
        const res = await get_coin_record_by_name(agent, { name: normalized });
        const record = res.coin_record;
        return jsonText({
          network,
          coin_name: normalized,
          coin_record: record,
          ...(record
            ? {
                amount_mojo: record.coin.amount.toString(),
                amount_xch: mojoToXch(toBigInt(record.coin.amount)),
              }
            : {}),
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

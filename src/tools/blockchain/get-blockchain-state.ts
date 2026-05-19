import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_blockchain_state } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { formatNetspace } from '../../chia/amounts.js';
import { networkSchema } from '../../schemas/common.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_blockchain_state',
    'Get the current Chia blockchain state: peak height, netspace (raw + formatted EiB/PiB), difficulty, mempool stats and sync status. Defaults to mainnet.',
    { network: networkSchema },
    async ({ network }) => {
      try {
        const agent = getAgent(network as Network);
        const res = await get_blockchain_state(agent);
        const bs = res.blockchain_state;
        const space = formatNetspace(bs.space);
        return jsonText({
          network,
          peak_height: bs.peak?.height ?? null,
          peak_header_hash: bs.peak?.header_hash ?? null,
          peak_timestamp: bs.peak?.timestamp ?? null,
          space_bytes: space.bytes,
          space_eib: space.eib,
          space_pib: space.pib,
          space_human: space.human,
          difficulty: bs.difficulty,
          sub_slot_iters: bs.sub_slot_iters,
          average_block_time_seconds: bs.average_block_time ?? null,
          mempool_size: bs.mempool_size,
          mempool_cost: bs.mempool_cost,
          mempool_min_fees: bs.mempool_min_fees,
          sync: bs.sync,
          node_id: bs.node_id,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

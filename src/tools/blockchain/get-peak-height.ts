import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_blockchain_state } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { networkSchema } from '../../schemas/common.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_peak_height',
    'Get the current peak block height of the Chia blockchain.',
    { network: networkSchema },
    async ({ network }) => {
      try {
        const agent = getAgent(network as Network);
        const res = await get_blockchain_state(agent);
        const peak = res.blockchain_state.peak;
        return jsonText({
          network,
          peak_height: peak?.height ?? null,
          peak_header_hash: peak?.header_hash ?? null,
          peak_timestamp: peak?.timestamp ?? null,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

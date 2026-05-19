import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_blockchain_state } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { formatNetspace } from '../../chia/amounts.js';
import { networkSchema } from '../../schemas/common.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_netspace',
    'Get the current Chia netspace (estimated total network space). Returns raw bytes and formatted values in EiB, PiB, and TiB.',
    { network: networkSchema },
    async ({ network }) => {
      try {
        const agent = getAgent(network as Network);
        const res = await get_blockchain_state(agent);
        const space = formatNetspace(res.blockchain_state.space);
        return jsonText({
          network,
          bytes: space.bytes,
          eib: space.eib,
          pib: space.pib,
          tib: space.tib,
          human: space.human,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

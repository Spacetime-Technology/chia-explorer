import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_mempool_item_by_tx_id } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { hex32Schema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'is_in_mempool',
    'Check whether a specific transaction id (the spend bundle hash) is currently sitting in the full node mempool. Returns `in_mempool: true` with the mempool item, or `in_mempool: false` if the node has no record of it.',
    {
      tx_id: hex32Schema.describe(
        '32-byte transaction id (spend bundle hash). Hex, optional 0x prefix.'
      ),
      network: networkSchema,
    },
    async ({ tx_id, network }) => {
      const normalized = stripHexPrefix(tx_id).toLowerCase();
      try {
        const agent = getAgent(network as Network);
        try {
          const res = await get_mempool_item_by_tx_id(agent, { tx_id: normalized });
          const item = res.mempool_item;
          if (!item) {
            return jsonText({ network, tx_id: normalized, in_mempool: false });
          }
          return jsonText({ network, tx_id: normalized, in_mempool: true, item });
        } catch (rpcErr) {
          // Coinset returns an error response when the tx_id isn't in the mempool.
          // Treat both null and thrown-RPC as "not found".
          const message = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
          if (/not in the mempool|not.*found|no.*mempool/i.test(message)) {
            return jsonText({ network, tx_id: normalized, in_mempool: false });
          }
          throw rpcErr;
        }
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

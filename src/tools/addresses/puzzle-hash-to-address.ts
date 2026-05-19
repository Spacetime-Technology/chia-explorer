import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { hex32Schema, networkSchema } from '../../schemas/common.js';
import { puzzleHashToAddress } from '../../chia/bech32.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'puzzle_hash_to_address',
    'Encode a 32-byte puzzle hash to a bech32m xch/txch address. Use `network` to select mainnet (xch) or testnet11 (txch). Local computation only — no RPC.',
    {
      puzzle_hash: hex32Schema,
      network: networkSchema,
    },
    async ({ puzzle_hash, network }) => {
      try {
        const ph = stripHexPrefix(puzzle_hash).toLowerCase();
        const address = puzzleHashToAddress(ph, network as Network);
        return jsonText({
          puzzle_hash: ph,
          network,
          address,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addressSchema } from '../../schemas/common.js';
import { addressToPuzzleHash } from '../../chia/bech32.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'address_to_puzzle_hash',
    'Decode an xch1/txch1 bech32m address to its 32-byte puzzle hash. Also reports the detected network. Local computation only — no RPC.',
    {
      address: addressSchema,
    },
    async ({ address }) => {
      try {
        const { puzzleHash, network } = addressToPuzzleHash(address.trim());
        return jsonText({
          address: address.trim().toLowerCase(),
          puzzle_hash: puzzleHash,
          network,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

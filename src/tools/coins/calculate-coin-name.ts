import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { coinName } from '../../chia/coin-name.js';
import { hex32Schema } from '../../schemas/common.js';
import { errorText, jsonText } from '../shared/response.js';

const amountSchema = z
  .union([z.string(), z.number().int().nonnegative()])
  .describe(
    'Coin amount in mojos. Strings are accepted for values that exceed JS number precision.'
  );

export function register(server: McpServer): void {
  server.tool(
    'calculate_coin_name',
    'Compute the coin name (sha256 of parent_coin_info || puzzle_hash || amount). Local computation only — no RPC.',
    {
      parent_coin_info: hex32Schema.describe('32-byte parent coin id (hex)'),
      puzzle_hash: hex32Schema.describe('32-byte puzzle hash (hex)'),
      amount: amountSchema,
    },
    async ({ parent_coin_info, puzzle_hash, amount }) => {
      try {
        const name = coinName({ parent_coin_info, puzzle_hash, amount });
        return jsonText({
          coin_name: name,
          parent_coin_info: parent_coin_info.toLowerCase().replace(/^0x/, ''),
          puzzle_hash: puzzle_hash.toLowerCase().replace(/^0x/, ''),
          amount: amount.toString(),
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAgent } from '../../coinset/agent.js';
import { fetchCoinRecordsByPuzzleHash } from '../../coinset/pagination.js';
import { addressOrPuzzleHashSchema, networkSchemaOptional } from '../../schemas/common.js';
import { Network } from '../../network.js';
import { resolveAddressOrPuzzleHash } from '../shared/address-input.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_coin_records_by_puzzle_hash',
    'Return raw coin records for an address or puzzle hash. Optionally include spent coins or restrict to a height window.',
    {
      address_or_puzzle_hash: addressOrPuzzleHashSchema,
      include_spent_coins: z.boolean().optional().describe('Include spent coins (default false)'),
      start_height: z.number().int().nonnegative().optional(),
      end_height: z.number().int().nonnegative().optional(),
      network: networkSchemaOptional,
    },
    async ({ address_or_puzzle_hash, include_spent_coins, start_height, end_height, network }) => {
      try {
        const target = resolveAddressOrPuzzleHash(
          address_or_puzzle_hash,
          network as Network | undefined
        );
        const agent = getAgent(target.network);
        const records = await fetchCoinRecordsByPuzzleHash(agent, target.puzzleHash, {
          includeSpent: include_spent_coins ?? false,
          ...(start_height !== undefined ? { startHeight: start_height } : {}),
          ...(end_height !== undefined ? { endHeight: end_height } : {}),
        });
        return jsonText({
          network: target.network,
          address: target.address,
          puzzle_hash: target.puzzleHash,
          coin_count: records.length,
          coin_records: records,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { get_puzzle_and_solution } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { classifyPuzzle, parseConditions } from '../../chia/offer.js';
import { hex32Schema, heightSchema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'decompile_puzzle',
    'Classify a Chia CLVM puzzle reveal. Returns its kind (xch, cat, nft, did, singleton, unknown), asset_id for CATs, launcher_id for NFTs/DIDs, and the inner p2 puzzle hash. Either pass `puzzle_reveal` as hex directly, OR pass `coin_id` + `height` to auto-fetch from the full node. Set `include_conditions: true` to also parse the conditions a spend emits (requires `solution` hex, or a spent coin reachable via coin_id + height).',
    {
      puzzle_reveal: z
        .string()
        .optional()
        .describe('Hex-encoded puzzle reveal. Omit to auto-fetch via coin_id + height.'),
      solution: z
        .string()
        .optional()
        .describe('Hex-encoded solution. Only used when include_conditions is true.'),
      coin_id: hex32Schema
        .optional()
        .describe('32-byte coin id. Use with `height` to auto-fetch the puzzle reveal.'),
      height: heightSchema
        .optional()
        .describe('The spent_block_index of the coin (where it was spent).'),
      include_conditions: z
        .boolean()
        .default(false)
        .describe('If true, run the puzzle with the solution and parse the emitted conditions.'),
      network: networkSchema,
    },
    async ({ puzzle_reveal, solution, coin_id, height, include_conditions, network }) => {
      try {
        let revealHex = puzzle_reveal;
        let solutionHex = solution;

        if (!revealHex) {
          if (!coin_id || height === undefined) {
            throw new Error(
              'must supply either `puzzle_reveal` (hex) or both `coin_id` and `height` to auto-fetch'
            );
          }
          const agent = getAgent(network as Network);
          const normalizedCoinId = stripHexPrefix(coin_id).toLowerCase();
          const res = await get_puzzle_and_solution(agent, {
            coin_id: normalizedCoinId,
            height,
          });
          revealHex = res.coin_solution.puzzle_reveal;
          if (!solutionHex) solutionHex = res.coin_solution.solution;
        }

        const classification = classifyPuzzle(revealHex);
        const out: Record<string, unknown> = { classification };

        if (include_conditions) {
          if (!solutionHex) {
            throw new Error(
              '`include_conditions: true` requires a `solution` argument (or a fetchable coin_id + height that yields one)'
            );
          }
          out.parsed_conditions = parseConditions(revealHex, solutionHex);
        }

        return jsonText(out);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

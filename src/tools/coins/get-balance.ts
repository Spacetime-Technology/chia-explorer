import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAgent } from '../../coinset/agent.js';
import { fetchCoinRecordsByPuzzleHash } from '../../coinset/pagination.js';
import { mojoToXch, toBigInt } from '../../chia/amounts.js';
import { addressOrPuzzleHashSchema, networkSchemaOptional } from '../../schemas/common.js';
import { Network } from '../../network.js';
import { resolveAddressOrPuzzleHash } from '../shared/address-input.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_balance',
    'Get the XCH balance of an address or puzzle hash. Sums all unspent coins (paginated). Accepts xch/txch addresses (network auto-detected from prefix) or a 32-byte hex puzzle hash (network defaults to mainnet, override with `network`).',
    {
      address_or_puzzle_hash: addressOrPuzzleHashSchema,
      network: networkSchemaOptional,
    },
    async ({ address_or_puzzle_hash, network }) => {
      try {
        const target = resolveAddressOrPuzzleHash(
          address_or_puzzle_hash,
          network as Network | undefined
        );
        const agent = getAgent(target.network);
        const records = await fetchCoinRecordsByPuzzleHash(agent, target.puzzleHash, {
          includeSpent: false,
        });
        let total = 0n;
        for (const r of records) total += toBigInt(r.coin.amount);
        return jsonText({
          network: target.network,
          address: target.address,
          puzzle_hash: target.puzzleHash,
          unspent_coin_count: records.length,
          balance_mojo: total.toString(),
          balance_xch: mojoToXch(total),
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function register(server: McpServer): void {
  server.registerPrompt(
    'address_summary',
    {
      title: 'Chia address summary',
      description: 'Balance and recent activity for a Chia address or puzzle hash.',
      argsSchema: {
        address: z.string().describe('An xch/txch bech32m address OR a 32-byte hex puzzle hash.'),
        network: z
          .enum(['mainnet', 'testnet11'])
          .optional()
          .describe('Override network. Auto-detected from address prefix when omitted.'),
      },
    },
    ({ address, network }) => {
      const lines = [
        `Summarise the address ${address} on the Chia blockchain.`,
        ``,
        `Steps:`,
        `1. If the input looks like a bech32m address (starts with xch1 or txch1), call \`address_to_puzzle_hash\` to confirm the puzzle hash and detected network. If it is a hex puzzle hash, call \`puzzle_hash_to_address\` with the appropriate network to produce the address.`,
        `2. Call \`get_balance\` with \`address_or_puzzle_hash: "${address}"\`${network ? ` and \`network: "${network}"\`` : ''}.`,
        `3. Call \`get_coin_records_by_puzzle_hash\` with the same input, \`include_spent_coins: false\`, to fetch unspent coins. If the count is large, show only the 10 highest-value coins.`,
        `4. Present:`,
        `   - Network and address (canonical form).`,
        `   - Puzzle hash.`,
        `   - Balance in XCH and mojos.`,
        `   - Number of unspent coins.`,
        `   - Top coins by amount (coin amount in XCH, confirmed_block_index).`,
        `5. Keep the summary short. Use plain prose, no tables unless the user asks.`,
      ];
      return {
        messages: [{ role: 'user', content: { type: 'text', text: lines.join('\n') } }],
      };
    }
  );
}

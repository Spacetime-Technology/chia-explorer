import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function register(server: McpServer): void {
  server.registerPrompt(
    'prefarm_summary',
    {
      title: 'Chia strategic-reserve summary',
      description:
        'Summarise the Chia strategic reserve: how much pre-farm has been spent, how much remains, and where it has gone.',
      argsSchema: {},
    },
    () => {
      const text = [
        `Summarise the state of the Chia strategic reserve (the 21M XCH pre-farm).`,
        ``,
        `Steps:`,
        `1. Call \`get_prefarm_status\` to get headline numbers and per-wallet balances.`,
        `2. Call \`get_prefarm_spends\` with \`limit: 10\` to get the most recent outflows.`,
        `3. Call \`get_xch_price\` to convert spent and remaining amounts to USD.`,
        ``,
        `Present, in this order:`,
        `- Total spent vs remaining as both XCH and USD, with the percentage of the 21M reserve spent so far. If some wallets are pending population, say so explicitly and base the percentage only on tracked wallets.`,
        `- Per-wallet breakdown: id, balance in XCH, percent of its allocation spent. Skip wallets marked \`pending\`.`,
        `- Last few outflows: height, amount in XCH, destination label (or "unknown" if unlabelled). Skip internal rotations between custody wallets.`,
        ``,
        `Keep it tight. Plain prose, no tables unless asked.`,
      ].join('\n');
      return {
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function register(server: McpServer): void {
  server.registerPrompt(
    'network_status',
    {
      title: 'Chia network status',
      description:
        'Summarise the current state of the Chia blockchain: peak height, netspace, sync, difficulty.',
      argsSchema: {
        network: z
          .enum(['mainnet', 'testnet11'])
          .optional()
          .describe('Network to query. Defaults to mainnet.'),
      },
    },
    ({ network }) => {
      const net = network ?? 'mainnet';
      const text =
        `Summarise the current state of the Chia ${net} blockchain.\n\n` +
        `Steps:\n` +
        `1. Call \`get_blockchain_state\` with \`network: "${net}"\`.\n` +
        `2. From the response present, in this order:\n` +
        `   - Peak height and the time of that block (timestamp, as UTC).\n` +
        `   - Netspace in EiB (use \`space_eib\` plus a "PiB" fallback if it is less than 1 EiB).\n` +
        `   - Difficulty and sub_slot_iters.\n` +
        `   - Sync status: synced yes/no, plus sync_tip_height and sync_progress_height if not synced.\n` +
        `   - Mempool size and cost.\n` +
        `3. Keep the summary short and scannable. One short line per item.`;
      return {
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }
  );
}

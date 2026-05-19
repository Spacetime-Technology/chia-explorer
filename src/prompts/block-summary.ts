import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function register(server: McpServer): void {
  server.registerPrompt(
    'block_summary',
    {
      title: 'Chia block summary',
      description: 'Block details plus transaction counts, by height or header hash.',
      argsSchema: {
        height: z
          .string()
          .optional()
          .describe('Block height (as a string — MCP prompt args are strings).'),
        header_hash: z
          .string()
          .optional()
          .describe('Block header hash (32-byte hex, optional 0x prefix).'),
        network: z
          .enum(['mainnet', 'testnet11'])
          .optional()
          .describe('Network. Defaults to mainnet.'),
      },
    },
    ({ height, header_hash, network }) => {
      const net = network ?? 'mainnet';
      const lookupCall = header_hash
        ? `\`get_block_by_hash\` with \`header_hash: "${header_hash}"\` and \`network: "${net}"\``
        : height !== undefined
          ? `\`get_block_by_height\` with \`height: ${height}\` and \`network: "${net}"\``
          : `either \`get_block_by_height\` (if a height is supplied) or \`get_block_by_hash\` (if a header hash is supplied)`;

      const countCall = header_hash
        ? `\`count_block_transactions\` with \`header_hash: "${header_hash}"\` and \`network: "${net}"\``
        : height !== undefined
          ? `\`count_block_transactions\` with \`height: ${height}\` and \`network: "${net}"\``
          : `\`count_block_transactions\` with the matching identifier and \`network: "${net}"\``;

      const text = [
        `Summarise the Chia ${net} block.`,
        ``,
        `Steps:`,
        `1. Fetch the block record via ${lookupCall}.`,
        `2. Fetch transaction counts via ${countCall}.`,
        `3. Present:`,
        `   - Height and header hash (and previous hash).`,
        `   - Timestamp (UTC). If null, note that this is not a transaction block.`,
        `   - is_transaction_block.`,
        `   - coin_spends_count, additions_count, removals_count.`,
        `4. Keep it short.`,
      ].join('\n');

      return {
        messages: [{ role: 'user', content: { type: 'text', text } }],
      };
    }
  );
}

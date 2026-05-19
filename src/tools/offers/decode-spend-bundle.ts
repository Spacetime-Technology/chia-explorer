import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { summarizeSpendBundleHex } from '../../chia/offer.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'decode_spend_bundle',
    'Decode a raw hex-encoded Chia spend bundle (e.g. a mempool item, or any bundle that is not wrapped in an offer string) into the same structured trade-summary shape as decode_offer. Useful for inspecting pending mempool transactions.',
    {
      spend_bundle: z
        .string()
        .min(1)
        .describe('Hex-encoded spend bundle bytes (with or without 0x prefix).'),
    },
    async ({ spend_bundle }) => {
      try {
        const summary = summarizeSpendBundleHex(spend_bundle);
        return jsonText(summary);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

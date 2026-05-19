import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { decodeOfferString } from '../../chia/offer.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'decode_offer',
    "Decode a Chia 'offer1...' string locally (no external API). Returns a structured trade summary: what assets are offered, what is requested, and per-asset amounts and IDs. Classifies XCH, CATs (with asset_id), NFTs (with launcher_id), and DIDs.",
    {
      offer: z
        .string()
        .min(1)
        .describe("A Chia offer string starting with 'offer1'. Bech32m-encoded."),
    },
    async ({ offer }) => {
      try {
        const summary = decodeOfferString(offer);
        return jsonText(summary);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

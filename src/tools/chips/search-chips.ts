import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchChips } from '../../chips/index.js';
import {
  chipStatusFilterSchema,
  searchLimitSchema,
  searchQuerySchema,
  searchSourceSchema,
} from '../../schemas/chips.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'search_chips',
    'Case-insensitive keyword search across merged CHIPs and open PR drafts. Matches against title, description, abstract, authors, and CHIP number. Optional filters: status, source (merged | draft | both, default both), limit (default 20).',
    {
      query: searchQuerySchema,
      status: chipStatusFilterSchema,
      source: searchSourceSchema,
      limit: searchLimitSchema,
    },
    async ({ query, status, source, limit }) => {
      try {
        const opts: { source: 'merged' | 'draft' | 'both'; limit: number; status?: string } = {
          source,
          limit,
        };
        if (status !== undefined) opts.status = status;
        const matches = await searchChips(query, opts);
        return jsonText({
          query,
          source,
          count: matches.length,
          matches,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

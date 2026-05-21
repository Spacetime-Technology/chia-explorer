import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listChipsFromReadme } from '../../chips/index.js';
import { chipCategoryFilterSchema, chipStatusFilterSchema } from '../../schemas/chips.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'list_chips',
    'List all Chia Improvement Proposals (CHIPs) from the canonical index in the Chia-Network/chips repo README, across every status (Living, Draft, Review, Final, Stagnant, Withdrawn, Obsolete, Grandfathered, Under Consideration). Draft and Review entries point to open PRs; Final entries point to merged files on main. Status comes from the README (authoritative); category, authors, and abstract are enriched from front matter when a CHIP file is available. Use this to find the most recent CHIPs — they are typically in Draft. Optional filters: status, category.',
    {
      status: chipStatusFilterSchema,
      category: chipCategoryFilterSchema,
    },
    async ({ status, category }) => {
      try {
        const all = await listChipsFromReadme();
        const statusLc = status?.toLowerCase();
        const categoryLc = category?.toLowerCase();
        const filtered = all.filter((c) => {
          if (statusLc && (c.status?.toLowerCase() ?? '') !== statusLc) return false;
          if (categoryLc && (c.category?.toLowerCase() ?? '') !== categoryLc) return false;
          return true;
        });
        return jsonText({
          source: 'github',
          repo: 'Chia-Network/chips',
          index: 'README.md',
          count: filtered.length,
          chips: filtered,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

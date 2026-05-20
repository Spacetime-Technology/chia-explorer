import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listMergedChips } from '../../chips/index.js';
import { chipCategoryFilterSchema, chipStatusFilterSchema } from '../../schemas/chips.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'list_chips',
    'List Chia Improvement Proposals (CHIPs) merged on the main branch of Chia-Network/chips. Returns parsed metadata (number, title, status, category, authors, abstract, dates) for every CHIP. Optional filters: status, category. For in-progress CHIPs in open PRs use list_chip_drafts.',
    {
      status: chipStatusFilterSchema,
      category: chipCategoryFilterSchema,
    },
    async ({ status, category }) => {
      try {
        const all = await listMergedChips();
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
          ref: 'main',
          count: filtered.length,
          chips: filtered,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

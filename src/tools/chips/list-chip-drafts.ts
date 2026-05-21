import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listChipDrafts } from '../../chips/index.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'list_chip_drafts',
    'List the live state of every open pull request against Chia-Network/chips that adds or modifies a CHIP file. Use this for PR review context (author, requested reviewers, draft flag, updated_at) and the modifies_existing flag for amendments. PRs that do not touch a CHIPs/chip-*.md file are filtered out. For the canonical CHIP index across all statuses (including Draft proposals), use list_chips.',
    {},
    async () => {
      try {
        const drafts = await listChipDrafts();
        return jsonText({
          source: 'github',
          repo: 'Chia-Network/chips',
          count: drafts.length,
          drafts,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

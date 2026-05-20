import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listChipDrafts } from '../../chips/index.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'list_chip_drafts',
    'List open pull requests against Chia-Network/chips that add or modify a CHIP file. Each entry includes parsed front matter from the proposed file plus PR context (number, url, author, requested reviewers, draft flag, updated_at) and a modifies_existing flag for amendments. PRs that do not touch a CHIPs/chip-*.md file are filtered out.',
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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findChipByNumber } from '../../chips/index.js';
import { chipNumberSchema, includeBodySchema } from '../../schemas/chips.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'get_chip',
    'Get a single CHIP by number. Looks first on main (merged) and also surfaces any open PRs proposing changes to the same number. Returns parsed front matter, abstract, source URL, and (with include_body=true) the full markdown body.',
    {
      number: chipNumberSchema,
      include_body: includeBodySchema,
    },
    async ({ number, include_body }) => {
      try {
        const { merged, drafts } = await findChipByNumber(number, { includeBody: include_body });
        if (!merged && drafts.length === 0) {
          return jsonText({
            number,
            found: false,
            message: `no CHIP ${number} on main or in open PRs`,
          });
        }
        return jsonText({
          number,
          found: true,
          merged,
          drafts,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getForks } from '../../chia-docs/index.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'list_forks',
    'List every Chia consensus fork (hard and soft) with current status, drawn from the canonical docs page at https://docs.chia.net/chia-blockchain/consensus/forks/ (sourced from the Chia-Network/chia-docs GitHub repo). Each entry has type ("hard" | "soft"), name, activation_block, activation_date, build, status (e.g. Activated, Planned), and a purpose_url linking to the relevant CHIP, post-mortem, or blog post when available. Includes the source\'s last_updated date so callers can judge freshness. No arguments, no network selector (consensus forks are protocol-level).',
    {},
    async () => {
      try {
        const result = await getForks();
        return jsonText(result);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

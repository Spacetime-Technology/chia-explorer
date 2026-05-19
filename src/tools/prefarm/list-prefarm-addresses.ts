import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mojoToXch } from '../../chia/amounts.js';
import {
  KNOWN_DESTINATIONS,
  PREFARM_WALLETS,
  TOTAL_PREFARM_ALLOCATION_MOJO,
} from '../../prefarm/registry.js';
import { jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'list_prefarm_addresses',
    'Return the hardcoded registry of Chia strategic-reserve custody wallets and labelled destination addresses (partners, market makers, exchanges). Identities only — balances are not returned here; call `get_prefarm_status` for live amounts. Pure local data, no network call.',
    {},
    async () => {
      const wallets = PREFARM_WALLETS.map((w) => ({
        id: w.id,
        label: w.label,
        region: w.region,
        temperature: w.temperature,
        addresses: w.addresses,
        puzzle_hashes: w.puzzleHashes,
        pending: w.addresses.length === 0,
      }));
      const destinations = KNOWN_DESTINATIONS.map((d) => ({
        address: d.address,
        puzzle_hash: d.puzzleHash,
        entity: d.entity,
        label: d.label,
        category: d.category,
      }));
      return jsonText({
        wallets,
        destinations,
        total_allocation_mojo: TOTAL_PREFARM_ALLOCATION_MOJO.toString(),
        total_allocation_xch: mojoToXch(TOTAL_PREFARM_ALLOCATION_MOJO),
        wallets_configured: wallets.filter((w) => !w.pending).length,
        wallets_pending: wallets.filter((w) => w.pending).length,
        destinations_configured: destinations.length,
      });
    }
  );
}

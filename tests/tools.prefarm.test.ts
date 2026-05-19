import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mocks = vi.hoisted(() => ({
  get_coin_records_by_puzzle_hash: vi.fn(),
  get_coin_records_by_parent_ids: vi.fn(),
}));

vi.mock('chia-agent/api/rpc/full_node/index.js', () => mocks);

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');
const { PREFARM_WALLETS, TOTAL_PREFARM_ALLOCATION_MOJO } =
  await import('../src/prefarm/registry.js');
const { mojoToXch } = await import('../src/chia/amounts.js');

describe('prefarm tools', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
  });

  it('list_prefarm_addresses returns the four wallets and the 21M genesis constant', async () => {
    const res = await client.callTool({ name: 'list_prefarm_addresses', arguments: {} });
    const body = parseToolText(res) as {
      wallets: Array<{ id: string; addresses: string[]; pending: boolean }>;
      destinations: unknown[];
      total_allocation_mojo: string;
      total_allocation_xch: string;
      wallets_configured: number;
      wallets_pending: number;
    };
    const ids = body.wallets.map((w) => w.id).sort();
    expect(ids).toEqual(['ch-cold', 'ch-warm', 'us-cold', 'us-warm']);
    expect(body.total_allocation_mojo).toBe(TOTAL_PREFARM_ALLOCATION_MOJO.toString());
    expect(body.total_allocation_xch).toBe(mojoToXch(TOTAL_PREFARM_ALLOCATION_MOJO));
    expect(body.wallets_configured + body.wallets_pending).toBe(4);
    // Configured wallets must have at least one address.
    for (const w of body.wallets.filter((w) => !w.pending)) {
      expect(w.addresses.length).toBeGreaterThan(0);
    }
  });

  it('get_prefarm_status sums balances across every puzzle hash of every configured wallet', async () => {
    const populated = PREFARM_WALLETS.filter((w) => w.addresses.length > 0);
    const totalPuzzleHashes = populated.reduce((acc, w) => acc + w.puzzleHashes.length, 0);
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({
      coin_records: [
        {
          coin: {
            parent_coin_info: '0'.repeat(64),
            puzzle_hash: '0'.repeat(64),
            amount: 1_000_000_000_000n,
          },
          confirmed_block_index: 1,
          spent_block_index: 0,
          coinbase: false,
          timestamp: 1_700_000_000,
        },
      ],
    });
    const res = await client.callTool({ name: 'get_prefarm_status', arguments: {} });
    const body = parseToolText(res) as {
      wallets: Array<{ id: string; pending: boolean; balance_mojo: string | null }>;
      totals: {
        allocation_mojo: string;
        tracked_balance_mojo: string;
        tracked_spent_pct: number | null;
      };
      wallets_configured: number;
    };
    expect(body.wallets_configured).toBe(populated.length);
    expect(body.totals.allocation_mojo).toBe(TOTAL_PREFARM_ALLOCATION_MOJO.toString());
    // One coin per puzzle-hash query, 1 XCH each → total = totalPuzzleHashes XCH (in mojos).
    expect(BigInt(body.totals.tracked_balance_mojo)).toBe(
      BigInt(totalPuzzleHashes) * 1_000_000_000_000n
    );
    if (populated.length === PREFARM_WALLETS.length) {
      expect(body.totals.tracked_spent_pct).not.toBeNull();
    }
  });

  it('get_prefarm_spends returns an empty list when there are no spent coins', async () => {
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({ coin_records: [] });
    const res = await client.callTool({ name: 'get_prefarm_spends', arguments: { limit: 5 } });
    const body = parseToolText(res) as {
      spends: unknown[];
      total_spend_count: number;
      total_outflow_mojo: string;
      wallets_pending: string[];
    };
    expect(body.spends).toEqual([]);
    expect(body.total_spend_count).toBe(0);
    expect(body.total_outflow_mojo).toBe('0');
  });

  it('get_prefarm_spends rejects an unknown wallet_id at the schema layer', async () => {
    const res = (await client.callTool({
      name: 'get_prefarm_spends',
      arguments: { wallet_id: 'not-a-wallet' },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mocks = vi.hoisted(() => ({
  get_all_mempool_tx_ids: vi.fn(),
  get_all_mempool_items: vi.fn(),
  get_mempool_item_by_tx_id: vi.fn(),
  get_fee_estimate: vi.fn(),
}));

vi.mock('chia-agent/api/rpc/full_node/index.js', () => mocks);

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');

describe('mempool tools (mocked RPC)', () => {
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

  describe('get_mempool', () => {
    it('returns count + tx_ids, no items by default', async () => {
      const ids = Array.from({ length: 5 }, (_, i) => i.toString(16).padStart(64, '0'));
      mocks.get_all_mempool_tx_ids.mockResolvedValue({ tx_ids: ids });

      const res = await client.callTool({ name: 'get_mempool', arguments: {} });
      const body = parseToolText(res) as {
        count: number;
        tx_ids: string[];
        truncated: boolean;
        items?: unknown;
      };
      expect(body.count).toBe(5);
      expect(body.tx_ids).toEqual(ids);
      expect(body.truncated).toBe(false);
      expect(body.items).toBeUndefined();
      expect(mocks.get_all_mempool_items).not.toHaveBeenCalled();
    });

    it('truncates when there are more ids than limit', async () => {
      const ids = Array.from({ length: 250 }, (_, i) => i.toString(16).padStart(64, '0'));
      mocks.get_all_mempool_tx_ids.mockResolvedValue({ tx_ids: ids });

      const res = await client.callTool({
        name: 'get_mempool',
        arguments: { limit: 100 },
      });
      const body = parseToolText(res) as { count: number; tx_ids: string[]; truncated: boolean };
      expect(body.count).toBe(250);
      expect(body.tx_ids).toHaveLength(100);
      expect(body.truncated).toBe(true);
    });

    it('include_items returns the full mempool item map for the returned tx_ids', async () => {
      const id1 = '11'.repeat(32);
      const id2 = '22'.repeat(32);
      mocks.get_all_mempool_tx_ids.mockResolvedValue({ tx_ids: [id1, id2] });
      mocks.get_all_mempool_items.mockResolvedValue({
        mempool_items: {
          [id1]: { spend_bundle: 'sb1', fee: 100 },
          [id2]: { spend_bundle: 'sb2', fee: 200 },
        },
      });

      const res = await client.callTool({
        name: 'get_mempool',
        arguments: { include_items: true },
      });
      const body = parseToolText(res) as { items: Record<string, { fee: number }> };
      expect(Object.keys(body.items).sort()).toEqual([id1, id2].sort());
      expect(body.items[id1]?.fee).toBe(100);
    });

    it('rejects limit > 1000', async () => {
      const res = (await client.callTool({
        name: 'get_mempool',
        arguments: { limit: 1001 },
      })) as { isError?: boolean };
      expect(res.isError).toBe(true);
    });

    it('handles an empty mempool', async () => {
      mocks.get_all_mempool_tx_ids.mockResolvedValue({ tx_ids: [] });
      const res = await client.callTool({ name: 'get_mempool', arguments: {} });
      const body = parseToolText(res) as { count: number; tx_ids: string[]; truncated: boolean };
      expect(body.count).toBe(0);
      expect(body.tx_ids).toEqual([]);
      expect(body.truncated).toBe(false);
    });
  });

  describe('is_in_mempool', () => {
    it('returns in_mempool=true with the item when found', async () => {
      const txId = 'ab'.repeat(32);
      mocks.get_mempool_item_by_tx_id.mockResolvedValue({
        mempool_item: { spend_bundle: 'sb', fee: 50 },
      });
      const res = await client.callTool({
        name: 'is_in_mempool',
        arguments: { tx_id: txId },
      });
      const body = parseToolText(res) as { in_mempool: boolean; item: { fee: number } };
      expect(body.in_mempool).toBe(true);
      expect(body.item.fee).toBe(50);
      expect(mocks.get_mempool_item_by_tx_id).toHaveBeenCalledWith(expect.anything(), {
        tx_id: txId,
      });
    });

    it('returns in_mempool=false when mempool_item is null', async () => {
      mocks.get_mempool_item_by_tx_id.mockResolvedValue({ mempool_item: null });
      const res = await client.callTool({
        name: 'is_in_mempool',
        arguments: { tx_id: 'cd'.repeat(32) },
      });
      const body = parseToolText(res) as { in_mempool: boolean; item?: unknown };
      expect(body.in_mempool).toBe(false);
      expect(body.item).toBeUndefined();
    });

    it('returns in_mempool=false when the RPC throws a "not in mempool" error', async () => {
      mocks.get_mempool_item_by_tx_id.mockRejectedValue(
        new Error('Transaction is not in the mempool')
      );
      const res = await client.callTool({
        name: 'is_in_mempool',
        arguments: { tx_id: 'ef'.repeat(32) },
      });
      const body = parseToolText(res) as { in_mempool: boolean };
      expect(body.in_mempool).toBe(false);
    });

    it('rejects non-hex32 tx_id', async () => {
      const res = (await client.callTool({
        name: 'is_in_mempool',
        arguments: { tx_id: 'notahash' },
      })) as { isError?: boolean };
      expect(res.isError).toBe(true);
    });

    it('strips 0x prefix from tx_id before calling RPC', async () => {
      mocks.get_mempool_item_by_tx_id.mockResolvedValue({ mempool_item: null });
      const txId = '12'.repeat(32);
      await client.callTool({
        name: 'is_in_mempool',
        arguments: { tx_id: '0x' + txId },
      });
      expect(mocks.get_mempool_item_by_tx_id).toHaveBeenCalledWith(expect.anything(), {
        tx_id: txId,
      });
    });
  });

  describe('estimate_fee', () => {
    it('passes default target_times [60,300,900] when none supplied', async () => {
      mocks.get_fee_estimate.mockResolvedValue({
        estimates: [0, 1000, 5000],
        target_times: [60, 300, 900],
        current_fee_rate: 0,
        mempool_size: 0,
        mempool_fees: 0,
        full_node_synced: true,
        peak_height: 100,
      });
      const res = await client.callTool({ name: 'estimate_fee', arguments: {} });
      const body = parseToolText(res) as {
        target_times: number[];
        estimates_mojo: string[];
        estimates_xch: string[];
      };
      expect(body.target_times).toEqual([60, 300, 900]);
      expect(body.estimates_mojo).toEqual(['0', '1000', '5000']);
      expect(body.estimates_xch[0]).toBe('0');
      expect(mocks.get_fee_estimate).toHaveBeenCalledWith(expect.anything(), {
        target_times: [60, 300, 900],
      });
    });

    it('forwards spend_type, spend_count and cost when supplied', async () => {
      mocks.get_fee_estimate.mockResolvedValue({
        estimates: [0],
        target_times: [60],
        current_fee_rate: 0,
        mempool_size: 0,
        mempool_fees: 0,
        full_node_synced: true,
        peak_height: 1,
      });
      await client.callTool({
        name: 'estimate_fee',
        arguments: {
          target_times: [60],
          cost: 1_000_000,
          spend_type: 'take_offer',
          spend_count: 2,
        },
      });
      expect(mocks.get_fee_estimate).toHaveBeenCalledWith(expect.anything(), {
        target_times: [60],
        cost: 1_000_000,
        spend_type: 'take_offer',
        spend_count: 2,
      });
    });

    it('rejects an empty target_times array', async () => {
      const res = (await client.callTool({
        name: 'estimate_fee',
        arguments: { target_times: [] },
      })) as { isError?: boolean };
      expect(res.isError).toBe(true);
    });

    it('rejects negative target_times entries', async () => {
      const res = (await client.callTool({
        name: 'estimate_fee',
        arguments: { target_times: [-1] },
      })) as { isError?: boolean };
      expect(res.isError).toBe(true);
    });

    it('rejects an unknown spend_type', async () => {
      const res = (await client.callTool({
        name: 'estimate_fee',
        arguments: { spend_type: 'mystery_spend' },
      })) as { isError?: boolean };
      expect(res.isError).toBe(true);
    });
  });
});

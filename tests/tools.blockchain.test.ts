import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mocks = vi.hoisted(() => ({
  get_blockchain_state: vi.fn(),
  get_block_record_by_height: vi.fn(),
  get_block_record: vi.fn(),
  get_block_spends: vi.fn(),
  get_additions_and_removals: vi.fn(),
  get_coin_records_by_puzzle_hash: vi.fn(),
  get_coin_record_by_name: vi.fn(),
}));

vi.mock('chia-agent/api/rpc/full_node/index.js', () => mocks);

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');

const SAMPLE_BLOCKCHAIN_STATE = {
  blockchain_state: {
    peak: {
      height: 6_500_000,
      header_hash: '0xabc',
      timestamp: 1_700_000_000,
    },
    genesis_challenge_initialized: true,
    sync: { sync_mode: false, synced: true, sync_tip_height: 0, sync_progress_height: 0 },
    difficulty: 9000,
    sub_slot_iters: 580_000_000,
    space: 30n * 2n ** 60n,
    average_block_time: 18,
    mempool_size: 5,
    mempool_cost: 1,
    mempool_fees: 0,
    mempool_min_fees: { cost_5000000: 0 },
    mempool_max_total_cost: 0,
    block_max_cost: 0,
    node_id: 'node',
  },
};

describe('blockchain tools (mocked RPC)', () => {
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

  it('get_blockchain_state formats space and surfaces peak info', async () => {
    mocks.get_blockchain_state.mockResolvedValue(SAMPLE_BLOCKCHAIN_STATE);
    const res = await client.callTool({
      name: 'get_blockchain_state',
      arguments: { network: 'mainnet' },
    });
    const body = parseToolText(res) as {
      network: string;
      peak_height: number;
      space_eib: string;
      space_human: string;
      sync: { synced: boolean };
    };
    expect(body.network).toBe('mainnet');
    expect(body.peak_height).toBe(6_500_000);
    expect(body.space_eib).toBe('30');
    expect(body.space_human).toMatch(/EiB$/);
    expect(body.sync.synced).toBe(true);
  });

  it('get_netspace returns bytes/eib/pib/tib', async () => {
    mocks.get_blockchain_state.mockResolvedValue(SAMPLE_BLOCKCHAIN_STATE);
    const res = await client.callTool({ name: 'get_netspace', arguments: {} });
    const body = parseToolText(res) as { eib: string; bytes: string; pib: string; tib: string };
    expect(body.eib).toBe('30');
    expect(BigInt(body.bytes)).toBe(30n * 2n ** 60n);
  });

  it('get_peak_height returns peak.height', async () => {
    mocks.get_blockchain_state.mockResolvedValue(SAMPLE_BLOCKCHAIN_STATE);
    const res = await client.callTool({ name: 'get_peak_height', arguments: {} });
    const body = parseToolText(res) as { peak_height: number };
    expect(body.peak_height).toBe(6_500_000);
  });

  it('get_block_by_height passes through the block record', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 123, header_hash: 'deadbeef', timestamp: 1_700_000_000 },
    });
    const res = await client.callTool({
      name: 'get_block_by_height',
      arguments: { height: 123 },
    });
    const body = parseToolText(res) as { header_hash: string; height: number };
    expect(body.header_hash).toBe('deadbeef');
    expect(body.height).toBe(123);
    expect(mocks.get_block_record_by_height).toHaveBeenCalledWith(expect.anything(), {
      height: 123,
    });
  });

  it('get_block_by_hash normalises the header hash and returns the record', async () => {
    mocks.get_block_record.mockResolvedValue({
      block_record: { height: 999, header_hash: 'cafe' },
    });
    const res = await client.callTool({
      name: 'get_block_by_hash',
      arguments: { header_hash: '0x' + 'a'.repeat(64) },
    });
    const body = parseToolText(res) as { height: number; header_hash: string };
    expect(body.height).toBe(999);
    expect(body.header_hash).toBe('a'.repeat(64));
    expect(mocks.get_block_record).toHaveBeenCalledWith(expect.anything(), {
      header_hash: 'a'.repeat(64),
    });
  });

  it('count_block_transactions resolves a height, then aggregates counts', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 200, header_hash: 'b'.repeat(64), timestamp: 1 },
    });
    mocks.get_block_spends.mockResolvedValue({ block_spends: [{}, {}, {}] });
    mocks.get_additions_and_removals.mockResolvedValue({
      additions: new Array(5).fill({}),
      removals: new Array(3).fill({}),
    });

    const res = await client.callTool({
      name: 'count_block_transactions',
      arguments: { height: 200 },
    });
    const body = parseToolText(res) as {
      coin_spends_count: number;
      additions_count: number;
      removals_count: number;
      is_transaction_block: boolean;
      header_hash: string;
    };
    expect(body.coin_spends_count).toBe(3);
    expect(body.additions_count).toBe(5);
    expect(body.removals_count).toBe(3);
    expect(body.is_transaction_block).toBe(true);
    expect(body.header_hash).toBe('b'.repeat(64));
  });

  it('count_block_transactions reports is_transaction_block=false when timestamp is null', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 201, header_hash: 'c'.repeat(64), timestamp: null },
    });
    mocks.get_block_spends.mockResolvedValue({ block_spends: [] });
    mocks.get_additions_and_removals.mockResolvedValue({ additions: [], removals: [] });

    const res = await client.callTool({
      name: 'count_block_transactions',
      arguments: { height: 201 },
    });
    const body = parseToolText(res) as { is_transaction_block: boolean };
    expect(body.is_transaction_block).toBe(false);
  });

  it('count_block_transactions requires either height or header_hash', async () => {
    const res = (await client.callTool({
      name: 'count_block_transactions',
      arguments: {},
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('get_block_additions_and_removals resolves height to header_hash then returns coin lists', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 500, header_hash: 'd'.repeat(64), timestamp: 1 },
    });
    mocks.get_additions_and_removals.mockResolvedValue({
      additions: [{ coin: { amount: 1n } }, { coin: { amount: 2n } }],
      removals: [{ coin: { amount: 3n } }],
    });
    const res = await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: { height: 500 },
    });
    const body = parseToolText(res) as {
      height: number | null;
      header_hash: string;
      additions_count: number;
      removals_count: number;
      additions: unknown[];
      removals: unknown[];
    };
    expect(body.height).toBe(500);
    expect(body.header_hash).toBe('d'.repeat(64));
    expect(body.additions_count).toBe(2);
    expect(body.removals_count).toBe(1);
    expect(body.additions).toHaveLength(2);
    expect(body.removals).toHaveLength(1);
    expect(mocks.get_additions_and_removals).toHaveBeenCalledWith(expect.anything(), {
      header_hash: 'd'.repeat(64),
    });
  });

  it('get_block_additions_and_removals accepts header_hash directly without resolving height', async () => {
    mocks.get_additions_and_removals.mockResolvedValue({ additions: [], removals: [] });
    await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: { header_hash: '0x' + 'e'.repeat(64) },
    });
    expect(mocks.get_block_record_by_height).not.toHaveBeenCalled();
    expect(mocks.get_additions_and_removals).toHaveBeenCalledWith(expect.anything(), {
      header_hash: 'e'.repeat(64),
    });
  });

  it('get_block_additions_and_removals rejects when neither height nor header_hash supplied', async () => {
    const res = (await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: {},
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('get_block_additions_and_removals rejects when both height and header_hash are supplied', async () => {
    const res = (await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: { height: 1, header_hash: 'f'.repeat(64) },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });
});

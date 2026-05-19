import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const mocks = vi.hoisted(() => ({
  get_blockchain_state: vi.fn(),
  get_block_record_by_height: vi.fn(),
  get_block_record: vi.fn(),
  get_block_spends: vi.fn(),
  get_additions_and_removals: vi.fn(),
  get_coin_records_by_puzzle_hash: vi.fn(),
  get_coin_records_by_parent_ids: vi.fn(),
  get_coin_record_by_name: vi.fn(),
  get_puzzle_and_solution: vi.fn(),
}));

vi.mock('chia-agent/api/rpc/full_node/index.js', () => mocks);

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');
const { puzzleHashToAddress } = await import('../src/chia/bech32.js');

const PUZZLE_HASH = '7faa3253bfddd1e0debb883ab8ac733c272b6e6c9e7e9d5c44e1d59ed1b3eb18';
const MAINNET_ADDRESS = puzzleHashToAddress(PUZZLE_HASH, 'mainnet');
const TESTNET_ADDRESS = puzzleHashToAddress(PUZZLE_HASH, 'testnet11');

function makeCoinRecord(amount: bigint, confirmed_block_index = 100, spent = false) {
  return {
    coin: {
      parent_coin_info: '0'.repeat(64),
      puzzle_hash: PUZZLE_HASH,
      amount,
    },
    confirmed_block_index,
    spent_block_index: spent ? confirmed_block_index + 1 : 0,
    coinbase: false,
    timestamp: 1_700_000_000,
    spent,
  };
}

describe('coin tools (mocked RPC)', () => {
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

  it('get_balance sums unspent coin amounts', async () => {
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({
      coin_records: [
        makeCoinRecord(1_000_000_000_000n),
        makeCoinRecord(2_500_000_000_000n),
        makeCoinRecord(500_000_000n),
      ],
    });
    const res = await client.callTool({
      name: 'get_balance',
      arguments: { address_or_puzzle_hash: MAINNET_ADDRESS },
    });
    const body = parseToolText(res) as {
      network: string;
      balance_mojo: string;
      balance_xch: string;
      unspent_coin_count: number;
      puzzle_hash: string;
    };
    expect(body.network).toBe('mainnet');
    expect(body.puzzle_hash).toBe(PUZZLE_HASH);
    expect(body.unspent_coin_count).toBe(3);
    expect(body.balance_mojo).toBe('3500500000000');
    expect(body.balance_xch).toBe('3.5005');
  });

  it('get_balance auto-detects testnet from txch address', async () => {
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({ coin_records: [] });
    const res = await client.callTool({
      name: 'get_balance',
      arguments: { address_or_puzzle_hash: TESTNET_ADDRESS },
    });
    const body = parseToolText(res) as { network: string; balance_mojo: string };
    expect(body.network).toBe('testnet11');
    expect(body.balance_mojo).toBe('0');
  });

  it('get_balance rejects when network arg disagrees with address prefix', async () => {
    const res = (await client.callTool({
      name: 'get_balance',
      arguments: { address_or_puzzle_hash: MAINNET_ADDRESS, network: 'testnet11' },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('get_balance accepts raw puzzle hash with explicit network', async () => {
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({
      coin_records: [makeCoinRecord(1_000_000_000_000n)],
    });
    const res = await client.callTool({
      name: 'get_balance',
      arguments: { address_or_puzzle_hash: PUZZLE_HASH, network: 'testnet11' },
    });
    const body = parseToolText(res) as { network: string; address: string };
    expect(body.network).toBe('testnet11');
    expect(body.address.startsWith('txch1')).toBe(true);
  });

  it('get_coin_records_by_puzzle_hash returns the raw records', async () => {
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({
      coin_records: [makeCoinRecord(1_000n, 50), makeCoinRecord(2_000n, 60)],
    });
    const res = await client.callTool({
      name: 'get_coin_records_by_puzzle_hash',
      arguments: { address_or_puzzle_hash: MAINNET_ADDRESS, include_spent_coins: true },
    });
    const body = parseToolText(res) as {
      coin_count: number;
      coin_records: Array<{ confirmed_block_index: number }>;
    };
    expect(body.coin_count).toBe(2);
    expect(mocks.get_coin_records_by_puzzle_hash).toHaveBeenCalledWith(expect.anything(), {
      puzzle_hash: PUZZLE_HASH,
      include_spent_coins: true,
    });
  });

  it('get_coin_records_by_puzzle_hash forwards start_height and end_height when supplied', async () => {
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({ coin_records: [] });
    await client.callTool({
      name: 'get_coin_records_by_puzzle_hash',
      arguments: {
        address_or_puzzle_hash: MAINNET_ADDRESS,
        start_height: 1000,
        end_height: 2000,
      },
    });
    expect(mocks.get_coin_records_by_puzzle_hash).toHaveBeenCalledWith(expect.anything(), {
      puzzle_hash: PUZZLE_HASH,
      include_spent_coins: false,
      start_height: 1000,
      end_height: 2000,
    });
  });

  it('get_coin_records_by_parent_ids defaults include_spent_coins to true', async () => {
    const parentId = 'a'.repeat(64);
    mocks.get_coin_records_by_parent_ids.mockResolvedValue({
      coin_records: [makeCoinRecord(1_000n), makeCoinRecord(2_000n)],
    });
    const res = await client.callTool({
      name: 'get_coin_records_by_parent_ids',
      arguments: { parent_ids: ['0x' + parentId] },
    });
    const body = parseToolText(res) as {
      coin_count: number;
      parent_count: number;
      parent_ids: string[];
    };
    expect(body.coin_count).toBe(2);
    expect(body.parent_count).toBe(1);
    expect(body.parent_ids).toEqual([parentId]);
    expect(mocks.get_coin_records_by_parent_ids).toHaveBeenCalledWith(expect.anything(), {
      parent_ids: [parentId],
      include_spent_coins: true,
    });
  });

  it('get_coin_records_by_parent_ids forwards start_height / end_height and include_spent_coins=false', async () => {
    const parentId = 'b'.repeat(64);
    mocks.get_coin_records_by_parent_ids.mockResolvedValue({ coin_records: [] });
    await client.callTool({
      name: 'get_coin_records_by_parent_ids',
      arguments: {
        parent_ids: [parentId],
        include_spent_coins: false,
        start_height: 100,
        end_height: 200,
      },
    });
    expect(mocks.get_coin_records_by_parent_ids).toHaveBeenCalledWith(expect.anything(), {
      parent_ids: [parentId],
      include_spent_coins: false,
      start_height: 100,
      end_height: 200,
    });
  });

  it('get_coin_records_by_parent_ids batches more than 200 parent_ids', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i.toString(16).padStart(64, '0'));
    mocks.get_coin_records_by_parent_ids.mockResolvedValue({ coin_records: [makeCoinRecord(1n)] });
    const res = await client.callTool({
      name: 'get_coin_records_by_parent_ids',
      arguments: { parent_ids: ids },
    });
    const body = parseToolText(res) as { coin_count: number; parent_count: number };
    expect(body.parent_count).toBe(250);
    expect(body.coin_count).toBe(2);
    expect(mocks.get_coin_records_by_parent_ids).toHaveBeenCalledTimes(2);
    const firstCall = mocks.get_coin_records_by_parent_ids.mock.calls[0]![1] as {
      parent_ids: string[];
    };
    const secondCall = mocks.get_coin_records_by_parent_ids.mock.calls[1]![1] as {
      parent_ids: string[];
    };
    expect(firstCall.parent_ids).toHaveLength(200);
    expect(secondCall.parent_ids).toHaveLength(50);
  });

  it('get_puzzle_and_solution returns the coin solution', async () => {
    const coinId = 'c'.repeat(64);
    mocks.get_puzzle_and_solution.mockResolvedValue({
      coin_solution: {
        coin: { parent_coin_info: '0'.repeat(64), puzzle_hash: PUZZLE_HASH, amount: 1n },
        puzzle_reveal: '0xff01ff02',
        solution: '0x80',
      },
    });
    const res = await client.callTool({
      name: 'get_puzzle_and_solution',
      arguments: { coin_id: '0x' + coinId, height: 12345 },
    });
    const body = parseToolText(res) as {
      coin_id: string;
      height: number;
      coin_solution: { puzzle_reveal: string; solution: string };
    };
    expect(body.coin_id).toBe(coinId);
    expect(body.height).toBe(12345);
    expect(body.coin_solution.puzzle_reveal).toBe('0xff01ff02');
    expect(body.coin_solution.solution).toBe('0x80');
    expect(mocks.get_puzzle_and_solution).toHaveBeenCalledWith(expect.anything(), {
      coin_id: coinId,
      height: 12345,
    });
  });

  it('get_coin_by_name surfaces XCH amount when present', async () => {
    const coinName = 'd'.repeat(64);
    mocks.get_coin_record_by_name.mockResolvedValue({
      coin_record: makeCoinRecord(1_750_000_000_000n),
    });
    const res = await client.callTool({
      name: 'get_coin_by_name',
      arguments: { name: '0x' + coinName },
    });
    const body = parseToolText(res) as {
      coin_name: string;
      amount_mojo: string;
      amount_xch: string;
    };
    expect(body.coin_name).toBe(coinName);
    expect(body.amount_mojo).toBe('1750000000000');
    expect(body.amount_xch).toBe('1.75');
    expect(mocks.get_coin_record_by_name).toHaveBeenCalledWith(expect.anything(), {
      name: coinName,
    });
  });

  it('surfaces RPC errors via isError', async () => {
    mocks.get_coin_record_by_name.mockRejectedValue(new Error('boom'));
    const res = (await client.callTool({
      name: 'get_coin_by_name',
      arguments: { name: 'a'.repeat(64) },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0]!.text) as { error: string };
    expect(body.error).toContain('boom');
  });
});

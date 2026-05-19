import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const offerMocks = vi.hoisted(() => ({
  decodeOfferString: vi.fn(),
  summarizeSpendBundleHex: vi.fn(),
  classifyPuzzle: vi.fn(),
  parseConditions: vi.fn(),
}));

vi.mock('../src/chia/offer.js', () => offerMocks);

const rpcMocks = vi.hoisted(() => ({
  get_puzzle_and_solution: vi.fn(),
}));
vi.mock('chia-agent/api/rpc/full_node/index.js', () => rpcMocks);

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');

describe('offers tools (helper mocked)', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    for (const fn of Object.values(offerMocks)) fn.mockReset();
    for (const fn of Object.values(rpcMocks)) fn.mockReset();
  });

  it('decode_offer returns the helper output verbatim', async () => {
    offerMocks.decodeOfferString.mockReturnValue({
      offered: [
        {
          asset_kind: 'xch',
          amount_mojo: '1000',
          source_puzzle_hash: '11'.repeat(32),
          source_coin_id: '22'.repeat(32),
        },
      ],
      requested: [
        {
          asset_kind: 'xch',
          amount_mojo: '500',
          destination_puzzle_hash: '33'.repeat(32),
          nonce: '44'.repeat(32),
        },
      ],
      fee_mojo: '0',
      coin_spends_count: 2,
      aggregated_signature: 'c0'.repeat(48),
    });

    const res = await client.callTool({
      name: 'decode_offer',
      arguments: { offer: 'offer1synthetic' },
    });
    const body = parseToolText(res) as { offered: unknown[]; requested: unknown[] };
    expect(offerMocks.decodeOfferString).toHaveBeenCalledWith('offer1synthetic');
    expect(body.offered).toHaveLength(1);
    expect(body.requested).toHaveLength(1);
  });

  it('decode_offer surfaces helper errors via isError', async () => {
    offerMocks.decodeOfferString.mockImplementation(() => {
      throw new Error('invalid offer string: bad bech32');
    });
    const res = (await client.callTool({
      name: 'decode_offer',
      arguments: { offer: 'offer1bad' },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/invalid offer string/);
  });

  it('decode_offer rejects empty input via Zod', async () => {
    const res = (await client.callTool({
      name: 'decode_offer',
      arguments: { offer: '' },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('decode_spend_bundle calls summarizeSpendBundleHex with the input', async () => {
    offerMocks.summarizeSpendBundleHex.mockReturnValue({
      offered: [],
      requested: [],
      fee_mojo: '0',
      coin_spends_count: 0,
      aggregated_signature: 'c0'.repeat(48),
    });
    await client.callTool({
      name: 'decode_spend_bundle',
      arguments: { spend_bundle: '0xdeadbeef' },
    });
    expect(offerMocks.summarizeSpendBundleHex).toHaveBeenCalledWith('0xdeadbeef');
  });

  it('decompile_puzzle returns classification when given puzzle_reveal directly', async () => {
    offerMocks.classifyPuzzle.mockReturnValue({
      kind: 'cat',
      asset_id: 'aa'.repeat(32),
      puzzle_hash: 'bb'.repeat(32),
      is_settlement: false,
    });
    const res = await client.callTool({
      name: 'decompile_puzzle',
      arguments: { puzzle_reveal: '0x80' },
    });
    const body = parseToolText(res) as { classification: { kind: string; asset_id: string } };
    expect(body.classification.kind).toBe('cat');
    expect(body.classification.asset_id).toBe('aa'.repeat(32));
    expect(offerMocks.classifyPuzzle).toHaveBeenCalledWith('0x80');
  });

  it('decompile_puzzle auto-fetches puzzle_reveal via coin_id + height', async () => {
    rpcMocks.get_puzzle_and_solution.mockResolvedValue({
      coin_solution: {
        coin: { parent_coin_info: '0'.repeat(64), puzzle_hash: 'ee'.repeat(32), amount: 1n },
        puzzle_reveal: '0xfetched',
        solution: '0xsol',
      },
    });
    offerMocks.classifyPuzzle.mockReturnValue({
      kind: 'unknown',
      puzzle_hash: 'ee'.repeat(32),
      is_settlement: false,
    });
    const res = await client.callTool({
      name: 'decompile_puzzle',
      arguments: { coin_id: 'a'.repeat(64), height: 42 },
    });
    const body = parseToolText(res) as { classification: { kind: string } };
    expect(body.classification.kind).toBe('unknown');
    expect(rpcMocks.get_puzzle_and_solution).toHaveBeenCalledWith(expect.anything(), {
      coin_id: 'a'.repeat(64),
      height: 42,
    });
    expect(offerMocks.classifyPuzzle).toHaveBeenCalledWith('0xfetched');
  });

  it('decompile_puzzle rejects when neither puzzle_reveal nor (coin_id+height) supplied', async () => {
    const res = (await client.callTool({
      name: 'decompile_puzzle',
      arguments: {},
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/must supply either/);
  });

  it('decompile_puzzle with include_conditions also parses the solution', async () => {
    offerMocks.classifyPuzzle.mockReturnValue({
      kind: 'xch',
      puzzle_hash: 'ff'.repeat(32),
      is_settlement: true,
    });
    offerMocks.parseConditions.mockReturnValue({
      create_coins: [{ puzzle_hash: '11'.repeat(32), amount: '100', memos: [] }],
      reserve_fee_mojo: '0',
      agg_sigs_count: 0,
      announcements: [],
      asserts: [],
      other: [],
    });
    const res = await client.callTool({
      name: 'decompile_puzzle',
      arguments: { puzzle_reveal: '0x80', solution: '0x80', include_conditions: true },
    });
    const body = parseToolText(res) as {
      classification: { kind: string };
      parsed_conditions: { create_coins: unknown[] };
    };
    expect(body.parsed_conditions.create_coins).toHaveLength(1);
    expect(offerMocks.parseConditions).toHaveBeenCalledWith('0x80', '0x80');
  });

  it('decompile_puzzle with include_conditions but no solution errors', async () => {
    offerMocks.classifyPuzzle.mockReturnValue({
      kind: 'unknown',
      puzzle_hash: 'ff'.repeat(32),
      is_settlement: false,
    });
    const res = (await client.callTool({
      name: 'decompile_puzzle',
      arguments: { puzzle_reveal: '0x80', include_conditions: true },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/requires a `solution`/);
  });
});

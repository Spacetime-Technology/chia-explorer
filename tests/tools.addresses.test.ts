import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTestClient, parseToolText } from './helpers/create-test-client.js';

const PUZZLE_HASH = '7faa3253bfddd1e0debb883ab8ac733c272b6e6c9e7e9d5c44e1d59ed1b3eb18';

describe('address tools', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  it('puzzle_hash_to_address (mainnet) returns xch1...', async () => {
    const res = await client.callTool({
      name: 'puzzle_hash_to_address',
      arguments: { puzzle_hash: PUZZLE_HASH, network: 'mainnet' },
    });
    const body = parseToolText(res) as { address: string; network: string; puzzle_hash: string };
    expect(body.network).toBe('mainnet');
    expect(body.address.startsWith('xch1')).toBe(true);
    expect(body.puzzle_hash).toBe(PUZZLE_HASH);
  });

  it('puzzle_hash_to_address (testnet11) returns txch1...', async () => {
    const res = await client.callTool({
      name: 'puzzle_hash_to_address',
      arguments: { puzzle_hash: PUZZLE_HASH, network: 'testnet11' },
    });
    const body = parseToolText(res) as { address: string };
    expect(body.address.startsWith('txch1')).toBe(true);
  });

  it('address_to_puzzle_hash decodes back and reports detected network', async () => {
    const toAddr = await client.callTool({
      name: 'puzzle_hash_to_address',
      arguments: { puzzle_hash: PUZZLE_HASH, network: 'testnet11' },
    });
    const { address } = parseToolText(toAddr) as { address: string };

    const back = await client.callTool({
      name: 'address_to_puzzle_hash',
      arguments: { address },
    });
    const body = parseToolText(back) as { puzzle_hash: string; network: string };
    expect(body.puzzle_hash).toBe(PUZZLE_HASH);
    expect(body.network).toBe('testnet11');
  });

  it('address_to_puzzle_hash rejects a malformed address', async () => {
    const res = (await client.callTool({
      name: 'address_to_puzzle_hash',
      arguments: { address: 'xch1notvalid' },
    })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    expect(res.isError).toBe(true);
  });
});

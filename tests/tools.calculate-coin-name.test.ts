import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTestClient, parseToolText } from './helpers/create-test-client.js';
import { coinName } from '../src/chia/coin-name.js';

const PARENT = 'a'.repeat(64);
const PH = 'b'.repeat(64);

describe('calculate_coin_name tool', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  it('matches the local coinName helper', async () => {
    const expected = coinName({ parent_coin_info: PARENT, puzzle_hash: PH, amount: 12345 });
    const res = await client.callTool({
      name: 'calculate_coin_name',
      arguments: { parent_coin_info: PARENT, puzzle_hash: PH, amount: 12345 },
    });
    const body = parseToolText(res) as { coin_name: string };
    expect(body.coin_name).toBe(expected);
  });

  it('accepts amount as a string', async () => {
    const expected = coinName({
      parent_coin_info: PARENT,
      puzzle_hash: PH,
      amount: '1000000000000',
    });
    const res = await client.callTool({
      name: 'calculate_coin_name',
      arguments: {
        parent_coin_info: PARENT,
        puzzle_hash: PH,
        amount: '1000000000000',
      },
    });
    const body = parseToolText(res) as { coin_name: string };
    expect(body.coin_name).toBe(expected);
  });
});

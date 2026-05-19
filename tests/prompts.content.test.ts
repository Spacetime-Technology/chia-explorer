import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTestClient } from './helpers/create-test-client.js';

function promptText(messages: Array<{ content: { type: string; text?: string } }>): string {
  return messages
    .map((m) => (m.content.type === 'text' && m.content.text ? m.content.text : ''))
    .join('\n');
}

describe('prompt content', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  it('network_status defaults to mainnet and references get_blockchain_state', async () => {
    const res = await client.getPrompt({ name: 'network_status', arguments: {} });
    const text = promptText(res.messages);
    expect(text).toContain('mainnet');
    expect(text).toContain('get_blockchain_state');
  });

  it('network_status honors testnet11', async () => {
    const res = await client.getPrompt({
      name: 'network_status',
      arguments: { network: 'testnet11' },
    });
    expect(promptText(res.messages)).toContain('testnet11');
  });

  it('address_summary references address and get_balance', async () => {
    const res = await client.getPrompt({
      name: 'address_summary',
      arguments: { address: 'xch1foo' },
    });
    const text = promptText(res.messages);
    expect(text).toContain('xch1foo');
    expect(text).toContain('get_balance');
    expect(text).toContain('get_coin_records_by_puzzle_hash');
  });

  it('block_summary by height references count_block_transactions', async () => {
    const res = await client.getPrompt({
      name: 'block_summary',
      arguments: { height: '100' },
    });
    const text = promptText(res.messages);
    expect(text).toContain('count_block_transactions');
    expect(text).toContain('100');
  });

  it('block_summary by header_hash references get_block_by_hash', async () => {
    const res = await client.getPrompt({
      name: 'block_summary',
      arguments: { header_hash: 'deadbeef' },
    });
    const text = promptText(res.messages);
    expect(text).toContain('get_block_by_hash');
    expect(text).toContain('deadbeef');
  });

  it('prefarm_summary references the three prefarm tools', async () => {
    const res = await client.getPrompt({ name: 'prefarm_summary', arguments: {} });
    const text = promptText(res.messages);
    expect(text).toContain('get_prefarm_status');
    expect(text).toContain('get_prefarm_spends');
    expect(text).toContain('21M XCH');
  });
});

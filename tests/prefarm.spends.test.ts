import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get_coin_records_by_puzzle_hash: vi.fn(),
  get_coin_records_by_parent_ids: vi.fn(),
}));

vi.mock('chia-agent/api/rpc/full_node/index.js', () => mocks);

const { getAgent } = await import('../src/coinset/agent.js');
const { coinName } = await import('../src/chia/coin-name.js');
const { puzzleHashToAddress } = await import('../src/chia/bech32.js');
const { MOJOS_PER_XCH } = await import('../src/chia/amounts.js');
const { getWalletSpends } = await import('../src/prefarm/spends.js');
const { PREFARM_WALLETS, getWalletById } = await import('../src/prefarm/registry.js');

type WalletShape = Awaited<ReturnType<typeof getWalletSpends>>[number];

const WALLET_PH = '7faa3253bfddd1e0debb883ab8ac733c272b6e6c9e7e9d5c44e1d59ed1b3eb18';
const UNKNOWN_PH = 'b'.repeat(64);

const stubWallet = {
  id: 'us-cold' as const,
  label: 'Stub Wallet',
  region: 'us' as const,
  temperature: 'cold' as const,
  addresses: [puzzleHashToAddress(WALLET_PH, 'mainnet')],
  puzzleHashes: [WALLET_PH],
};

function makeRecord(
  puzzle_hash: string,
  amount: bigint,
  parent_coin_info: string,
  spent_block_index: number
) {
  return {
    coin: { parent_coin_info, puzzle_hash, amount },
    confirmed_block_index: spent_block_index - 10,
    spent_block_index,
    coinbase: false,
    timestamp: 1_700_000_000,
    spent: spent_block_index > 0,
  };
}

describe('getWalletSpends', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
  });

  it('returns empty when the wallet is unpopulated', async () => {
    const agent = getAgent('mainnet');
    const pending = { ...stubWallet, addresses: [], puzzleHashes: [] };
    const out = await getWalletSpends(agent, pending);
    expect(out).toEqual([]);
    expect(mocks.get_coin_records_by_puzzle_hash).not.toHaveBeenCalled();
  });

  it('labels destinations as unknown when not in the registry, sorted by spent_height desc', async () => {
    const parentA = '1'.repeat(64);
    const parentB = '2'.repeat(64);
    const spentA = makeRecord(WALLET_PH, 100n * MOJOS_PER_XCH, parentA, 50_000);
    const spentB = makeRecord(WALLET_PH, 200n * MOJOS_PER_XCH, parentB, 60_000);
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({ coin_records: [spentA, spentB] });

    const nameA = coinName({
      parent_coin_info: spentA.coin.parent_coin_info,
      puzzle_hash: spentA.coin.puzzle_hash,
      amount: spentA.coin.amount,
    });
    const nameB = coinName({
      parent_coin_info: spentB.coin.parent_coin_info,
      puzzle_hash: spentB.coin.puzzle_hash,
      amount: spentB.coin.amount,
    });

    mocks.get_coin_records_by_parent_ids.mockResolvedValue({
      coin_records: [
        makeRecord(UNKNOWN_PH, 100n * MOJOS_PER_XCH, nameA, 0),
        makeRecord(UNKNOWN_PH, 200n * MOJOS_PER_XCH, nameB, 0),
      ],
    });

    const agent = getAgent('mainnet');
    const out: WalletShape[] = await getWalletSpends(agent, stubWallet);

    expect(out).toHaveLength(2);
    expect(out[0]!.spent_height).toBe(60_000);
    expect(out[1]!.spent_height).toBe(50_000);
    expect(out[0]!.destinations[0]!.category).toBe('unknown');
    expect(out[0]!.destinations[0]!.label).toBeNull();
    expect(out[0]!.outflow_xch).toBe('200');
  });

  it('skips own-wallet rotation children and flags cross-wallet rotation as internal-rotation', async () => {
    // Use real us-cold + us-warm so lookupPrefarmWallet returns hits.
    const usCold = getWalletById('us-cold');
    const usWarm = getWalletById('us-warm');
    expect(usCold && usWarm).toBeTruthy();
    if (!usCold || !usWarm) return;

    const sourcePh = usCold.puzzleHashes[0]!;
    const ownPh = usCold.puzzleHashes[0]!; // landing on the same wallet — should be filtered out
    const crossPh = usWarm.puzzleHashes[0]!; // landing on us-warm — should be tagged internal-rotation
    const parent = '3'.repeat(64);
    const spent = makeRecord(sourcePh, 500n * MOJOS_PER_XCH, parent, 70_000);
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({ coin_records: [spent] });
    const parentName = coinName({
      parent_coin_info: spent.coin.parent_coin_info,
      puzzle_hash: spent.coin.puzzle_hash,
      amount: spent.coin.amount,
    });
    mocks.get_coin_records_by_parent_ids.mockResolvedValue({
      coin_records: [
        makeRecord(ownPh, 1n * MOJOS_PER_XCH, parentName, 0), // own-wallet, filtered
        makeRecord(crossPh, 499n * MOJOS_PER_XCH, parentName, 0), // cross-wallet rotation
      ],
    });

    const agent = getAgent('mainnet');
    const out = await getWalletSpends(agent, usCold);
    expect(out).toHaveLength(1);
    expect(out[0]!.destinations).toHaveLength(1);
    const dest = out[0]!.destinations[0]!;
    expect(dest.category).toBe('internal-rotation');
    expect(dest.internal_wallet_id).toBe('us-warm');
    expect(out[0]!.outflow_mojo).toBe('0'); // internal rotation excluded from outflow
  });

  it('fans queries across every puzzle hash of a multi-address wallet', async () => {
    const usWarm = getWalletById('us-warm');
    expect(usWarm).toBeTruthy();
    if (!usWarm) return;
    expect(usWarm.puzzleHashes.length).toBeGreaterThan(1);
    mocks.get_coin_records_by_puzzle_hash.mockResolvedValue({ coin_records: [] });
    await getWalletSpends(getAgent('mainnet'), usWarm);
    expect(mocks.get_coin_records_by_puzzle_hash).toHaveBeenCalledTimes(usWarm.puzzleHashes.length);
  });

  it('PREFARM_WALLETS is now fully populated (no pending wallets)', () => {
    const pending = PREFARM_WALLETS.filter((w) => w.addresses.length === 0);
    expect(pending).toEqual([]);
  });
});

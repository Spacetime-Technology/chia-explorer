import { MOJOS_PER_XCH } from '../chia/amounts.js';
import { addressToPuzzleHash } from '../chia/bech32.js';

export type WalletId = 'us-cold' | 'us-warm' | 'ch-cold' | 'ch-warm';
export type Region = 'us' | 'ch';
export type Temperature = 'cold' | 'warm';
export type DestinationCategory = 'partner' | 'market-maker' | 'exchange' | 'other';

export interface PrefarmWallet {
  id: WalletId;
  label: string;
  region: Region;
  temperature: Temperature;
  /**
   * Current on-chain p2 addresses for this custody singleton. Warm wallets carry
   * more than one because outgoing spends sit at a clawback intermediate before
   * settling. Empty array = pending population.
   */
  addresses: readonly string[];
  /** Lower-case hex puzzle hashes derived from `addresses`. Same length, same order. */
  puzzleHashes: readonly string[];
}

export interface KnownDestination {
  address: string;
  puzzleHash: string;
  entity: string;
  label: string;
  category: DestinationCategory;
}

interface WalletInput {
  id: WalletId;
  label: string;
  region: Region;
  temperature: Temperature;
  addresses: readonly string[];
}

/** Genesis total of the Chia strategic reserve. The only amount we hardcode; everything else is live. */
export const TOTAL_PREFARM_ALLOCATION_MOJO: bigint = 21_000_000n * MOJOS_PER_XCH;

const WALLET_INPUTS: readonly WalletInput[] = [
  {
    id: 'us-cold',
    label: 'Strategic Reserve — US Cold',
    region: 'us',
    temperature: 'cold',
    addresses: ['xch1yxqsmyuyjdlgxw4sqjg4vqlqv5ms2qzex00586nu643jqemmarwslh08yl'],
  },
  {
    id: 'us-warm',
    label: 'Strategic Reserve — US Warm',
    region: 'us',
    temperature: 'warm',
    addresses: [
      'xch12pc7qk46t8aktdsd7ss96pctdp0236sexakfsdvsqefuqyyll3hqzhnldc',
      'xch1aukdy3djga7j8ckaw06lwjew9pnnv5hugqyx9lu9l2utaxjtgj5snuuwkc',
    ],
  },
  {
    id: 'ch-cold',
    label: 'Strategic Reserve — Swiss Cold',
    region: 'ch',
    temperature: 'cold',
    addresses: ['xch1y6krqgs2cjz6mjgz5wy4dd5zqghm3a5pgueccjtudchn2xzcajtsnyzvgy'],
  },
  {
    id: 'ch-warm',
    label: 'Strategic Reserve — Swiss Warm',
    region: 'ch',
    temperature: 'warm',
    addresses: [
      'xch18hp0afeqmcvn675dqpnxfhk7gggwcpjaa0huc45huu79tkaa28dsuse43w',
      'xch1xhghtsdqdtt5eqr307lcacg49nt72zmeuq2qfwu7ymmqvqf0ej0qsruh0w',
    ],
  },
];

interface DestinationInput {
  address: string;
  entity: string;
  label: string;
  category: DestinationCategory;
}

const DESTINATION_INPUTS: readonly DestinationInput[] = [
  {
    address: 'xch1drz2ufckxz7dtlaajsw3gwtyd6ztss08vwxyfcr4rz0z0t77ufrq8qqe09',
    entity: 'silicon',
    label: 'Silicon.net',
    category: 'partner',
  },
  {
    address: 'xch1mhw0vz0jl8etxqar0se73excayq2e4jg3g5zegzumyzm2u4htzusjfk8q4',
    entity: 'koba42',
    label: 'Koba42 Gaming RFP Grant',
    category: 'partner',
  },
  {
    address: 'xch1plthft5ykcnnaxvpydzlmu2nlslzcevn3vv4s43rkm908d95nd5sv22nqr',
    entity: 'nossd',
    label: 'Purchase Agreement with NoSSD',
    category: 'partner',
  },
  {
    address: 'xch1hy7r0hcq4xymv2d944dtsn7rw8tv8pntc7adr36u45zhmmh3ad4seh48zz',
    entity: 'market-maker-primary',
    label: 'Market Maker (primary)',
    category: 'market-maker',
  },
  {
    address: 'xch1g8wl32qjyquzx6rnzn0rpj5l2q5acykawzped7nl5kdsfp3drpqqfavwnf',
    entity: 'market-maker-secondary',
    label: 'Market Maker (secondary)',
    category: 'market-maker',
  },
  {
    address: 'xch1d6w3ctu8pqtkkmsa3hjmqam9fuy7q9u4fzy5hqw08rx36whpg3hs4xpjeu',
    entity: 'market-maker-tertiary',
    label: 'Market Maker (tertiary)',
    category: 'market-maker',
  },
];

function buildWallets(): readonly PrefarmWallet[] {
  return WALLET_INPUTS.map((w) => {
    const puzzleHashes = w.addresses.map((addr) => {
      const { puzzleHash, network } = addressToPuzzleHash(addr);
      if (network !== 'mainnet') {
        throw new Error(`prefarm wallet ${w.id} must use mainnet addresses`);
      }
      return puzzleHash;
    });
    return { ...w, puzzleHashes };
  });
}

function buildDestinations(): readonly KnownDestination[] {
  return DESTINATION_INPUTS.map((d) => {
    const { puzzleHash, network } = addressToPuzzleHash(d.address);
    if (network !== 'mainnet') {
      throw new Error(`destination ${d.entity} must use a mainnet address`);
    }
    return { ...d, puzzleHash };
  });
}

export const PREFARM_WALLETS: readonly PrefarmWallet[] = buildWallets();
export const KNOWN_DESTINATIONS: readonly KnownDestination[] = buildDestinations();

const DESTINATION_INDEX = new Map(KNOWN_DESTINATIONS.map((d) => [d.puzzleHash, d]));
const WALLET_BY_PUZZLE_HASH = new Map<string, PrefarmWallet>();
for (const w of PREFARM_WALLETS) {
  for (const ph of w.puzzleHashes) WALLET_BY_PUZZLE_HASH.set(ph, w);
}
const WALLET_BY_ID = new Map(PREFARM_WALLETS.map((w) => [w.id, w]));

export function lookupDestination(puzzleHashHex: string): KnownDestination | undefined {
  return DESTINATION_INDEX.get(puzzleHashHex.toLowerCase());
}

export function lookupPrefarmWallet(puzzleHashHex: string): PrefarmWallet | undefined {
  return WALLET_BY_PUZZLE_HASH.get(puzzleHashHex.toLowerCase());
}

export function getWalletById(id: WalletId): PrefarmWallet | undefined {
  return WALLET_BY_ID.get(id);
}

export function isPopulated(wallet: PrefarmWallet): boolean {
  return wallet.addresses.length > 0;
}

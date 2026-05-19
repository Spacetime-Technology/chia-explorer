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
  /** Current on-chain p2 address. `null` while pending population (refreshed on rebalance). */
  address: string | null;
  /** Lower-case hex puzzle hash derived from `address`, or `null` when unpopulated. */
  puzzleHash: string | null;
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
  address: string | null;
}

/** Genesis total of the Chia strategic reserve. The only amount we hardcode; everything else is live. */
export const TOTAL_PREFARM_ALLOCATION_MOJO: bigint = 21_000_000n * MOJOS_PER_XCH;

const WALLET_INPUTS: readonly WalletInput[] = [
  {
    id: 'us-cold',
    label: 'Strategic Reserve — US Cold',
    region: 'us',
    temperature: 'cold',
    address: null,
  },
  {
    id: 'us-warm',
    label: 'Strategic Reserve — US Warm',
    region: 'us',
    temperature: 'warm',
    address: null,
  },
  {
    id: 'ch-cold',
    label: 'Strategic Reserve — CH Cold',
    region: 'ch',
    temperature: 'cold',
    address: null,
  },
  {
    id: 'ch-warm',
    label: 'Strategic Reserve — CH Warm',
    region: 'ch',
    temperature: 'warm',
    address: null,
  },
];

interface DestinationInput {
  address: string;
  entity: string;
  label: string;
  category: DestinationCategory;
}

const DESTINATION_INPUTS: readonly DestinationInput[] = [];

function buildWallets(): readonly PrefarmWallet[] {
  return WALLET_INPUTS.map((w) => {
    if (w.address === null) return { ...w, puzzleHash: null };
    const { puzzleHash, network } = addressToPuzzleHash(w.address);
    if (network !== 'mainnet') {
      throw new Error(`prefarm wallet ${w.id} must be a mainnet address`);
    }
    return { ...w, puzzleHash };
  });
}

function buildDestinations(): readonly KnownDestination[] {
  return DESTINATION_INPUTS.map((d) => {
    const { puzzleHash, network } = addressToPuzzleHash(d.address);
    if (network !== 'mainnet') {
      throw new Error(`destination ${d.entity} must be a mainnet address`);
    }
    return { ...d, puzzleHash };
  });
}

export const PREFARM_WALLETS: readonly PrefarmWallet[] = buildWallets();
export const KNOWN_DESTINATIONS: readonly KnownDestination[] = buildDestinations();

const DESTINATION_INDEX = new Map(KNOWN_DESTINATIONS.map((d) => [d.puzzleHash, d]));
const WALLET_BY_PUZZLE_HASH = new Map(
  PREFARM_WALLETS.filter(
    (w): w is PrefarmWallet & { puzzleHash: string } => w.puzzleHash !== null
  ).map((w) => [w.puzzleHash, w])
);
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

export function isPopulated(wallet: PrefarmWallet): wallet is PrefarmWallet & {
  address: string;
  puzzleHash: string;
} {
  return wallet.address !== null && wallet.puzzleHash !== null;
}

import { bech32m } from '@scure/base';
import { ADDRESS_PREFIX, Network, networkFromPrefix } from '../network.js';
import { bytesToHex, hexToBytes } from './hex.js';

export function puzzleHashToAddress(puzzleHashHex: string, network: Network): string {
  const ph = hexToBytes(puzzleHashHex);
  if (ph.length !== 32) throw new Error('puzzle hash must be 32 bytes');
  return bech32m.encode(ADDRESS_PREFIX[network], bech32m.toWords(ph));
}

export interface DecodedAddress {
  puzzleHash: string;
  network: Network;
}

export function addressToPuzzleHash(address: string): DecodedAddress {
  let decoded;
  try {
    decoded = bech32m.decode(address as `${string}1${string}`);
  } catch (err) {
    throw new Error(
      `invalid bech32m address: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }
  const network = networkFromPrefix(decoded.prefix);
  if (!network) {
    throw new Error(
      `unknown address prefix '${decoded.prefix}' — expected 'xch' (mainnet) or 'txch' (testnet11)`
    );
  }
  const bytes = bech32m.fromWords(decoded.words);
  if (bytes.length !== 32) {
    throw new Error(`decoded payload must be 32 bytes, got ${bytes.length}`);
  }
  return { puzzleHash: bytesToHex(bytes), network };
}

export function looksLikeAddress(s: string): boolean {
  return /^(xch|txch)1[02-9ac-hj-np-z]+$/i.test(s);
}

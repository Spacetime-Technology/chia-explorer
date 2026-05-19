import { addressToPuzzleHash, looksLikeAddress, puzzleHashToAddress } from '../../chia/bech32.js';
import { isHex32, stripHexPrefix } from '../../chia/hex.js';
import { DEFAULT_NETWORK, Network } from '../../network.js';

export interface ResolvedTarget {
  puzzleHash: string;
  address: string;
  network: Network;
}

/**
 * Resolve a user-supplied "address or puzzle hash" into a normalized form.
 * If both an address and a network argument are provided and they disagree,
 * throws — better to surface the mismatch than silently pick one.
 */
export function resolveAddressOrPuzzleHash(
  input: string,
  requestedNetwork: Network | undefined
): ResolvedTarget {
  const trimmed = input.trim();
  if (looksLikeAddress(trimmed)) {
    const { puzzleHash, network: detected } = addressToPuzzleHash(trimmed);
    if (requestedNetwork && requestedNetwork !== detected) {
      throw new Error(
        `network mismatch: address belongs to ${detected} but network argument was ${requestedNetwork}`
      );
    }
    return { puzzleHash, address: trimmed.toLowerCase(), network: detected };
  }
  if (isHex32(trimmed)) {
    const network = requestedNetwork ?? DEFAULT_NETWORK;
    const puzzleHash = stripHexPrefix(trimmed).toLowerCase();
    const address = puzzleHashToAddress(puzzleHash, network);
    return { puzzleHash, address, network };
  }
  throw new Error(
    `input is neither a valid xch/txch address nor a 32-byte hex puzzle hash: ${trimmed.slice(0, 40)}`
  );
}

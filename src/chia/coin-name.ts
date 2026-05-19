import { createHash } from 'node:crypto';
import { bytesToHex, hexToBytes } from './hex.js';

/**
 * Big-endian minimal-length two's-complement encoding of a non-negative bigint,
 * matching Chia's int_to_bytes serialization used in coin name calculation.
 *
 * Why: coin name = sha256(parent_coin_info || puzzle_hash || amount_bytes) where
 * amount_bytes follows Python's int.to_bytes(signed=True) with the minimum length
 * needed. Off-by-one here produces wrong coin names.
 */
export function bigIntToBytes(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('coin amount must be non-negative');
  if (n === 0n) return new Uint8Array(0);
  const buf: number[] = [];
  let v = n;
  while (v > 0n) {
    buf.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  if ((buf[0] ?? 0) & 0x80) buf.unshift(0);
  return Uint8Array.from(buf);
}

export interface CoinFields {
  parent_coin_info: string;
  puzzle_hash: string;
  amount: bigint | number | string;
}

export function coinName(coin: CoinFields): string {
  const parent = hexToBytes(coin.parent_coin_info);
  const ph = hexToBytes(coin.puzzle_hash);
  if (parent.length !== 32) throw new Error('parent_coin_info must be 32 bytes');
  if (ph.length !== 32) throw new Error('puzzle_hash must be 32 bytes');
  const amount = bigIntToBytes(BigInt(coin.amount));
  const hash = createHash('sha256');
  hash.update(parent);
  hash.update(ph);
  hash.update(amount);
  return bytesToHex(new Uint8Array(hash.digest()));
}

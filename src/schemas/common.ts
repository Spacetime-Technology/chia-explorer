import { z } from 'zod';
import { DEFAULT_NETWORK, NETWORKS } from '../network.js';

export const networkSchema = z
  .enum(NETWORKS as unknown as [string, ...string[]])
  .default(DEFAULT_NETWORK)
  .describe("Chia network: 'mainnet' (default) or 'testnet11'");

export const networkSchemaOptional = z
  .enum(NETWORKS as unknown as [string, ...string[]])
  .optional()
  .describe(
    "Chia network: 'mainnet' or 'testnet11'. Optional — auto-detected from address prefix when an address is supplied."
  );

const HEX32_REGEX = /^(0x)?[0-9a-fA-F]{64}$/;
const ADDRESS_REGEX = /^(xch|txch)1[02-9ac-hj-np-z]{6,}$/i;

export const hex32Schema = z
  .string()
  .regex(HEX32_REGEX, '32-byte hex string (64 hex chars, optional 0x prefix)');

export const addressSchema = z
  .string()
  .regex(ADDRESS_REGEX, "bech32m address starting with 'xch1' or 'txch1'");

export const addressOrPuzzleHashSchema = z
  .string()
  .min(1)
  .describe('An xch/txch bech32m address OR a 32-byte hex puzzle hash (optional 0x prefix)');

export const heightSchema = z.number().int().nonnegative().describe('Block height');

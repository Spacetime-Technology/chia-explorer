import { z } from 'zod';

export const currenciesSchema = z
  .array(
    z
      .string()
      .min(2)
      .max(10)
      .regex(/^[a-zA-Z]+$/)
  )
  .min(1)
  .max(20)
  .default(['usd'])
  .describe(
    "Fiat or crypto currency codes accepted by CoinGecko (e.g. 'usd', 'eur', 'gbp', 'jpy', 'btc', 'eth'). Case-insensitive. Defaults to ['usd']."
  );

export const mojoAmountSchema = z
  .string()
  .regex(/^\d+$/)
  .describe(
    'Non-negative integer mojo amount as a decimal string. 1 XCH = 1,000,000,000,000 mojo. Convert XCH amounts to mojo before passing.'
  );

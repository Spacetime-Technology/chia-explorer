import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getXchPrices } from '../../coingecko/index.js';
import { mojoToXch, toBigInt } from '../../chia/amounts.js';
import { currenciesSchema, mojoAmountSchema } from '../../schemas/price.js';
import { errorText, jsonText } from '../shared/response.js';

function normalize(currencies: string[]): string[] {
  return Array.from(new Set(currencies.map((c) => c.toLowerCase())));
}

export function register(server: McpServer): void {
  server.tool(
    'convert_xch_to_fiat',
    'Convert a mojo amount to its current fiat (or other CoinGecko-supported currency) value. 1 XCH = 1,000,000,000,000 mojo — convert XCH to mojo before calling. Prices come from CoinGecko (cached 60s). Returned values use JS floating-point; precise to far more decimals than any realistic balance.',
    {
      mojo: mojoAmountSchema,
      currencies: currenciesSchema,
    },
    async ({ mojo, currencies }) => {
      try {
        const mojoBig = toBigInt(mojo);
        if (mojoBig < 0n) throw new Error('mojo must be non-negative');
        const xchString = mojoToXch(mojoBig);
        const xchNumber = Number(xchString);

        const normalized = normalize(currencies);
        const prices = await getXchPrices(normalized);

        const values: Record<string, number> = {};
        for (const currency of normalized) {
          const price = prices[currency];
          if (price === undefined) throw new Error(`missing price for ${currency}`);
          values[currency] = xchNumber * price;
        }

        return jsonText({
          source: 'coingecko',
          mojo: mojoBig.toString(),
          amount_xch: xchString,
          prices_per_xch: prices,
          values,
          fetched_at: new Date().toISOString(),
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getXchPrices } from '../../coingecko/index.js';
import { currenciesSchema } from '../../schemas/price.js';
import { errorText, jsonText } from '../shared/response.js';

function normalize(currencies: string[]): string[] {
  return Array.from(new Set(currencies.map((c) => c.toLowerCase())));
}

export function register(server: McpServer): void {
  server.tool(
    'get_xch_price',
    "Current XCH spot price via CoinGecko. Accepts any currency CoinGecko supports (e.g. 'usd', 'eur', 'gbp', 'jpy', 'btc', 'eth'); defaults to ['usd']. Free-tier API is rate-limited; results are cached for 60 seconds.",
    {
      currencies: currenciesSchema,
    },
    async ({ currencies }) => {
      try {
        const normalized = normalize(currencies);
        const prices = await getXchPrices(normalized);
        return jsonText({
          source: 'coingecko',
          asset: 'chia',
          prices,
          fetched_at: new Date().toISOString(),
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

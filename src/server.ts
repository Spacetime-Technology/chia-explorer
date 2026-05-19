import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VERSION } from './version.js';

import { register as registerGetBlockchainState } from './tools/blockchain/get-blockchain-state.js';
import { register as registerGetNetspace } from './tools/blockchain/get-netspace.js';
import { register as registerGetPeakHeight } from './tools/blockchain/get-peak-height.js';
import { register as registerGetBlockByHeight } from './tools/blockchain/get-block-by-height.js';
import { register as registerGetBlockByHash } from './tools/blockchain/get-block-by-hash.js';
import { register as registerCountBlockTransactions } from './tools/blockchain/count-block-transactions.js';

import { register as registerGetBalance } from './tools/coins/get-balance.js';
import { register as registerGetCoinRecordsByPuzzleHash } from './tools/coins/get-coin-records-by-puzzle-hash.js';
import { register as registerGetCoinByName } from './tools/coins/get-coin-by-name.js';
import { register as registerCalculateCoinName } from './tools/coins/calculate-coin-name.js';

import { register as registerAddressToPuzzleHash } from './tools/addresses/address-to-puzzle-hash.js';
import { register as registerPuzzleHashToAddress } from './tools/addresses/puzzle-hash-to-address.js';

import { register as registerNetworkStatusPrompt } from './prompts/network-status.js';
import { register as registerAddressSummaryPrompt } from './prompts/address-summary.js';
import { register as registerBlockSummaryPrompt } from './prompts/block-summary.js';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'chia-explorer', version: VERSION },
    {
      instructions:
        'chia-explorer answers questions about the Chia blockchain via the public coinset.org API. ' +
        'Read-only: no signing, no key material, no push_tx. ' +
        "All tools accept an optional `network: 'mainnet' | 'testnet11'` argument; mainnet is the default. " +
        'When an address is provided, the network is auto-detected from the prefix (xch / txch).',
    }
  );

  registerGetBlockchainState(server);
  registerGetNetspace(server);
  registerGetPeakHeight(server);
  registerGetBlockByHeight(server);
  registerGetBlockByHash(server);
  registerCountBlockTransactions(server);

  registerGetBalance(server);
  registerGetCoinRecordsByPuzzleHash(server);
  registerGetCoinByName(server);
  registerCalculateCoinName(server);

  registerAddressToPuzzleHash(server);
  registerPuzzleHashToAddress(server);

  registerNetworkStatusPrompt(server);
  registerAddressSummaryPrompt(server);
  registerBlockSummaryPrompt(server);

  return server;
}

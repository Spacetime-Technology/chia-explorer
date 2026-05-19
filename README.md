# chia-explorer

MCP server that answers questions about the Chia blockchain. Read-only, no keys, no signing.

Backed by the public [coinset.org](https://www.coinset.org) full-node API for chain data and [CoinGecko](https://www.coingecko.com) for XCH price. Offer strings and CLVM puzzles are decoded locally via the [chia-wallet-sdk](https://github.com/xch-dev/chia-wallet-sdk) native module — no extra services. Supports mainnet (default) and testnet11. Auto-detects network from `xch` or `txch` address prefixes.

## What it can answer

- What is the current netspace? Peak height? Sync status?
- What is the header hash of block N? How many transactions in that block? What coins were created or destroyed?
- What is the balance of `xch1...` (or `txch1...`, or a raw puzzle hash)?
- Look up a coin by name. Calculate a coin name from its fields. Find the children produced by spending a coin.
- Fetch the CLVM puzzle reveal and solution for a spent coin, plus an automatic classification (xch / cat / nft / did) and parsed conditions.
- Decode a Chia `offer1...` string locally and tell you what's being traded. Same for any raw spend bundle.
- Decompile any puzzle reveal and identify its kind (CAT with asset_id, NFT with launcher_id, settlement-payments, plain p2, etc.).
- What's currently in the mempool? Is my specific transaction pending? What fee should I pay for inclusion in 1/5/15 minutes?
- Convert between addresses and puzzle hashes in either direction.
- What is XCH worth in USD (or EUR, GBP, BTC, ...) right now? What's this balance worth?
- How much XCH is left in the strategic reserve? Where has it been sent? Which destinations are known partners, market makers, or exchanges?

## Install

```bash
npm install -g chia-explorer
```

Or run via `npx`:

```bash
npx chia-explorer
```

## Use with Claude Code

```bash
claude mcp add chia-explorer -- npx chia-explorer
```

## Use with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chia-explorer": {
      "command": "npx",
      "args": ["chia-explorer"]
    }
  }
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `get_blockchain_state` | Peak height, netspace (EiB), difficulty, sync status |
| `get_netspace` | Just the netspace in bytes, EiB, and PiB |
| `get_peak_height` | Just the peak height |
| `get_block_by_height` | Block record + header hash for a height |
| `get_block_by_hash` | Block record for a header hash |
| `count_block_transactions` | Coin spends, additions, removals counts for a block |
| `get_block_additions_and_removals` | Every coin created and destroyed in a block (full lists, not just counts) |
| `get_balance` | Balance of an address or puzzle hash (paginated, unspent coins) |
| `get_coin_records_by_puzzle_hash` | Raw coin records for a puzzle hash or address |
| `get_coin_records_by_parent_ids` | Children of one or more spent coins (the usual coin-lineage step) |
| `get_coin_by_name` | Coin record by coin name |
| `calculate_coin_name` | sha256(parent_coin_info \|\| puzzle_hash \|\| amount) — no RPC |
| `get_puzzle_and_solution` | CLVM puzzle reveal + solution for a spent coin, plus automatic puzzle classification and parsed conditions |
| `decode_offer` | Decode a `offer1...` string locally into offered / requested assets (XCH, CATs with asset_id, NFTs with launcher_id) |
| `decode_spend_bundle` | Same trade-summary shape as `decode_offer` but for any raw hex spend bundle (e.g. a mempool item) |
| `decompile_puzzle` | Classify any CLVM puzzle reveal (or fetch via coin_id+height) and optionally parse the conditions a spend emits |
| `get_mempool` | List tx_ids currently in the mempool (paginated, with optional full items) |
| `is_in_mempool` | Check whether a specific tx_id is sitting in the mempool right now |
| `estimate_fee` | Recommended mojo fee for inclusion in 1/5/15 minutes (configurable target_times + spend_type bias) |
| `address_to_puzzle_hash` | bech32m decode — no RPC |
| `puzzle_hash_to_address` | bech32m encode — no RPC |
| `get_xch_price` | Current XCH spot price in one or more currencies (CoinGecko) |
| `convert_xch_to_fiat` | Convert a mojo amount to fiat using the current XCH price |
| `get_prefarm_status` | Live per-wallet balances of the 21M XCH strategic reserve, plus total spent |
| `get_prefarm_spends` | Outflows from the reserve, with destinations labelled when known (partners / market makers / exchanges). Filter by wallet, height, or count |
| `list_prefarm_addresses` | The hardcoded registry: custody wallets and known destination addresses. No network call |

Blockchain tools take an optional `network: "mainnet" | "testnet11"` (default `mainnet`). The price tools take no network arg. The prefarm tools are mainnet only.

## Optional config

- `COINGECKO_API_KEY` — if set, sent as `x-cg-demo-api-key` to lift the free-tier rate limit. The price tools work without it.

## Prompts

- `network_status` — quick snapshot of current chain state
- `address_summary` — balance and recent activity for an address
- `block_summary` — block details plus transaction counts
- `prefarm_summary` — strategic reserve balances, recent outflows, and known destinations

## What it isn't

- A wallet. No private keys, no signing, no `push_tx`.
- A full node. Talks to public coinset.org RPC.
- A mempool watcher. Snapshot data only.

## License

MIT

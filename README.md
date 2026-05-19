# chia-explorer

MCP server that answers questions about the Chia blockchain. Read-only, no keys, no signing.

Backed by the public [coinset.org](https://www.coinset.org) full-node API. Supports mainnet (default) and testnet11. Auto-detects network from `xch` or `txch` address prefixes.

## What it can answer

- What is the current netspace? Peak height? Sync status?
- What is the header hash of block N? How many transactions in that block?
- What is the balance of `xch1...` (or `txch1...`, or a raw puzzle hash)?
- Look up a coin by name. Calculate a coin name from its fields.
- Convert between addresses and puzzle hashes in either direction.
- What is XCH worth in USD (or EUR, GBP, BTC, ...) right now? What's this balance worth?

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
| `get_balance` | Balance of an address or puzzle hash (paginated, unspent coins) |
| `get_coin_records_by_puzzle_hash` | Raw coin records for a puzzle hash or address |
| `get_coin_by_name` | Coin record by coin name |
| `calculate_coin_name` | sha256(parent_coin_info \|\| puzzle_hash \|\| amount) — no RPC |
| `address_to_puzzle_hash` | bech32m decode — no RPC |
| `puzzle_hash_to_address` | bech32m encode — no RPC |
| `get_xch_price` | Current XCH spot price in one or more currencies (CoinGecko) |
| `convert_xch_to_fiat` | Convert a mojo amount to fiat using the current XCH price |

Blockchain tools take an optional `network: "mainnet" | "testnet11"` (default `mainnet`). The price tools don't take a network arg.

## Optional config

- `COINGECKO_API_KEY` — if set, sent as `x-cg-demo-api-key` to lift the free-tier rate limit. The price tools work without it.

## Prompts

- `network_status` — quick snapshot of current chain state
- `address_summary` — balance and recent activity for an address
- `block_summary` — block details plus transaction counts

## What it isn't

- A wallet. No private keys, no signing, no `push_tx`.
- A full node. Talks to public coinset.org RPC.
- A mempool watcher. Snapshot data only.

## License

MIT

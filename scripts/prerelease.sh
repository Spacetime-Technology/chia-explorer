#!/bin/bash
set -e

branch=$(git branch --show-current)
[ "$branch" = "main" ] || { echo "error: on branch '$branch', must be on main"; exit 1; }

[ -z "$(git status --porcelain)" ] || { echo "error: working tree is dirty — commit or stash first"; exit 1; }

git fetch origin main --quiet
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "error: not up to date with origin/main — pull first"; exit 1; }

pkg_version=$(node -p "require('./package.json').version")
server_version=$(node -p "require('./server.json').version")
[ "$pkg_version" = "$server_version" ] || { echo "error: server.json version ($server_version) does not match package.json ($pkg_version) — run 'node scripts/sync-server-json.js' and commit"; exit 1; }

echo "checks passed"

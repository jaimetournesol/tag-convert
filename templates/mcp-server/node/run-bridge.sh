#!/usr/bin/env bash
# Launch tag-mcp-bridge against this Node MCP server, connecting it to the TAG relay.
# Prereqs: `npm i -g @tournesol-tag/mcp-bridge` and a bridge token
# (mint one with: `node ../../scripts/tag.mjs bridge-token --write .bridge.env`).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load TAG_BRIDGE_TOKEN / TAG_RELAY_URL from .bridge.env if present.
[ -f "$DIR/.bridge.env" ] && set -a && . "$DIR/.bridge.env" && set +a

: "${TAG_RELAY_URL:=https://tag-mcp-relay.gentledesert-d3828315.westeurope.azurecontainerapps.io}"
: "${TAG_WORKSPACE_ROOT:=$DIR/workspace}"
: "${PROJECT_DIR:=$DIR}"

if [ -z "${TAG_BRIDGE_TOKEN:-}" ]; then
  echo "TAG_BRIDGE_TOKEN is not set. Mint one:" >&2
  echo "  node ../../scripts/tag.mjs bridge-token --write $DIR/.bridge.env" >&2
  exit 1
fi

exec tag-mcp-bridge \
  --relay="$TAG_RELAY_URL" \
  --token="$TAG_BRIDGE_TOKEN" \
  --mcp-cmd="node $DIR/server.mjs" \
  --mcp-env "TAG_WORKSPACE_ROOT=$TAG_WORKSPACE_ROOT" \
  --mcp-env "PROJECT_DIR=$PROJECT_DIR"

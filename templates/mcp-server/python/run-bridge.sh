#!/usr/bin/env bash
# Launch tag-mcp-bridge against this Python MCP server, connecting it to the TAG relay.
# Prereqs: `npm i -g @tournesol-tag/mcp-bridge`, a venv with your deps, and a bridge token
# (mint one with: `node ../../scripts/tag.mjs bridge-token --write .bridge.env`).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$DIR/.bridge.env" ] && set -a && . "$DIR/.bridge.env" && set +a

: "${TAG_RELAY_URL:=https://tag-mcp-relay.gentledesert-d3828315.westeurope.azurecontainerapps.io}"
: "${TAG_WORKSPACE_ROOT:=$DIR/workspace}"
: "${PROJECT_DIR:=$DIR}"
PY="${PYTHON:-$DIR/.venv/bin/python}"
[ -x "$PY" ] || PY="python3"

if [ -z "${TAG_BRIDGE_TOKEN:-}" ]; then
  echo "TAG_BRIDGE_TOKEN is not set. Mint one:" >&2
  echo "  node ../../scripts/tag.mjs bridge-token --write $DIR/.bridge.env" >&2
  exit 1
fi

exec tag-mcp-bridge \
  --relay="$TAG_RELAY_URL" \
  --token="$TAG_BRIDGE_TOKEN" \
  --mcp-cmd="$PY $DIR/server.py" \
  --mcp-env "PYTHONPATH=$DIR" \
  --mcp-env "TAG_WORKSPACE_ROOT=$TAG_WORKSPACE_ROOT" \
  --mcp-env "PROJECT_DIR=$PROJECT_DIR"

#!/usr/bin/env bash
# Launch tag-mcp-bridge against this Node MCP server, connecting it to the TAG relay.
# Prereqs: `npm i -g @tournesol-tag/mcp-bridge` and a bridge token
# (mint one with: `node ../../scripts/tag.mjs bridge-token --write .bridge.env`).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load TAG_BRIDGE_TOKEN / TAG_RELAY_URL from .bridge.env if present.
[ -f "$DIR/.bridge.env" ] && set -a && . "$DIR/.bridge.env" && set +a

if [ -z "${TAG_RELAY_URL:-}" ]; then echo "Set TAG_RELAY_URL (your TAG relay base URL), e.g. in .bridge.env" >&2; exit 1; fi
: "${TAG_WORKSPACE_ROOT:=$DIR/workspace}"
: "${PROJECT_DIR:=$DIR}"

if [ -z "${TAG_BRIDGE_TOKEN:-}" ]; then
  echo "TAG_BRIDGE_TOKEN is not set. Mint one:" >&2
  echo "  node ../../scripts/tag.mjs bridge-token --write $DIR/.bridge.env" >&2
  exit 1
fi

# On Windows (Git Bash / MSYS / Cygwin) the spawned `node` is a native Windows
# binary and cannot resolve POSIX paths like /c/Users/...  Translate to native
# (mixed, forward-slash) form when cygpath is present; no-op on Linux/macOS.
SRV="$DIR/server.mjs"
if command -v cygpath >/dev/null 2>&1; then
  SRV="$(cygpath -m "$SRV")"
  TAG_WORKSPACE_ROOT="$(cygpath -m "$TAG_WORKSPACE_ROOT")"
  PROJECT_DIR="$(cygpath -m "$PROJECT_DIR")"
fi

exec tag-mcp-bridge \
  --relay="$TAG_RELAY_URL" \
  --token="$TAG_BRIDGE_TOKEN" \
  --mcp-cmd="node $SRV" \
  --mcp-env "TAG_WORKSPACE_ROOT=$TAG_WORKSPACE_ROOT" \
  --mcp-env "PROJECT_DIR=$PROJECT_DIR"

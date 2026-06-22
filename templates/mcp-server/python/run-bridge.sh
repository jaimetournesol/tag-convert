#!/usr/bin/env bash
# Launch tag-mcp-bridge against this Python MCP server, connecting it to the TAG relay.
# Prereqs: `npm i -g @tournesol-tag/mcp-bridge`, a venv with your deps, and a bridge token
# (mint one with: `node ../../scripts/tag.mjs bridge-token --write .bridge.env`).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$DIR/.bridge.env" ] && set -a && . "$DIR/.bridge.env" && set +a

if [ -z "${TAG_RELAY_URL:-}" ]; then echo "Set TAG_RELAY_URL (your TAG relay base URL), e.g. in .bridge.env" >&2; exit 1; fi
: "${TAG_WORKSPACE_ROOT:=$DIR/workspace}"
: "${PROJECT_DIR:=$DIR}"
PY="${PYTHON:-$DIR/.venv/bin/python}"
[ -x "$PY" ] || PY="python3"

if [ -z "${TAG_BRIDGE_TOKEN:-}" ]; then
  echo "TAG_BRIDGE_TOKEN is not set. Mint one:" >&2
  echo "  node ../../scripts/tag.mjs bridge-token --write $DIR/.bridge.env" >&2
  exit 1
fi

# On Windows (Git Bash / MSYS / Cygwin) the spawned interpreter is a native
# Windows binary and cannot resolve POSIX paths like /c/Users/...  Translate to
# native (mixed, forward-slash) form when cygpath is present; no-op elsewhere.
SRV="$DIR/server.py"
PYPATH="$DIR"
if command -v cygpath >/dev/null 2>&1; then
  SRV="$(cygpath -m "$SRV")"
  PYPATH="$(cygpath -m "$PYPATH")"
  TAG_WORKSPACE_ROOT="$(cygpath -m "$TAG_WORKSPACE_ROOT")"
  PROJECT_DIR="$(cygpath -m "$PROJECT_DIR")"
  [ -f "$PY" ] && PY="$(cygpath -m "$PY")"
fi

exec tag-mcp-bridge \
  --relay="$TAG_RELAY_URL" \
  --token="$TAG_BRIDGE_TOKEN" \
  --mcp-cmd="$PY $SRV" \
  --mcp-env "PYTHONPATH=$PYPATH" \
  --mcp-env "TAG_WORKSPACE_ROOT=$TAG_WORKSPACE_ROOT" \
  --mcp-env "PROJECT_DIR=$PROJECT_DIR"

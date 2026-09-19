# MCP server templates

Two starting points for wrapping a project's functionality as MCP tools:

- **`node/`** — a stdio JSON-RPC MCP server in Node (good for JS/TS projects
  or zero-Python environments).
- **`python/`** — the same, in Python (matches the existing localMCP precedent;
  good for Python projects).

Pick the one matching the project. You edit **`tools.mjs`** / **`tools.py`** —
that's where the project's capabilities become tools. The `server.*` file
(the protocol plumbing) rarely needs changes.

## Smoke-test the server locally (no bridge, no TAG)

The server speaks newline-delimited JSON-RPC on stdin/stdout, so you can test
it with a pipe before bridging:

```bash
# Node
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"x.txt"}}}' \
  | node server.mjs

# Python
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python server.py
```

You should see a `tools` array, then a `tools/call` result. Once that looks
right, mint a bridge token and run `./run-bridge.sh` to connect it to TAG.

## Connect to TAG (the bridge)

```bash
npm i -g @tournesol-tag/mcp-bridge
node ../../scripts/tag.mjs bridge-token --project my-project --write .bridge.env   # mint a token
./run-bridge.sh                                               # connect to the relay
```

A healthy start prints `mcp child initialized` then `connected to relay`. The
returned devId identifies this project slot — use that exact value for the
`capability:create` step so TAG routes tool calls to this bridge.

Use `tag_capability_test` after registration, then a deterministic MCP-tool workflow to verify a real call. Tokens are loaded via environment, not command-line arguments. A catalogue listing alone does not test tool behavior.

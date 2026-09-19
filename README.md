# TAG: workflows, modules and MCP tools for agents

`tag-convert` gives Conductor, Codex and Claude agents a common capability to discover, create, execute and inspect TAG workflows. It also supports reusable modules, MCP capability registration, relay bridges and registry tools. Existing projects remain in their original TAG workspace.

## Components

- `scripts/mcp-server.mjs`: 15 agent-facing MCP tools, stdio JSON-RPC.
- `scripts/tag.mjs`: CLI using exactly the same handlers and authentication.
- `skills/tag-workflows`: run and monitor existing workflows.
- `skills/convert-to-tag`: author workflows/modules and implement MCP tools.
- `templates/mcp-server/{node,python}`: project business-tool scaffolds.
- `reference/CURRENT-API.md`: current resource, version and run contracts.

Node 18+; no npm dependencies for the client/server. Existing Node/Python business servers need their own project dependencies. The separately installed `tag-mcp-bridge` connects those servers to TAG; this package does not replace or restart existing bridges.

## Configure

Create `~/.config/tag/config.json` (mode 0600), or set `TAG_CONFIG_FILE`:

```json
{
  "apiUrl": "https://your-tag-api.example.com",
  "relayUrl": "https://your-tag-relay.example.com",
  "accountFile": "/absolute/private/tag-account.json"
}
```

The account file contains email/password. Alternatively use explicit `TAG_TOKEN` or `TAG_API_KEY`; appropriate TAG read/write permissions are required. `TAG_API_URL`, `TAG_RELAY_URL`, `TAG_ACCOUNT_FILE`, `TAG_STATE_DIR` override config. Tokens are not printed. No project `.env` is automatically read. This deliberately replaces the old implicit cwd `.env` behavior and shared session cache.

## Attach to any agent

Use this portable MCP entry, replacing the absolute path:

```json
{
  "mcpServers": {
    "tag": {
      "command": "node",
      "args": ["/absolute/path/tag-convert/scripts/mcp-server.mjs"]
    }
  }
}
```

For AgentNode/Conductor, use the same `tag` spec in the project's `mcps` setting. Every agent in that project inherits its MCP settings on startup. Install on each machine where agents execute; a path on the Mini is not a path on another machine. On AgentNode versions supporting shared MCP defaults, use `install-local.py --shared` to write `~/.agentnode/mcp.json` for all existing and future projects. On older versions, include the spec in each project. Restart/new sessions may be required by the host; do not interrupt a running agent or workflow solely to reload tools.

`python3 scripts/install-local.py` installs discoverable Codex and Claude skills and merges the `tag` MCP entry into the home `.mcp.json`. `--project-dir DIR` additionally merges into a project `.mcp.json`. `--server-file FILE` uses a supplied portable command/args specification, including an existing authenticated SSH connection to another installation. It backs up changed files and refuses to overwrite a differently configured existing tag server unless `--replace` is explicit. Project files are loaded by AgentNode; the installer does not pretend this changes an inaccessible control node or future project defaults.

The repository includes both Claude and Codex plugin manifests. The MCP entry inside each manifest uses that host's plugin-root variable. For a generic Conductor installation use the absolute-path entry above, not a plugin variable.

## CLI / MCP parity

```bash
node scripts/tag.mjs help
node scripts/tag.mjs tools
node scripts/tag.mjs project:list
node scripts/tag.mjs call tag_catalog --args '{"kind":"nodes"}'
node scripts/tag.mjs workflow:create --name "Example" --project existing-project-slug --graph graph.json
node scripts/tag.mjs call tag_module_save --args @module.json
node scripts/tag.mjs run:start --id WORKFLOW --version VERSION --request-key TASK_EXECUTION --input @input.json
node scripts/tag.mjs run:wait --id RUN_ID
node scripts/tag.mjs run:events --id RUN_ID
```

Creation requires an explicit project; the CLI no longer silently creates a default project. `workflow:save` returns a new version; use its actual version ID. For bridge capabilities, use the actual devId from `bridge-token --project SLOT --write PRIVATE_FILE`, then `capability:create --name NAME --slug SLUG --devId DEV_ID`.

Runs return immediately. Monitor the same ID, including after reconnecting. Reusing a requestKey with the same payload returns the accepted run; uncertain submissions block replay. Receipts live under `~/.local/state/tag-convert` and protect only this machine. Conductor must coordinate run IDs across machines. Failed tests exit nonzero. No automatic retries of externally mutating workflows and no automatic approval of human gates.

## Test

```bash
node --test tests/*.test.mjs
node scripts/tag.mjs test-run --id WORKFLOW --version VERSION --request-key UNIQUE_TEST --input @fixture.json
```

Local contract tests use a mock TAG API and do not spend tokens. Live verification should use a small deterministic workflow and isolated bridge slot; verify output, not just submission. Report LLM costs only when TAG provides them. Capability test lists the remote catalogue; it is not a complete functional test of every exposed tool.

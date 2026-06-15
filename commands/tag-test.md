---
description: Test-run a TAG workflow and stream its live telemetry (turns, tool calls + results, final output).
---

Test-run a TAG workflow and read the trace as the acceptance test.

1. Make sure the local bridge is running (`node <plugin>/scripts/tag.mjs
   bridge-status` → `connected: true`); if not, start `./run-bridge.sh` in the
   MCP server dir.
2. Run:
   ```
   node <plugin>/scripts/tag.mjs test-run --id <workflow-id> --input '<json>'
   ```
3. Read the streamed trace. Confirm: each node's behavior is visible, each
   `tool.invoked` shows sensible arguments + results, no agent burned turns
   guessing, and the final output is correct.
4. If anything is opaque or wrong, identify which deterministic logic leaked
   into an agent, move it into a node (`transform`/`branch`/`mcp-tool`),
   `workflow:save` the updated graph, and re-run.

Workflow id and input: $ARGUMENTS

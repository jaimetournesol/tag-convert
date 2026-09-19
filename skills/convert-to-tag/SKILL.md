---
name: convert-to-tag
description: Create or adapt TAG workflows, reusable modules and MCP tools from a local project or a new automation request. Use for building, converting, registering or testing TAG integrations; use tag-workflows for running an existing workflow.
---

# Build with TAG

Use the `tag` MCP server when available. The plugin root contains `reference/`, `templates/mcp-server/` and `scripts/tag.mjs`. Resolve the real path of this skill's directory and go up two levels to locate that root (also when installed through a symlink). The CLI's `tools` command lists the same schemas; `call TOOL_NAME --args @file.json` invokes them without MCP.

## Discover and design

Read the project and any local instructions. Inspect `tag_catalog` projects, workflows, modules and capabilities before creating duplicates. Read `tag_catalog(kind="nodes")` for the target installation's **current node types, ports and configuration**. Read plugin `reference/CURRENT-API.md` for API/version semantics and `reference/CONCEPTS.md` for decomposition guidance.

Reuse the user's chosen project and workflow when supplied. Separate deterministic parsing, validation, calculation and document rendering from language interpretation. TAG can run internal as well as customer-facing workflows. Keep one-off local preparation local when that fits the task; do not impose that boundary on an explicitly requested TAG automation.

Put request-specific data on graph inputs, not hard-coded prompts. Use small focused agents only where judgment is useful. Select models and budgets from the target installation; do not assume old model examples remain available. Keep source evidence and identifiers in structured outputs. Do not substitute default facts for missing customer inputs.

## Build MCP capabilities

Use the Node or Python template in `templates/mcp-server/` when a project needs new tools. Wrap real functions, with narrow input schemas, explicit failure results and small structured output. Test initialize, tools/list and a representative tools/call locally before bridging. Replace sample tools that do not belong in the target server.

A local MCP server, its relay bridge and its TAG capability are separate objects. Use `tag_bridge_token` with a distinct project/agent slot and a private output file. Start the installed bridge with that env file and inspect `tag_bridge_status`. Never replace an unrelated bridge in the same slot. A separate slot does not restrict a server's tool set: the server must expose the intended tools only.

Register with `tag_capability_save`, then `tag_capability_test`. Use the returned devId rather than reconstructing it from a guessed JWT claim. A catalogue test proves connectivity; exercise the actual tool separately. A static URL must implement TAG's supported MCP transport/binding; it is not automatically equivalent to any arbitrary REST endpoint.

## Author and verify

Use `tag_module_save` for reusable subgraphs: declare `ioContract` mappings to internal nodes and ports, and pin `moduleVersionId` in consumers. Use `tag_workflow_save` for explicit project creation or a new workflow version. Read back the version and verify its graph. TAG is the authoritative validator; the client checks only graph structure and fills missing positions.

Use current node definitions for `module`, `iterator`, `mcp-tool` and agent ports. Connect capability IDs/tool names explicitly. Prefer deterministic `mcp-tool` nodes for fixed calls; give agent nodes only their needed capabilities/tool filters. Test nested modules and iteration when used rather than assuming flat-graph tests cover them.

Start a test with `tag_run_start`, a pinned workflow version and a stable `requestKey`. It returns immediately. Inspect that same run via `tag_run_wait`/`tag_inspect`; stop at human gates and report them. Do not retry uncertain writes blindly. A new test after a code change is a new intended execution and gets a new requestKey. Failed attempts and partial outputs are not a successful final result.

Complete authorized implementation and tests without adding an extra approval round merely because this is a conversion. Retain any user-required approval gates and obtain additional authorization only where the actual action requires it.

## Handoff

Report project, workflow/module/version IDs, capability/bridge identity, inputs, verified outputs, reported usage/cost and remaining dependencies. Clearly distinguish mocked/local tests from actual TAG runs. Leave unrelated deals, workflows, credentials and running bridges intact.

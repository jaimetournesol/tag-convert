# Node reference (the subset you need for conversions)

Each node in a workflow graph is:

```json
{ "id": "short-id", "type": "<node-type>", "label": "Human label",
  "config": { ... } }
```

Edges connect ports:

```json
{ "id": "e1", "source": "a", "target": "b",
  "sourceHandle": "output", "targetHandle": "input" }
```

> **Omit node `position`** — the editor auto-lays-out. If you must set it,
> use `{ "x": <num>, "y": <num> }` with **both** keys.

## Triggers & input
- **`input`** — seed/receive data. `config.data` = default object (overridden
  by run input). Output handle: `output` (the payload object).
- **`api-trigger`** — HTTP entry for a deployed workflow. Output: `payload`.
- **`file-input`** — a file. Outputs: `file`, `filename`, `mimeType`.

## Deterministic processing
- **`transform`** — JSONata reshape. `config.expression`. In: `input`, out:
  `output`. See `JSONATA.md`.
- **`branch`** — boolean route. `config.condition` (JSONata → truthy).
  Outputs: `true`, `false`. In: `input`.
- **`smart-branch`** — dynamic router. `config.branches = [{id,label,color}]`;
  outgoing edges set `sourceHandle` to a branch `id`.
- **`http-get` / `http-post`** — call an HTTP endpoint deterministically.
  `config.url`, `config.headers`, `config.body`.
- **`mcp-tool`** — call ONE known MCP tool deterministically.
  `config.capabilityId`, `config.toolName`, `config.args`. Outputs: `output`
  (json), `error` (string).
- **`join`** — fan-in. `config.mergeStrategy` = `array` | `object`. Inputs:
  `input1`..`input4`. Out: `output`.
- **`iterator`** — fan-out over an array. `config.arrayPath`,
  `config.concurrency`. Outputs: `item`, `done`.
- **`memory-read` / `memory-write`** — Redis K/V. read in: `key`; out:
  `value`, `found`. write in: `key`, `value`; out: `ok`.

## Agents
- **`claude-sdk`** — a sandboxed Claude agent. Key config:
  - `configMode`: `"inline"` (use `systemPrompt`) or `"registry"` (use `agentId`).
  - `systemPrompt`: the agent's instructions — **name the tools it has** and
    the structured input it receives.
  - `model`: e.g. `"claude-sonnet-4-6"`.
  - `maxTurns`: tool-call budget (e.g. 8–20 for tool-using agents; 1–3 for
    pure text).
  - `capabilityIds`: `[capId, …]` — the capabilities (MCP tools) it can use.
  - `capabilityToolFilters`: `{ capId: ["tool_a","tool_b"] }` — per-agent tool
    allowlist; scope each agent to only the tools its job needs.
  - `enableWorkspace`: `true` to give the agent a built-in **Claude-Code-style
    file toolkit** (`read_file` with line ranges, `write_file`, `edit_file`,
    `list_files`, `glob`, `grep`, `move_file`, `delete_file`) over a workspace
    **shared by every agent node in the same run**. Set it on each agent that
    should read or write the shared files. See "Multi-agent shared workspace"
    below. Default `false`.
  - Inputs: `prompt` (the user message), `context`. Outputs: `text`,
    `toolCalls`, `tokensUsed`, `costUsd`.

## Terminals & output
- **`format-output`** — validate/shape the final result. Outputs: `output`,
  `error`.
- **`chat-response`** — reply in a chat deployment. `config.staticResponse` or
  dynamic; `config.responseFormat`. In: `message`.
- **`log`** — record/observe a value. `config.message`, `config.saveArtifact`.

## Tool-using agent — minimal shape
```json
{
  "nodes": [
    { "id": "in", "type": "input", "label": "Input", "config": { "data": {} } },
    { "id": "agent", "type": "claude-sdk", "label": "Worker", "config": {
        "configMode": "inline",
        "model": "claude-sonnet-4-6",
        "maxTurns": 12,
        "systemPrompt": "You have these MCP tools: <name(args)…>. Your input contains <…>. Use the tools to <…> and return <…>.",
        "capabilityIds": ["<capability-id>"],
        "capabilityToolFilters": { "<capability-id>": ["tool_a","tool_b"] }
    } },
    { "id": "out", "type": "log", "label": "Result", "config": { "message": "Result:", "saveArtifact": true } }
  ],
  "edges": [
    { "id": "e1", "source": "in", "target": "agent", "sourceHandle": "output", "targetHandle": "prompt" },
    { "id": "e2", "source": "agent", "target": "out", "sourceHandle": "text", "targetHandle": "input" }
  ]
}
```

## Multi-agent shared workspace — pass files between agents

When a workflow has **several agents that need to exchange whole files or
directories** (not just a single string), set `"enableWorkspace": true` on
**every** agent node that should touch the shared files. Each such agent gets
the Claude-Code-style file toolkit over **one workspace scoped to the run** —
so a producer can `write_file` and a later agent can `glob` / `grep` /
`read_file` / `edit_file` the very same paths. The workspace is isolated per
run and wiped when the run ends.

Prefer this over `memory-write` / `memory-read` whenever agents pass FILES or
multiple artifacts. Still wire the normal `text` → `prompt` edge so the
consumer agent runs *after* the producer and knows what to look for.

```json
{
  "nodes": [
    { "id": "in", "type": "input", "label": "Input", "config": { "data": {} } },
    { "id": "writer", "type": "claude-sdk", "label": "Writer", "config": {
        "configMode": "inline", "model": "claude-sonnet-4-6", "maxTurns": 12,
        "enableWorkspace": true,
        "systemPrompt": "Write your draft to docs/report.md using write_file, then summarize what you wrote."
    } },
    { "id": "editor", "type": "claude-sdk", "label": "Editor", "config": {
        "configMode": "inline", "model": "claude-sonnet-4-6", "maxTurns": 12,
        "enableWorkspace": true,
        "systemPrompt": "Use glob/grep/read_file to find the draft under docs/, then edit_file to tighten it. Report the final path."
    } },
    { "id": "out", "type": "log", "label": "Result", "config": { "message": "Result:", "saveArtifact": true } }
  ],
  "edges": [
    { "id": "e1", "source": "in", "target": "writer", "sourceHandle": "output", "targetHandle": "prompt" },
    { "id": "e2", "source": "writer", "target": "editor", "sourceHandle": "text", "targetHandle": "prompt" },
    { "id": "e3", "source": "editor", "target": "out", "sourceHandle": "text", "targetHandle": "input" }
  ]
}
```

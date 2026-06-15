---
name: convert-to-tag
description: >
  Convert an existing local project into a TAG workflow. Use when the user
  wants to take a project on their machine (a script, CLI, service, pipeline,
  library) and turn it into an observable TAG workflow — exposing the
  project's actions as MCP tools, bridging them to TAG, and building + testing
  a workflow that orchestrates deterministic nodes and agents. Trigger on
  requests like "convert this project to TAG", "make a TAG workflow from
  this", "wrap my project as TAG tools".
---

# Convert a local project to TAG

You are converting the project in the current directory into a **TAG
workflow**. This is a decomposition exercise, not a wrapping exercise. Read
`reference/CONCEPTS.md` first and keep it in mind the whole way through — the
quality of the result depends almost entirely on splitting the project into
**observable deterministic nodes** vs a **small agentic core**, and keeping
**data** (flows on edges) separate from **workflow** (the graph).

The plugin gives you:
- `reference/CONCEPTS.md` — the TAG way of thinking (read this).
- `reference/NODES.md` — node types, ports, config.
- `reference/JSONATA.md` — safe `branch`/`transform` expressions.
- `scripts/tag.mjs` — a dependency-free TAG API CLI (login, capability,
  workflow, test-run + live telemetry).
- `templates/mcp-server/{node,python}/` — MCP server scaffolds.

## Prerequisites (check once)

1. Node 18+ (`node -v`) and, for Python projects, Python 3.10+.
2. The bridge CLI: `npm i -g @tournesol-tag/mcp-bridge`.
3. TAG credentials available to `tag.mjs` — a `.env` in the working dir with
   `TAG_EMAIL` + `TAG_PASSWORD` (or `TAG_TOKEN`). `TAG_API_URL` /
   `TAG_RELAY_URL` default to the hosted instance; override for another.
   Verify: `node <plugin>/scripts/tag.mjs login` then `… whoami`.

> Throughout, run the CLI as `node <path-to-plugin>/scripts/tag.mjs <cmd>`.

## Phase 0 — Understand the project

Read the project before touching TAG. Determine:
- What it does and its **entry points** (CLI, `main`, exported functions, an
  HTTP server, a pipeline).
- The discrete **operations** it performs and their inputs/outputs.
- Which operations **touch the outside world** (files, DBs, APIs, compute).
- Which operations need **judgment / language / planning** vs which are
  **deterministic**.

Write a short conversion plan and confirm it with the user before building.

## Phase 1 — Decompose (the important part)

Apply the rubric from `CONCEPTS.md §6` to every operation:

1. **Deterministic** (parse, transform, a fixed API call, routing) →
   a programmatic node: `transform`, `http-get/post`, `mcp-tool`, `branch`,
   `join`, `format-output`. No agent.
2. **External action** (file/db/api/compute) → expose as an **MCP tool**.
   Then decide: called the same way every time → an `mcp-tool` node; chosen
   dynamically by reasoning → give it to an **agent** as a capability.
3. **Needs judgment / language** → a `claude-sdk` **agent**, with a tight
   prompt and a **small, named** tool set.

Sketch the graph: mostly deterministic nodes preparing/routing data, one or a
few focused agents at the decision points, observable terminals. Keep **data
on edges** — the thing the run operates on is `input`, not a constant baked
into a prompt.

## Phase 2 — Build the MCP tools

Copy the matching template into the project (or a sibling dir):

```bash
cp -r <plugin>/templates/mcp-server/node   ./tag-mcp     # or .../python
```

Edit **`tools.mjs`** / **`tools.py`**: replace the example tools with one tool
per external action you identified in Phase 1. Wrap the project's real
functions/CLI/endpoints (patterns A/B/C in the template). Name tools like the
project's own verbs. Keep results as plain text / compact JSON.

**Smoke-test locally** (no bridge) by piping JSON-RPC — see
`templates/mcp-server/README.md`. Confirm `tools/list` shows your tools and a
`tools/call` returns what you expect. Do not proceed until this works.

## Phase 3 — Bridge the tools to TAG

```bash
cd ./tag-mcp
node <plugin>/scripts/tag.mjs bridge-token --write .bridge.env   # mint token (devId = your user id)
./run-bridge.sh                                                  # leave running
```

Confirm with `node <plugin>/scripts/tag.mjs bridge-status` → `connected: true`.

## Phase 4 — Create the capability

```bash
node <plugin>/scripts/tag.mjs capability:create \
  --name "My Project Tools" --slug my-project-tools
```

This registers an `mcp-server` capability whose `urlSource` is the relay +
your `devId`, so a TAG agent that holds this capability can call your bridged
tools. Note the printed **capability id**. (Optionally narrow which tools each
agent sees later via `capabilityToolFilters` — see `NODES.md`.)

## Phase 5 — Author the workflow graph

Write `graph.json` following the plan from Phase 1 and `NODES.md`. Principles:
- **Omit node positions** (auto-layout). Use canonical node types.
- Deterministic steps as nodes; agents only where needed, each with
  `capabilityIds: ["<your-cap-id>"]` and a `systemPrompt` that **names the
  tools** and describes the **structured input** it receives.
- For an agent that should only use some tools, set
  `capabilityToolFilters: { "<cap-id>": ["tool_a","tool_b"] }`.
- `branch`/`transform` expressions: the value is an object — coerce with
  `$string($)` or reach into a field (`JSONATA.md`).
- End on an observable terminal (`format-output` / `log` / `chat-response`).

Create it:

```bash
node <plugin>/scripts/tag.mjs workflow:create --name "My Project" --graph graph.json
# → prints the workflow id ; iterate with:  workflow:save --id <id> --graph graph.json
```

## Phase 6 — Test end-to-end (the acceptance test)

With the bridge still running:

```bash
node <plugin>/scripts/tag.mjs test-run --id <workflow-id> --input '{"...":"..."}'
```

This streams the live trace: turns, **`tool.invoked` with arguments and
results**, assistant messages, and the final output. The acceptance test from
`CONCEPTS.md §7`: **you should be able to read the trace and say exactly what
happened at every step.** If an agent did something you can't see, or burned
turns guessing, pull that logic out of the agent into a deterministic node and
re-run. Iterate `tools.* → workflow:save → test-run` until the trace is clean.

## Phase 7 — Hand off

Summarize for the user: the capability id, the workflow id, the graph shape
(which steps are deterministic vs agentic and why), how to keep the bridge
running, and how to re-test. Note anything you deferred (e.g. tools that
should later become deterministic `mcp-tool` nodes).

## Anti-patterns (do not)

- **One mega-agent that does everything.** Decompose; reserve the agent for
  the dynamic core. (This is the single most common mistake.)
- **Baking run data into the workflow.** URLs/ids/paths the run operates on
  are `input`, not constants.
- **Giving an agent every tool.** Scope with `capabilityToolFilters`.
- **String functions on a bare `$`** in JSONata — coerce/reach in.
- **Skipping the local smoke test** before bridging, or **skipping the
  test-run** before handing off.

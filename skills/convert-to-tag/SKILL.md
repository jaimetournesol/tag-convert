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
- `reference/EXAMPLES.md` — two complete starter graphs (an interactive chatbot
  with MCP tools + TAG-owned chat history, and a deterministic lookup).
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

## Scope — TAG is your customers' runtime, not your data-prep tool

Decide what belongs in TAG **at all** before decomposing. The line:

- **TAG = the customer-facing, observable, validatable runtime.** You build TAG
  workflows for **your customers** to run — classification, Q&A, an interactive
  chatbot — with observable steps and (for chat) **TAG-owned conversation state**
  (history is persisted in TAG, keyed by a conversation/session id — your
  customer never has to store it, and neither do you).
- **Your own data prep stays LOCAL.** Ingesting documents, **enriching your own
  knowledge graph**, batch-embedding, backfills — that's *dev-side* work on
  *your* data. Do it **locally with your own Claude (Claude Code) or your own
  scripts** — **not** a TAG workflow.

**Why this matters:** a TAG workflow runs agents in the platform sandbox, which
spends **API tokens** (the platform's). Running your own KG ingestion/enrichment
*through a TAG workflow* burns platform tokens for work that is just your local
data preparation — the exact anti-pattern to avoid (a dev ran ingestion-into-his-
own-graph as a TAG workflow and it cost a lot of tokens for zero customer value).

**The shape that's right:**
1. **Locally, with your own Claude / scripts** — build and enrich your KG / data.
2. **Wrap your local data + functions as MCP servers** (Phase 2) and bridge them.
3. **In TAG, build the observable workflow your *customers* run** — it *queries*
   your data through those MCP tools (and can chat over it, with TAG holding the
   conversation history). The heavy, one-off, dev-side compute never enters TAG.

If an operation is "prepare/enrich *my* data," keep it local. If it's "*serve* a
customer a validatable result over that data," that's the TAG workflow.

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

**Least privilege — one bridge per agent (recommended).** When a workflow has
several agents with different tool needs, give each agent its **own** bridge slot
exposing **only its tools**, rather than one shared bridge carrying every tool.
Mint a per-agent slot (`--project "<project>-<agent>"`) and create a per-agent
capability pointed at it, then put **only that capability id** on that agent's
node. The bridge process is the hard boundary (it runs only that agent's MCP
server), so a prompt-injected or buggy agent physically cannot reach another
agent's tools — defense-in-depth above `capabilityToolFilters` (a soft,
visible-surface filter). See "one bridge per agent" in the plugin `README.md`.
Default to per-agent when tool needs differ or any tool is sensitive; share a
bridge only when agents genuinely share one tool set.

## Phase 5 — Author the workflow graph

Write `graph.json` following the plan from Phase 1 and `NODES.md`. For two
complete, adaptable starting graphs (an interactive chatbot and a deterministic
lookup) see `reference/EXAMPLES.md`. Principles:
- **Omit node positions** (auto-layout). Use canonical node types.
- Deterministic steps as nodes; agents only where needed, each with
  `capabilityIds: ["<your-cap-id>"]` and a `systemPrompt` that **names the
  tools** and describes the **structured input** it receives.
- For an agent that should only use some tools, set
  `capabilityToolFilters: { "<cap-id>": ["tool_a","tool_b"] }`.
- If two or more agents must **exchange whole files** (writer → editor,
  planner → executor), set `enableWorkspace: true` on each of those agents:
  they share one run-scoped filesystem with built-in `read_file` / `write_file`
  / `edit_file` / `list_files` / `glob` / `grep` / `move_file` / `delete_file`
  tools. Use this instead of `memory-*` when passing files/artifacts rather
  than a single value (`NODES.md` → "Multi-agent shared workspace").
- `branch`/`transform` expressions: the value is an object — coerce with
  `$string($)` or reach into a field (`JSONATA.md`).
- End on an observable terminal (`format-output` / `log` / `chat-response`).

**Pick a project FIRST.** A workflow must belong to a project or it won't be
visible in the TAG UI (the UI is project-scoped — every list/editor route is
under `/p/:projectSlug/...`, so a project-less workflow can't be listed or
opened). Reuse an existing project or create one:

```bash
node <plugin>/scripts/tag.mjs project:list                       # id · slug · name
node <plugin>/scripts/tag.mjs project:create --name "My Project"  # → prints a project id
```

Create the workflow **with `--project`** (slug or id):

```bash
node <plugin>/scripts/tag.mjs workflow:create --name "My Project" --graph graph.json --project my-project
# → prints the workflow id ; iterate with:  workflow:save --id <id> --graph graph.json
```

If you omit `--project`, the CLI still attaches one (a default "TAG Convert"
project) so the workflow is never orphaned — but prefer an explicit, meaningful
project so the user finds it where they expect.

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
- **Giving an agent every tool.** Soft-scope with `capabilityToolFilters`; for a
  hard boundary give each agent its **own per-agent bridge** exposing only its
  tools (see Phase 4 + `README.md`). Default to one bridge per agent.
- **String functions on a bare `$`** in JSONata — coerce/reach in.
- **Skipping the local smoke test** before bridging, or **skipping the
  test-run** before handing off.

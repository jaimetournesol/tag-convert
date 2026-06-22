# The TAG way of thinking

> Read this before converting anything. Converting a project to TAG is not
> "wrap it in an agent." It is a **decomposition**: deciding which parts of
> the project become observable, deterministic graph nodes and which small
> core genuinely needs an agent. Get this split right and the rest is easy.

## 1. A TAG workflow is an observable DAG, not a black box

A TAG workflow is a directed acyclic graph. **Nodes** are steps; **edges**
carry data between them through typed ports (`sourceHandle` → `targetHandle`).
The platform records every node's input and output for every run (the
`NodeAttempt` rows you see in the run trace). That observability is the whole
point:

- You can see exactly what data entered and left each step.
- You can replay, diff, and unit-test individual steps.
- Failures are localized to a node, not buried in one long agent transcript.

A single "one agent does everything" design throws all of this away. The TAG
win is a mostly-deterministic graph with agents only at the genuinely dynamic
points.

## 2. Two kinds of computation — choose deliberately

### Programmatic / deterministic nodes — the skeleton
Same input → same output. No LLM, cheap, fast, fully inspectable. Use these
for anything you can express as a rule or a known operation:

| Need | Node |
|------|------|
| Seed / receive input | `input`, `api-trigger`, `file-input` |
| Reshape / compute (JSONata) | `transform` |
| Route on a condition | `branch`, `smart-branch`, `difficulty-router` |
| Call a known HTTP endpoint | `http-get`, `http-post` |
| Call a known MCP tool deterministically | `mcp-tool` |
| Persist / recall state | `memory-write`, `memory-read`, `format-output` |
| Fan-out / fan-in | `iterator`, `join` |
| Pause for a human | `approval` |
| Terminal output | `chat-response`, `log`, `format-output` |

### Agentic nodes — the dynamic spark
`claude-sdk` is a sandboxed Claude agent that reasons over its input and may
call MCP tools. Non-deterministic, costs tokens, slower, harder to inspect.
Use it **only** where the task is irreducibly dynamic:

- open-ended natural-language understanding or generation,
- judgment / classification / planning that you cannot pre-script,
- dynamic tool orchestration (it decides *which* tools to call and *when*).

When **two or more agents need to exchange whole files** (a writer produces a
draft, an editor refines it; a planner emits files, an executor consumes
them), turn on the **shared run workspace** — set `"enableWorkspace": true` on
each of those agent nodes. They then share one run-scoped filesystem with a
Claude-Code-style toolkit (`read_file` / `write_file` / `edit_file` /
`list_files` / `glob` / `grep` / `move_file` / `delete_file`). Reach for this
instead of `memory-write` / `memory-read` when the thing being passed is FILES
or multiple artifacts rather than a single value. (See `NODES.md` →
"Multi-agent shared workspace".)

### The rule
> **Push everything deterministic OUT of the agent into observable nodes.
> Reserve the agent for the small, genuinely dynamic core.**

If a step always does the same thing, it does not belong inside an agent —
it belongs in a `transform` / `http` / `mcp-tool` / `branch` node where you
can watch it. When you find yourself writing an agent prompt like "first
fetch X, then parse the third field, then if it's > 5 do Y" — stop. Fetch X
with an `http`/`mcp-tool` node, parse with `transform`, decide with `branch`.
Hand the agent only the part that needs thinking.

## 3. Data vs workflow — keep them separate

- The **workflow** is the recipe: the nodes and how they're wired. It is
  static and versioned.
- **Data** is the ingredients: the objects that flow on edges at run time
  (recorded per node), plus anything you deliberately persist
  (`memory-*`, artifacts).
- **External systems** are the pantry: databases, files, APIs, your
  project's functions — reached through **MCP tools** (for the agent) or
  `http`/`mcp-tool` nodes (deterministically).

Three discipline rules that fall out of this:

1. **Don't bake data into the workflow.** A URL, a customer id, a file path
   the run operates on is *input data* — it arrives on an edge from an
   `input`/`api-trigger` node. It is not a constant hardcoded in a prompt.
2. **Don't make the agent fetch/transform data it could be handed.** If a
   deterministic node can produce the value, wire it in. The agent should
   receive clean, structured input, not go digging.
3. **Data shapes are runtime, not design-time.** A node's *ports* declare
   types, but the exact object keys on an edge are determined at run time by
   upstream nodes and the caller's input. When writing JSONata in a
   `branch`/`transform`, remember the value is usually an **object**
   (e.g. `{ "url": "..." }`), so coerce or reach into a field — never call a
   string function on the bare `$`. (See `JSONATA.md`.)

## 4. MCP tools = the agent's hands

When your project *does* things to the outside world — reads/writes files,
queries a database, calls an API, runs a computation — those become **MCP
tools**. You expose them by running a small MCP server (wrapping your
project) and bridging it to TAG. An agent node, given that capability,
**decides at run time** which tools to call.

Deterministic vs agentic, again:

- If the agent must *decide* which action to take based on dynamic input →
  give it the tools as a **capability** and let it orchestrate.
- If the action is always the same → call it directly with an `mcp-tool` or
  `http` node in the graph. More observable, no agent indeterminacy.

Scope the agent's tools with a **tool allowlist** (`capabilityToolFilters`)
so each agent sees only the tools its job needs — a reviewer agent gets
`scrape_website`; a writer agent gets the filesystem tools. Smaller tool
surface = fewer wrong turns, clearer traces.

## 5. Capabilities — packaged external power

A **capability** is how an agent reaches beyond its own reasoning. Three kinds:

- **mcp-server** — a set of MCP tools (this is what wrapping your project
  produces; reached via your local bridge → the relay).
- **inline-prompt** — a reusable system-prompt fragment / skill.
- **http-tool** — an OpenAPI-described HTTP surface.

Capabilities are attached to agent nodes by id (`config.capabilityIds[]`)
and optionally narrowed per-agent (`config.capabilityToolFilters`).

## 6. The decomposition rubric (use this when converting)

For each thing the project does, ask in order:

1. **Is it deterministic?** → a programmatic node (`transform` / `http` /
   `mcp-tool` / `branch` / …). Done.
2. **Is it an external action** (file/db/api/compute)? → expose it as an
   **MCP tool**. Then: is *when to call it* fixed → `mcp-tool` node; or
   dynamic → give it to an agent as a capability.
3. **Does it need judgment / language / planning?** → a `claude-sdk` agent,
   with a tight prompt that **names the tools it has** and the structured
   input it receives.
4. **Wire it** so data flows on edges; keep each agent's prompt + tool set
   minimal; end on an observable terminal (`format-output` / `log` /
   `chat-response`).

A healthy converted workflow looks like: a few deterministic nodes that
prepare and route data, one (sometimes two or three) focused agents at the
decision points each holding a small, named tool set, and clear terminals —
all watchable in the test-run trace.

## 7. Observability is the acceptance test

When you test-run the workflow, you should be able to read the trace and say
exactly what happened: which nodes ran, what each received and produced, and
for each agent which tools it called with what arguments and what came back.
**If you can't tell what happened, you've put too much in the agent** — pull
the deterministic parts back out into nodes and try again.

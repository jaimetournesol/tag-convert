# tag-convert

A Claude Code plugin that turns **"I have a project on my laptop"** into a
working, observable **TAG workflow** — scaffolding MCP tools from the project,
bridging them to TAG, creating the capability + workflow, and testing it
end-to-end.

It is opinionated about the **TAG way of thinking**: a workflow is an
observable DAG, you push everything deterministic into inspectable nodes and
reserve agents for the genuinely dynamic core, and you keep **data** (flows on
edges) separate from the **workflow** (the graph). See
[`reference/CONCEPTS.md`](reference/CONCEPTS.md) — read it first.

## What's inside

```
tag-convert/
├── .claude-plugin/plugin.json     plugin manifest
├── skills/convert-to-tag/SKILL.md the conversion playbook (the brain)
├── commands/                      /tag-convert, /tag-test
├── scripts/tag.mjs                dependency-free TAG API CLI (the tools)
├── templates/mcp-server/          node + python MCP server scaffolds
└── reference/                     CONCEPTS · NODES · JSONATA · EXAMPLES
```

## Install

Clone this repo, then add it to Claude Code as a plugin (point your plugin
config / marketplace at this directory), or simply open it and invoke the
skill from a project you want to convert.

The CLI needs no install — it's plain Node 18+:

```bash
node /path/to/tag-convert/scripts/tag.mjs help
```

## Configure

Point it at your TAG instance and authenticate. Create a `.env` in the
directory you run from (your TAG operator provides the API + relay URLs):

```bash
# Target instance (required) — ask your TAG operator for these:
TAG_API_URL=https://your-tag-api.example.com
TAG_RELAY_URL=https://your-tag-relay.example.com

# Auth:
TAG_EMAIL=you@example.com
TAG_PASSWORD=...
# or, instead of email/password:
# TAG_TOKEN=<a TAG session JWT>
```

Then: `node scripts/tag.mjs login && node scripts/tag.mjs whoami`.

`login` caches a 7-day **refresh token** in `.tag-convert/session.json`, and
the CLI silently re-mints the short-lived (~15 min) access token on `401` — so
you only enter the password **once**. After the first `login` you can remove
`TAG_PASSWORD` from `.env`; you'll only need it again after 7 idle days (or
`login` to refresh sooner). Add `.tag-convert/` to `.gitignore`.

## Use

In Claude Code, from the project you want to convert:

```
/tag-convert
```

Claude Code will read the concepts, decompose the project (deterministic nodes
vs agentic core), scaffold + smoke-test the MCP tools, bridge them, create the
capability and workflow, and `/tag-test` it until the trace is clean.

## The CLI (what the skill drives)

```
node scripts/tag.mjs login|whoami
node scripts/tag.mjs bridge-token --write .bridge.env
node scripts/tag.mjs bridge-status
node scripts/tag.mjs capability:create --name N --slug S
node scripts/tag.mjs capability:list
node scripts/tag.mjs workflow:create --name N --graph graph.json
node scripts/tag.mjs workflow:save  --id ID --graph graph.json
node scripts/tag.mjs test-run --id ID --input '{"...":"..."}'
```

## Multiple projects at once (one bridge per project)

The relay gives each **devId** a single bridge slot — a second bridge on the
same devId kicks the first. To run several projects' MCP servers concurrently,
mint a **per-project** token: `--project <name>` derives a distinct slot
(`<userId>__<slug>`, namespaced under your own id), and `capability:create
--project <name>` points that project's tools at the matching slot.

```
# project A
node scripts/tag.mjs bridge-token   --project tariff --write a/.bridge.env
node scripts/tag.mjs capability:create --name "Tariff Tools" --slug tariff-tools --project tariff
./a/run-bridge.sh        # exposes A's MCP server on slot <userId>__tariff

# project B — runs at the SAME time, its own slot
node scripts/tag.mjs bridge-token   --project ifrs --write b/.bridge.env
node scripts/tag.mjs capability:create --name "IFRS Tools" --slug ifrs-tools --project ifrs
./b/run-bridge.sh        # exposes B's MCP server on slot <userId>__ifrs
```

Omit `--project` for your default single slot. Check any slot with
`bridge-status --project <name>`.

### Recommended: one bridge per *agent* (least privilege)

The slot namespace is arbitrary, so go finer than per-project: run **one bridge
per agent**, each exposing **only that agent's tools**. In an agent platform, a
single bridge that exposes *every* tool means a prompt-injected or buggy agent can
call *any* of them (a "summariser" reaching a "delete-DB" tool). A bridge per agent
makes the other agents' tools physically unreachable — least privilege at the
connection boundary, on top of `capabilityToolFilters` and the relay deny-list.

Use a per-agent slot name (`<project>-<agent>`):

```
# the "enrich" agent — its own slot, ONLY its tools
node scripts/tag.mjs bridge-token      --project ifrs-enrich --write enrich/.bridge.env
node scripts/tag.mjs capability:create --name "IFRS enrich tools" --slug ifrs-enrich-tools --project ifrs-enrich
./enrich/run-bridge.sh     # this process exposes ONLY the enrich agent's MCP server

# the "cross-check" agent — separate slot, its own (different) tools
node scripts/tag.mjs bridge-token      --project ifrs-crosscheck --write check/.bridge.env
node scripts/tag.mjs capability:create --name "IFRS cross-check tools" --slug ifrs-check-tools --project ifrs-crosscheck
./check/run-bridge.sh
```

Then give each agent node **only its own** capability id in `capabilityIds[]`. The
bridge process is what scopes the tools (it runs only that agent's server); the
relay just routes by slot. Granularity is a dial (per-user → per-project →
per-agent → per-tool-group) — default to **per-agent** when agents have different
or sensitive tool needs; share a bridge only when agents genuinely share one tool
set.

## Requirements

- Node 18+ (the CLI + Node template). Python 3.10+ for the Python template.
- The bridge CLI: `npm i -g @tournesol-tag/mcp-bridge`.
- A TAG account on the target instance.

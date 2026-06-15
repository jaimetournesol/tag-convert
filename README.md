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
└── reference/                     CONCEPTS · NODES · JSONATA
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

## Requirements

- Node 18+ (the CLI + Node template). Python 3.10+ for the Python template.
- The bridge CLI: `npm i -g @tournesol-tag/mcp-bridge`.
- A TAG account on the target instance.

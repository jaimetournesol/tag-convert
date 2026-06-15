---
description: Convert the current local project into a TAG workflow (MCP tools + bridge + capability + workflow + test).
---

Convert the project in the current working directory into a TAG workflow by
following the **convert-to-tag** skill.

Work through it in order and do not skip the thinking step:

1. Read `reference/CONCEPTS.md` (the TAG way of thinking) and apply the
   decomposition rubric — observable deterministic nodes for everything
   predictable, an agent only for the genuinely dynamic core, data on edges.
2. Understand this project (entry points, operations, external actions).
3. Propose a conversion plan (which steps become nodes vs MCP tools vs an
   agent, and the graph shape) and **confirm it with me before building**.
4. Then build: scaffold the MCP server, wrap the project's actions as tools,
   smoke-test locally, bridge to TAG, create the capability, author the
   workflow graph, and test-run it with live telemetry until the trace is
   clean.

Use `node <plugin>/scripts/tag.mjs` for all TAG API calls.

$ARGUMENTS

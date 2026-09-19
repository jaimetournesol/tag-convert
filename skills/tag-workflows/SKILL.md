---
name: tag-workflows
description: Discover, execute and monitor existing TAG workflows from Conductor or any agent. Use for TAG runs, outputs, progress, failures, approvals or questions; use convert-to-tag when creating workflows, modules or MCP tools.
---

# Run workflows through TAG

Use the available `tag` MCP tools. They are optional execution capabilities: choose TAG when requested or when an existing workflow fits the task. Do not force unrelated work through TAG.

1. Discover projects and workflows with `tag_catalog`; lists are paginated. Select the intended project and inspect the workflow with `tag_inspect`. Check the input contract and capabilities. Pin the actual workflow version ID.
2. Check existing runs with `tag_run_list` when resuming or investigating a possible duplicate. A previously accepted run is monitored, not resubmitted.
3. Within the user's authorization, call `tag_run_start` with workflowId, workflowVersionId, structured input and a stable requestKey identifying this intended execution. Save the returned run ID in the task record. Reusing the same key and input retrieves that run; changing the inputs under a used key is rejected. Local receipts prevent duplicate submissions on this machine, not across independent machines.
4. Use `tag_run_wait` for bounded waits (at most 50 seconds), then report meaningful progress. `tag_inspect(kind="runs")` returns attempts and outputs; its events section accepts a since cursor. Counts should distinguish node IDs/attempt numbers: repeated labels or retry attempts do not imply duplicate workflows. Deduplicate streamed/event records by event ID.
5. Treat succeeded as success only after checking expected outputs. Failed/cancelled runs, paused approvals and outstanding questions are distinct outcomes. Use `tag_run_respond` only for the human answer or approval actually authorized. Inspect before pause/resume/cancel; do not auto-approve or auto-relaunch a failed run.
6. Report the run ID, pinned version, outcome, useful output/artifact links and any actual token/cost fields reported by TAG. If cost is absent, say unavailable; do not invent a total or infer charges from node counts.

If submission times out, its result is uncertain. Inspect runs and the receipt first; do not replace its requestKey merely to bypass duplicate protection. Receipt storage is local and contains run identifiers/hashes, not inputs or credentials.

Authentication comes from explicit TAG config or environment, never a random project's .env. Do not display passwords, tokens or bridge files. If the tag MCP is not attached, the plugin CLI provides the same tools: resolve this skill's real directory, go up two levels, then run `node scripts/tag.mjs tools` or `node scripts/tag.mjs call TOOL_NAME --args @request.json` from the plugin root. Installation instructions are in the plugin README. A missing runtime integration is a setup issue, not a reason to guess tool names.

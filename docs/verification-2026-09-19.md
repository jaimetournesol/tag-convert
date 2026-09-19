# TAG agent integration verification — 2026-09-19

## Updated

- Existing tag-convert repository, CLI, Claude manifest, conversion skill, commands and MCP launch templates.
- New Codex compatibility manifest, execution skill, dependency-free 15-tool MCP server, explicit-config client and local installer.
- Current node definitions discovered from the live TAG API. Workflow/module version creation and run monitoring follow current API resource contracts.
- Tokens stay in private config/environment; no implicit project .env access. Bridge token files are private and token values are not printed or passed in argv.
- Stable execution receipts protect against local duplicate requests, including concurrent calls and uncertain submissions. No claim of cross-machine/server-wide idempotency.

## Passed

- Nine Node tests: graph validation; persistent and concurrent duplicate prevention; uncertain submission; human-gate wait; authoring request shapes; input validation; auth refresh/error redaction; MCP JSON-RPC.
- Two installer tests: merge/idempotency/preservation and conflict preflight.
- Both skill validators and Codex plugin manifest validation.
- Bash syntax checks on Node/Python bridge launchers.
- Live TAG project discovery and node catalogue discovery.
- Live module creation, composition in a workflow and pinned run: input 21 → output 42.
- Live local MCP server → separate relay slot → registered capability → deterministic MCP-tool workflow: inputs 19 + 23 → output 42.
- Fresh process started from the installed home MCP configuration successfully initialized and read the live completed run.

## Live test identifiers

Project: `ecdb6bbc-48c7-4114-b6fb-24c23f39ea1b` (TAG integration QA)

Module: `40f545ec-c062-4cb7-b643-eb361b1a72e0`

Module workflow: `701806c4-a910-45d8-a750-ce809cb3ba9c`

Module run: `6e3033f1-eb54-469f-997f-1e0e66265c5f` — succeeded

MCP capability: `bc5f72e7-6e93-4f63-bc4b-1d4e4118de91`

MCP run: `d1d65959-4eaf-40f1-81b0-94de7185ddd3` — succeeded

The QA relay bridge was stopped after the test. Its saved workflow/capability are labelled QA and require that fixture bridge to run again. Existing Previse bridges and deals were not changed. Both test graphs are deterministic and contain no LLM nodes.

## Installation and limits

Skills are linked into both ~/.codex/skills and ~/.claude/skills. Portable MCP entries are installed for every existing Mini project directory in ~/.agentnode/projects.json (shared directories receive one entry). Authentication references the existing dedicated TAG account file; credentials were not copied into repositories or MCP config.

New agent sessions can load the configuration. Existing sessions were not interrupted or restarted. The current Mini runtime has per-project MCP settings, not node-global MCP defaults. New project creation must include the portable tag spec; the installer can apply it to additional directories.

The Mini is not the Conductor control node. Its repository/location was requested from the user. Other fleet machines and Conductor's future-project defaults have **not** been updated or verified. The portable server, manifests, installer and README are ready for that rollout. Live approval/cancel/resume and registry tool publication were not exercised on user workflows; no automated test approved a human gate or published production tools.

Codex packaging reference: https://developers.openai.com/plugins/build/plugins (consulted 2026-09-19). Host-specific plugin loading differs; the tested installation uses absolute-path portable MCP configuration.


## Pi follow-up

The control host was verified as `pi`, logical name `mac`, on its unchanged
`15b48879eb917c5614d9ad465741344997bb3d0d` release. The toolkit and skill links are
installed under `/home/jaime/.local/share/tag-convert`; both the existing Conductor
project and prepared node-wide defaults configure `tag` through the Pi's existing,
host-key-verified SSH connection to the Mini. TAG credentials remain on the Mini.
The separate API-key creation attempt was rejected (403); no new key was created.

The actual Pi-configured MCP enumerated 15 tools and started/monitored a pinned TAG
module workflow. Run `45888ba3-84b1-42b9-a64e-c4d9f4535ed7` succeeded: input17 → output34.
No model agent was started or restarted. The Conductor was working during setup.

Shared default inheritance and per-project opt-out are in AgentNode PR22:
https://github.com/jaimetournesol/agentnode/pull/22 . The 174 Python tests passed
locally. The PR remains unmerged pending production-rollout approval; the Pi's
current release does not yet consume node-wide defaults. Existing Conductor
project config is prepared for its next authorized restart. Other worker runtimes
have not been upgraded by this Pi setup. Installer tests now include shared SSH
configuration (three Python tests).


CI for AgentNode PR22 passed on commit `07eea99b7aebd7cbe188dcd96d161080ac8c12a7`:
https://github.com/jaimetournesol/agentnode/actions/runs/35434197362 . Python/adapters,
browser/Stage, Surface build, real-service security/presentation/rollback checks,
and Android lint/build passed. Production deployment was correctly skipped for
the PR. Toolkit changes are reviewable in https://github.com/jaimetournesol/tag-convert/pull/2 .
Both PRs remain unmerged. Pi ARM64 also passed the toolkit's 9 Node and 3 Python tests.

# TAG API and orchestration contract

Verified against the local TAG API source on 2026-09-19. Query `/api/nodes` on the target instance before graph authoring; installations may differ. Earlier NODES/EXAMPLES documents illustrate patterns, not a frozen API specification.

## Auth and ownership

- Explicit `TAG_API_URL`; JWT bearer or `x-api-key` (`TAG_API_KEY`). API keys need appropriate read/write scopes; server-side tenancy remains authoritative.
- `TAG_ACCOUNT_FILE` is a private JSON file containing email/password. It is read only by the configured client, never emitted. No automatic cwd `.env` lookup. The server refreshes its own short-lived access token after a 401, once.
- Client state/duplicate receipts: `TAG_STATE_DIR` or `~/.local/state/tag-convert`. No global credential copying between machines. Configure a dedicated identity appropriate to each installation.
- The agent-side `tag` MCP manages TAG. Project-specific MCP servers expose business tools to TAG. Do not confuse the two or grant business agents the administrative TAG capability automatically.

## Resources

| Resource | Discover/read | Create/version |
|---|---|---|
| Node definitions | GET /api/nodes | Built-in registry: inspect current ports/config |
| Projects | GET /api/projects | POST /api/projects |
| Workflows | GET /api/workflows?projectId=…&take=50&skip=0; GET /api/workflows/:id | POST /api/workflows {name,projectId,graph}; POST /:id/versions {graph,comment} |
| Modules | GET /api/modules; GET /api/modules/:id | POST /api/modules {name,projectId,sourceNodes,sourceEdges,ioContract,params?,paramMappings?}; POST /:id/versions {graph,ioContract,…} |
| Capabilities | GET /api/capabilities; GET /:id | POST /api/capabilities; PUT /:id; POST /:id/test |
| Registry tools | GET /api/tools | POST /api/tools; POST /:id/versions |
| Runs | GET /api/runs?workflowId=…; GET /api/runs/:id | POST /api/runs {workflowId,workflowVersionId,input} |

A module ioContract has inputs/outputs arrays of `{portId,label,type,internalNodeId,internalPortId,required?}`. Consumers use node type `module`, config `moduleId` and `moduleVersionId`, and connect the module's declared ports. Read module versions and contracts before composing them.

A capability definition for a bridged MCP server is `{kind:"mcp-server",name,slug,scope:"personal",body:{kind:"mcp-server",urlSource:{type:"relay",devId}}}`. Mint a bridge slot with POST `/api/me/relay-bridge-token` `{project}` and verify GET `/api/me/relay-bridge-status?project=…`. The CLI writes tokens to a mode-0600 file and never prints them.

A static capability uses urlSource `{type:"static-url",url}`. Inspect supported transport/binding fields in the target capability schema; simply hosting a REST route does not make it an MCP server. Registry tools and MCP capabilities are different APIs. Registry build-and-publish fixture checks are structural, not proof of executable tool behavior.

## Run lifecycle

Start returns a run ID; acceptance is not completion. Poll GET `/api/runs/:id`, read `/attempts`, `/events?since=…&limit=100`, `/approvals`, `/questions`. Server-provided attempt IDs/node paths matter more than display labels. Modules and iterators can emit multiple attempts with similar labels.

- POST /:id/pause, /resume, /cancel act on an existing run.
- POST /:id/nodes/:nodeId/approve `{approved,comment?}` records an authorized human decision.
- POST /:id/nodes/:nodeId/respond `{response}` answers an outstanding question.
- Never treat a failed run as a successful CLI test: test-run exits nonzero on failure/human gates and 2 if still running at its deadline.
- There is no claimed server-wide idempotency guarantee. The client stores a local stable-key receipt before submission; uncertain submissions block repeated calls until inspected. Independent machines must coordinate the run ID/request intent through Conductor.

The legacy `/api/workflows/:id/test-run` SSE endpoint is not needed by this client; CLI tests use the same durable `/api/runs` path as MCP callers, with pinned versions and status polling.

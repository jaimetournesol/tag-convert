# Examples

Small, complete workflows you can adapt. Both follow the rules in `CONCEPTS.md`:
deterministic nodes where possible, an agent only where judgment is needed, data
on edges. Author graphs with **node positions omitted** (auto-layout).

---

## 1. Interactive chatbot with MCP lookup tools

A customer chats; the agent answers and, when it needs a fact, calls **your**
MCP tools (bridged from your local project) to look it up. Multi-turn — TAG owns
the conversation history, keyed by a **conversation id** (the chat `sessionId`).
You store nothing; the customer's KG/data stays untouched.

**Shape:** `api-trigger(message) → claude-sdk(agent + your MCP capability) → chat-response`

```json
{
  "nodes": [
    {
      "id": "trigger",
      "type": "api-trigger",
      "data": {
        "label": "User message",
        "config": {
          "inputSchema": {
            "type": "object",
            "required": ["message"],
            "properties": { "message": { "type": "string", "description": "The user's chat message" } }
          }
        }
      }
    },
    {
      "id": "assistant",
      "type": "claude-sdk",
      "data": {
        "label": "Assistant",
        "config": {
          "model": "claude-sonnet-4-6",
          "maxTurns": 12,
          "capabilityIds": ["<YOUR_CAPABILITY_ID>"],
          "systemPrompt": "You are a helpful assistant for <DOMAIN>. You have MCP tools to look things up: <tool_a>, <tool_b>. When a question needs a fact you don't have, CALL the tool — never guess. Otherwise answer directly. Be concise. The prior conversation (if any) is provided as context; use it."
        }
      }
    },
    {
      "id": "reply",
      "type": "chat-response",
      "data": {
        "label": "Reply",
        "config": { "responseFormat": "markdown", "responseField": "response" }
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "trigger", "target": "assistant" },
    { "id": "e2", "source": "assistant", "target": "reply" }
  ]
}
```

**Deploy it as a chat endpoint** (each user message = one run; the run streams
its answer back):

```bash
node <plugin>/scripts/tag.mjs workflow:create --name "Support chatbot" --graph chatbot.json --project my-project
# then deploy with chat enabled (POST /api/deployments { workflowId, slug, chatEnabled: true })
```

**Multi-turn / the conversation id.** Call the deployed chat endpoint with the
user's message; the response carries a `sessionId`. Pass that **same `sessionId`**
on every later turn and TAG threads the prior turns back into the agent
automatically — the agent "remembers" with **no extra wiring**:

```
POST /d/<slug>/chat  { "message": "What is the HS code for steel bolts?" }
  → { "sessionId": "abc-123", "output": ... }

POST /d/<slug>/chat  { "message": "And the same but in aluminum?", "sessionId": "abc-123" }
  → the agent knows "the same" = bolts, from turn 1
```

**Notes**
- The agent only reaches the tools on **its** capability (`capabilityIds`). For
  least privilege, give the chatbot its **own per-agent bridge** exposing only
  the tools it needs (see `README.md` → "one bridge per agent").
- Name your tools in the `systemPrompt` and tell it to call them, not guess.
- Keep `maxTurns` modest; a chat answer rarely needs many tool round-trips.

---

## 2. Deterministic lookup (no agent — cheap + fully observable)

When the action is **always the same** ("take a code, return its record"), you
don't need an agent at all. Call your MCP tool directly with an `mcp-tool` node
and format the result. No model, no tokens, every step inspectable.

**Shape:** `api-trigger(code) → mcp-tool(lookup) → format-output`

```json
{
  "nodes": [
    {
      "id": "trigger",
      "type": "api-trigger",
      "data": {
        "label": "Lookup request",
        "config": {
          "inputSchema": {
            "type": "object",
            "required": ["code"],
            "properties": { "code": { "type": "string" } }
          }
        }
      }
    },
    {
      "id": "lookup",
      "type": "mcp-tool",
      "data": {
        "label": "Look up record",
        "config": {
          "capabilityId": "<YOUR_CAPABILITY_ID>",
          "toolName": "lookup_record",
          "args": { "code": "${code}" }
        }
      }
    },
    {
      "id": "out",
      "type": "format-output",
      "data": {
        "label": "Result",
        "config": { "expression": "{ \"code\": code, \"record\": $.output }" }
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "trigger", "target": "lookup" },
    { "id": "e2", "source": "lookup", "target": "out" }
  ]
}
```

**Why prefer this when you can:** it's deterministic (same input → same output),
costs no agent tokens, and every node's input/output shows in the run trace —
ideal for the validatable, customer-facing surface. Reach for the agent (example
1) only where the task genuinely needs judgment or open-ended conversation.

---

## 3. Observable, multi-agent workflow (the "show-the-value" pattern)

The flagship shape — it proves BOTH the depth of your data **and** TAG itself. A
rigid, auditable graph where each step is a **visible node**: graph lookups and a
**calculator that reads your KG** as deterministic `mcp-tool` nodes, agents only
at the judgment steps, sharing a workspace. The customer sees *how* the answer was
derived — which facts, which rule, the calculation, the cross-check — the audit
trail a single black-box agent can't give. (IFRS-style example: a figure like a
lease liability computed from graph facts under a cited standard, then validated.)

**Shape:** `api-trigger → mcp-tool(fetch facts) → mcp-tool(lookup rule) →
claude-sdk(interpret, workspace) → mcp-tool(calculator over the KG) →
claude-sdk(cross-check, workspace) → format-output(validate) → chat-response`

```json
{
  "nodes": [
    { "id": "trigger", "type": "api-trigger", "data": { "label": "Question",
      "config": { "inputSchema": { "type": "object", "required": ["question","entityId"],
        "properties": { "question": { "type": "string" }, "entityId": { "type": "string" } } } } } },
    { "id": "facts", "type": "mcp-tool", "data": { "label": "Fetch entity facts (graph)",
      "config": { "capabilityId": "<CAP_ID>", "toolName": "graph_fetch_entity", "args": { "entityId": "${entityId}" } } } },
    { "id": "rule", "type": "mcp-tool", "data": { "label": "Look up applicable standard (graph)",
      "config": { "capabilityId": "<CAP_ID>", "toolName": "graph_lookup_standard", "args": { "topic": "${question}" } } } },
    { "id": "interpret", "type": "claude-sdk", "data": { "label": "Interpret + plan",
      "config": { "model": "claude-sonnet-4-6", "maxTurns": 8, "enableWorkspace": true, "capabilityIds": ["<CAP_ID>"],
        "systemPrompt": "Read the entity facts and the cited standard. Decide the basis + inputs for the figure and WRITE your working to the shared workspace. Do not compute it yourself — the calculator tool does that." } } },
    { "id": "calc", "type": "mcp-tool", "data": { "label": "Calculator (reads the graph)",
      "config": { "capabilityId": "<CAP_ID>", "toolName": "compute_figure", "args": { "entityId": "${entityId}", "measure": "lease_liability" } } } },
    { "id": "crosscheck", "type": "claude-sdk", "data": { "label": "Cross-check + validate",
      "config": { "model": "claude-sonnet-4-6", "maxTurns": 8, "enableWorkspace": true, "capabilityIds": ["<CAP_ID>"],
        "systemPrompt": "Using the working in the shared workspace and the cited standard, verify the calculator's figure is correct and compliant. Flag any discrepancy; otherwise confirm." } } },
    { "id": "validate", "type": "format-output", "data": { "label": "Validate result contract",
      "config": { "expression": "{ \"entityId\": entityId, \"figure\": $.output, \"standard\": $.rule, \"checked\": true }" } } },
    { "id": "reply", "type": "chat-response", "data": { "label": "Cited answer",
      "config": { "responseFormat": "markdown", "responseField": "response" } } }
  ],
  "edges": [
    { "id": "e1", "source": "trigger", "target": "facts" },
    { "id": "e2", "source": "facts", "target": "rule" },
    { "id": "e3", "source": "rule", "target": "interpret" },
    { "id": "e4", "source": "interpret", "target": "calc" },
    { "id": "e5", "source": "calc", "target": "crosscheck" },
    { "id": "e6", "source": "crosscheck", "target": "validate" },
    { "id": "e7", "source": "validate", "target": "reply" }
  ]
}
```

**Why this is the demo**
- Every `mcp-tool` step — facts, rule, and the **calculator** — is a deterministic,
  inspectable node. The run trace shows each input + output, so the result is
  *auditable*, not asserted.
- The two agents share a workspace (`enableWorkspace: true`): "interpret" hands its
  working to "cross-check" — you're showing **orchestration**, not one model.
- `format-output` validates the result against a contract before it's returned —
  a visible pass/fail.
- It markets both sides at once: the **depth of your graph** (rich facts + cited
  rules behind every answer) and **TAG** (observable, validatable, re-runnable).

Trade-off: more to build, and it answers the cases you designed nodes for. Pair it
with example 1 (the agent chat) for open-ended questions. (`${…}` arg wiring follows
the data on the edges — see `NODES.md`; the calculator stays a deterministic node so
the computation is visible, not hidden in an agent.)

> Reminder (see SKILL.md → "Scope"): all three examples *serve a customer over your
> data via MCP tools* — and the customer workflow should be **rich and observable**,
> not a thin pass-through. Building or **enriching** that data (ingesting docs into
> your KG, embeddings, backfills) is the part that stays **local** dev-side work —
> do it with your own Claude/scripts, not a TAG workflow.

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

> Reminder (see SKILL.md → "Scope"): both examples *serve a customer over your
> data via MCP tools*. Building or **enriching** that data (ingesting docs into
> your KG, embeddings, backfills) is **local** dev-side work — do it with your
> own Claude/scripts, not a TAG workflow.

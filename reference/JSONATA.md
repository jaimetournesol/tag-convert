# JSONata in `branch.condition` and `transform.expression`

These two node types evaluate a JSONata expression against the **upstream
node's output value** — which at run time is almost always an **object**, not
a bare string. `$` is that object.

- An `input` / `api-trigger` node emits the caller's payload verbatim, so
  `$` is e.g. `{ "url": "https://…" }` or `{ "result": "…" }`.
- A `claude-sdk` agent emits `{ text, toolCalls, tokensUsed, costUsd }`.
- An `mcp-tool` emits `{ output }` on success (and a string on its `error` port).
- A `branch` emits `{ data, result, condition, _activeBranch }`.

## Rules

1. **String functions need a string first argument and THROW on an object.**
   `$contains`, `$lowercase`, `$match`, `$split`, `$substring`. Never call
   them on a bare `$` unless you are certain `$` is a scalar string.
2. **For "does the input contain X" checks, coerce first** with `$string($)`
   — it turns any value (object or string) into text, so the call never
   throws:
   ```
   $contains($lowercase($string($)), 'needle')
   ```
3. **To target a field, reach in** using the upstream node's output handle:
   `$.text` (claude-sdk), `$.output` (mcp-tool), `$.result` / `$.url`
   (input), `$.payload.field` (api-trigger). When unsure of the key, prefer
   the `$string($)` coercion form above.
4. **Booleans / numbers compare directly:** `$.result = true`, `$.score > 0.65`.

## Examples

```jsonata
# branch: route to "true" if the input text mentions an injection attempt
$contains($lowercase($string($)), 'ignore previous') or
  $contains($lowercase($string($)), 'disregard')

# transform: reshape an agent's text into the next agent's prompt object
{ "prompt": $.text }

# branch: route on a numeric field produced upstream
$.score >= 0.7
```

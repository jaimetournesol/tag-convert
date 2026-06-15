#!/usr/bin/env node
/**
 * Minimal stdio JSON-RPC MCP server (newline-delimited JSON), hand-rolled so
 * it answers `tools/list` / `tools/call` whether or not the bridge sends the
 * MCP `initialize` handshake first. The `tag-mcp-bridge` proxies this over
 * the relay to TAG.
 *
 * You normally don't edit this file — add your project's tools in `tools.mjs`.
 */
import { createInterface } from 'node:readline';
import { tools } from './tools.mjs';

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const registry = new Map(tools.map((t) => [t.name, t]));

async function handle(req) {
  const { id, method, params } = req;
  // Notifications (no id) get no response.
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: process.env.MCP_SERVER_NAME || 'tag-project-tools', version: '0.1.0' },
      });
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
    case 'tools/call': {
      const tool = registry.get(params?.name);
      if (!tool) return err(id, -32602, `unknown tool: ${params?.name}`);
      try {
        const text = await tool.handler(params.arguments || {});
        return ok(id, { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }], isError: false });
      } catch (e) {
        return ok(id, { content: [{ type: 'text', text: `Tool "${tool.name}" failed: ${e?.message || e}` }], isError: true });
      }
    }
    default:
      return err(id, -32601, `method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const s = line.trim();
  if (!s) return;
  let req; try { req = JSON.parse(s); } catch { return; }
  Promise.resolve(handle(req)).catch((e) => { if (req?.id != null) err(req.id, -32603, String(e?.message || e)); });
});

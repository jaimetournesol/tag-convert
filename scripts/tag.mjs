#!/usr/bin/env node
/**
 * tag.mjs — a tiny, dependency-free TAG API client for converting a local
 * project into a TAG workflow. Node 18+ (uses global fetch + web streams).
 *
 * Config (env, or a `.env` file in the cwd, or flags):
 *   TAG_API_URL    your TAG API base URL, e.g. https://your-tag-api.example.com  (required)
 *   TAG_RELAY_URL  your TAG relay base URL, e.g. https://your-tag-relay.example.com  (required for the bridge)
 *   TAG_EMAIL / TAG_PASSWORD   (used by `login`)
 *   TAG_TOKEN      a pre-minted session JWT (skips login)
 *
 * The session (token + userId/devId + orgId) is cached in
 * `.tag-convert/session.json` in the cwd. Add `.tag-convert/` to .gitignore.
 *
 * Commands:
 *   login                          authenticate, cache the session
 *   whoami                         print user id (= devId), org, email
 *   bridge-token [--write FILE]    mint a tag-mcp-bridge token (writes TAG_BRIDGE_TOKEN= line if --write)
 *   bridge-status                  is your local bridge connected to the relay?
 *   capability:create --name N --slug S [--devId D] [--scope personal|org]
 *                                  create an mcp-server (relay) capability → prints its id
 *   capability:list                list capabilities visible to you
 *   workflow:create --name N --graph FILE [--project ID]   create a workflow → prints its id
 *   workflow:save  --id ID --graph FILE [--comment C]      save a new version
 *   test-run --id ID [--input JSON|@file] [--graph FILE]   run + stream telemetry to the terminal
 *
 * Examples:
 *   node tag.mjs login
 *   node tag.mjs capability:create --name "My Project Tools" --slug my-project-tools
 *   node tag.mjs workflow:create --name "My Project" --graph graph.json
 *   node tag.mjs test-run --id <wf-id> --input '{"url":"https://example.com"}'
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// TAG_API_URL + TAG_RELAY_URL are required — set them in env or a .env file
// (your TAG operator provides the values for your instance).
const DEFAULTS = {};
const SESSION_FILE = join(process.cwd(), '.tag-convert', 'session.json');

// ── tiny .env loader (no deps) ────────────────────────────────────────────
function loadDotEnv() {
  const f = join(process.cwd(), '.env');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const cfg = (k) => process.env[k] || DEFAULTS[k] || '';
const API = cfg('TAG_API_URL').replace(/\/+$/, '');

// ── arg parsing ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

// ── session cache ─────────────────────────────────────────────────────────
function loadSession() {
  try { return JSON.parse(readFileSync(SESSION_FILE, 'utf8')); } catch { return null; }
}
function saveSession(s) {
  mkdirSync(dirname(SESSION_FILE), { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2));
}
function decodeJwt(t) {
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')); } catch { return {}; }
}

// ── HTTP ──────────────────────────────────────────────────────────────────
async function api(method, path, { token, body } = {}) {
  if (!API) throw new Error('Set TAG_API_URL (env or .env), e.g. https://your-tag-api.example.com');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.message || json?.error || text || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

// ── auth ────────────────────────────────────────────────────────────────--
async function login() {
  const email = cfg('TAG_EMAIL'), password = cfg('TAG_PASSWORD');
  if (!email || !password) throw new Error('Set TAG_EMAIL and TAG_PASSWORD (env or .env) to log in, or set TAG_TOKEN.');
  const r = await api('POST', '/api/auth/login', { body: { email, password } });
  if (!r.token) throw new Error('Login returned no token.');
  const s = { token: r.token, userId: r.user?.id, orgId: r.org?.id ?? r.user?.orgId, email: r.user?.email };
  saveSession(s);
  return s;
}
async function session() {
  if (cfg('TAG_TOKEN')) {
    const t = cfg('TAG_TOKEN'); const p = decodeJwt(t);
    return { token: t, userId: p.userId || p.sub?.replace?.(/^.*:/, '') || p.sub, orgId: p.orgId, email: p.email };
  }
  return loadSession() || login();
}

// ── SSE streaming for test-run ────────────────────────────────────────────
async function streamEvents(url) {
  const res = await fetch(url, { headers: { accept: 'text/event-stream' } });
  if (!res.ok || !res.body) throw new Error(`stream ${url} → ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      let frame; try { frame = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
      if (renderFrame(frame)) return; // final
    }
  }
}
function renderFrame(f) {
  switch (f.kind) {
    case 'turn.started': process.stdout.write(`\n  ▸ turn ${f.turn} started\n`); break;
    case 'assistant.message': if (f.text) process.stdout.write(`    💬 ${f.text.slice(0, 500)}${f.text.length > 500 ? '…' : ''}\n`); break;
    case 'tool.invoked': {
      const inp = f.toolInput !== undefined ? ` in=${JSON.stringify(f.toolInput).slice(0, 200)}` : '';
      const outp = f.toolResult !== undefined ? ` out=${String(f.toolResult).replace(/\s+/g, ' ').slice(0, 200)}` : '';
      process.stdout.write(`    🔧 ${f.toolName}${inp}${outp}\n`);
      break;
    }
    case 'turn.completed': process.stdout.write(`  ◂ turn ${f.turn} done\n`); break;
    case 'final': {
      const ok = f.result?.ok;
      process.stdout.write(`\n${ok ? '✅' : '❌'} final (${f.result?.durationMs ?? '?'}ms)\n`);
      const out = f.result?.output;
      if (out !== undefined) process.stdout.write(`${typeof out === 'string' ? out : JSON.stringify(out, null, 2)}\n`);
      if (f.result?.error) process.stdout.write(`error: ${f.result.error}\n`);
      return true;
    }
    default: break;
  }
  return false;
}

// ── commands ──────────────────────────────────────────────────────────────
const cmds = {
  async login() { const s = await login(); console.log(`Logged in as ${s.email} (userId/devId ${s.userId}, org ${s.orgId})`); },

  async whoami() { const s = await session(); console.log(JSON.stringify({ userId: s.userId, devId: s.userId, orgId: s.orgId, email: s.email }, null, 2)); },

  async ['bridge-token'](args) {
    const s = await session();
    const r = await api('POST', '/api/me/relay-bridge-token', { token: s.token });
    console.log(`token (expires ${r.expiresAt}):\n${r.token}`);
    if (args.write) {
      const relay = cfg('TAG_RELAY_URL');
      if (!relay) throw new Error('Set TAG_RELAY_URL before --write (your TAG relay base URL).');
      writeFileSync(args.write, `TAG_BRIDGE_TOKEN=${r.token}\nTAG_RELAY_URL=${relay}\n`);
      console.log(`\nwrote ${args.write}`);
    }
  },

  async ['bridge-status']() {
    const s = await session();
    console.log(JSON.stringify(await api('GET', '/api/me/relay-bridge-status', { token: s.token }), null, 2));
  },

  async ['capability:create'](args) {
    const s = await session();
    const name = args.name, slug = args.slug;
    if (!name || !slug) throw new Error('--name and --slug are required');
    const devId = args.devId || s.userId;
    if (!devId) throw new Error('could not resolve devId — pass --devId (your TAG user id)');
    const r = await api('POST', '/api/capabilities', {
      token: s.token,
      body: {
        kind: 'mcp-server',
        name,
        slug,
        description: args.description || `MCP tools bridged from a local project (${name})`,
        scope: args.scope || 'personal',
        body: { kind: 'mcp-server', urlSource: { type: 'relay', devId } },
      },
    });
    console.log(`capability created: ${r.id}  (devId ${devId})`);
    console.log(r.id);
  },

  async ['capability:list']() {
    const s = await session();
    const r = await api('GET', '/api/capabilities', { token: s.token });
    const rows = r.rows || r.capabilities || r;
    for (const c of rows) console.log(`${c.id}  ${c.kind.padEnd(12)} ${c.name}`);
  },

  async ['workflow:create'](args) {
    const s = await session();
    if (!args.name || !args.graph) throw new Error('--name and --graph FILE are required');
    const graph = JSON.parse(readFileSync(args.graph, 'utf8'));
    const r = await api('POST', '/api/workflows', {
      token: s.token,
      body: { name: args.name, ...(args.project ? { projectId: args.project } : {}), graph },
    });
    console.log(`workflow created: ${r.id} (v${r.currentVersion?.version ?? 1})`);
    console.log(r.id);
  },

  async ['workflow:save'](args) {
    const s = await session();
    if (!args.id || !args.graph) throw new Error('--id and --graph FILE are required');
    const graph = JSON.parse(readFileSync(args.graph, 'utf8'));
    const r = await api('POST', `/api/workflows/${args.id}/versions`, {
      token: s.token,
      body: { graph, comment: args.comment || 'tag-convert save' },
    });
    console.log(`saved version v${r.version}`);
  },

  async ['test-run'](args) {
    const s = await session();
    if (!args.id) throw new Error('--id WORKFLOW_ID is required');
    let input = {};
    if (typeof args.input === 'string') {
      input = args.input.startsWith('@') ? JSON.parse(readFileSync(args.input.slice(1), 'utf8')) : JSON.parse(args.input);
    }
    const body = { input, ...(args.graph ? { graph: JSON.parse(readFileSync(args.graph, 'utf8')) } : {}) };
    const r = await api('POST', `/api/workflows/${args.id}/test-run`, { token: s.token, body });
    console.log(`run ${r.runId} (invocation ${r.invocationId}) — streaming…`);
    const streamUrl = `${API}${r.streamUrl}?token=${encodeURIComponent(s.token)}`;
    await streamEvents(streamUrl);
  },
};

function usage() {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n')
    .filter((l) => l.startsWith(' *')).map((l) => l.replace(/^ \*?/, '')).join('\n'));
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (!cmd || cmd === 'help' || cmd === '--help') { usage(); process.exit(0); }
const fn = cmds[cmd];
if (!fn) { console.error(`unknown command: ${cmd}\n`); usage(); process.exit(1); }
fn(args).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });

/**
 * Project tools — THIS is the file you edit when converting a project.
 *
 * Each tool wraps one capability of the project as an MCP tool the TAG agent
 * can call. A tool is:
 *   { name, description, inputSchema (JSON Schema), handler(args) -> string }
 *
 * Design guidance (see ../../../reference/CONCEPTS.md):
 *   - Expose ONE clear action per tool, named like a function the project
 *     already has (e.g. `classify_invoice`, `query_db`, `render_report`).
 *   - Tools are the agent's HANDS for dynamic/external actions. If a call is
 *     always the same and deterministic, prefer an `mcp-tool`/`http` node in
 *     the workflow instead of a tool the agent must decide to call.
 *   - Keep tool results as plain text (or compact JSON-as-text). Big outputs
 *     should be truncated or written to the workspace and referenced.
 *
 * Common wrapping patterns are shown below — delete the examples and add
 * your project's real tools.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, mkdir, realpath, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';

const pexec = promisify(execFile);

// The workspace must be owned by this process's user. This is path containment,
// not an OS sandbox against another process racing filesystem changes.
const ROOT = resolve(process.env.TAG_WORKSPACE_ROOT || resolve(process.cwd(), 'workspace'));
async function safe(p) {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw new Error('path must be a nonempty string');
  const abs = resolve(ROOT, p), rel = relative(ROOT, abs);
  if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('path escapes the workspace root');
  await mkdir(ROOT, { recursive: true });
  const root = await realpath(ROOT);
  let current = root;
  for (const part of rel.split('/')) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('symbolic links are not allowed in workspace paths');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}

export const tools = [
  // ── Pattern A: shell out to the project's CLI / script ──────────────────
  {
    name: 'run_project_command',
    description:
      'Run an allowlisted project command (e.g. a build/test/analyze script) and return its stdout. Replace the allowlist + cwd with your project.',
    inputSchema: {
      type: 'object',
      properties: { args: { type: 'array', items: { type: 'string' }, description: 'arguments to the project CLI' } },
      required: ['args'],
    },
    async handler({ args }) {
      const ALLOWED = new Set(['--help', 'status', 'analyze']); // ← tighten to your project's safe subcommands
      const sub = String((args || [])[0] ?? '');
      if (!ALLOWED.has(sub)) throw new Error(`subcommand "${sub}" not allowed`);
      const cwd = process.env.PROJECT_DIR || process.cwd();
      const { stdout } = await pexec('node', ['./cli.js', ...args], { cwd, timeout: 60_000, maxBuffer: 4 << 20 });
      return stdout.slice(0, 8000);
    },
  },

  // ── Pattern B: sandboxed workspace file I/O (read/write artifacts) ───────
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the workspace.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async handler({ path }) {
      const file = await open(await safe(path), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { return await file.readFile('utf8'); } finally { await file.close(); }
    },
  },
  {
    name: 'write_file',
    description: 'Create/overwrite a UTF-8 text file in the workspace (parent dirs auto-created).',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
    async handler({ path, content }) {
      const abs = await safe(path);
      await mkdir(dirname(abs), { recursive: true });
      const file = await open(await safe(path), constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try { await file.truncate(0); await file.writeFile(String(content ?? ''), 'utf8'); } finally { await file.close(); }
      return `wrote ${path} (${(content ?? '').length} bytes)`;
    },
  },

  // ── Pattern C: call the project's own functions (if it's a Node module) ──
  // import { classifyInvoice } from '../path/to/your/project/index.js';
  // {
  //   name: 'classify_invoice',
  //   description: 'Classify an invoice and return the category + confidence.',
  //   inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  //   async handler({ text }) { return JSON.stringify(await classifyInvoice(text)); },
  // },
];

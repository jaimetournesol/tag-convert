"""Project tools — THIS is the file you edit when converting a project.

Each tool wraps one capability of the project as an MCP tool the TAG agent
can call. A tool is a dict:
    {"name": str, "description": str, "inputSchema": <JSON Schema>,
     "handler": callable(args: dict) -> str}

Design guidance (see ../../../reference/CONCEPTS.md):
  - One clear action per tool, named like a function the project already has.
  - Tools are the agent's HANDS for dynamic/external actions. If a call is
    always the same and deterministic, prefer an mcp-tool/http node in the
    workflow instead of a tool the agent must decide to call.
  - Return plain text (or compact JSON-as-text). Truncate big outputs.

Delete the examples below and add your project's real tools.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(os.environ.get("TAG_WORKSPACE_ROOT", Path.cwd() / "workspace")).resolve()


def _safe(p: str) -> Path:
    abs_p = (ROOT / p).resolve() if not os.path.isabs(p) else Path(p).resolve()
    if ROOT not in abs_p.parents and abs_p != ROOT:
        raise ValueError("path escapes the workspace root")
    return abs_p


# ── Pattern A: shell out to the project's CLI / script ──────────────────────
def run_project_command(args: dict) -> str:
    allowed = {"--help", "status", "analyze"}  # ← tighten to your project's safe subcommands
    argv = args.get("args") or []
    sub = str(argv[0]) if argv else ""
    if sub not in allowed:
        raise ValueError(f'subcommand "{sub}" not allowed')
    cwd = os.environ.get("PROJECT_DIR", os.getcwd())
    out = subprocess.run(["python", "cli.py", *argv], cwd=cwd, capture_output=True, text=True, timeout=60)
    return (out.stdout or out.stderr)[:8000]


# ── Pattern B: sandboxed workspace file I/O ─────────────────────────────────
def read_file(args: dict) -> str:
    return _safe(args["path"]).read_text(encoding="utf-8")


def write_file(args: dict) -> str:
    p = _safe(args["path"])
    p.parent.mkdir(parents=True, exist_ok=True)
    content = args.get("content", "")
    p.write_text(content, encoding="utf-8")
    return f"wrote {args['path']} ({len(content)} bytes)"


# ── Pattern C: call the project's own functions (import it) ─────────────────
# from my_project import classify_invoice
# def classify_invoice_tool(args): return json.dumps(classify_invoice(args["text"]))


TOOLS = [
    {
        "name": "run_project_command",
        "description": "Run an allowlisted project command and return its stdout.",
        "inputSchema": {"type": "object", "properties": {"args": {"type": "array", "items": {"type": "string"}}}, "required": ["args"]},
        "handler": run_project_command,
    },
    {
        "name": "read_file",
        "description": "Read a UTF-8 text file from the workspace.",
        "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
        "handler": read_file,
    },
    {
        "name": "write_file",
        "description": "Create/overwrite a UTF-8 text file in the workspace.",
        "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]},
        "handler": write_file,
    },
]

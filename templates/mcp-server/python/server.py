#!/usr/bin/env python3
"""Minimal stdio JSON-RPC MCP server (newline-delimited JSON).

Hand-rolled so it answers tools/list / tools/call whether or not the bridge
sends the MCP `initialize` handshake first. The tag-mcp-bridge proxies this
over the relay to TAG.

You normally don't edit this file — add your project's tools in tools.py.
"""
import json
import sys

from tools import TOOLS  # list of dicts: {name, description, inputSchema, handler}

REGISTRY = {t["name"]: t for t in TOOLS}


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def ok(_id, result):
    send({"jsonrpc": "2.0", "id": _id, "result": result})


def err(_id, code, message):
    send({"jsonrpc": "2.0", "id": _id, "error": {"code": code, "message": message}})


def handle(req):
    _id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}
    if _id is None:  # notification
        return

    if method == "initialize":
        return ok(_id, {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "tag-project-tools", "version": "0.1.0"},
        })
    if method == "ping":
        return ok(_id, {})
    if method == "tools/list":
        return ok(_id, {"tools": [
            {"name": t["name"], "description": t["description"], "inputSchema": t["inputSchema"]}
            for t in TOOLS
        ]})
    if method == "tools/call":
        tool = REGISTRY.get(params.get("name"))
        if not tool:
            return err(_id, -32602, f"unknown tool: {params.get('name')}")
        try:
            text = tool["handler"](params.get("arguments") or {})
            if not isinstance(text, str):
                text = json.dumps(text)
            return ok(_id, {"content": [{"type": "text", "text": text}], "isError": False})
        except Exception as e:  # noqa: BLE001
            return ok(_id, {"content": [{"type": "text", "text": f'Tool "{tool["name"]}" failed: {e}'}], "isError": True})
    return err(_id, -32601, f"method not found: {method}")


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            handle(req)
        except Exception as e:  # noqa: BLE001
            if isinstance(req, dict) and req.get("id") is not None:
                err(req["id"], -32603, str(e))


if __name__ == "__main__":
    main()

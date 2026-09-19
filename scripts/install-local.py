#!/usr/bin/env python3
"""Install TAG skills and a portable MCP entry without altering unrelated config."""
import argparse
import json
import shutil
import time
from pathlib import Path


def install(home, root, project_dirs=(), replace=False, shared=False, server=None):
    changed = []
    spec = {'command': shutil.which('node') or 'node', 'args': [str(root / 'scripts/mcp-server.mjs')]}
    if server is not None:
        if not isinstance(server, dict) or not isinstance(server.get('command'), str) or not isinstance(server.get('args', []), list) or any(not isinstance(x, str) for x in server.get('args', [])):
            raise ValueError('Server file must contain a portable command/args MCP specification')
        spec = server
    targets = [home / '.mcp.json', *(Path(p).resolve() / '.mcp.json' for p in project_dirs)]
    if shared:
        targets.append(home / '.agentnode' / 'mcp.json')
    # Preflight every destination before writes.
    configs = []
    for path in dict.fromkeys(targets):
        data = json.loads(path.read_text()) if path.exists() else {}
        old = data.get('mcpServers', {}).get('tag')
        if old and old != spec and not replace:
            raise ValueError(f'{path} already configures tag; inspect it, then use --replace if intended')
        data.setdefault('mcpServers', {})['tag'] = spec
        configs.append((path, data))
    links = []
    for host in ('.codex', '.claude'):
        for name in ('convert-to-tag', 'tag-workflows'):
            dest = home / host / 'skills' / name
            source = root / 'skills' / name
            if dest.exists() or dest.is_symlink():
                if dest.resolve() == source.resolve():
                    continue
                raise ValueError(f'Existing skill at {dest}; reconcile it manually')
            links.append((dest, source))
    stamp = str(time.time_ns())
    for path, data in configs:
        text = json.dumps(data, indent=2) + '\n'
        if path.exists() and path.read_text() == text:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            backup = path.with_name(path.name + '.before-tag-' + stamp)
            shutil.copy2(path, backup)
            backup.chmod(0o600)
        tmp = path.with_name(path.name + '.tag-tmp-' + stamp)
        tmp.write_text(text)
        tmp.chmod(0o600)
        tmp.replace(path)
        changed.append(str(path))
    for dest, source in links:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.symlink_to(source, target_is_directory=True)
        changed.append(str(dest))
    return {'changed': changed, 'server': spec, 'note': 'New sessions pick up project MCP settings. Configure other machines and future project defaults separately.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=Path.home())
    parser.add_argument('--project-dir', action='append', default=[])
    parser.add_argument('--replace', action='store_true')
    parser.add_argument('--server-file', type=Path, help='Use an explicit portable MCP server specification, e.g. SSH to an existing installation')
    parser.add_argument('--shared', action='store_true', help='Write AgentNode shared MCP defaults (requires runtime support)')
    args = parser.parse_args()
    print(json.dumps(install(args.home.resolve(), Path(__file__).resolve().parents[1], args.project_dir, args.replace, args.shared, json.loads(args.server_file.read_text()) if args.server_file else None), indent=2))

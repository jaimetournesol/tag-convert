import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('installer', root / 'scripts/install-local.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class InstallTest(unittest.TestCase):
    def test_merge_idempotency_and_preservation(self):
        with tempfile.TemporaryDirectory() as d:
            h = Path(d)
            (h / '.mcp.json').write_text(json.dumps({'mcpServers': {'other': {'command': 'example'}}}))
            m.install(h, root)
            self.assertEqual(json.loads((h / '.mcp.json').read_text())['mcpServers']['other'], {'command': 'example'})
            self.assertEqual(m.install(h, root)['changed'], [])
            self.assertTrue((h / '.codex/skills/tag-workflows').resolve().samefile(root / 'skills/tag-workflows'))
            self.assertEqual((h / '.mcp.json').stat().st_mode & 0o777, 0o600)

    def test_shared_defaults_support_explicit_remote_server(self):
        with tempfile.TemporaryDirectory() as d:
            h = Path(d)
            remote = {'command': '/usr/bin/ssh', 'args': ['-T', 'fixture', 'node', '/tag/mcp-server.mjs']}
            result = m.install(h, root, shared=True, server=remote)
            self.assertTrue(result['sharedDefaultsPrepared'])
            self.assertEqual(json.loads((h / '.agentnode/mcp.json').read_text())['mcpServers']['tag'], remote)
            self.assertEqual(m.install(h, root, shared=True, server=remote)['changed'], [])

    def test_conflict_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            h = Path(d)
            text = json.dumps({'mcpServers': {'tag': {'command': 'custom'}}})
            (h / '.mcp.json').write_text(text)
            with self.assertRaises(ValueError):
                m.install(h, root)
            self.assertEqual((h / '.mcp.json').read_text(), text)
            self.assertFalse((h / '.codex').exists())

if __name__ == '__main__':
    unittest.main()

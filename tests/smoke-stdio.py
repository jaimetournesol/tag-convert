#!/usr/bin/env python3
"""Protocol smoke against a local server or container; no TAG credentials/network."""
import json, subprocess, sys
requests=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{}},
          {'jsonrpc':'2.0','id':2,'method':'tools/list'},
          {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'tag_run_start','arguments':{}}}]
r=subprocess.run(sys.argv[1:],input=''.join(json.dumps(x)+'\n' for x in requests),text=True,capture_output=True,timeout=40,check=True)
responses={x['id']:x for x in map(json.loads,r.stdout.splitlines())}
assert responses[1]['result']['serverInfo']['version']=='0.2.1'
assert len(responses[2]['result']['tools'])==15
assert responses[3]['result']['isError'] is True
print('MCP initialize, 15 tools, and invalid-run rejection passed')

// Explicit test of local server -> relay -> capability -> deterministic TAG workflow.
import {TagClient,secureWrite} from '../scripts/client.mjs';
import {createTools} from '../scripts/tools.mjs';
import {existsSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const c=new TagClient(), ts=createTools(()=>c), invoke=(n,a)=>ts.find(t=>t.name===n).handler(a);
const file=process.env.TAG_SMOKE_RECORD;if(!file)throw Error('Set TAG_SMOKE_RECORD');
const state=JSON.parse(readFileSync(file,'utf8')),save=()=>secureWrite(file,state), slot='tag-convert-qa-v02';
const before=await invoke('tag_bridge_status',{project:slot});if(before.connected)throw Error('QA slot already connected; inspect before replacing it');
const info=await c.request('GET','/api/me/relay-bridge-info');
const auth=await c.request('POST','/api/me/relay-bridge-token',{project:slot});
const server=new URL('./fixture-mcp/server.mjs',import.meta.url).pathname;
const bridge=spawn('tag-mcp-bridge',['--mcp-cmd','node','--',server],{env:{...process.env,TAG_RELAY_URL:info.relayUrl,TAG_BRIDGE_TOKEN:auth.token,TAG_MCP_CMD:undefined},stdio:['ignore','pipe','pipe']});
let logs='';bridge.stdout.on('data',d=>logs+=d);bridge.stderr.on('data',d=>logs+=d);
try{
 let connected=false;for(let i=0;i<20;i++){if((await invoke('tag_bridge_status',{project:slot})).connected){connected=true;break;}await new Promise(r=>setTimeout(r,500));}
 if(!connected)console.error(logs.replaceAll(auth.token,'[token redacted]').slice(-3000));
 assert.ok(connected,'bridge must connect');
 if(!state.capability){state.capability=await invoke('tag_capability_save',{definition:{kind:'mcp-server',name:'Agent integration QA sum',slug:'agent-integration-qa-sum',scope:'personal',body:{kind:'mcp-server',urlSource:{type:'relay',devId:auth.devId}}}});save();}
 const check=await invoke('tag_capability_test',{id:state.capability.id});assert.equal(check.ok,true);
 if(!state.mcpWorkflow){state.mcpWorkflow=await invoke('tag_workflow_save',{name:'Agent integration MCP smoke',projectId:state.project.id,graph:{nodes:[{id:'input',type:'input',config:{}},{id:'sum',type:'mcp-tool',config:{capabilityId:state.capability.id,toolName:'sum'}}],edges:[{id:'e',source:'input',target:'sum',sourceHandle:'output',targetHandle:'input'}]}});save();}
 if(!state.mcpRun){state.mcpRun=await invoke('tag_run_start',{workflowId:state.mcpWorkflow.id,workflowVersionId:state.mcpWorkflow.currentVersion.id,input:{a:19,b:23},requestKey:'tag-integration-mcp-smoke-v02'});save();}
 state.mcpResult=await invoke('tag_run_wait',{id:state.mcpRun.id,seconds:40});save();assert.equal(state.mcpResult.status,'succeeded');
 const result=state.mcpResult.output.sum.output; assert.equal(result.isError,false);
 assert.deepEqual(JSON.parse(result.content[0].text),{sum:42});
 console.log(JSON.stringify({capabilityId:state.capability.id,runId:state.mcpRun.id,status:state.mcpResult.status,output:state.mcpResult.output},null,2));
}finally{bridge.kill('SIGTERM');}

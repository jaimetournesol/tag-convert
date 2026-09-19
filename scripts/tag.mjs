#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {TagClient,configuration} from './client.mjs';
import {createTools,validateArguments} from './tools.mjs';
const argv=process.argv.slice(2), cmd=argv.shift()||'help', a={};
for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--')) {const [key,...val]=argv[i].slice(2).split('='); a[key]=val.length?val.join('='):argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;} else a._=argv[i];}
const parse=v=>v===undefined?{}:JSON.parse(v.startsWith('@')?readFileSync(v.slice(1),'utf8'):v);
const file=p=>JSON.parse(readFileSync(p,'utf8'));
let client;const getClient=()=>client??=new TagClient(configuration());
const tools=createTools(getClient), invoke=async(name,args)=>{const t=tools.find(t=>t.name===name);if(!t)throw Error('Unknown tool '+name);validateArguments(t.inputSchema,args);return t.handler(args);};
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));
async function projectId(){if(!a.project)throw Error('--project (existing id or slug) is required'); const r=await invoke('tag_catalog',{kind:'projects'});const rows=Array.isArray(r)?r:r.rows||r.projects||r.data||[];const p=rows.find(p=>p.id===a.project||p.slug===a.project);if(!p)throw Error('Project not found; use project:list or project:create');return p.id;}
async function main(){
 if(cmd==='help'||cmd==='--help')return {usage:'node tag.mjs COMMAND [options]. JSON output; explicit TAG config, no implicit .env loading.',commands:[
 'catalog --kind nodes|projects|workflows|modules|capabilities|tools',
 'call TOOL_NAME --args JSON|@file (tools lists schemas)',
 'login | whoami | tools',
 'project:list | project:create --name NAME [--slug SLUG]',
 'workflow:list [--project ID] | workflow:get --id ID',
 'workflow:create --name NAME --project SLUG_OR_ID --graph FILE',
 'workflow:save --id ID --graph FILE [--comment TEXT]',
 'run:start --id WORKFLOW_ID --version VERSION_ID --request-key KEY [--input JSON|@file]',
 'run:get|run:wait|run:events --id RUN_ID',
 'test-run --id WORKFLOW_ID [--version VERSION_ID] [--input JSON|@file] [--request-key KEY]',
 'capability:list | capability:test --id ID',
 'capability:create --name NAME --slug SLUG --devId BRIDGE_SLOT',
 'bridge-token --project SLOT --write FILE | bridge-status [--project SLOT]']};
 if(cmd==='tools')return tools.map(({handler,...t})=>t);
 if(cmd==='call')return invoke(a._,parse(a.args));
 if(cmd==='login'||cmd==='whoami'){await getClient().login();return {apiUrl:getClient().base,authentication:getClient().config.apiKey?'api-key':'bearer',user:getClient().user?{id:getClient().user.id,email:getClient().user.email}:undefined};}
 if(cmd==='catalog')return invoke('tag_catalog',clean({kind:a.kind,projectId:a.project}));
 if(cmd==='project:list')return invoke('tag_catalog',{kind:'projects'});
 if(cmd==='project:create')return invoke('tag_project_create',clean({name:a.name,slug:a.slug}));
 if(cmd==='workflow:list'||cmd==='capability:list')return invoke('tag_catalog',clean({kind:cmd==='workflow:list'?'workflows':'capabilities',projectId:a.project}));
 if(cmd==='workflow:get'||cmd==='run:get'||cmd==='run:events')return invoke('tag_inspect',clean({kind:cmd==='workflow:get'?'workflows':'runs',id:a.id,section:cmd==='run:events'?'events':undefined,since:a.since}));
 if(cmd==='workflow:create'||cmd==='workflow:save')return invoke('tag_workflow_save',clean({graph:file(a.graph),...(cmd==='workflow:create'?{name:a.name,projectId:await projectId()}:{workflowId:a.id}),comment:a.comment}));
 if(cmd==='bridge-token'||cmd==='relay-bridge')return invoke('tag_bridge_token',{project:a.project,writePath:a.write});
 if(cmd==='bridge-status')return invoke('tag_bridge_status',clean({project:a.project}));
 if(cmd==='capability:test')return invoke('tag_capability_test',{id:a.id});
 if(cmd==='capability:create'){
   if(!a.devId)throw Error('--devId from bridge-token output is required; do not guess a relay slot');
   return invoke('tag_capability_save',{definition:{kind:'mcp-server',name:a.name,slug:a.slug,scope:a.scope||'personal',description:a.description||a.name,body:{kind:'mcp-server',urlSource:{type:'relay',devId:a.devId}}}});
 }
 if(cmd==='run:wait')return invoke('tag_run_wait',{id:a.id,seconds:Number(a.seconds??20)});
 if(cmd==='run:start'||cmd==='test-run'){
   let version=a.version;
   if(!version&&cmd==='test-run'){const w=await invoke('tag_inspect',{kind:'workflows',id:a.id});version=w.currentVersion?.id||w.versions?.[0]?.id;}
   const requestKey=a['request-key']||(cmd==='test-run'?randomUUID():undefined);
   if(!requestKey)throw Error('--request-key is required');
   const run=await invoke('tag_run_start',{workflowId:a.id,workflowVersionId:version,requestKey,input:parse(a.input)});
   if(cmd==='run:start')return run;
   console.error(JSON.stringify({runId:run.id,requestKey,status:run.status}));
   const end=Date.now()+Number(a.timeout??300)*1000;
   for(;;){const r=await invoke('tag_run_wait',{id:run.id,seconds:20});
     console.error(JSON.stringify({runId:r.id,status:r.status}));
     if(!['pending','queued','running'].includes(r.status)){if(r.status!=='succeeded')process.exitCode=1;return r;}
     if(Date.now()>=end){process.exitCode=2;return {runId:run.id,status:r.status,message:'Still running; inspect this run id. No replacement started.'};}
   }
 }
 throw Error('Unknown command; run help');
}
main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});

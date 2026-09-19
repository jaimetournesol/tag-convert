// Explicit live test: creates isolated QA resources, no LLM nodes.
import {TagClient,secureWrite} from '../scripts/client.mjs';
import {createTools} from '../scripts/tools.mjs';
import {existsSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const c=new TagClient(), tools=createTools(()=>c), invoke=(name,a)=>tools.find(t=>t.name===name).handler(a);
const record=process.env.TAG_SMOKE_RECORD;
if(!record)throw Error('Set TAG_SMOKE_RECORD to a private checkpoint file');
const state=existsSync(record)?JSON.parse(readFileSync(record,'utf8')):{};
const save=()=>secureWrite(record,state);
const edge=(id,source,target,sourceHandle='output',targetHandle='input')=>({id,source,target,sourceHandle,targetHandle});
if(!state.project){const ps=await invoke('tag_catalog',{kind:'projects'});state.project=ps.find(p=>p.slug==='tag-integration-qa')||await invoke('tag_project_create',{name:'TAG integration QA',slug:'tag-integration-qa'});save();}
const moduleGraph={nodes:[{id:'double',type:'transform',config:{expression:'{"value": $.value * 2}'}}],edges:[]};
if(!state.module){state.module=await invoke('tag_module_save',{name:'Agent integration double',projectId:state.project.id,graph:moduleGraph,ioContract:{inputs:[{portId:'input',label:'Input',type:'json',internalNodeId:'double',internalPortId:'input'}],outputs:[{portId:'output',label:'Output',type:'json',internalNodeId:'double',internalPortId:'output'}]}});save();}
if(!state.workflow){const graph={nodes:[{id:'input',type:'input',config:{}},{id:'module',type:'module',config:{moduleId:state.module.id,moduleVersionId:state.module.currentVersion.id}}],edges:[edge('e','input','module')]};state.workflow=await invoke('tag_workflow_save',{name:'Agent integration module smoke',projectId:state.project.id,graph});save();}
if(!state.run){state.run=await invoke('tag_run_start',{workflowId:state.workflow.id,workflowVersionId:state.workflow.currentVersion.id,input:{value:21},requestKey:'tag-integration-module-smoke-v02'});save();}
let r=await invoke('tag_run_wait',{id:state.run.id,seconds:40});state.result=r;save();
assert.equal(r.status,'succeeded'); assert.deepEqual(r.output, {'module:double': {value:42}});
console.log(JSON.stringify({projectId:state.project.id,moduleId:state.module.id,workflowId:state.workflow.id,runId:r.id,status:r.status,output:r.output,attempts:r.attempts.map(a=>({nodeId:a.nodeId,status:a.status,output:a.output}))},null,2));

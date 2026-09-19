import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {TagClient,normalizeGraph} from '../scripts/client.mjs';
import {createTools,validateArguments} from '../scripts/tools.mjs';
const graph={nodes:[{id:'a',type:'input'},{id:'b',type:'transform'}],edges:[{id:'e',source:'a',target:'b'}]};
async function fixture(fn,handler){
 const dir=mkdtempSync(join(tmpdir(),'tag-tests-')); const requests=[];
 const server=createServer(async(req,res)=>{let data='';for await(const c of req)data+=c;requests.push({method:req.method,url:req.url,body:data?JSON.parse(data):undefined});
  const out=handler?.(req,requests)||{id:'run-1',status:'succeeded'};res.writeHead(out.http||200,{'content-type':'application/json'});res.end(JSON.stringify(out));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const c=new TagClient({apiUrl:`http://127.0.0.1:${server.address().port}`,token:'test-only',stateDir:dir});
 try{await fn(c,requests,dir);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}
}
test('normalize graph validates edges and cycles without modifying caller',()=>{
 assert.ok(normalizeGraph(graph).nodes[0].position);assert.equal(graph.nodes[0].position,undefined);
 assert.throws(()=>normalizeGraph({...graph,edges:[...graph.edges,{id:'e2',source:'b',target:'a'}]}),/acyclic/);
 assert.throws(()=>normalizeGraph({...graph,edges:[{id:'e',source:'missing',target:'a'}]}),/endpoints/);
});
test('same request survives separate clients without second run and mismatched inputs fail',()=>fixture(async(c,req)=>{
 const a={workflowId:'wf',workflowVersionId:'v1',requestKey:'intent-1',input:{hello:'there'}};
 await c.start(a);await new TagClient(c.config).start(a);
 assert.equal(req.filter(r=>r.method==='POST').length,1);
 await assert.rejects(c.start({...a,input:{different:true}}),/different run inputs/);
}));
test('concurrent duplicate start only submits once',()=>fixture(async(c,req)=>{
 const a={workflowId:'wf',workflowVersionId:'v1',requestKey:'concurrent'};
 const r=await Promise.allSettled([c.start(a),c.start(a)]);
 assert.equal(req.filter(r=>r.method==='POST').length,1);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
}));
test('uncertain submission cannot silently retry',()=>fixture(async(c,req)=>{
 const a={workflowId:'wf',workflowVersionId:'v1',requestKey:'uncertain'};
 await assert.rejects(c.start(a),/missing run id/);await assert.rejects(c.start(a),/uncertain/);assert.equal(req.length,1);
},()=>({status:'running'})));
test('wait returns human gate immediately and never starts work',()=>fixture(async(c,req)=>{
 const r=await c.wait('r',50);assert.equal(r.status,'paused');assert.equal(req.length,1);assert.equal(req[0].method,'GET');
},()=>({id:'r',status:'paused'})));
test('workflow and module authoring use current request shapes',()=>fixture(async(c,req)=>{
 const t=createTools(()=>c);await t.find(t=>t.name==='tag_workflow_save').handler({name:'test',projectId:'p',graph});
 await t.find(t=>t.name==='tag_module_save').handler({name:'mod',projectId:'p',graph,ioContract:{inputs:[],outputs:[]}});
 assert.equal(req[0].body.projectId,'p');assert.ok(req[0].body.graph.nodes[0].position);
 assert.ok(req[1].body.sourceNodes);assert.equal(req[1].body.graph,undefined);
}));
test('arguments reject unsupported actions and wrong types',()=>{
 const t=createTools().find(t=>t.name==='tag_run_wait');assert.throws(()=>validateArguments(t.inputSchema,{id:'r',seconds:1000}),/Invalid/);
 assert.throws(()=>validateArguments(t.inputSchema,{id:'r',seconds:'50'}),/type/);
 assert.throws(()=>validateArguments(t.inputSchema,{id:'r',shell:'rm'}),/Unknown/);
});
test('auth refresh retries once and errors do not echo secrets',()=>fixture(async(c,req)=>{
 c.refreshToken='refresh-secret';await c.request('GET','/api/projects');
 assert.equal(req.length,3);assert.equal(c.token,'new-token');
 await assert.rejects(c.request('POST','/api/private',{}),e=>!e.message.includes('private-secret')&&e.message.includes('403'));
},(req,all)=>req.url==='/api/private'?{http:403,error:'private-secret'}:req.url==='/api/auth/refresh'?{token:'new-token'}:all.length===1?{http:401}:[]));
test('MCP initialize, listing, argument errors and parse errors use JSON-RPC',async()=>{
 const p=spawn(process.execPath,[new URL('../scripts/mcp-server.mjs',import.meta.url).pathname],{env:{...process.env,TAG_API_URL:''}});
 let out='';p.stdout.on('data',d=>out+=d);p.stdin.end([
 '{',JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}}),JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'}),
 JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'tag_run_wait',arguments:{id:'r',seconds:999}}})].join('\n')+'\n');
 await new Promise(r=>p.on('close',r)); const rows=out.trim().split('\n').map(JSON.parse);
 assert.equal(rows.find(r=>r.id===1).result.serverInfo.name,'tag');
 assert.equal(rows.find(r=>r.id===2).result.tools.length,15);assert.equal(rows.find(r=>r.id===3).result.isError,true);
 assert.equal(rows.find(r=>r.id===null).error.code,-32700);
});

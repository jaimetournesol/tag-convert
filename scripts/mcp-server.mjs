#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {createTools,validateArguments} from './tools.mjs';
const tools=createTools(), send=v=>process.stdout.write(JSON.stringify(v)+'\n');
async function handle(r){
  if(r.id===undefined) return;
  const result = data=>send({jsonrpc:'2.0',id:r.id,result:data});
  if(r.method==='initialize') return result({protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'tag',version:'0.2.0'},instructions:'TAG workflow and MCP authoring and execution. Discover current node schemas, use explicit project and version IDs, monitor the returned run ID. Never blindly retry uncertain writes.'});
  if(r.method==='ping') return result({});
  if(r.method==='tools/list') return result({tools:tools.map(({handler,...t})=>t)});
  if(r.method==='tools/call') {
    try {const t=tools.find(t=>t.name===r.params?.name); if(!t) throw Error('Unknown TAG tool');
      const a=r.params.arguments||{}; validateArguments(t.inputSchema,a); const output=await t.handler(a);
      return result({content:[{type:'text',text:JSON.stringify(output)}],isError:false});
    } catch(e) {return result({content:[{type:'text',text:e.message}],isError:true});}
  }
  send({jsonrpc:'2.0',id:r.id,error:{code:-32601,message:'Method not found'}});
}
createInterface({input:process.stdin}).on('line',line=>{
  if(!line.trim())return; let r; try{r=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}
  handle(r).catch(()=>send({jsonrpc:'2.0',id:r?.id??null,error:{code:-32603,message:'Internal error'}}));
});

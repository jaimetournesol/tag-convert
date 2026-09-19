import {TagClient, configuration, normalizeGraph, secureWrite} from './client.mjs';
const obj={type:'object'}, str={type:'string'}, id={type:'string',minLength:1};
const q = o => {const s=new URLSearchParams(Object.entries(o).filter(([,v])=>v!==undefined)); return s.size?'?'+s:'';};
const enc = value => {if(typeof value!=='string'||!value) throw Error('A nonempty id is required'); return encodeURIComponent(value);};
const required = (o,...keys)=>{for(const k of keys) if(o[k]===undefined || o[k]===null || o[k]==='') throw Error(`${k} is required`);};
export function createTools(getClient=()=>new TagClient()) {
  let c; const client=()=>c??=getClient();
  const call=(method,path,body)=>client().request(method,path,body);
  const tool=(name,description,properties,requiredFields,handler,readOnly=false)=>({name,description,
    inputSchema:{type:'object',properties,required:requiredFields,additionalProperties:false},
    annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,idempotentHint:readOnly,openWorldHint:true},handler});
  return [
    tool('tag_catalog','Discover current TAG node types, projects, workflows, modules, MCP capabilities or registered tools. List workflows is paginated. Read node definitions before authoring graphs.',
      {kind:{enum:['nodes','projects','workflows','modules','capabilities','tools']},projectId:str,take:{type:'integer',minimum:1,maximum:100},skip:{type:'integer',minimum:0}},['kind'],
      a=>call('GET','/api/'+a.kind+q({projectId:a.projectId,...(a.kind==='workflows'?{take:a.take||50,skip:a.skip||0}:{})})),true),
    tool('tag_inspect','Read a workflow/module/capability/tool or a pinned version. Run details include attempts, outputs and reported costs. Events can be read incrementally with since.',
      {kind:{enum:['workflows','modules','capabilities','tools','runs']},id,section:{enum:['versions','events','attempts','approvals','questions']},versionId:str,since:str},['kind','id'],a=>{
        if(a.versionId && !['workflows','modules','tools'].includes(a.kind)) throw Error('versionId only applies to versioned resources');
        if(a.section && !(a.kind==='runs'?['events','attempts','approvals','questions']:['workflows','modules','tools'].includes(a.kind)?['versions']:[]).includes(a.section)) throw Error('Unsupported section for resource');
        return call('GET',`/api/${a.kind}/${enc(a.id)}`+(a.versionId?`/versions/${enc(a.versionId)}`:a.section?'/'+a.section:'')+q(a.section==='events'?{since:a.since,limit:100}:{}));
      },true),
    tool('tag_project_create','Create a TAG project. Inspect the project list first and reuse an existing project when appropriate.',{name:str,slug:str},['name'],a=>call('POST','/api/projects',a)),
    tool('tag_workflow_save','Create a workflow in an explicit project or save a new version of an existing workflow. Normalizes positions and checks basic DAG integrity; TAG performs authoritative validation.',
      {name:str,projectId:str,workflowId:str,graph:obj,comment:str},['graph'],a=>{
        const graph=normalizeGraph(a.graph);
        if(a.workflowId) return call('POST',`/api/workflows/${enc(a.workflowId)}/versions`,{graph,comment:a.comment||'Agent update'});
        required(a,'name','projectId'); return call('POST','/api/workflows',{name:a.name,projectId:a.projectId,graph});
      }),
    tool('tag_module_save','Create a reusable module or save a new module version. ioContract ports map portId/label/type to internalNodeId/internalPortId. Pin moduleVersionId in consuming workflows.',
      {name:str,projectId:str,moduleId:str,graph:obj,ioContract:obj,params:{type:'array'},paramMappings:{type:'array'},comment:str},['graph','ioContract'],a=>{
        const graph=normalizeGraph(a.graph), shared={ioContract:a.ioContract,params:a.params,paramMappings:a.paramMappings};
        if(a.moduleId) return call('POST',`/api/modules/${enc(a.moduleId)}/versions`,{...shared,graph,comment:a.comment});
        required(a,'name','projectId'); return call('POST','/api/modules',{...shared,name:a.name,projectId:a.projectId,sourceNodes:graph.nodes,sourceEdges:graph.edges});
      }),
    tool('tag_run_start','Start exactly one pinned workflow run and return its id immediately. Use a stable requestKey for the same intended execution: accepted calls reuse the run; uncertain submissions block retries. Inspect workflow and inputs first.',
      {workflowId:id,workflowVersionId:id,input:obj,requestKey:id},['workflowId','workflowVersionId','requestKey'],a=>client().start(a)),
    tool('tag_run_list','Find existing runs before retrying a request with an uncertain outcome.',
      {workflowId:str,projectId:str,status:str,take:{type:'integer',minimum:1,maximum:100},skip:{type:'integer',minimum:0}},[],a=>call('GET','/api/runs'+q({...a,take:a.take||30})),true),
    tool('tag_run_wait','Wait up to 50 seconds for an existing run. Returns paused/waiting states immediately. This never launches or retries a workflow; continue polling with the same id.',
      {id,seconds:{type:'number',minimum:0,maximum:50}},['id'],a=>client().wait(a.id,a.seconds??20),true),
    tool('tag_run_control','Pause, resume or cancel an existing run, within user authorization. Inspect status first. Does not start replacement runs.',
      {id,action:{enum:['pause','resume','cancel']}},['id','action'],a=>call('POST',`/api/runs/${enc(a.id)}/${a.action}`,{})),
    tool('tag_run_respond','Answer an outstanding human question or record an explicitly authorized approval/rejection. Never auto-approve human gates to make a run finish.',
      {id,nodeId:id,action:{enum:['respond','approve']},response:str,approved:{type:'boolean'},comment:str},['id','nodeId','action'],a=>{
        required(a,a.action==='approve'?'approved':'response');
        return call('POST',`/api/runs/${enc(a.id)}/nodes/${enc(a.nodeId)}/${a.action}`,a.action==='approve'?{approved:a.approved,comment:a.comment}:{response:a.response});
      }),
    tool('tag_capability_save','Register or update a TAG capability. MCP body.kind=mcp-server and body.urlSource specifies relay devId or static-url url. Supply the current server schema, use credential references, and inspect existing capabilities to avoid duplicates.',
      {id:str,definition:obj},['definition'],a=>call(a.id?'PUT':'POST','/api/capabilities'+(a.id?'/'+enc(a.id):''),a.definition)),
    tool('tag_capability_test','Test connectivity and enumerate tools of a registered capability. This tests its catalogue, not the functional correctness of each tool.',
      {id},['id'],a=>call('POST',`/api/capabilities/${enc(a.id)}/test`,{}),true),
    tool('tag_bridge_status','Check the relay connection for the current identity and optional project/agent slot.',{project:str},[],a=>call('GET','/api/me/relay-bridge-status'+q(a)),true),
    tool('tag_bridge_token','Mint a relay bridge token and write it to a private env file. Returns slot and expiry, never the token. Use a distinct project/agent slot to avoid displacing another bridge.',
      {project:id,writePath:id},['project','writePath'],async a=>{
        const relay=client().config.relayUrl; if(!relay) throw Error('Configure TAG_RELAY_URL first');
        const r=await call('POST','/api/me/relay-bridge-token',{project:a.project});
        // Env values are quoted for safe shell sourcing.
        const quote=s=>"'"+String(s).replaceAll("'","'\\''")+"'";
        secureWrite(a.writePath,`TAG_BRIDGE_TOKEN=${quote(r.token)}\nTAG_RELAY_URL=${quote(relay)}\n`);
        return {devId:r.devId,expiresAt:r.expiresAt,path:a.writePath};
      }),
    tool('tag_tool_publish','Publish a registry tool manifest and entrypoint, or a new version. This is separate from registering an MCP capability. Publishing performs structural validation, not a functional execution test.',
      {id:str,definition:obj},['definition'],a=>call('POST','/api/tools'+(a.id?`/${enc(a.id)}/versions`:''),a.definition)),
  ];
}
export function validateArguments(schema,args){
  if(!args || typeof args!=='object'||Array.isArray(args)) throw Error('Arguments must be an object');
  for(const key of schema.required||[]) if(args[key]===undefined) throw Error(`${key} is required`);
  for(const [key,v] of Object.entries(args)) {
    const s=schema.properties[key]; if(!s) throw Error(`Unknown argument: ${key}`);
    if(s.enum && !s.enum.includes(v)) throw Error(`Unsupported ${key}`);
    if(s.type && !(s.type==='object'?v!==null&&typeof v==='object'&&!Array.isArray(v):s.type==='array'?Array.isArray(v):s.type==='integer'?Number.isInteger(v):typeof v===s.type)) throw Error(`Invalid ${key} type`);
    if(s.minLength && v.length<s.minLength || s.minimum!==undefined && v<s.minimum || s.maximum!==undefined && v>s.maximum) throw Error(`Invalid ${key} value`);
  }
}

import {readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';

const json = p => JSON.parse(readFileSync(p, 'utf8'));
export function configuration(env = process.env) {
  const file = env.TAG_CONFIG_FILE || join(homedir(), '.config/tag/config.json');
  const c = existsSync(file) ? json(file) : {};
  return {apiUrl: env.TAG_API_URL || c.apiUrl, relayUrl: env.TAG_RELAY_URL || c.relayUrl,
    accountFile: env.TAG_ACCOUNT_FILE || c.accountFile, token: env.TAG_TOKEN || c.token,
    apiKey: env.TAG_API_KEY || c.apiKey,
    email: env.TAG_EMAIL || c.email, password: env.TAG_PASSWORD || c.password,
    stateDir: env.TAG_STATE_DIR || c.stateDir || join(homedir(), '.local/state/tag-convert')};
}
export function secureWrite(path, value) {
  mkdirSync(dirname(path), {recursive:true, mode:0o700});
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2), {mode:0o600});
  chmodSync(path, 0o600);
}
export function normalizeGraph(value) {
  const g = structuredClone(value);
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw Error('graph requires nodes and edges arrays');
  const ids = new Set();
  for (const [i,n] of g.nodes.entries()) {
    if (!n.id || ids.has(n.id) || !n.type) throw Error('Each node requires a unique id and a type');
    ids.add(n.id); n.config ??= {}; n.label ??= n.id;
    if (!Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y)) n.position = {x:i%4*320,y:Math.floor(i/4)*160};
  }
  const edgeIds = new Set(), next = new Map([...ids].map(id=>[id,[]]));
  for (const e of g.edges) {
    if (!e.id || edgeIds.has(e.id) || !ids.has(e.source) || !ids.has(e.target)) throw Error('Each edge requires a unique id and existing endpoints');
    edgeIds.add(e.id); next.get(e.source).push(e.target);
  }
  const visiting = new Set(), done = new Set();
  function visit(id) { if(visiting.has(id)) throw Error('Workflow graph must be acyclic'); if(done.has(id)) return;
    visiting.add(id); next.get(id).forEach(visit); visiting.delete(id); done.add(id); }
  ids.forEach(visit); return g;
}
export class TagClient {
  constructor(config = configuration()) {
    this.config = config; this.base = (config.apiUrl || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(this.base)) throw Error('Configure TAG_API_URL or ~/.config/tag/config.json apiUrl');
    this.token = config.token; this.user = null; this.refreshToken = null;
  }
  async login() {
    if (this.config.apiKey || this.token) return;
    if (!this.authenticating) this.authenticating = (async()=>{
      const a = this.config.accountFile ? json(this.config.accountFile) : this.config;
      if (!a.email || !a.password) throw Error('Configure TAG_ACCOUNT_FILE, TAG_TOKEN or TAG_API_KEY; no project .env is read');
      const r = await this.request('POST','/api/auth/login',{email:a.email,password:a.password},false);
      if (!r.token) throw Error('TAG login returned no access token');
      this.token=r.token; this.refreshToken=r.refreshToken; this.user=r.user;
    })().finally(()=>{this.authenticating=null;});
    await this.authenticating;
  }
  async request(method, path, body, auth = true, retried = false) {
    if (!path.startsWith('/api/') || path.includes('..')) throw Error('Expected a TAG API path');
    if(auth) await this.login();
    let res;
    try {
      res=await fetch(this.base+path,{method,signal:AbortSignal.timeout(45000),redirect:'error',
        headers:{'content-type':'application/json',...(auth && this.config.apiKey ? {'x-api-key':this.config.apiKey} : auth && this.token ? {authorization:`Bearer ${this.token}`} : {})},
        body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(body ?? {})});
    } catch { throw Error(`${method} ${path.split('?')[0]}: connection failed or timed out${method==='GET'?'':'; outcome uncertain — inspect state before retrying'}`); }
    if (res.status===401 && auth && !retried && this.refreshToken) {
      if(!this.refreshing) this.refreshing=this.request('POST','/api/auth/refresh',{refreshToken:this.refreshToken},false).then(r=>{
        this.token=r.token; this.refreshToken=r.refreshToken || this.refreshToken;
      }).finally(()=>{this.refreshing=null;});
      await this.refreshing; return this.request(method,path,body,auth,true);
    }
    const text=await res.text(); let data;
    try {data=text?JSON.parse(text):{};} catch {throw Error(`TAG ${method} ${path.split('?')[0]} returned non-JSON (HTTP ${res.status})`);}
    if(!res.ok) {const e=Error(`TAG ${method} ${path.split('?')[0]} returned HTTP ${res.status}`); e.status=res.status;
      // Report validation paths, never arbitrary response bodies or echoed credentials.
      if(Array.isArray(data.details)) e.message+=': '+data.details.map(x=>`${(x.path||[]).join('.')}: ${x.message}`).join('; ');
      throw e;}
    return data;
  }
  async start({workflowId,workflowVersionId,input={},requestKey}) {
    if(!workflowId || !workflowVersionId || !requestKey) throw Error('workflowId, workflowVersionId and a stable requestKey are required');
    const payload={workflowId,workflowVersionId,input};
    const key=createHash('sha256').update(this.base+'|'+(this.config.accountFile||this.config.email||this.config.apiKey||this.config.token||'default')+'|'+requestKey).digest('hex');
    const file=join(this.config.stateDir,'requests',key+'.json');
    const fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    mkdirSync(dirname(file),{recursive:true,mode:0o700});
    try {writeFileSync(file,JSON.stringify({fingerprint,status:'submitting',workflowId,workflowVersionId,createdAt:new Date().toISOString()}),{flag:'wx',mode:0o600});}
    catch(e) {if(e.code!=='EEXIST') throw e; const prior=json(file);
      if(prior.fingerprint!==fingerprint) throw Error('requestKey already belongs to different run inputs');
      if(prior.runId) return this.request('GET',`/api/runs/${encodeURIComponent(prior.runId)}`);
      throw Error(`Previous submission is ${prior.status}; inspect runs for workflow ${workflowId} before submitting again. Receipt: ${file}`);}
    try {const run=await this.request('POST','/api/runs',payload);
      if(!run.id) throw Error('TAG response missing run id; inspect runs before retrying');
      secureWrite(file,{fingerprint,status:'accepted',runId:run.id}); return run;
    } catch(e) {secureWrite(file,{fingerprint,status:e.status?'rejected':'uncertain',workflowId,workflowVersionId}); throw e;}
  }
  async wait(id,seconds=20) {
    if(!Number.isFinite(seconds)||seconds<0||seconds>50) throw Error('seconds must be between 0 and 50');
    const end=Date.now()+seconds*1000;
    for(;;){const run=await this.request('GET',`/api/runs/${encodeURIComponent(id)}`);
      if(!['pending','queued','running'].includes(run.status)||Date.now()>=end) return run;
      await new Promise(r=>setTimeout(r,Math.min(1000,end-Date.now())));}
  }
}

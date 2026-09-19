import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('workspace template rejects traversal and symlink reads/writes, permits nested files', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tag-path-test-'));
 try {
  const root=join(dir,'workspace'); await mkdir(root); await mkdir(join(dir,'outside'));
  await writeFile(join(dir,'outside','secret.txt'),'unchanged');
  await symlink(join(dir,'outside'),join(root,'escape'));
  await symlink(join(dir,'outside','secret.txt'),join(root,'file-link'));
  await symlink(join(dir,'outside','missing.txt'),join(root,'dangling'));
  process.env.TAG_WORKSPACE_ROOT=root;
  const {tools}=await import('../templates/mcp-server/node/tools.mjs');
  const read=tools.find(t=>t.name==='read_file').handler, write=tools.find(t=>t.name==='write_file').handler;
  for(const path of ['../outside/secret.txt',join(dir,'outside','secret.txt'),'escape/secret.txt','file-link','dangling']) {
   await assert.rejects(()=>read({path})); await assert.rejects(()=>write({path,content:'bad'}));
  }
  await write({path:'nested/deep/result.txt',content:'first'});
  await write({path:'nested/deep/result.txt',content:'ok'});
  assert.equal(await read({path:'nested/deep/result.txt'}),'ok');
  assert.equal(await readFile(join(dir,'outside','secret.txt'),'utf8'),'unchanged');
 } finally {delete process.env.TAG_WORKSPACE_ROOT;await rm(dir,{recursive:true,force:true});}
});

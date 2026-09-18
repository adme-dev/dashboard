import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AttachmentRehearsal, steps } from './attachment.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const scope = { tenantId:'tenant-a', clientId:'client-a', businessId:'client-a', siteId:'site-a', environment:'staging' };
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'cms-attachment-'));
  let store = new AttachmentRehearsal(directory);
  const manifest = JSON.stringify({ pages:Array.from({length:75},(_,i)=>({id:`page-${i}`,html:`<h1>Imported ${i}</h1>`})), assets:109, forms:8 });
  const request = { operationId:'attach-1', scope, actor:{userId:'editor-a',loginId:'login-a'}, anchor:{id:'imported-head',digest:hash(manifest)}, runtimeDigest:hash('runtime-v1'),schemaDigest:hash('schema-v1') };
  store.addSite(scope,request.anchor,manifest);
  store.grant(scope,request.actor);
  const before = store.pageState(scope);
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  return { request,before,get store(){return store;}, restart(){store.close();store=new AttachmentRehearsal(directory);} };
}

test('attaches empty storage while preserving synthetic pages, count metadata, checkpoint and release',t=>{
  const f=fixture(t);f.store.run(f.request);
  assert.equal(f.store.status(f.request).phase,'complete');
  assert.deepEqual(f.store.pageState(scope),f.before);
  assert.deepEqual(f.store.counts(scope),{databases:1,runtimes:1,seeds:1,records:0});
  assert.equal(f.store.resolve(scope).runtimeDigest,f.request.runtimeDigest);
});

for(const step of ['reserved',...steps]) test(`recovers lost acknowledgement after ${step}, including process reopen`,t=>{
  const f=fixture(t);
  assert.throws(()=>f.store.run(f.request,{crashAfter:step}),/Injected interruption/);
  assert.equal(f.store.resolve(scope),null);
  f.restart();f.store.run(f.request);f.store.run(f.request);
  assert.equal(f.store.status(f.request).phase,'complete');
  assert.deepEqual(f.store.counts(scope),{databases:1,runtimes:1,seeds:1,records:0});
  assert.deepEqual(f.store.pageState(scope),f.before);
});

test('two competing operation IDs cannot provision the same scope',t=>{
  const f=fixture(t);assert.throws(()=>f.store.run(f.request,{crashAfter:'reserved'}),/interruption/);
  assert.throws(()=>f.store.run({...f.request,operationId:'attach-2'}),/Scope already reserved/);
  assert.deepEqual(f.store.counts(scope),{databases:0,runtimes:0,seeds:0,records:0});
  f.store.run(f.request);
});

for(const field of ['runtimeDigest','schemaDigest']) test(`rejects operation reuse with changed ${field}`,t=>{
  const f=fixture(t);assert.throws(()=>f.store.run(f.request,{crashAfter:'database'}),/interruption/);
  assert.throws(()=>f.store.run({...f.request,[field]:hash('different')}),/Operation changed/);
  assert.equal(f.store.resolve(scope),null);
});

for(const field of Object.keys(scope)) test(`denies a forged ${field} before provider effects`,t=>{
  const f=fixture(t);const forged={...scope,[field]:field==='environment'?'production':'foreign'};
  assert.throws(()=>f.store.run({...f.request,scope:forged}),/Authority denied/);
  assert.deepEqual(f.store.counts(scope),{databases:0,runtimes:0,seeds:0,records:0});
});

test('a fresh login cannot adopt the original operation',t=>{
  const f=fixture(t);assert.throws(()=>f.store.run(f.request,{crashAfter:'database'}),/interruption/);
  const actor={...f.request.actor,loginId:'login-b'};f.store.grant(scope,actor);
  assert.throws(()=>f.store.run({...f.request,actor}),/Operation changed/);
});

test('revocation blocks resumption but retains already allocated resources',t=>{
  const f=fixture(t);assert.throws(()=>f.store.run(f.request,{crashAfter:'database'}),/interruption/);
  f.store.revoke(scope,f.request.actor);
  assert.throws(()=>f.store.run(f.request),/Authority denied/);
  assert.equal(f.store.resolve(scope),null);
  assert.deepEqual(f.store.counts(scope),{databases:1,runtimes:0,seeds:0,records:0});
});

test('authority loss after route preparation withholds completion',t=>{
  const f=fixture(t);
  assert.throws(()=>f.store.run(f.request,{afterEffect:step=>{if(step==='route')f.store.revoke(scope,f.request.actor);}}),/Authority denied/);
  assert.equal(f.store.resolve(scope),null);
  assert.equal(f.store.status(f.request).phase,'seed');
});

test('an interleaved page edit survives attachment without restoring the old anchor',t=>{
  const f=fixture(t);assert.throws(()=>f.store.run(f.request,{crashAfter:'runtime'}),/interruption/);
  f.store.editPage(scope,'new-head','new page content');const edited=f.store.pageState(scope);
  f.store.run(f.request);
  assert.deepEqual(f.store.pageState(scope),edited);
  assert.notDeepEqual(edited,f.before);
});

test('a mismatched immutable anchor is rejected before allocation',t=>{
  const f=fixture(t);
  assert.throws(()=>f.store.run({...f.request,anchor:{...f.request.anchor,digest:hash('forged')}}),/Anchor mismatch/);
  assert.deepEqual(f.store.counts(scope),{databases:0,runtimes:0,seeds:0,records:0});
});

test('completed retries preserve records and later content revisions',t=>{
  const f=fixture(t);f.store.run(f.request);
  f.store.addRecord(scope,'enquiry-1',{customer:'Synthetic customer',customField:'retained'},3);
  const records=f.store.records(scope);f.restart();f.store.run(f.request);
  assert.deepEqual(f.store.records(scope),records);
  assert.deepEqual(f.store.pageState(scope),f.before);
});

test('rolling back the runtime pin after new records arrive preserves every stored field',t=>{
  const f=fixture(t);f.store.run(f.request);
  f.store.replaceRuntime(scope,f.request.runtimeDigest,hash('runtime-v2'),f.request.schemaDigest);
  f.store.addRecord(scope,'enquiry-2',{customer:'Synthetic',addedByV2:'keep this'},4);
  const records=f.store.records(scope);
  f.store.replaceRuntime(scope,hash('runtime-v2'),f.request.runtimeDigest,f.request.schemaDigest);
  assert.deepEqual(f.store.records(scope),records);
  assert.equal(f.store.resolve(scope).runtimeDigest,f.request.runtimeDigest);
});

test('incompatible schema rollback and stale runtime replacement are rejected',t=>{
  const f=fixture(t);f.store.run(f.request);
  assert.throws(()=>f.store.replaceRuntime(scope,hash('stale'),hash('next'),f.request.schemaDigest),/Runtime changed/);
  assert.throws(()=>f.store.replaceRuntime(scope,f.request.runtimeDigest,hash('next'),hash('different-schema')),/Schema migration required/);
  assert.equal(f.store.resolve(scope).runtimeDigest,f.request.runtimeDigest);
});

test('a disabled route remains disabled through operation retries',t=>{
  const f=fixture(t);f.store.run(f.request);f.store.disable(scope);
  assert.throws(()=>f.store.run(f.request),/Route disabled/);
  assert.equal(f.store.resolve(scope),null);
  assert.deepEqual(f.store.counts(scope),{databases:1,runtimes:1,seeds:1,records:0});
});

test('a foreign site cannot resolve or read the attached content',t=>{
  const f=fixture(t);f.store.run(f.request);f.store.addRecord(scope,'record-a',{private:'owned'},1);
  assert.equal(f.store.resolve({...scope,siteId:'site-b'}),null);
  assert.deepEqual(f.store.records({...scope,siteId:'site-b'}),[]);
});

for(const [table,values] of [
  ['databases',['other-operation']],
  ['runtimes',['other-operation',hash('foreign-runtime')]],
  ['seeds',['other-operation',hash('foreign-schema')]]
]) test(`retains conflicting ${table} ownership for reconciliation`,t=>{
  const f=fixture(t);
  const fields=table==='databases'?'scope,operation':'scope,operation,digest';
  const k=JSON.stringify(Object.fromEntries(Object.entries(scope).sort(([a],[b])=>a.localeCompare(b))));
  f.store.provider.prepare(`INSERT INTO ${table} (${fields}) VALUES (${[k,...values].map(()=>'?').join(',')})`).run(k,...values);
  assert.throws(()=>f.store.run(f.request),/ownership conflict/);
  assert.equal(f.store.resolve(scope),null);
  assert.equal(f.store.provider.prepare(`SELECT operation FROM ${table} WHERE scope=?`).get(k).operation,'other-operation');
  assert.deepEqual(f.store.pageState(scope),f.before);
});

for(const table of ['databases','runtimes','seeds']) for(const change of ['removed','reassigned'])
  test(`cannot resume activation when the recorded ${table} receipt is ${change}`,t=>{
    const f=fixture(t);assert.throws(()=>f.store.run(f.request,{crashAfter:'route'}),/interruption/);
    f.store.provider.exec(change==='removed'?`DELETE FROM ${table}`:`UPDATE ${table} SET operation='foreign-owner'`);
    assert.throws(()=>f.store.run(f.request),/Provider receipt changed/);
    assert.equal(f.store.resolve(scope),null);
    assert.notEqual(f.store.status(f.request).phase,'complete');
  });

test('completed route resolution withholds a missing provider resource',t=>{
  const f=fixture(t);f.store.run(f.request);f.store.provider.exec('DELETE FROM runtimes');
  assert.equal(f.store.resolve(scope),null);
  assert.throws(()=>f.store.run(f.request),/Provider receipt changed/);
});

for(const sql of [
  'DELETE FROM routes',
  "UPDATE routes SET operation='foreign-operation'",
  `UPDATE routes SET schema_digest='${hash('foreign-schema')}'`,
  `UPDATE routes SET runtime='${hash('foreign-runtime')}'`
]) test(`verifies route receipt before completion: ${sql}`,t=>{
  const f=fixture(t);
  assert.throws(()=>f.store.run(f.request,{afterEffect:step=>{if(step==='route')f.store.control.exec(sql);}}),/Route receipt changed/);
  assert.equal(f.store.resolve(scope),null);
  assert.notEqual(f.store.status(f.request).phase,'complete');
});

test('a recorded route phase cannot complete after its route disappears',t=>{
  const f=fixture(t);assert.throws(()=>f.store.run(f.request,{crashAfter:'route'}),/interruption/);
  f.store.control.exec("UPDATE jobs SET phase='route'; DELETE FROM routes");
  assert.throws(()=>f.store.run(f.request),/Route receipt changed/);
  assert.notEqual(f.store.status(f.request).phase,'complete');
});

test('completed retries and reads reject an altered route receipt',t=>{
  const f=fixture(t);f.store.run(f.request);
  f.store.control.exec("UPDATE routes SET operation='foreign-operation'");
  assert.equal(f.store.resolve(scope),null);
  assert.throws(()=>f.store.run(f.request),/Route receipt changed/);
});

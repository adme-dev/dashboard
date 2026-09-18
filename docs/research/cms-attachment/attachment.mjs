// Research-only lifecycle model. Never import into a customer API or deploy.
// Two local SQLite files model independently durable control/provider effects.
// Authority is a synthetic grant, not native authentication or a distributed fence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export const steps = ['database','runtime','seed','route'];
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
const scopeFields=['tenantId','clientId','businessId','siteId','environment'];
function key(scope) {
  assert.deepEqual(Object.keys(scope).sort(),[...scopeFields].sort(),'Invalid scope');
  assert(scopeFields.every(field=>typeof scope[field]==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(scope[field])),'Invalid scope');
  assert(['staging','production'].includes(scope.environment),'Invalid environment');
  return canonical(scope);
}
function validate(request) {
  key(request.scope);
  assert(/^[A-Za-z0-9_-]{1,128}$/.test(request.operationId),'Invalid operation');
  assert(request.actor.userId&&request.actor.loginId,'Missing original login');
  assert(request.anchor.id,'Missing imported checkpoint');
  for(const digest of [request.anchor.digest,request.runtimeDigest,request.schemaDigest])
    assert(/^[a-f0-9]{64}$/.test(digest),'Invalid immutable digest');
  return canonical(request);
}

export class AttachmentRehearsal {
  constructor(directory) {
    this.control=new DatabaseSync(path.join(directory,'control.sqlite'));
    this.provider=new DatabaseSync(path.join(directory,'provider.sqlite'));
    this.control.exec(`
      CREATE TABLE IF NOT EXISTS sites(scope TEXT PRIMARY KEY,head TEXT NOT NULL,release TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS checkpoints(scope TEXT,id TEXT,digest TEXT,manifest TEXT,PRIMARY KEY(scope,id));
      CREATE TABLE IF NOT EXISTS grants(scope TEXT,user TEXT,login TEXT,active INTEGER,PRIMARY KEY(scope,user,login));
      CREATE TABLE IF NOT EXISTS jobs(scope TEXT PRIMARY KEY,operation TEXT,request TEXT,phase TEXT);
      CREATE TABLE IF NOT EXISTS routes(scope TEXT PRIMARY KEY,operation TEXT,state TEXT,runtime TEXT,schema_digest TEXT);
      CREATE TABLE IF NOT EXISTS runtime_pins(scope TEXT PRIMARY KEY,digest TEXT);
    `);
    this.provider.exec(`
      CREATE TABLE IF NOT EXISTS databases(scope TEXT PRIMARY KEY,operation TEXT);
      CREATE TABLE IF NOT EXISTS runtimes(scope TEXT PRIMARY KEY,operation TEXT,digest TEXT);
      CREATE TABLE IF NOT EXISTS seeds(scope TEXT PRIMARY KEY,operation TEXT,digest TEXT);
      CREATE TABLE IF NOT EXISTS records(scope TEXT,id TEXT,revision INTEGER,payload TEXT,PRIMARY KEY(scope,id));
    `);
  }
  close(){this.control.close();this.provider.close();}
  addSite(scope,anchor,manifest) {
    const k=key(scope);assert.equal(hash(manifest),anchor.digest);
    this.control.prepare('INSERT INTO sites VALUES(?,?,?)').run(k,anchor.id,'existing-reviewed-release');
    this.control.prepare('INSERT INTO checkpoints VALUES(?,?,?,?)').run(k,anchor.id,anchor.digest,manifest);
  }
  grant(scope,actor){this.control.prepare('INSERT OR REPLACE INTO grants VALUES(?,?,?,1)').run(key(scope),actor.userId,actor.loginId);}
  revoke(scope,actor){this.control.prepare('UPDATE grants SET active=0 WHERE scope=? AND user=? AND login=?').run(key(scope),actor.userId,actor.loginId);}
  guard(request) {
    const k=key(request.scope);
    assert(this.control.prepare('SELECT 1 FROM grants WHERE scope=? AND user=? AND login=? AND active=1')
      .get(k,request.actor.userId,request.actor.loginId),'Authority denied');
    assert(this.control.prepare('SELECT 1 FROM sites WHERE scope=?').get(k),'Authority denied');
    const anchor=this.control.prepare('SELECT digest,manifest FROM checkpoints WHERE scope=? AND id=?').get(k,request.anchor.id);
    assert(anchor&&anchor.digest===request.anchor.digest&&hash(anchor.manifest)===request.anchor.digest,'Anchor mismatch');
  }
  reserve(request,payload) {
    const k=key(request.scope);
    this.control.prepare("INSERT INTO jobs VALUES(?,?,?,'reserved') ON CONFLICT(scope) DO NOTHING")
      .run(k,request.operationId,payload);
    const retained=this.control.prepare('SELECT * FROM jobs WHERE scope=?').get(k);
    assert.equal(retained.operation,request.operationId,'Scope already reserved');
    assert.equal(retained.request,payload,'Operation changed');
    return retained;
  }
  effect(step,request) {
    const k=key(request.scope),operation=request.operationId;
    if(step==='database') {
      this.provider.prepare('INSERT INTO databases VALUES(?,?) ON CONFLICT(scope) DO NOTHING').run(k,operation);
      assert.equal(this.provider.prepare('SELECT operation FROM databases WHERE scope=?').get(k).operation,operation,'Database ownership conflict');
    } else if(step==='runtime') {
      this.provider.prepare('INSERT INTO runtimes VALUES(?,?,?) ON CONFLICT(scope) DO NOTHING').run(k,operation,request.runtimeDigest);
      const row=this.provider.prepare('SELECT * FROM runtimes WHERE scope=?').get(k);
      assert(row.operation===operation&&row.digest===request.runtimeDigest,'Runtime ownership conflict');
    } else if(step==='seed') {
      // No customer rows are generated. A lost acknowledgement never clears data.
      this.provider.prepare('INSERT INTO seeds VALUES(?,?,?) ON CONFLICT(scope) DO NOTHING').run(k,operation,request.schemaDigest);
      const row=this.provider.prepare('SELECT * FROM seeds WHERE scope=?').get(k);
      assert(row.operation===operation&&row.digest===request.schemaDigest,'Seed ownership conflict');
    } else if(step==='route') {
      this.control.prepare("INSERT INTO routes VALUES(?,?,'prepared',?,?) ON CONFLICT(scope) DO NOTHING")
        .run(k,operation,request.runtimeDigest,request.schemaDigest);
      const row=this.control.prepare('SELECT * FROM routes WHERE scope=?').get(k);
      assert(row.operation===operation&&row.state==='prepared'&&row.runtime===request.runtimeDigest&&row.schema_digest===request.schemaDigest,'Route ownership conflict');
    }
  }
  verifyResources(request,count=3) {
    const k=key(request.scope);
    const receipts=[['databases',null],['runtimes',request.runtimeDigest],['seeds',request.schemaDigest]];
    for(const [table,digest] of receipts.slice(0,count)) {
      const row=this.provider.prepare(`SELECT * FROM ${table} WHERE scope=?`).get(k);
      assert(row&&row.operation===request.operationId&&(!digest||row.digest===digest),'Provider receipt changed');
    }
  }
  verifyRoute(request,state) {
    const row=this.control.prepare('SELECT * FROM routes WHERE scope=?').get(key(request.scope));
    assert(row&&row.operation===request.operationId&&row.state===state
      &&row.runtime===request.runtimeDigest&&row.schema_digest===request.schemaDigest,'Route receipt changed');
  }
  run(request,{crashAfter,afterEffect=()=>{}}={}) {
    const payload=validate(request);this.guard(request);
    const k=key(request.scope);
    const route=this.control.prepare('SELECT state FROM routes WHERE scope=?').get(k);
    assert(route?.state!=='disabled','Route disabled');
    const retained=this.reserve(request,payload);
    this.verifyResources(request,retained.phase==='complete'?3:Math.min(steps.indexOf(retained.phase)+1,3));
    if(['route','complete'].includes(retained.phase))this.verifyRoute(request,retained.phase==='complete'?'active':'prepared');
    const interrupt=step=>{if(crashAfter===step)throw new Error(`Injected interruption after ${step}`);};
    interrupt('reserved');
    if(retained.phase==='complete')return;
    for(const step of steps.slice(steps.indexOf(retained.phase)+1)) {
      this.guard(request);this.verifyResources(request,Math.min(steps.indexOf(step),3));this.effect(step,request);
      afterEffect(step);interrupt(step);this.guard(request);
      this.verifyResources(request,Math.min(steps.indexOf(step)+1,3));
      if(step==='route')this.verifyRoute(request,'prepared');
      this.control.prepare('UPDATE jobs SET phase=? WHERE scope=? AND request=?').run(step,k,payload);
    }
    // Only this local model stores authority and completion together. Real PG/D1
    // revocation coordination requires the separate production contract.
    this.control.exec('BEGIN IMMEDIATE');
    try {
      this.guard(request);
      this.verifyResources(request);
      this.verifyRoute(request,'prepared');
      this.control.prepare("UPDATE routes SET state='active' WHERE scope=? AND state='prepared'").run(k);
      this.control.prepare("UPDATE jobs SET phase='complete' WHERE scope=? AND request=?").run(k,payload);
      this.control.exec('COMMIT');
    } catch(error){this.control.exec('ROLLBACK');throw error;}
  }
  status(request){return this.control.prepare('SELECT phase FROM jobs WHERE scope=?').get(key(request.scope));}
  resolve(scope) {
    const row=this.control.prepare("SELECT runtime AS runtimeDigest,schema_digest AS schemaDigest,request FROM routes JOIN jobs USING(scope) WHERE scope=? AND state='active' AND phase='complete'").get(key(scope));
    if(!row)return null;
    try {const request=JSON.parse(row.request);this.verifyResources(request);this.verifyRoute(request,'active');} catch {return null;}
    const pin=this.control.prepare('SELECT digest FROM runtime_pins WHERE scope=?').get(key(scope));
    return {runtimeDigest:pin?.digest??row.runtimeDigest,schemaDigest:row.schemaDigest};
  }
  disable(scope){this.control.prepare("UPDATE routes SET state='disabled' WHERE scope=?").run(key(scope));}
  pageState(scope) {
    const k=key(scope);
    return {site:{...this.control.prepare('SELECT head,release FROM sites WHERE scope=?').get(k)},checkpoints:this.control.prepare('SELECT id,digest,manifest FROM checkpoints WHERE scope=? ORDER BY id').all(k).map(row=>({...row}))};
  }
  editPage(scope,id,manifest) {
    const k=key(scope);
    this.control.prepare('INSERT INTO checkpoints VALUES(?,?,?,?)').run(k,id,hash(manifest),manifest);
    this.control.prepare('UPDATE sites SET head=? WHERE scope=?').run(id,k);
  }
  counts(scope) {
    const k=key(scope);
    return Object.fromEntries(['databases','runtimes','seeds','records'].map(table=>[table,this.provider.prepare(`SELECT count(*) AS count FROM ${table} WHERE scope=?`).get(k).count]));
  }
  addRecord(scope,id,value,revision) {
    assert(this.resolve(scope),'Content route unavailable');
    this.provider.prepare('INSERT INTO records VALUES(?,?,?,?)').run(key(scope),id,revision,canonical(value));
  }
  records(scope){return this.provider.prepare('SELECT id,revision,payload FROM records WHERE scope=? ORDER BY id').all(key(scope)).map(row=>({...row}));}
  replaceRuntime(scope,expected,next,schemaDigest) {
    const k=key(scope),route=this.resolve(scope);assert(route,'Content route unavailable');
    assert.equal(route.runtimeDigest,expected,'Runtime changed');
    // Conservative rehearsal: exact schema identity only; additive compatibility
    // needs a versioned manifest and explicit tested reader/writer capabilities.
    assert.equal(route.schemaDigest,schemaDigest,'Schema migration required');
    assert(/^[a-f0-9]{64}$/.test(next),'Invalid runtime digest');
    // This is only a modeled selection; the immutable activation receipt remains
    // unchanged. Actual artifact rollout and native authority are not rehearsed.
    this.control.prepare('INSERT INTO runtime_pins VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET digest=excluded.digest').run(k,next);
  }
}

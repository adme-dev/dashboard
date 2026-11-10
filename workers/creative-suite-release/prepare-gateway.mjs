// Reconcile fresh gateway state and prepare an upload-only configuration. Never switches traffic.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { validatePrepared } from './validate-prepared.mjs'
const here=fileURLToPath(new URL('./',import.meta.url))
const repo=resolve(here,'../..')
const baseline=JSON.parse(readFileSync(resolve(here,'gateway-baseline.json')))
export function validateGatewayState(deployments,versions,detail) {
  const active=[...deployments].sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1)
  const latest=[...(Array.isArray(versions)?versions:versions.items)].sort((a,b)=>a.metadata.created_on.localeCompare(b.metadata.created_on)).at(-1)
  assert.equal(active.id,baseline.deployment,'Active gateway changed; reconcile')
  assert.deepEqual(active.versions,[{version_id:baseline.version,percentage:100}])
  assert.equal(latest.id,baseline.version,'Latest upload changed; refuse unsafe binding inheritance')
  assert.equal(detail.id,baseline.version)
  assert.equal(detail.resources.script.etag,baseline.etag)
  assert.deepEqual(detail.resources.script_runtime,baseline.runtime)
  assert.deepEqual(detail.resources.bindings,baseline.bindings)
}
export function releaseConfig(commit) {
  assert.match(commit,/^[a-f0-9]{40}$/)
  return {name:'xeroflow-creative-tools',account_id:'a5b299b3ad15c1b5b895dc66f9357b17',main:'worker.js',compatibility_date:'2026-10-27',compatibility_flags:['global_fetch_strictly_public'],no_bundle:true,find_additional_modules:true,rules:[{type:'ESModule',globs:['brand-rpc.mjs'],fallthrough:false}],send_metrics:false,dependencies_instrumentation:{enabled:false},unsafe:{metadata:{keep_assets:true,usage_model:'standard',bindings:[...baseline.bindings.map(({name})=>({name,type:'inherit'})),{name:'CREATIVE_STANDALONE_ASSETS',type:'service',service:'xeroflow-creative-standalone-assets',environment:'production'}],annotations:{'workers/commit_sha':commit,'workers/message':'Additive connected standalone candidate from '+commit}}}}
}
export function main(directory) {
  assert(directory,'Prepared connected release directory required')
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim()
  git('fetch','origin','main')
  const commit=git('rev-parse','HEAD')
  assert.equal(commit,git('rev-parse','origin/main'),'Gateway release requires exact current main')
  assert.equal(git('status','--porcelain','--untracked-files=all'),'','Gateway release requires clean source')
  const receipt=validatePrepared(directory)
  assert.equal(receipt.status,'prepared-unpublished-additive-candidate')
  assert.equal(receipt.stable_routes_changed,false)
  const config=releaseConfig(commit)
  for (const [name,sha] of Object.entries(receipt.modules))assert.equal(createHash('sha256').update(readFileSync(resolve(directory,'gateway',name))).digest('hex'),sha,'Prepared gateway module changed')
  const wrangler=(...args)=>JSON.parse(execFileSync(process.execPath,[resolve(repo,'node_modules/wrangler/bin/wrangler.js'),...args,'--name','xeroflow-creative-tools','--json'],{cwd:repo,encoding:'utf8'}))
  validateGatewayState(wrangler('deployments','list'),wrangler('versions','list'),wrangler('versions','view',baseline.version))
  writeFileSync(resolve(directory,'gateway/wrangler.release.json'),JSON.stringify(config,null,2)+'\n')
  console.log('Prepared upload-only gateway configuration after fresh active/latest/binding reconciliation. No upload or traffic change.')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv[2])

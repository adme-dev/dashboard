// Prepare stable-route selection only after recorded hosted acceptance and fresh live reconciliation.
// No upload or traffic change is performed by this command.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { releaseConfig } from './prepare-gateway.mjs'
import { validatePrepared } from './validate-prepared.mjs'
const here=fileURLToPath(new URL('./',import.meta.url)),repo=resolve(here,'../..')
const publication=JSON.parse(readFileSync(resolve(here,'publication.json')))
const baseline=JSON.parse(readFileSync(resolve(here,'gateway-baseline.json')))
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export function validateAcceptance(accepted,receipt,commit){
  assert.equal(accepted.status,'accepted-immutable-candidate','Hosted acceptance required')
  assert.equal(accepted.receiptSha256,publication.receipt_sha256,'Acceptance belongs to another artifact')
  assert.equal(accepted.sourceCommit,commit,'Acceptance belongs to another source commit')
  assert.deepEqual(Object.keys(receipt.promotion_modules||{}).sort(),['brand-rpc.mjs','worker.js'],'Frozen promotion modules required')
  assert.match(receipt.promotion_receipt_sha256||'',/^[a-f0-9]{64}$/,'Frozen promotion receipt required')
  assert.deepEqual(accepted.modules,receipt.modules)
  assert.deepEqual(accepted.promotionModules,receipt.promotion_modules)
  for(const key of ['allSixStartupSaveReopenExport','dockSession','motorstackNativeImport','figLibraryAndEdm','oldVersionsRetained','privateAssetService'])assert.equal(accepted.checks?.[key],true,'Unaccepted release gate: '+key)
  for(const target of ['gateway','assets'])for(const key of ['deployment','version'])assert.match(accepted[target]?.[key]||'',uuid)
  assert.match(accepted.gateway.etag||'',/^[a-f0-9]{64}$/)
}
export function validatePromotionState(accepted,gatewayDeployments,gatewayVersions,gatewayDetail,assetDeployments,assetVersions){
  for(const [key,deployments,versions] of [['gateway',gatewayDeployments,gatewayVersions],['assets',assetDeployments,assetVersions]]){
    const active=[...deployments].sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1)
    const latest=[...(Array.isArray(versions)?versions:versions.items)].sort((a,b)=>a.metadata.created_on.localeCompare(b.metadata.created_on)).at(-1)
    assert.equal(active.id,accepted[key].deployment,'Active '+key+' changed; reconcile')
    assert.deepEqual(active.versions,[{version_id:accepted[key].version,percentage:100}])
    assert.equal(latest.id,accepted[key].version,'Latest '+key+' upload changed; reconcile')
  }
  assert.equal(gatewayDetail.id,accepted.gateway.version)
  assert.equal(gatewayDetail.resources.script.etag,accepted.gateway.etag)
  assert.equal(gatewayDetail.annotations['workers/commit_sha'],accepted.sourceCommit)
  assert.deepEqual(gatewayDetail.resources.script_runtime,baseline.runtime)
  const expected=[...baseline.bindings,{name:'CREATIVE_STANDALONE_ASSETS',type:'service',service:'xeroflow-creative-standalone-assets',environment:'production'}]
  const ordered=values=>[...values].sort((a,b)=>a.name.localeCompare(b.name))
  assert.deepEqual(ordered(gatewayDetail.resources.bindings),ordered(expected),'Existing gateway bindings changed')
}
export function promotionConfig(commit){
  const config=releaseConfig(commit)
  config.unsafe.metadata.bindings=config.unsafe.metadata.bindings.map(({name})=>({name,type:'inherit'}))
  config.unsafe.metadata.annotations['workers/message']='Promote accepted standalone versions on existing Creative Suite from '+commit
  return config
}
export function main(directory,acceptanceFile){
  assert(directory&&acceptanceFile,'Prepared directory and real hosted acceptance file required')
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim()
  git('fetch','origin','main');const commit=git('rev-parse','HEAD')
  assert.equal(commit,git('rev-parse','origin/main'),'Promotion requires exact current main')
  assert.equal(git('status','--porcelain','--untracked-files=all'),'','Promotion requires clean source')
  const receipt=validatePrepared(directory)
  const accepted=JSON.parse(readFileSync(acceptanceFile))
  validateAcceptance(accepted,receipt,commit)
  const wrangler=(name,...args)=>JSON.parse(execFileSync(process.execPath,[resolve(repo,'node_modules/wrangler/bin/wrangler.js'),...args,'--name',name,'--json'],{cwd:repo,encoding:'utf8'}))
  validatePromotionState(accepted,wrangler('xeroflow-creative-tools','deployments','list'),wrangler('xeroflow-creative-tools','versions','list'),wrangler('xeroflow-creative-tools','versions','view',accepted.gateway.version),wrangler('xeroflow-creative-standalone-assets','deployments','list'),wrangler('xeroflow-creative-standalone-assets','versions','list'))
  writeFileSync(resolve(directory,'promotion/wrangler.release.json'),JSON.stringify(promotionConfig(commit),null,2)+'\n')
  console.log('Prepared accepted stable-route promotion config after fresh gateway/assets reconciliation; no upload or traffic change')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv[2],process.argv[3])

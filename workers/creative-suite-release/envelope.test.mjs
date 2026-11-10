import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { validatePrepared } from './validate-prepared.mjs'
const root=process.env.CREATIVE_RELEASE_DIR
if(!root)throw Error('Set CREATIVE_RELEASE_DIR')
test('frozen actual envelope validates service/config/manifests/assets/compressed round trips',()=>assert.equal(validatePrepared(root).assets,263))
for(const changed of ['assets-worker.mjs','wrangler.jsonc','inventory.json','compressed.json'])test('rejects tampered '+changed+' before upload',()=>{
  const temp=mkdtempSync(resolve(tmpdir(),'creative-envelope-'))
  try{
    const receipt=JSON.parse(readFileSync(resolve(root,'release-receipt.json')))
    writeFileSync(resolve(temp,'release-receipt.json'),readFileSync(resolve(root,'release-receipt.json')))
    for(const file of Object.keys(receipt.service_files))writeFileSync(resolve(temp,file),readFileSync(resolve(root,file)))
    writeFileSync(resolve(temp,changed),'tampered')
    assert.throws(()=>validatePrepared(temp),/Service upload file changed/)
  }finally{rmSync(temp,{recursive:true,force:true})}
})

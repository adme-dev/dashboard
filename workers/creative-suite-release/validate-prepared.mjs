import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { brotliDecompressSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
const publication=JSON.parse(readFileSync(new URL('./publication.json',import.meta.url)))
const sha=data=>createHash('sha256').update(data).digest('hex')
export function validatePrepared(directory){
  const bytes=readFileSync(resolve(directory,'release-receipt.json'))
  assert.equal(sha(bytes),publication.receipt_sha256,'Release receipt changed')
  const receipt=JSON.parse(bytes)
  assert.deepEqual(receipt,publication.receipt)
  for(const [file,digest] of Object.entries(receipt.service_files))assert.equal(sha(readFileSync(resolve(directory,file))),digest,'Service upload file changed: '+file)
  for(const [file,digest] of Object.entries(receipt.modules))assert.equal(sha(readFileSync(resolve(directory,'gateway',file))),digest,'Gateway module changed')
  const inventory=JSON.parse(readFileSync(resolve(directory,'inventory.json')))
  const list=(directory,prefix='')=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{assert(!entry.isSymbolicLink(),'Linked public asset');return entry.isDirectory()?list(resolve(directory,entry.name),prefix+entry.name+'/'):[prefix+entry.name]})
  assert.deepEqual(list(resolve(directory,'public')).sort(),Object.keys(inventory).map(x=>x.slice(1)).sort(),'Public inventory changed')
  for(const [path,pin] of Object.entries(inventory)){
    assert(/^\/[a-z]+flow\/\d+\.\d+\.\d+-flow\d+\//.test(path)&&!path.split('/').includes('..'),'Invalid public path')
    const data=readFileSync(resolve(directory,'public',path.slice(1)))
    assert.equal(sha(data),pin.sha256,'Stored asset changed');assert.equal(data.length,pin.bytes);assert(data.length<25*1024**2)
  }
  const compressed=JSON.parse(readFileSync(resolve(directory,'compressed.json')))
  for(const [path,target] of Object.entries(compressed)){
    assert(Object.hasOwn(inventory,target));assert(!Object.hasOwn(inventory,path))
    const decoded=brotliDecompressSync(readFileSync(resolve(directory,'public',target.slice(1))))
    assert.equal(sha(decoded),receipt.compressed_decoded[path].sha256);assert.equal(decoded.length,receipt.compressed_decoded[path].bytes)
  }
  const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc')))
  assert.equal(config.account_id,'a5b299b3ad15c1b5b895dc66f9357b17');assert.equal(config.name,'xeroflow-creative-standalone-assets');assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);assert.deepEqual(config.routes,[]);assert.deepEqual(config.assets,{directory:'./public',binding:'ASSETS',run_worker_first:true})
  return receipt
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=validatePrepared(process.argv[2]);console.log(JSON.stringify({status:'verified-prepared-unpublished',assets:r.assets,receipt_sha256:publication.receipt_sha256}))}

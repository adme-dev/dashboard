import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'

const root = process.env.CREATIVE_RELEASE_DIR
if (!root) throw Error('Set CREATIVE_RELEASE_DIR to the prepared connected release root')
const read = path => readFileSync(resolve(root, path), 'utf8')
const load = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const receipt = JSON.parse(read('release-receipt.json'))
const inventory = JSON.parse(read('inventory.json'))
const compressed = JSON.parse(read('compressed.json'))
const service = (await load(read('assets-worker.mjs').replace(/^import inventory .*$/m, 'const inventory = ' + JSON.stringify(inventory)).replace(/^import compressed .*$/m, 'const compressed = ' + JSON.stringify(compressed)))).default
const gateway = (await load(read('gateway/worker.js').replace('import { WorkerEntrypoint } from "cloudflare:workers";', 'class WorkerEntrypoint {}').replace('"./brand-rpc.mjs"', JSON.stringify(pathToFileURL(resolve(root,'gateway/brand-rpc.mjs')).href)))).default

test('all stored assets match final manifest and strict size bound', () => {
  for (const [url,pin] of Object.entries(inventory)) {
    const data = readFileSync(resolve(root,'public',url.slice(1)))
    assert.equal(data.length,pin.bytes)
    assert.ok(data.length < 25*1024**2)
    assert.equal(createHash('sha256').update(data).digest('hex'),pin.sha256)
  }
})
test('all shells include connected local modules and stable install identities', () => {
  for (const prefix of receipt.prefixes) {
    const page = read('public'+prefix+'index.html')
    for (const module of ['editor-dock.js','auth-session.js','asset-library.js','install-app.js']) assert.ok(page.includes('./xf-shell/'+module))
    const manifest = JSON.parse(read('public'+prefix+'manifest.webmanifest'))
    assert.equal(manifest.id,'/'+prefix.split('/')[1]+'/')
    assert.equal(manifest.start_url,manifest.id)
    assert.equal(manifest.scope,manifest.id)
  }
  const retirement=read('public/effectflow/0.23.1-flow1/sw.js')
  assert.ok(retirement.includes('registration.unregister()'))
  assert.ok(!retirement.includes('caches.') && !retirement.includes("'fetch'"))
})
test('asset service rejects unknown/method/direct compressed paths and strips query/credentials', async () => {
  const calls=[];const env={ASSETS:{fetch:async r=>{calls.push(r);return new Response('asset')}}}
  assert.equal((await service.fetch(new Request('https://assets/private'),env)).status,404)
  assert.equal((await service.fetch(new Request('https://assets'+receipt.prefixes[0],{method:'POST'}),env)).status,405)
  assert.equal((await service.fetch(new Request('https://assets'+Object.values(compressed)[0]),env)).status,404)
  const result=await service.fetch(new Request('https://assets'+receipt.prefixes[0]+'?secret=x',{headers:{Cookie:'secret'}}),env)
  assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'private, no-store')
  assert.equal(new URL(calls[0].url).search,'');assert.equal(calls[0].headers.get('Cookie'),null)
})
test('actual compressed mapping serves WASM with manual Brotli headers',async()=>{
  const path=Object.keys(compressed)[0];let target
  const response=await service.fetch(new Request('https://assets'+path),{ASSETS:{fetch:async r=>{target=new URL(r.url).pathname;return new Response('encoded',{headers:{'Content-Length':'7'}})}}})
  assert.equal(target,compressed[path]);assert.equal(response.headers.get('Content-Encoding'),'br');assert.equal(response.headers.get('Content-Type'),'application/wasm');assert.equal(response.headers.get('Content-Length'),null)
})
test('gateway fresh authorization precedes new editor and service-worker dispatch; legacy paths retained',async t=>{
  const original=globalThis.fetch
  t.after(()=>{globalThis.fetch=original})
  let authorityCalls=0
  globalThis.fetch=async()=>{authorityCalls++;return Response.json({success:true,user:{id:'fixture',email:'paul@adme.net.au',is_active:true}})}
  const forwarded=[],legacy=[],edm=[]
  const env={CREATIVE_AUTH_KEY:randomBytes(32).toString('base64url'),ASSETS:{fetch:async r=>{legacy.push(r);return new Response('legacy')}},CREATIVE_STANDALONE_ASSETS:{fetch:async r=>{forwarded.push(r);return new Response('new')}},FIGFLOW_EDM_ASSETS:{fetch:async r=>{edm.push(r);return new Response('edm')}}}
  const request=(path,token)=>gateway.fetch(new Request('https://creative.xeroflow.io'+path,{headers:token?{Cookie:'__Host-xf_creative_session='+token}:undefined}),env)
  for(const prefix of receipt.prefixes){assert.equal((await request(prefix)).status,401);assert.equal((await request(prefix,'fixture-jwt')).status,200)}
  assert.equal((await request('/effectflow/0.23.1-flow1/sw.js')).status,401)
  assert.equal((await request('/effectflow/0.23.1-flow1/sw.js','fixture-jwt')).status,200)
  assert.equal(forwarded.length,7);assert.equal(authorityCalls,7)
  for(const r of forwarded){assert.equal(r.headers.get('Cookie'),null);assert.equal(r.headers.get('Authorization'),null)}
  await request('/filmflow/0.13.0-flow1/','fixture-jwt');assert.equal(legacy.length,1)
  for(const v of [1,3,4,5])await request('/figflow/0.11.2-edm'+v+'/','fixture-jwt')
  await request('/figflow/0.11.2-flow1/','fixture-jwt');assert.equal(edm.length,5)
  const stable=await request('/figflow/','fixture-jwt');assert.equal(new URL(stable.headers.get('Location')).pathname,'/figflow/0.11.2-flow1/')
  assert.equal((await request('/filmflow/0.19.0-flow10/index.html','fixture-jwt')).status,200);assert.equal(legacy.length,2)
})

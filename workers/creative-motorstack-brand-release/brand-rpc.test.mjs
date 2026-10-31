import { mediaRepairPatches } from './media-repair-patches.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBrandService, createPrivateMotorstackFetch, privateRpcErrorCategory } from './brand-rpc.mjs'
const source = readFileSync(new URL('./source/worker.js', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('// motorstack.mjs'), source.indexOf('var handleMotorstack ='))
const native = new Function('__name', section.replace('return { handleMotorstack: handleMotorstack2 };', 'return { handleMotorstack: handleMotorstack2, rpc, binary };') + '\nreturn { createMotorstack, safeURL, extension, MIME, idFor, boundedBody, AdapterError }')((fn) => fn)
const key = 'msk_' + 'test_fixture_only_0123456789'
const base = 'https://oem-variants.pages.dev'
const fixture = { oem: 'ford', fonts: { heading: { family: 'FordBold', weight: 700, file: 'FordBold-400.woff2', url: base + '/api/fonts/ford/FordBold-400.woff2' }, body: { family: 'FordRegular', weight: 400, file: 'FordRegular-400.woff2', url: base + '/api/fonts/ford/FordRegular-400.woff2' }, medium: { family: 'FordBold', weight: 700, file: 'FordBold-400.woff2', url: base + '/api/fonts/ford/FordBold-400.woff2' } }, logos: [{ role: 'main', variant: 'Main logo', file: 'ford.svg', on_dark: false, url: base + '/api/logos/ford.svg' }], colours: { primaryColor: '#066fef' } }
function service(data = fixture, opts = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url === base + '/api/mcp') {
      const req = JSON.parse(options.body)
      const payload = req.params.name === 'list_oems' ? { oems: opts.brands ?? [{ oem: 'ford', name: 'Ford Australia' }] } : data
      return Response.json({ result: { structuredContent: payload } })
    }
    return opts.assetResponse?.(url, options) ?? new Response(new Uint8Array([119,79,70,50]), { headers: { 'Content-Type': 'font/woff2' } })
  }
  const adapter = native.createMotorstack({ fetcher })
  return { api: createBrandService({ ...native, ...adapter, fetcher }, { MOTORSTACK_API_KEY: opts.key ?? key }), calls, adapter }
}
test('retains exact declared source weight/file/role, including shared files', async () => {
  const { api } = service(); const kit = await api.getBrandKit('ford')
  assert.equal(kit.fonts[0].weight, 700); assert.equal(kit.fonts[0].file, 'FordBold-400.woff2')
  assert.equal(kit.fonts[0].assetId, kit.fonts[2].assetId); assert.equal(kit.assets.length, 3)
  assert.equal(kit.logos[0].role, 'main'); assert.equal(kit.logos[0].onDark, false)
  assert.equal(JSON.stringify(kit).includes('https://'), false); assert.equal(JSON.stringify(kit).includes(key), false)
})
test('does not synthesize missing fonts or invalid weights', async () => {
  const { api } = service({ fonts: { heading: { family: 'Arial', weight: 'bold', url: null }, body: { family: 'Arial', weight: 400 } } })
  const kit = await api.getBrandKit('ford')
  assert.deepEqual(kit.fonts.map(x => [x.weight, x.assetId]), [[null,null],[400,null]])
  assert.equal(kit.fonts[0].sourceWeight, 'bold'); assert.equal(kit.warnings.length, 3)
})
test('returns every bounded brand, without old catalog 100-brand silent truncation', async () => {
  const { api } = service(fixture, { brands: Array.from({length: 101}, (_,i) => ({oem: 'brand-' + i, name: 'Brand ' + i})) })
  assert.equal((await api.listBrands()).brands.length, 101)
})
test('validates brand membership and asset IDs; denies caller URL forwarding', async () => {
  const { api, calls } = service()
  await assert.rejects(api.getBrandKit('other'), /brand_not_available/)
  await assert.rejects(api.getBrandKit('../ford'), /invalid_brand_id/)
  await assert.rejects(api.getBrandAsset({brandId:'ford',assetId:'a'.repeat(64),url:'https://localhost'}), /invalid_asset_id/)
  await assert.rejects(api.getBrandAsset({brandId:'ford',assetId:'a'.repeat(64)}), /asset_not_found/)
  assert.ok(calls.every(x => x.url === base + '/api/mcp'))
})
test('rejects private/unsupported asset URLs without fetching them', async () => {
  const { api, calls } = service({ fonts: { heading: { family: 'No', weight: 400, url:'http://127.0.0.1/private.woff2' } } })
  assert.equal((await api.getBrandKit('ford')).fonts[0].assetId, null)
  assert.ok(calls.every(x => x.url === base + '/api/mcp'))
})
test('streams bounded Response with original MIME and private headers', async () => {
  const { api, calls } = service(); const kit = await api.getBrandKit('ford')
  const res = await api.getBrandAsset({ brandId:'ford',assetId:kit.fonts[0].assetId })
  assert.equal(res.headers.get('Content-Type'),'font/woff2'); assert.equal(res.headers.get('Cache-Control'),'private, no-store')
  assert.equal((await res.arrayBuffer()).byteLength,4)
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer ' + key)
})
test('rechecks redirects and never sends key to R2 or arbitrary hosts', async () => {
  let hops = 0
  const { api, calls } = service(fixture, { assetResponse: url => {
    hops++
    if (hops === 1) return new Response(null, {status:302,headers:{Location:'https://pub-150d4c02365b4ffe9e158d72b3b048a1.r2.dev/font.woff2'}})
    return new Response(new Uint8Array([1]), {headers:{'Content-Type':'font/woff2'}})
  } })
  const kit = await api.getBrandKit('ford'); await api.getBrandAsset({brandId:'ford',assetId:kit.fonts[0].assetId})
  assert.equal(calls.at(-1).options.headers.Authorization,undefined)
  const bad = service(fixture, {assetResponse:()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1/font.woff2'}})})
  await assert.rejects(bad.api.getBrandAsset({brandId:'ford',assetId:kit.fonts[0].assetId}), /asset_host_not_supported/)
  assert.ok(!bad.calls.some(x=>x.url.includes('127.0.0.1')))
})
test('rejects MIME mismatch and oversized content before returning bytes', async () => {
  const kit = await service().api.getBrandKit('ford')
  for (const headers of [{'Content-Type':'text/html'},{'Content-Type':'font/woff2','Content-Length':String(33*1024*1024)}]) {
    const { api } = service(fixture,{assetResponse:()=>new Response('bad',{headers})})
    await assert.rejects(api.getBrandAsset({brandId:'ford',assetId:kit.fonts[0].assetId}), /asset_type_refused|provider_response_too_large/)
  }
})
test('invalid config does not call provider', async () => {
  const { api, calls } = service(fixture,{key:'invalid'})
  await assert.rejects(api.listBrands(),/motorstack_not_configured/); assert.equal(calls.length,0)
})
test('build preserves the complete current Worker except reviewed diagnostics, exact media CDN and additive media RPC', () => {
  const candidate=readFileSync(new URL('./dist/worker.js',import.meta.url),'utf8')
  const unpatched = [...mediaRepairPatches].reverse().reduce((text, [before, after]) => text.replace(after, before), candidate)
  const restored=unpatched.replace('import { createBrandService, createPrivateMotorstackFetch } from "./brand-rpc.mjs";', 'import { createBrandService } from "./brand-rpc.mjs";').replace('    const fetcher = createPrivateMotorstackFetch();\n    const { rpc, binary, catalog } = createMotorstack({ fetcher });\n    return createBrandService({ rpc, binary, catalog, safeURL, extension, MIME, idFor, boundedBody, AdapterError, fetcher }, this.env);', '    const { rpc, binary } = createMotorstack();\n    return createBrandService({ rpc, binary, safeURL, extension, MIME, idFor, boundedBody, AdapterError }, this.env);')
  assert.equal(restored.replace('      for (const item of Array.isArray(data.brochures) ? data.brochures : []) {\n', '      for (const item of Array.isArray(data.brochures) ? data.brochures : []) {\n        if (model && !matches(item.model || item.model_name || item.modelName)) continue;\n').replace('return { handleMotorstack: handleMotorstack2, rpc, binary, catalog };', 'return { handleMotorstack: handleMotorstack2, rpc, binary };').replace('  listMedia(input) { return this.#service().listMedia(input); }\n  getMediaAsset(input) { return this.#service().getMediaAsset(input); }\n', '').replace('[new URL(ORIGIN).hostname, R2_HOST, "motorstackmedia.driveagent.io"].includes(url.hostname)', '[new URL(ORIGIN).hostname, R2_HOST].includes(url.hostname)'),source)
  assert.equal((candidate.match(/export class MotorstackBrandAssets/g)||[]).length,1)
})

test('preserves ICO metadata and accepts equivalent icon MIME with bounded bytes', async () => {
  const { api } = service({logos:[{role:'favicon',file:'ford.ico',url:base+'/api/logos/ford.ico'}]}, {assetResponse:()=>new Response(new Uint8Array([0,0,1,0]),{headers:{'Content-Type':'image/vnd.microsoft.icon'}})})
  const kit=await api.getBrandKit('ford'); assert.equal(kit.logos[0].mime,'image/x-icon')
  const file=await api.getBrandAsset({brandId:'ford',assetId:kit.logos[0].assetId})
  assert.equal(file.headers.get('Content-Type'),'image/x-icon'); assert.equal((await file.arrayBuffer()).byteLength,4)
})

test('private diagnostics preserve outbound arguments and log no credential or URL content', async () => {
  const events=[]; const args=['https://private.invalid?key=DO_NOT_LOG',{headers:{Authorization:'DO_NOT_LOG'},body:'DO_NOT_LOG'}]
  const res=new Response('DO_NOT_LOG',{status:403})
  const fetcher=createPrivateMotorstackFetch(async (...received)=>{assert.deepEqual(received,args);return res},e=>events.push(e))
  assert.equal(await fetcher(...args),res)
  assert.deepEqual(events,[{stage:'fetch_started'},{stage:'fetch_response',status:403}])
  assert.equal(JSON.stringify(events).includes('DO_NOT_LOG'),false)
})
test('private diagnostics categorize context failure without logging raw error', async () => {
  const events=[];const error=new TypeError('Cannot perform I/O on behalf of a different request DO_NOT_LOG')
  const fetcher=createPrivateMotorstackFetch(async()=>{throw error},e=>events.push(e))
  await assert.rejects(fetcher('https://private.invalid'),e=>e===error)
  assert.deepEqual(events[1],{stage:'fetch_failed',name:'TypeError',category:'cross_request_io'})
  assert.equal(JSON.stringify(events).includes('DO_NOT_LOG'),false)
  assert.deepEqual(privateRpcErrorCategory({name:'DO_NOT_LOG',message:'DO_NOT_LOG'}),{name:'OtherError',category:'other'})
})

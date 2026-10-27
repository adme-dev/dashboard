import { buildBundle } from './build.mjs'
import { PNG } from 'pngjs'
import { Miniflare } from 'miniflare'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const root = new URL('.', import.meta.url)
const config = JSON.parse(await readFile(new URL('wrangler.production.jsonc', root), 'utf8'))
await buildBundle('proof/codec.ts', 'dist/proof-codec.js')
let launches = 0
let outbound = 0
let resourceCalls = 0
const mf = new Miniflare({
  workers: [
    { name: 'codec', modules: true, scriptPath: new URL('dist/proof-codec.js', root).pathname, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      outboundService: (request) => {
        assert.equal(request.url, 'https://resource.fixture.invalid/font')
        assert.equal(request.headers.has('cookie'), false)
        assert.equal(request.headers.has('authorization'), false)
        resourceCalls++
        return new Response('resource-fixture')
      } },
    { name: 'caller', modules: true, compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      script: `export default { async fetch(request, env) { if (new URL(request.url).pathname === '/named') return env.RENDERER.fetch(request); return Response.json(await env.RENDERER.render(await request.json())); } }`,
      serviceBindings: { RENDERER: { name: 'renderer', entrypoint: 'BannerRenderer' } } },
    { name: 'renderer', modules: true, scriptPath: new URL('dist/index.js', root).pathname,
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      bindings: config.vars,
      serviceBindings: { BROWSER: async () => {
        launches++
        return Response.json({ error: 'synthetic unavailable' }, { status: 503 })
      } },
      outboundService: async () => {
        outbound++
        throw new Error('Unexpected outbound request')
      } }
  ]
})
try {
  await mf.ready
  const codecWorker = await mf.getWorker('codec')
  const resource = await codecWorker.fetch('https://codec.invalid/resource')
  assert.equal(resource.status, 200)
  assert.equal(await resource.text(), 'resource-fixture')
  assert.equal(resourceCalls, 1)
  const png = new PNG({ width: 2, height: 2 })
  png.data.fill(255)
  const encoded = await codecWorker.fetch('https://codec.invalid/', { method: 'POST', body: PNG.sync.write(png) })
  assert.equal(encoded.status, 200)
  const gif = new Uint8Array(await encoded.arrayBuffer())
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a')
  assert.equal(new DataView(gif.buffer).getUint16(6, true), 2)
  assert.equal(new DataView(gif.buffer).getUint16(8, true), 2)
  const worker = await mf.getWorker('renderer')
  assert.equal((await worker.fetch('https://renderer.invalid/')).status, 404)
  const caller = await mf.getWorker('caller')
  assert.equal((await caller.fetch('https://caller.invalid/named')).status, 404)
  const invoke = async value => (await caller.fetch('https://caller.invalid/', { method: 'POST', body: JSON.stringify(value) })).json()
  assert.equal((await invoke({})).error.code, 'INVALID_INPUT')
  assert.equal(launches, 0)
  const input = { version: 1, expectedEnvironment: 'production', requestId: 'runtime_proof', output: 'png', items: [{ key: 'tiny', width: 2, height: 2, scale: 1, html: '<html></html>' }] }
  assert.equal((await invoke({ ...input, expectedEnvironment: 'staging' })).error.code, 'UNAVAILABLE')
  assert.equal((await invoke(input)).error.code, 'BROWSER_UNAVAILABLE')
  assert.equal(launches, 1)
  assert.equal(outbound, 0)
  console.log(JSON.stringify({ proof: 'actual bundled Worker in workerd', defaultFetch: 404, namedFetch: 404, invalidInput: true, environmentIsolation: true, realPuppeteerBindingLaunches: launches, outboundRequests: outbound, browserRenderProof: false, actualWorkerdPngDecodeGifEncode: true, actualWorkerdResourceFetch: true }))
} finally { await mf.dispose() }

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBrandService } from './dist/brand-rpc.mjs'

const worker = readFileSync(new URL('./dist/worker.js', import.meta.url), 'utf8')
const section = worker.slice(worker.indexOf('// motorstack.mjs'), worker.indexOf('var handleMotorstack ='))
const native = new Function('__name', section + '\nreturn { createMotorstack, safeURL, extension, MIME, idFor, boundedBody, AdapterError }')((fn) => fn)
const source = 'https://motorstackmedia.driveagent.io/subaru/images/forester/hero.png'
const colour = 'https://motorstackmedia.driveagent.io/subaru/images/forester/white.png'

test('all models load hero images without requesting the heavy variants catalogue', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    if (url.includes('/api/mcp')) {
      const { name, arguments: args } = JSON.parse(options.body).params
      calls.push({ name, args })
      const data = name === 'list_oems' ? { oems: [{ oem: 'subaru', name: 'Subaru' }] }
        : name === 'get_media_library' ? { models: [{ model: 'Forester', heroImage: source, colours: [] }] }
          : name === 'get_variants' ? { vehicles: [{ model: 'Forester', colours: [{ name: 'White', main_photo_url: colour }] }] }
            : { offers: [] }
      return Response.json({ result: { structuredContent: data } })
    }
    return new Response('png', { headers: { 'Content-Type': 'image/png' } })
  }
  const adapter = native.createMotorstack({ fetcher })
  const api = createBrandService({ ...native, ...adapter, fetcher }, { MOTORSTACK_API_KEY: 'msk_test_fixture_only_0123456789' })
  const initial = await api.listMedia({ brandId: 'subaru' })
  assert.equal(initial.assets.length, 1)
  assert.equal(initial.warnings.length, 0)
  assert.equal(calls.some(call => call.name === 'get_variants'), false)
  const selected = await api.listMedia({ brandId: 'subaru', model: 'Forester' })
  assert.equal(selected.assets.length, 2)
  assert.deepEqual(calls.filter(call => call.name === 'get_variants').map(call => call.args), [{ oem: 'subaru', model: 'Forester', include_photos: true }])
})

test('preview requests reuse only the matching short-lived media catalogue', async () => {
  const cache = worker.slice(worker.indexOf('const mediaCatalogCache = new Map();'), worker.indexOf('// Private RPC only; the default HTTP handler above remains unchanged.'))
  const cachedMediaCatalog = new Function(cache + '\nreturn cachedMediaCatalog')()
  let calls = 0
  const catalogue = async (_key, brand, kind, model) => { calls++; return { brand, kind, model } }
  const first = cachedMediaCatalog(catalogue, 'credential-one')
  assert.deepEqual(await first('credential-one', 'subaru', 'media', ''), { brand: 'subaru', kind: 'media', model: '' })
  await first('credential-one', 'subaru', 'media', '')
  assert.equal(calls, 1)
  await first('credential-one', 'subaru', 'media', 'Forester')
  await first('credential-one', 'subaru', 'brand', '')
  assert.equal(calls, 3)
  await cachedMediaCatalog(catalogue, 'credential-two')('credential-two', 'subaru', 'media', '')
  assert.equal(calls, 4)
  await first('credential-one', 'subaru', 'media', '')
  assert.equal(calls, 5)
})

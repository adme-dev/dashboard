import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBrandService } from './dist/brand-rpc.mjs'

const source = readFileSync(new URL('./dist/worker.js', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('// motorstack.mjs'), source.indexOf('var handleMotorstack ='))
const native = new Function('__name', section + '\nreturn { createMotorstack, safeURL, extension, MIME, idFor, boundedBody, AdapterError }')((fn) => fn)
const key = 'msk_test_fixture_only_0123456789'
function service(provider) {
  const calls = []
  const fetcher = async (_url, options) => {
    const { name, arguments: args } = JSON.parse(options.body).params
    calls.push({ name, args })
    const data = name === 'list_oems' ? { oems: [{ oem: 'ford', name: 'Ford Australia' }] } : provider(name, args)
    return Response.json({ result: data?.content ? data : { structuredContent: data } })
  }
  const adapter = native.createMotorstack({ fetcher })
  return { api: createBrandService({ ...native, ...adapter, fetcher }, { MOTORSTACK_API_KEY: key }), adapter, calls }
}

test('long Ford terms survive the actual RPC adapter together with shorter offers and artwork', async () => {
  const disclaimer = 'Full source conditions. '.repeat(750)
  const { api } = service(() => ({ offers: [{ title: 'Fuel card', disclaimer }, { title: 'Wolftrak', disclaimer: 'While stocks last.', image_url: 'https://motorstackmedia.driveagent.io/ford/wolftrak.webp' }] }))
  const result = await api.listCreativeCatalog({ brandId: 'ford', kind: 'offers' })
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].disclaimer, disclaimer)
  assert.equal(result.items[1].disclaimer, 'While stocks last.')
  assert.match(result.items[1].artworkAssetId, /^[a-f0-9]{64}$/)
})

test('oversized, control-character and credential-containing source terms still fail closed', async () => {
  for (const disclaimer of ['x'.repeat(24001), 'Bad\u0000terms', 'Terms ' + key]) {
    const { api } = service(() => ({ offers: [{ title: 'Offer', disclaimer }] }))
    await assert.rejects(api.listCreativeCatalog({ brandId: 'ford', kind: 'offers' }), /invalid_motorstack_catalog/)
  }
})

test('truncated galleries recover the same model grade/paint heroes without silently claiming a full gallery', async () => {
  const { api, calls } = service((name, args) => {
    if (name === 'get_media_library') return { models: [{ model: 'Ranger' }] }
    if (name === 'get_variants' && args.include_photos) return { content: [{ type: 'text', text: '{"vehicles": [\n…[truncated at 200000 characters]' }] }
    return { vehicles: [{ model: 'Ranger', title: 'Ford Ranger XLT', colours: [{ name: 'Arctic White', main_photo_url: 'https://motorstackmedia.driveagent.io/ford/ranger/xlt/arctic-white.webp' }] }] }
  })
  const result = await api.listMedia({ brandId: 'ford', model: 'Ranger' })
  assert.ok(result.assets.some(asset => asset.name.includes('XLT') && asset.name.includes('Arctic White')))
  assert.ok(result.warnings.some(warning => warning.includes('Extra model gallery images')))
  assert.deepEqual(calls.filter(call => call.name === 'get_variants').map(call => call.args), [
    { oem: 'ford', model: 'Ranger', include_photos: true }, { oem: 'ford', model: 'Ranger', include_photos: false }
  ])
  assert.equal(JSON.stringify(result).includes(key), false)
})

test('complete model galleries are retained without a fallback request', async () => {
  const { api, calls } = service(name => name === 'get_media_library' ? { models: [{ model: 'Ranger' }] } : { vehicles: [{ model: 'Ranger', title: 'Ford Ranger XLT', colours: [{ name: 'Arctic White', photos: ['https://motorstackmedia.driveagent.io/ford/ranger/gallery.webp'] }] }] })
  const result = await api.listMedia({ brandId: 'ford', model: 'Ranger' })
  assert.equal(result.assets.length, 1)
  assert.deepEqual(result.warnings, [])
  assert.equal(calls.filter(call => call.name === 'get_variants').length, 1)
})

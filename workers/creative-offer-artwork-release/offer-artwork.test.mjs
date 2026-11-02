import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBrandService } from './dist/brand-rpc.mjs'

const worker = readFileSync(new URL('./dist/worker.js', import.meta.url), 'utf8')
const section = worker.slice(worker.indexOf('// motorstack.mjs'), worker.indexOf('var handleMotorstack ='))
const native = new Function('__name', section + '\nreturn { createMotorstack, safeURL, extension, MIME, idFor, boundedBody, AdapterError }')((fn) => fn)
const key = 'msk_test_fixture_only_0123456789'
const image = 'https://motorstackmedia.driveagent.io/subaru/offers/forester/default-hero.jpg'
const offer = { title: 'Forester offer', model: 'Forester', offer: 'Driveaway offer', end_date: '2026-11-30', disclaimer: 'Terms apply.', image_url: image }

function service(imageUrl = image) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url === 'https://oem-variants.pages.dev/api/mcp') {
      const { name } = JSON.parse(options.body).params
      const data = name === 'list_oems' ? { oems: [{ oem: 'subaru', name: 'Subaru Australia' }] }
        : name === 'get_offers' ? { offers: [{ ...offer, image_url: imageUrl }] }
          : name === 'get_media_library' ? { models: [] } : { vehicles: [] }
      return Response.json({ result: { structuredContent: data } })
    }
    return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } })
  }
  const adapter = native.createMotorstack({ fetcher })
  return { api: createBrandService({ ...native, ...adapter, fetcher }, { MOTORSTACK_API_KEY: key }), calls }
}

test('offer hero has the same opaque ID in the catalogue and importable media, with full terms', async () => {
  const { api, calls } = service()
  const catalog = await api.listCreativeCatalog({ brandId: 'subaru', kind: 'offers' })
  const item = catalog.items[0]
  assert.match(item.artworkAssetId, /^[a-f0-9]{64}$/)
  assert.equal(item.disclaimer, 'Terms apply.')
  assert.equal(JSON.stringify(catalog).includes(image), false)
  const media = await api.listMedia({ brandId: 'subaru' })
  const artwork = media.assets.find(asset => asset.id === item.artworkAssetId)
  assert.equal(artwork.importable, true)
  assert.equal(artwork.mime, 'image/jpeg')
  const file = await api.getMediaAsset({ brandId: 'subaru', assetId: item.artworkAssetId })
  assert.equal(file.headers.get('Content-Type'), 'image/jpeg')
  assert.equal(calls.at(-1).url, image)
  assert.equal(calls.at(-1).options.headers.Authorization, undefined)
})

test('an unsafe offer artwork URL stays unavailable and is never fetched', async () => {
  const { api, calls } = service('https://127.0.0.1/private.jpg')
  const catalog = await api.listCreativeCatalog({ brandId: 'subaru', kind: 'offers' })
  assert.equal(catalog.items[0].artworkAssetId, null)
  assert.equal((await api.listMedia({ brandId: 'subaru' })).assets.length, 0)
  assert.ok(calls.every(call => call.url === 'https://oem-variants.pages.dev/api/mcp'))
})

test('candidate preserves authenticated FigFlow routes, launcher and private binding surface', () => {
  const auth = worker.indexOf('const access = await authorize(request, env)')
  const rejected = worker.indexOf('if (!access.ok)', auth)
  const figflow = worker.indexOf('url.pathname.startsWith("/figflow/0.11.2-edm1/")')
  const library = worker.indexOf('url.searchParams.get("canvas") !== "1"')
  assert.ok(auth > 0 && auth < rejected && rejected < figflow && figflow < library)
  assert.equal(worker.includes('FIGFLOW_EDM_ASSETS'), true)
  assert.equal(worker.includes('MotorstackBrandAssets'), true)
})

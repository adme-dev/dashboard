import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBrandService } from './brand-rpc.mjs'

// Exercise the generated production adapter, including its existing HTTP surface.
const source = readFileSync(new URL('./dist/worker.js', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('// motorstack.mjs'), source.indexOf('var handleMotorstack ='))
const native = new Function('__name', section + '\nreturn { createMotorstack, safeURL, extension, MIME, idFor, boundedBody, AdapterError }')((fn) => fn)
const key = 'msk_test_fixture_only_0123456789'
const provider = 'https://oem-variants.pages.dev'
const cdn = 'https://motorstackmedia.driveagent.io'
const r2 = 'https://pub-150d4c02365b4ffe9e158d72b3b048a1.r2.dev'
const image300 = cdn + '/gwm/images/300/lux-diesel/fossil-grey-hero.png'
const imageH7 = cdn + '/gwm/images/h7/lux-hev/hamilton-white-hero-02eec89e.png'
// Reduced fields from get_media_library('gwm'), observed 31 October 2026.
const media = {
  brochures: [{ model: 'Tank 300', title: 'Tank 300 Brochure', url: r2 + '/gwm/documents/tank-300/tank-300-brochure.pdf' }],
  models: [{ model: '300', heroImage: image300, colours: [] }, { model: 'H7', heroImage: imageH7, colours: [] }]
}
function setup({ data = media, variants = { vehicles: [] }, assetResponse } = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url === provider + '/api/mcp') {
      const { name, arguments: args } = JSON.parse(options.body).params
      const result = name === 'list_oems' ? { oems: [{ oem: 'gwm', name: 'GWM' }, { oem: 'ford', name: 'Ford' }] }
        : name === 'get_variants' ? variants : args.oem === 'gwm' ? (typeof data === 'function' ? data(args) : data) : { models: [] }
      return Response.json({ result: { structuredContent: result } })
    }
    return assetResponse?.(url, options) ?? new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } })
  }
  const adapter = native.createMotorstack({ fetcher })
  const api = createBrandService({ ...native, ...adapter, fetcher }, { MOTORSTACK_API_KEY: key })
  const http = path => adapter.handleMotorstack(new Request('https://creative.xeroflow.io/__assets/motorstack/' + path), { MOTORSTACK_API_KEY: key })
  return { calls, api, adapter, http }
}

test('HTTP media catalog exposes observed CDN heroes only through opaque file routes', async () => {
  const { http } = setup()
  const response = await http('catalog?brand=gwm&kind=media')
  assert.equal(response.status, 200)
  const catalog = await response.json()
  assert.equal(catalog.assets.length, 3)
  const hero = catalog.assets.find(item => item.name.endsWith('300'))
  assert.equal(hero.mime, 'image/png'); assert.equal(hero.importable, true)
  assert.match(hero.url, /^\/__assets\/motorstack\/file\?brand=gwm&kind=media&id=[a-f0-9]{64}$/)
  assert.equal(hero.original, undefined)
  assert.equal(JSON.stringify(catalog).includes(cdn), false)
  const file = await http(hero.url.split('/__assets/motorstack/')[1])
  assert.equal(file.status, 200); assert.equal((await file.arrayBuffer()).byteLength, 4)
  assert.equal(file.headers.get('Cache-Control'), 'private, no-store')
})

test('exact HTTPS CDN only; lookalikes, credentials, ports and private hosts stay denied', () => {
  assert.equal(native.safeURL(image300).href, image300)
  for (const value of [image300.replace('https:', 'http:'), image300.replace('driveagent.io', 'driveagent.io.evil.example'), image300.replace('motorstackmedia.', 'other.'), image300.replace('https://', 'https://user:pass@'), image300.replace('.io/', '.io:8443/'), 'https://127.0.0.1/a.png', provider + '/api/private.png']) assert.equal(native.safeURL(value), null, value)
  assert.equal(native.safeURL(image300 + '?token=secret&width=400#x').href, image300 + '?width=400')
})

test('private media RPC keeps metadata URL-free and rebinds every file to brand/model', async () => {
  const { api, calls } = setup()
  const catalog = await api.listMedia({ brandId: 'gwm' })
  assert.deepEqual(Object.keys(catalog).sort(), ['assets', 'brand', 'models', 'schemaVersion', 'warnings'])
  assert.equal(catalog.assets.length, 3)
  assert.deepEqual(catalog.models, ['300', 'H7'])
  assert.equal(JSON.stringify(catalog).includes('https://'), false)
  assert.equal(JSON.stringify(catalog).includes(key), false)
  const hero = catalog.assets.find(item => item.name.endsWith('300'))
  const file = await api.getMediaAsset({ brandId: 'gwm', model: '300', assetId: hero.id })
  assert.equal(file.headers.get('Content-Type'), 'image/png')
  assert.equal(calls.at(-1).url, image300)
  assert.equal(calls.at(-1).options.headers.Authorization, undefined)
  const before = calls.filter(call => call.url !== provider + '/api/mcp').length
  await assert.rejects(api.getMediaAsset({ brandId: 'ford', assetId: hero.id }), /asset_not_found/)
  await assert.rejects(api.getMediaAsset({ brandId: 'gwm', model: 'H7', assetId: hero.id }), /asset_not_found/)
  assert.equal(calls.filter(call => call.url !== provider + '/api/mcp').length, before)
})

test('image model filtering normalizes formatting and preserves source labels without inventing aliases', async () => {
  const { api } = setup({ data: { ...media, brochures: [] }, variants: { vehicles: [{ model: 'H7', colours: [{ colour: 'Black', main_photo_url: cdn + '/gwm/images/h7/black.png' }] }] } })
  const selected = await api.listMedia({ brandId: 'gwm', model: 'h-7' })
  assert.equal(selected.assets.length, 2)
  assert.ok(selected.assets.every(item => item.mime === 'image/png'))
  assert.equal((await api.listMedia({ brandId: 'gwm', model: '300' })).assets.length, 1)
  assert.equal((await api.listMedia({ brandId: 'gwm', model: 'Tank 300' })).assets.length, 0)
})

test('retains Haval H7 brochure from provider-filtered H7 response without relaxing image matching', async () => {
  const { api } = setup({ data: args => {
    assert.equal(args.model, 'H7')
    return {
      brochures: [{ model: 'Haval H7', title: 'Haval H7 Brochure', url: r2 + '/gwm/documents/haval-h7/haval-h7-brochure.pdf' }],
      models: media.models
    }
  } })
  const result = await api.listMedia({ brandId: 'gwm', model: 'H7' })
  assert.equal(result.assets.length, 2)
  assert.equal(result.assets[0].name, 'Haval H7 Brochure')
  assert.equal(result.assets[0].mime, 'application/pdf')
  assert.equal(result.assets[0].importable, false)
  assert.deepEqual(result.models, ['H7'])
  assert.equal(result.assets[1].name.endsWith('H7'), true)
})

test('media RPC rejects extra keys and invalid IDs/models before any provider request', async () => {
  const { api, calls } = setup()
  for (const input of [null, [], {}, { brandId: 'gwm', url: image300 }, { brandId: '../gwm' }, { brandId: 'gwm', model: '' }, { brandId: 'gwm', model: null }, { brandId: 'gwm', model: 'x'.repeat(101) }, { brandId: 'gwm', model: 'H7\n' }]) await assert.rejects(api.listMedia(input), /invalid_media_query|invalid_brand_id/)
  await assert.rejects(api.getMediaAsset({ brandId: 'gwm', assetId: 'no' }), /invalid_asset_id/)
  await assert.rejects(api.getMediaAsset({ brandId: 'gwm', assetId: 'a'.repeat(64), url: image300 }), /invalid_media_query/)
  assert.equal(calls.length, 0)
})

test('credentials are recalculated per redirect and never reach media CDN or R2', async () => {
  const paths = [provider + '/api/logos/hero.png', image300, r2 + '/hero.png']
  const { adapter, calls } = setup({ assetResponse: url => paths.indexOf(url) < 2
    ? new Response(null, { status: 302, headers: { Location: paths[paths.indexOf(url) + 1] } })
    : new Response('png', { headers: { 'Content-Type': 'image/png' } }) })
  await adapter.binary(key, { original: paths[0], mime: 'image/png', name: 'Hero' })
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + key)
  assert.equal(calls[1].options.headers.Authorization, undefined)
  assert.equal(calls[2].options.headers.Authorization, undefined)
  assert.ok(calls.every(call => call.options.redirect === 'manual'))
})

test('CDN redirects cannot escape the allowlist or exceed three hops', async () => {
  for (const target of ['http://127.0.0.1/a.png', 'https://motorstackmedia.driveagent.io.evil.example/a.png', provider + '/api/private.png']) {
    const { adapter, calls } = setup({ assetResponse: () => new Response(null, { status: 302, headers: { Location: target } }) })
    await assert.rejects(adapter.binary(key, { original: image300, mime: 'image/png', name: 'Hero' }), /asset_host_not_supported/)
    assert.equal(calls.length, 1)
  }
  const { adapter, calls } = setup({ assetResponse: () => new Response(null, { status: 302, headers: { Location: image300 } }) })
  await assert.rejects(adapter.binary(key, { original: image300, mime: 'image/png', name: 'Hero' }), /asset_redirect_refused/)
  assert.equal(calls.length, 4)
})

test('CDN bytes retain MIME and size validation', async () => {
  for (const headers of [{ 'Content-Type': 'text/html' }, { 'Content-Type': 'image/png', 'Content-Length': String(33 * 1024 * 1024) }]) {
    const { api } = setup({ assetResponse: () => new Response('bad', { headers }) })
    const { assets } = await api.listMedia({ brandId: 'gwm', model: '300' })
    await assert.rejects(api.getMediaAsset({ brandId: 'gwm', model: '300', assetId: assets[0].id }), /asset_type_refused|provider_response_too_large/)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createMotorstack } from './motorstack.mjs'
const KEY = 'msk_test_only_not_a_real_key_1234567890'
const R2 = 'https://pub-150d4c02365b4ffe9e158d72b3b048a1.r2.dev'
const env = { MOTORSTACK_API_KEY: KEY }
const request = path => new Request('https://creative.xeroflow.io/__assets/motorstack/' + path)
const rpc = data => Response.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } })
function fixture({ slides, response, brands, rpcResponse } = {}) {
  const calls = []
  const adapter = createMotorstack({ fetcher: async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/api/mcp')) {
      assert.equal(options.headers.Authorization, 'Bearer ' + KEY)
      const body = JSON.parse(options.body)
      assert.equal(body.method, 'tools/call')
      assert.ok(['list_oems', 'get_webslides', 'get_media_library', 'get_brand_assets', 'get_variants'].includes(body.params.name))
      if (rpcResponse) return rpcResponse(body.params.name)
      if (body.params.name === 'list_oems') return rpc({ oems: brands ?? [{ oem: 'nissan', name: 'Nissan' }] })
      if (body.params.name === 'get_webslides') return rpc({ oem: 'nissan', slides: slides ?? [{ heading: 'Navara', desktop_url: R2 + '/nissan/hero.png' }] })
      if (body.params.name === 'get_variants') {
        assert.equal(body.params.arguments.include_photos, false)
        return rpc({ vehicles: [{ title: 'Navara ST', colours: [{ name: 'White', main_photo_url: R2 + '/nissan/white.png' }] }] })
      }
      if (body.params.name === 'get_media_library') return rpc({ brochures: [{ title: 'Nissan brochure', url: R2 + '/nissan/brochure.pdf' }], models: [{ model: 'Navara', heroImage: R2 + '/nissan/hero.png' }] })
      return rpc({ logos: [{ variant: 'Main logo', url: 'https://oem-variants.pages.dev/api/logos/nissan.svg?key=must-not-leak&v=1' }], fonts: { body: { family: 'Nissan Brand', weight: 400, url: 'https://oem-variants.pages.dev/api/fonts/nissan/font.woff2' } }, colours: { primary: '#C3002F', invalid: 'url(https://evil)' } })
    }
    return response ? response(url, options) : new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } })
  } })
  return { ...adapter, calls }
}
async function assetURL(adapter, kind = 'slides') {
  const r = await adapter.handleMotorstack(request('catalog?brand=nissan&kind=' + kind), env)
  assert.equal(r.status, 200)
  const data = await r.json()
  return { data, path: data.assets[0]?.url }
}

test('brands are projected from the current key without exposing key/provider payload', async () => {
  const a = fixture(); const r = await a.handleMotorstack(request('brands'), env)
  assert.deepEqual(await r.json(), { brands: [{ id: 'nissan', name: 'Nissan' }] })
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store')
})
test('all catalogue assets use private same-origin proxy URLs and safe metadata', async () => {
  const a = fixture(); const { data } = await assetURL(a, 'all')
  assert.equal(data.assets.length, 4)
  const body = JSON.stringify(data)
  assert.ok(!body.includes(KEY) && !body.includes('must-not-leak') && !body.includes(R2) && !body.includes('original'))
  assert.ok(data.assets.every(x => x.url.startsWith('/__assets/motorstack/file?')))
  assert.equal(data.assets.find(x => x.mime === 'image/svg+xml').importable, false)
  assert.deepEqual(data.colors, [{ name: 'primary', value: '#C3002F' }])
})
test('file fetch freshly checks brand membership and resolves catalogue id', async () => {
  const a = fixture(); const { path } = await assetURL(a)
  const before = a.calls.length
  const r = await a.handleMotorstack(new Request('https://creative.xeroflow.io' + path), env)
  assert.equal(r.status, 200); assert.equal(r.headers.get('Content-Type'), 'image/png')
  assert.ok(a.calls.slice(before).some(x => x.options.body?.includes('list_oems')))
  assert.ok(a.calls.slice(before).some(x => x.options.body?.includes('get_webslides')))
  assert.equal(a.calls.at(-1).options.headers.Authorization, undefined)
  assert.ok(r.headers.get('Content-Disposition').startsWith('attachment;'))
})
test('another brand is denied before any catalogue/file request', async () => {
  const a = fixture(); const r = await a.handleMotorstack(request('catalog?brand=toyota'), env)
  assert.equal(r.status, 403); assert.equal(a.calls.length, 1)
})
test('removed brand authority blocks a formerly issued file id', async () => {
  const a = fixture(); const { path } = await assetURL(a)
  const denied = fixture({ brands: [] })
  assert.equal((await denied.handleMotorstack(new Request('https://creative.xeroflow.io' + path), env)).status, 403)
})
test('browser URL/tool/key queries and unsupported methods never proxy', async () => {
  const a = fixture()
  for (const query of ['url=https://127.0.0.1/a.png', 'tool=delete_asset', 'key=secret']) assert.equal((await a.handleMotorstack(request('catalog?brand=nissan&' + query), env)).status, 400)
  assert.equal((await a.handleMotorstack(new Request(request('catalog').url, { method: 'POST' }), env)).status, 405)
  assert.equal(a.calls.length, 0)
})
test('missing provider key fails closed without network activity', async () => {
  const a = fixture(); assert.equal((await a.handleMotorstack(request('brands'), {})).status, 503); assert.equal(a.calls.length, 0)
})
test('malformed or oversized JSON and RPC errors become sanitized errors', async () => {
  for (const res of [() => new Response('{'), () => new Response('x', { headers: { 'Content-Length': '5000000' } }), () => Response.json({ error: { message: KEY } })]) {
    const a = fixture({ rpcResponse: res }); const r = await a.handleMotorstack(request('brands'), env)
    assert.equal(r.status, 502); assert.ok(!(await r.text()).includes(KEY))
  }
})
test('unsafe schemes, userinfo, private IPs, ports and unknown hosts are never emitted', async () => {
  for (const url of ['http://'+new URL(R2).hostname+'/a.png', 'https://127.0.0.1/a.png', 'https://[::1]/a.png', 'https://localhost/a.png', 'https://evil.example/a.png', 'https://u:p@'+new URL(R2).hostname+'/a.png', R2+':8443/a.png']) {
    const a = fixture({ slides: [{ desktop_url: url }] }); const { data } = await assetURL(a)
    assert.equal(data.assets.length, 0, url)
  }
})
test('catalogue and file IDs do not permit arbitrary resource substitution', async () => {
  const a = fixture(); const r = await a.handleMotorstack(request('file?brand=nissan&kind=slides&id='+'a'.repeat(64)), env)
  assert.equal(r.status, 404)
  assert.ok(a.calls.every(x => x.url.endsWith('/api/mcp')))
})
test('redirects to private or unrecognized hosts are refused without following', async () => {
  for (const target of ['https://127.0.0.1/private.png', 'https://evil.example/a.png']) {
    const a = fixture({ response: () => new Response(null, { status: 302, headers: { Location: target } }) }); const { path } = await assetURL(a)
    assert.equal((await a.handleMotorstack(new Request('https://creative.xeroflow.io'+path), env)).status, 502)
    assert.ok(a.calls.every(x => !x.url.startsWith(target)))
  }
})
test('provider Bearer is sent only to exact provider origin, never redirect CDN', async () => {
  const a = fixture({ response: (url, options) => {
    if (url.startsWith('https://oem-variants.pages.dev/')) { assert.equal(options.headers.Authorization, 'Bearer '+KEY); return new Response(null, { status: 302, headers: { Location: R2+'/nissan/logo.svg' } }) }
    assert.equal(options.headers.Authorization, undefined)
    return new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })
  } })
  const { data } = await assetURL(a, 'brand'); const asset = data.assets.find(x=>x.mime==='image/svg+xml')
  const r = await a.handleMotorstack(new Request('https://creative.xeroflow.io'+asset.url), env)
  assert.equal(r.status, 200); assert.ok(r.headers.get('Content-Security-Policy').includes('sandbox'))
  assert.ok(!a.calls.at(-2).url.includes('key='))
})
test('binary MIME mismatch and response size limits refuse unsafe output', async () => {
  for (const res of [() => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }), () => new Response('x', { headers: { 'Content-Type': 'image/png', 'Content-Length': String(33*1024*1024) } })]) {
    const a = fixture({ response: res }); const { path } = await assetURL(a)
    assert.equal((await a.handleMotorstack(new Request('https://creative.xeroflow.io'+path), env)).status, 502)
  }
})
test('unrelated paths are not handled', async () => {
  assert.equal(await fixture().handleMotorstack(new Request('https://creative.xeroflow.io/'), env), null)
})

test('selected models include bounded colour heroes without oversized gallery requests', async () => {
  const a = fixture()
  const r = await a.handleMotorstack(request('catalog?brand=nissan&kind=media&model=navara'), env)
  const data = await r.json()
  assert.equal(r.status, 200)
  assert.ok(data.assets.some(x => x.name.includes('White')))
  assert.ok(a.calls.some(x => x.options.body?.includes('get_variants')))
  assert.ok(a.calls.filter(x => x.options.body?.includes('get_variants')).every(x => JSON.parse(x.options.body).params.arguments.include_photos === false))
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { randomBytes, createHash } from 'node:crypto'
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

// Bundle the actual Worker and adapters; only generated build metadata is replaced.
const wasm = Buffer.from('\0asm\x01\0\0\0')
const encoded = brotliCompressSync(wasm)
const fixturePath = '/photoflow/v1/editor.wasm'
const result = await build({ entryPoints: [fileURLToPath(new URL('./worker.mjs', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', plugins: [{ name: 'generated-fixtures', setup(b) {
  b.onResolve({ filter: /(?:compressed|app-routes)\.json$/ }, args => ({ path: args.path, namespace: 'fixtures' }))
  b.onLoad({ filter: /.*/, namespace: 'fixtures' }, args => ({ loader: 'json', contents: JSON.stringify(args.path.includes('compressed') ? { [fixturePath]: fixturePath + '.br' } : { '/photoflow/': '/photoflow/v1/' }) }))
} }] })
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const origin = 'https://creative.xeroflow.io'
const emails = ['paul@adme.net.au', 'robert@adme.net.au', 'tina@adme.net.au', 'kristi@adme.net.au']
function harness(t) {
  const original = globalThis.fetch
  const calls = [], assets = [], provider = []
  const users = new Map(emails.map((email, i) => ['test-jwt-' + i, { id: 'test-user-' + i, email, is_active: true }]))
  let override
  globalThis.fetch = async (url, init) => {
    if (url === 'https://oem-variants.pages.dev/api/mcp') {
      provider.push(init)
      assert.equal(init.headers.Authorization, 'Bearer msk_' + 'x'.repeat(24))
      return Response.json({ result: { structuredContent: { oems: [{ oem: 'test', name: 'Test' }] } } })
    }
    assert.equal(url, 'https://app.xeroflow.io/api/auth/me', 'No unexpected network request')
    calls.push(init)
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'manual')
    assert.equal(init.headers['Cache-Control'], 'no-cache')
    assert.equal(init.headers.Cookie, undefined)
    if (override) return override()
    const user = users.get(init.headers.Authorization?.slice(7))
    return user ? Response.json({ success: true, user }) : new Response(null, { status: 401 })
  }
  t.after(() => { globalThis.fetch = original })
  const env = { CREATIVE_AUTH_KEY: randomBytes(32).toString('base64url'), MOTORSTACK_API_KEY: 'msk_' + 'x'.repeat(24), ASSETS: { fetch: async request => {
    const url = new URL(request.url); assets.push(url)
    return new Response(url.pathname.endsWith('.br') ? encoded : url.pathname.endsWith('/sw.js') ? 'self.addEventListener("activate",()=>self.registration.unregister())' : 'fixture asset', { headers: { 'Cache-Control': 'public, max-age=31536000', 'Content-Length': '999' } })
  } } }
  const request = (path, { token, host = origin, headers = {}, method = 'GET' } = {}) => worker.fetch(new Request(host + path, { method, headers: { ...(token ? { Cookie: '__Host-xf_creative_session=' + token } : {}), ...headers } }), env)
  return { env, request, users, calls, assets, provider, override: value => { override = value } }
}

test('anonymous editor code, binaries, HTML and Motorstack cannot reach backing services', async t => {
  const h = harness(t)
  for (const path of ['/photoflow/v1/editor.js', fixturePath, fixturePath + '.br', '/photoflow/v1/index.html', '/__assets/motorstack/brands', '/editor-apps.json']) {
    const response = await h.request(path)
    assert.equal(response.status, 401, path)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  }
  const forged = await h.request('/photoflow/v1/?auth_status=authorized&email=paul%40adme.net.au&token=test-jwt-0', { headers: { Authorization: 'Bearer test-jwt-0', 'X-User-Email': emails[0], 'X-Auth-Status': 'authorized', Cookie: 'auth_token=test-jwt-0' } })
  assert.equal(forged.status, 401)
  assert.equal(h.assets.length, 0); assert.equal(h.provider.length, 0); assert.equal(h.calls.length, 0)
  const nav = await h.request('/photoflow/v1/?project=1', { headers: { 'Sec-Fetch-Dest': 'document' } })
  assert.equal(nav.status, 303)
  const login = new URL(nav.headers.get('Location'))
  assert.equal(login.pathname, '/__auth/start'); assert.equal(login.searchParams.get('return'), '/photoflow/v1/?project=1')
})

test('public sharing, app manifests and retirement SW do not require identity', async t => {
  const h = harness(t)
  for (const path of ['/', '/social-preview.png', '/xeroflow-icon-192.png', '/manifest.webmanifest', '/photoflow/manifest.webmanifest', '/effectflow/v1/sw.js']) {
    const response = await h.request(path)
    assert.equal(response.status, 200, path)
    if (path.endsWith('/sw.js')) { assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.match(await response.text(), /unregister/) }
  }
  assert.equal(h.assets.length, 6); assert.equal(h.calls.length, 0)
})

test('each allowed account is verified afresh for every private asset and Motorstack request', async t => {
  const h = harness(t)
  for (let i = 0; i < emails.length; i++) {
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await h.request('/photoflow/v1/editor.js', { token: 'test-jwt-' + i })
      assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    }
  }
  assert.equal(h.calls.length, 8); assert.equal(h.assets.length, 8)
  const response = await h.request('/__assets/motorstack/brands', { token: 'test-jwt-0' })
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(await response.json(), { brands: [{ id: 'test', name: 'Test' }] })
  assert.equal(h.calls.length, 9); assert.equal(h.provider.length, 1)
})

test('revocation, unknown email, inactive users, authority outage and absent key fail closed', async t => {
  const h = harness(t)
  const options = { token: 'test-jwt-0' }
  assert.equal((await h.request('/private.js', options)).status, 200)
  h.users.delete('test-jwt-0')
  assert.equal((await h.request('/private.js', options)).status, 401)
  for (const user of [{ id: 'test', email: 'other@example.com', is_active: true }, { id: 'test', email: emails[0], is_active: false }]) {
    h.users.set('test-jwt-0', user)
    assert.equal((await h.request('/private.js', options)).status, 403)
  }
  h.override(() => new Response(null, { status: 503 }))
  assert.equal((await h.request('/__assets/motorstack/brands', options)).status, 503)
  delete h.env.CREATIVE_AUTH_KEY
  assert.equal((await h.request('/private.js', options)).status, 503)
  assert.equal(h.assets.length, 1); assert.equal(h.provider.length, 0)
})

test('stable app redirect preserves query; compressed WASM bytes remain private and unchanged', async t => {
  const h = harness(t)
  const redirect = await h.request('/photoflow/?project=test', { token: 'test-jwt-0' })
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.get('Location'), origin + '/photoflow/v1/?project=test')
  const response = await h.request(fixturePath + '?cachebust=1', { token: 'test-jwt-0' })
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Encoding'), 'br')
  assert.equal(response.headers.get('Content-Type'), 'application/wasm')
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('Content-Length'), null)
  const body = Buffer.from(await response.arrayBuffer())
  assert.deepEqual(body, encoded)
  const hash = value => createHash('sha256').update(value).digest('hex')
  assert.equal(hash(brotliDecompressSync(body)), hash(wasm))
  assert.equal(h.assets[0].pathname, fixturePath + '.br'); assert.equal(h.assets[0].search, '')
})

test('unsupported origins are refused even for public files; legacy creative origin remains gated', async t => {
  const h = harness(t)
  for (const path of ['/', '/social-preview.png', '/private.js', '/effectflow/v1/sw.js']) assert.equal((await h.request(path, { host: 'https://attacker.example', token: 'test-jwt-0' })).status, 403)
  assert.equal(h.assets.length, 0); assert.equal(h.calls.length, 0)
  assert.equal((await h.request('/private.js', { host: 'https://xeroflow-craft-editors.adme-dev.workers.dev' })).status, 401)
  assert.equal((await h.request('/private.js', { host: 'https://xeroflow-craft-editors.adme-dev.workers.dev', token: 'test-jwt-0' })).status, 200)
})

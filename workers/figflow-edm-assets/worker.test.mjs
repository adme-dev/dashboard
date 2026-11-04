import assert from 'node:assert/strict'
import test from 'node:test'
import worker, { PREFIX } from './worker.mjs'
import { validateTarget } from './deploy.mjs'
import { readFileSync } from 'node:fs'

test('native assets have no public route and reject other creative paths', async () => {
  const config = JSON.parse(readFileSync(new URL('./wrangler.json', import.meta.url)))
  validateTarget(config)
  assert.throws(() => validateTarget({ ...config, workers_dev: true }))
  let calls = 0
  const env = { ASSETS: { fetch: async () => { calls++; return new Response('native') } } }
  for (const url of ['https://creative.xeroflow.io/', 'https://creative.xeroflow.io/figflow/0.11.2-flow1/other', 'https://other.example' + PREFIX, 'https://creative.xeroflow.io' + PREFIX + '%2e%2e/private']) {
    assert.equal((await worker.fetch(new Request(url), env)).status, 404)
  }
  assert.equal((await worker.fetch(new Request('https://creative.xeroflow.io' + PREFIX, { method: 'POST' }), env)).status, 405)
  assert.equal(calls, 0)
})

test('library shell keeps the old canvas mounted and uses the authenticated app library', async () => {
  let calls = 0
  const response = await worker.fetch(new Request('https://creative.xeroflow.io/figflow/0.11.2-flow1/'), { ASSETS: { fetch: () => { calls++; throw Error('unexpected asset read') } } })
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.equal(calls, 0)
  assert.match(html, /href="#email-templates"/)
  assert.match(html, /src="\/figflow\/0.11.2-flow1\/\?canvas=1"/)
  assert.match(html, /src="https:\/\/app.xeroflow.io\/agency\/email\?tab=templates&amp;workspace=figflow"/)
  assert.match(html, /visibility:hidden/)
  assert.doesNotMatch(html, /<script|postMessage|auth_token/)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/)
})

test('serves only the immutable package without forwarding staff credentials', async () => {
  const request = new Request('https://creative.xeroflow.io' + PREFIX + 'index.html?ignored=true', { headers: { cookie: 'private', authorization: 'Bearer private' } })
  const response = await worker.fetch(request, { ASSETS: { fetch: async request => {
    assert.equal(new URL(request.url).search, '')
    assert.equal(request.headers.get('cookie'), null)
    assert.equal(request.headers.get('authorization'), null)
    return new Response('<main>Native</main>', { headers: { 'content-type': 'text/html' } })
  } } })
  assert.equal(response.headers.get('cache-control'), 'private, max-age=31536000, immutable')
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'self' https://app.xeroflow.io")
  assert.equal(await response.text(), '<main>Native</main>')
})

test('all retained versions are bounded, immutable only on success, and shell stays uncached', async () => {
  for (const version of ['edm1', 'edm3', 'edm4']) {
    for (const status of [200, 404, 500]) {
      const response = await worker.fetch(new Request(`https://creative.xeroflow.io/figflow/0.11.2-${version}/editor.wasm`, { method: 'HEAD' }), { ASSETS: { fetch: async () => new Response('asset', { status }) } })
      assert.equal(response.headers.get('cache-control'), status === 200 ? 'private, max-age=31536000, immutable' : 'private, no-store')
      assert.equal(await response.text(), '')
    }
  }
  for (const path of ['/figflow/0.11.2-edm40/', '/figflow/0.11.2-edm2/', '/figflow/0.11.2-edm4/%2fsecret']) {
    assert.equal((await worker.fetch(new Request('https://creative.xeroflow.io' + path), { ASSETS: { fetch: () => { throw Error('unexpected') } } })).status, 404)
  }
})

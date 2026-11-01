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
  for (const url of ['https://creative.xeroflow.io/', 'https://creative.xeroflow.io/figflow/0.11.2-flow1/', 'https://other.example' + PREFIX, 'https://creative.xeroflow.io' + PREFIX + '%2e%2e/private']) {
    assert.equal((await worker.fetch(new Request(url), env)).status, 404)
  }
  assert.equal((await worker.fetch(new Request('https://creative.xeroflow.io' + PREFIX, { method: 'POST' }), env)).status, 405)
  assert.equal(calls, 0)
})

test('serves only the immutable package without forwarding staff credentials', async () => {
  const request = new Request('https://creative.xeroflow.io' + PREFIX + 'index.html?ignored=true', { headers: { cookie: 'private', authorization: 'Bearer private' } })
  const response = await worker.fetch(request, { ASSETS: { fetch: async request => {
    assert.equal(new URL(request.url).search, '')
    assert.equal(request.headers.get('cookie'), null)
    assert.equal(request.headers.get('authorization'), null)
    return new Response('<main>Native</main>', { headers: { 'content-type': 'text/html' } })
  } } })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'self' https://app.xeroflow.io")
  assert.equal(await response.text(), '<main>Native</main>')
})

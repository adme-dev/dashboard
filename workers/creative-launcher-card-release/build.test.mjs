import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const load = async path => import(`data:text/javascript;base64,${readFileSync(path).toString('base64')}`)
const original = (await load(join(root, 'source/worker.js'))).default
const candidate = (await load(join(root, 'dist/worker.js'))).default
const cover = readFileSync(join(root, 'assets/banner-studio.webp'))
const assets = []
const env = { ASSETS: { fetch: async request => {
  assets.push(new URL(request.url).pathname)
  return new Response('existing asset', { headers: { 'Content-Type': 'text/plain' } })
} } }
const request = (worker, path, method = 'GET', host = 'https://creative.xeroflow.io') =>
  worker.fetch(new Request(host + path, { method }), env)

test('launcher has the seventh matching card and accurate copy', async () => {
  const response = await request(candidate, '/')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8')
  const html = await response.text()
  assert.equal(html.match(/class="editor"/g)?.length, 7)
  assert.match(html, /7 tools · One creative workspace/)
  assert.match(html, /href="https:\/\/app\.xeroflow\.io\/creative\/banner-studio"/)
  assert.match(html, /src="\/images\/banner-studio\.webp"/)
  assert.match(html, /Banner Studio saves its projects in XeroFlow/)
  assert.equal((await request(candidate, '/index.html')).status, 200)
  assert.equal((await request(candidate, '/', 'HEAD')).body, null)
})

test('cover is public, byte identical, and has an image content type', async () => {
  const response = await request(candidate, '/images/banner-studio.webp')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), cover)
  assert.equal((await request(candidate, '/images/banner-studio.webp', 'HEAD')).body, null)
})

test('existing public assets and private editor access retain their behavior', async () => {
  assets.length = 0
  const originalPublic = await request(original, '/starfield.js')
  const candidatePublic = await request(candidate, '/starfield.js')
  assert.equal(await candidatePublic.text(), await originalPublic.text())
  assert.deepEqual(assets, ['/starfield.js', '/starfield.js'])
  const privatePath = '/photoflow/0.16.0-flow1/index.html'
  const originalPrivate = await request(original, privatePath)
  const candidatePrivate = await request(candidate, privatePath)
  assert.equal(candidatePrivate.status, originalPrivate.status)
  assert.equal(await candidatePrivate.text(), await originalPrivate.text())
  const legacy = await request(candidate, '/', 'GET', 'https://xeroflow-craft-editors.adme-dev.workers.dev')
  assert.equal(legacy.status, 302)
  assert.equal(legacy.headers.get('location'), 'https://creative.xeroflow.io/')
})

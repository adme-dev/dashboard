import { createServer } from 'node:http'
import { once } from 'node:events'
import { createApp, eventHandler, toNodeListener } from 'h3'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

const { authenticate, writeAccess, rateLimit, service } = vi.hoisted(() => ({ authenticate: vi.fn(), writeAccess: vi.fn(), rateLimit: vi.fn(), service: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: authenticate, requireWriteAccess: writeAccess }))
vi.mock('~~/server/utils/rateLimit', () => ({ enforceRateLimit: rateLimit }))
import prepare from '../../server/api/agency/banner-studio/import/prepare.post'

const app = createApp()
app.use(eventHandler((event) => {
  event.context.cloudflare = { env: { THEBRIEF_IMPORT: { fetch: service } } } as never
}))
app.use(prepare)
const server = createServer(toNodeListener(app))
let url: string
beforeAll(async () => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  authenticate.mockResolvedValue({ id: 'actor' })
  writeAccess.mockResolvedValue({ id: 'actor' })
  rateLimit.mockResolvedValue(undefined)
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())) })

it('streams original ZIP bytes through the authenticated route and preserves response status', async () => {
  const original = new Uint8Array([0x50, 0x4b, 3, 4, 0, 255, 1])
  service.mockImplementationOnce(async (request: Request) => {
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(original)
    expect(request.headers.get('x-thebrief-filename')).toBe('Designs-HTML.zip')
    return new Response('{"packages":[],"issues":[]}', { status: 200, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } })
  })
  const result = await fetch(url, { method: 'POST', body: original, headers: { 'content-type': 'application/zip', 'x-thebrief-filename': 'Designs-HTML.zip' } })
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ packages: [], issues: [] })
  expect(result.headers.get('cache-control')).toBe('no-store')
  expect(rateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: 'thebrief-zip:actor', failureMode: 'closed' }))
})

it('rejects read-only users before reaching conversion', async () => {
  service.mockClear()
  writeAccess.mockRejectedValueOnce(Object.assign(new Error('Read-only access'), { statusCode: 403 }))
  expect((await fetch(url, { method: 'POST', body: 'PK', headers: { 'content-type': 'application/zip' } })).status).toBe(403)
  expect(service).not.toHaveBeenCalled()
})

it('rejects other content types and forwards actionable converter errors', async () => {
  service.mockClear()
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(415)
  expect(service).not.toHaveBeenCalled()
  service.mockResolvedValueOnce(new Response('{"message":"Unsafe ZIP path"}', { status: 422, headers: { 'content-type': 'application/json' } }))
  const result = await fetch(url, { method: 'POST', body: 'PK', headers: { 'content-type': 'application/zip' } })
  expect(result.status).toBe(422)
  expect(await result.json()).toEqual({ message: 'Unsafe ZIP path' })
})

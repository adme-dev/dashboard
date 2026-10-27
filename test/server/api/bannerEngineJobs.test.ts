import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { createApp, toNodeListener, type EventHandler } from 'h3'

const m = vi.hoisted(() => ({ auth: vi.fn(), write: vi.fn(), rate: vi.fn(), submit: vi.fn(), status: vi.fn(), cancel: vi.fn(), output: vi.fn(), service: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireWriteAccess: m.write }))
vi.mock('~~/server/utils/rateLimit', () => ({ enforceRateLimit: m.rate }))
vi.mock('~~/server/utils/banner/engineJobs', () => ({ engineJobAuthority: () => m }))
const submit = (await import('../../../server/api/agency/banner-studio/engine-jobs/index.post')).default
const internal = (await import('../../../server/api/internal/banner-engine.post')).default
const cap = { engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview', inputMimeType: 'application/x-photocraft', executableSha256: 'b'.repeat(64), capabilityProofSha256: 'c'.repeat(64) }
const env = { BANNER_ENGINE_ENABLED: 'true', BANNER_ENGINE_CAPABILITIES: JSON.stringify([cap]), BANNER_ENGINE_SERVICE_TOKEN: 'a'.repeat(64), BANNER_ENGINE_ALLOW_LOOPBACK: 'true', BANNER_ENGINE_BUCKET: { get() { }, put() { } } }
async function serve(handler: EventHandler, run: (url: string) => Promise<void>) {
  const app = createApp()
  app.use((event) => {
    event.context.cloudflare = { env }
  })
  app.use(handler)
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as {
    port: number
  }
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  m.write.mockResolvedValue({ id: 'owner' })
  m.auth.mockResolvedValue({ id: 'owner' })
  m.submit.mockResolvedValue({ status: 'queued' })
  m.service.mockResolvedValue({ request: null })
})
describe('engine jobs HTTP entrypoints', () => {
  it('requires user write permission before reading submitted body and uses private error headers', async () => {
    m.write.mockRejectedValue({ statusCode: 403, statusMessage: 'Forbidden' })
    await serve(submit, async (url) => {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' })
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(m.submit).not.toHaveBeenCalled()
    })
  })
  it('accepts bounded JSON after write auth and fail-closed rate limit', async () => {
    await serve(submit, async (url) => {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"example":1}' })
      expect(response.status).toBe(200)
      expect(m.submit).toHaveBeenCalledWith({ id: 'owner' }, { example: 1 })
      expect(m.rate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failureMode: 'closed' }))
    })
  })
  it('requires service bearer token before parsing or invoking authority', async () => {
    await serve(internal, async (url) => {
      const denied = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"claim"}' })
      expect(denied.status).toBe(401)
      expect(m.service).not.toHaveBeenCalled()
      const ok = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${'a'.repeat(64)}` }, body: '{"action":"claim"}' })
      expect(ok.status).toBe(200)
      expect(m.auth).not.toHaveBeenCalled()
    })
  })
  it('rejects compressed and malformed bodies without leaking content', async () => {
    await serve(submit, async (url) => {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: 'secret' })
      expect(response.status).toBe(415)
      expect(await response.text()).not.toContain('secret')
    })
  })
  it('sanitizes infrastructure failures instead of exposing database/storage details', async () => {
    m.submit.mockRejectedValue(new Error('SQL credential: secret-token'))
    await serve(submit, async (url) => {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      expect(response.status).toBe(503)
      expect(await response.text()).not.toContain('secret-token')
    })
  })
})

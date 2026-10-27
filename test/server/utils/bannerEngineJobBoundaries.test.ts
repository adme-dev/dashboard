import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { readEngineJobStream, createEngineJobStorage } from '../../../server/utils/banner/engineJobStorage'
import { engineJobConfig, assertEngineServiceAuth, readEngineJobJson } from '../../../server/utils/banner/engineJobHttp'
import type { H3Event } from 'h3'

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const stream = (...parts: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(c) {
  parts.forEach(p => c.enqueue(p))
  c.close()
} })
const event = (env = {}, url = 'https://engine.example/api/internal/banner-engine', token = 'a'.repeat(64)) => ({
  context: { cloudflare: { env } }, web: { request: new Request(url) },
  node: { req: { headers: { authorization: `Bearer ${token}` }, socket: { remoteAddress: '127.0.0.1' } } }
}) as unknown as H3Event
const capability = { engine: { id: 'photocraft', version: '0.16.0' }, operation: 'render-preview', inputMimeType: 'application/x-photocraft', executableSha256: 'b'.repeat(64), capabilityProofSha256: 'c'.repeat(64) }
const bucket = () => ({ get: vi.fn(), put: vi.fn().mockResolvedValue({ etag: 'stored' }) })
const config = () => ({ BANNER_ENGINE_ENABLED: 'true', BANNER_ENGINE_SERVICE_TOKEN: 'a'.repeat(64), BANNER_ENGINE_CAPABILITIES: JSON.stringify([capability]), BANNER_ENGINE_BUCKET: bucket() })
describe('engine job private boundaries', () => {
  it('bounds actual streaming bytes and cancels overflowing input', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ start(c) {
      c.enqueue(Buffer.alloc(5))
      c.enqueue(Buffer.alloc(5))
    }, cancel })
    await expect(readEngineJobStream(body, 8)).rejects.toMatchObject({ statusCode: 413 })
    expect(cancel).toHaveBeenCalledOnce()
    expect(await readEngineJobStream(stream(Buffer.from('ab'), Buffer.from('cd')), 4)).toEqual(Buffer.from('abcd'))
  })
  it('rejects a lying content length using actual native request stream bytes', async () => {
    const value = event()
    value.node.req.headers['content-type'] = 'application/json'
    value.node.req.headers['content-length'] = '2'
    value.web = { request: new Request('https://engine.example', { method: 'POST', body: '{"large":123456789}' }) } as typeof value.web
    await expect(readEngineJobJson(value, 8)).rejects.toMatchObject({ statusCode: 413 })
  })
  it('bounds a stalled stream by time and cancels the producer', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const pending = readEngineJobStream(new ReadableStream({ cancel }), 8)
    const rejected = expect(pending).rejects.toMatchObject({ statusCode: 408 })
    await vi.advanceTimersByTimeAsync(30000)
    await rejected
    expect(cancel).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
  it('requires dedicated private binding, enabled configuration and capability pins', () => {
    expect(() => engineJobConfig(event())).toThrow()
    expect(() => engineJobConfig(event({ ...config(), BANNER_ENGINE_BUCKET: undefined, MEDIA_BUCKET: bucket() }))).toThrow()
    expect(() => engineJobConfig(event({ ...config(), BANNER_ENGINE_CAPABILITIES: '[]' }))).toThrow()
    expect(engineJobConfig(event(config())).capabilities).toEqual([capability])
  })
  it('binding disabled value overrides enabled process fallback', () => {
    vi.stubEnv('BANNER_ENGINE_ENABLED', 'true')
    expect(() => engineJobConfig(event({ ...config(), BANNER_ENGINE_ENABLED: 'false' }))).toThrow()
    vi.unstubAllEnvs()
  })
  it('requires bearer identity and actual TLS; forwarded headers cannot upgrade HTTP', () => {
    const good = event(config())
    expect(() => assertEngineServiceAuth(good, engineJobConfig(good))).not.toThrow()
    expect(() => assertEngineServiceAuth(event(config(), undefined, 'x'.repeat(64)), engineJobConfig(good))).toThrow()
    const plain = event(config(), 'http://engine.example/api/internal/banner-engine')
    plain.node.req.headers['x-forwarded-proto'] = 'https'
    expect(() => assertEngineServiceAuth(plain, engineJobConfig(good))).toThrow()
    const local = event(config(), 'http://127.0.0.1/api/internal/banner-engine')
    expect(() => assertEngineServiceAuth(local, engineJobConfig(good))).toThrow()
  })
  it('writes objects exclusively and never overwrites or deletes collisions', async () => {
    const binding = bucket()
    const storage = createEngineJobStorage(binding)
    const bytes = Buffer.from('native')
    await storage.put('engine-jobs/a/input/b', bytes, 'application/x-photocraft')
    expect(binding.put).toHaveBeenCalledWith('engine-jobs/a/input/b', bytes, expect.objectContaining({ onlyIf: { etagDoesNotMatch: '*' } }))
    binding.put.mockResolvedValue(null)
    await expect(storage.put('engine-jobs/a/input/b', bytes, 'application/x-photocraft')).rejects.toThrow()
  })
  it('rejects absent or precondition-only objects without a body', async () => {
    const binding = bucket(), storage = createEngineJobStorage(binding)
    binding.get.mockResolvedValue({ size: 6 })
    await expect(storage.get('engine-jobs/a/input/b', { bytes: 6, sha256: hash(Buffer.from('native')) })).rejects.toMatchObject({ statusCode: 409 })
    binding.get.mockResolvedValue(null)
    await expect(storage.get('engine-jobs/a/input/b', { bytes: 6, sha256: hash(Buffer.from('native')) })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('checks private reads against durable size and actual digest', async () => {
    const binding = bucket(), bytes = Buffer.from('native')
    const storage = createEngineJobStorage(binding)
    binding.get.mockResolvedValue({ size: bytes.length, body: stream(bytes) })
    expect(await storage.get('engine-jobs/a/input/b', { bytes: bytes.length, sha256: hash(bytes) })).toEqual(bytes)
    binding.get.mockResolvedValue({ size: bytes.length, body: stream(Buffer.from('tamper')) })
    await expect(storage.get('engine-jobs/a/input/b', { bytes: bytes.length, sha256: hash(bytes) })).rejects.toThrow()
  })
})

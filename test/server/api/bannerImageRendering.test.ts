import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { createHash } from 'node:crypto'
import { encode } from 'jpeg-js'
import { createRequire } from 'node:module'
import type { H3Event } from 'h3'
import type { BannerRenderRequest, BannerRenderedItem } from '#shared/bannerRenderContract'

const { GIFEncoder } = createRequire(import.meta.url)('gifenc') as {
  GIFEncoder(): { writeFrame(data: Uint8Array, width: number, height: number, options: { palette: number[][], delay: number }): void, finish(): void, bytes(): Uint8Array }
}
vi.mock('h3', async actual => ({ ...await actual<typeof import('h3')>(), readBody: (event: { body: unknown }) => event.body }))

const mocks = vi.hoisted(() => ({ auth: vi.fn(), write: vi.fn(), fresh: vi.fn(), insert: vi.fn(), client: vi.fn(), all: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.fresh, queryOne: mocks.insert }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.client, hasAllSocialClientAccess: mocks.all }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', (event: { body: unknown }) => event.body)
const image = (await import('~~/server/api/agency/banner-studio/export-image.post')).default
const gif = (await import('~~/server/api/agency/banner-studio/export-gif.post')).default
const download = (await import('~~/server/api/agency/banner-studio/exports/[id]/download.get')).default
const PROJECT = '11111111-1111-4111-8111-111111111111'
const format = (key = 'square') => ({ key, html: '<html><body>unsaved text</body></html>', width: 2, height: 3 })
const body = () => ({ projectId: PROJECT, formats: [format()], quality: 1, format: 'png' })

function result(request: BannerRenderRequest) {
  return { version: 1, ok: true, value: { items: request.items.map((item): BannerRenderedItem => {
    const width = item.width * item.scale
    const height = item.height * item.scale
    let bytes: Uint8Array
    if (request.output === 'jpeg') bytes = encode({ width, height, data: Buffer.alloc(width * height * 4) }, request.jpegQuality).data
    else if (request.output === 'gif') {
      const encoder = GIFEncoder()
      for (let frame = 0; frame < 2; frame++) encoder.writeFrame(new Uint8Array(width * height), width, height, { palette: [[255, 0, 0], [0, 0, 255]], delay: Math.round(100 / request.fps!) * 10 })
      encoder.finish()
      bytes = encoder.bytes()
    } else bytes = PNG.sync.write(new PNG({ width, height }))
    return { key: item.key, output: request.output, mime: request.output === 'jpeg' ? 'image/jpeg' : request.output === 'gif' ? 'image/gif' : 'image/png', width: item.width, height: item.height,
      pixelWidth: width, pixelHeight: height, frames: request.output === 'gif' ? 2 : 1,
      ...(request.output === 'gif' ? { frameDelayMs: Math.round(100 / request.fps!) * 10, durationSec: 2 / request.fps! } : {}),
      bytes: new Uint8Array(bytes), byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }) } }
}
function fixture(input: unknown = body()) {
  const renderer = { render: vi.fn(async (request: BannerRenderRequest) => result(request)) }
  const bucket = { put: vi.fn(async (_key: string, _bytes: Uint8Array, _options: unknown) => ({})), delete: vi.fn(async (_key: string) => {}), get: vi.fn(), head: vi.fn() }
  const event = { body: input, context: { cloudflare: { env: { BANNER_RENDERER_PRODUCTION: renderer, MEDIA_BUCKET: bucket } } } } as unknown as H3Event
  return { event, renderer, bucket }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'user-1' })
  mocks.write.mockResolvedValue({ id: 'user-1' })
  mocks.fresh.mockResolvedValue({ id: PROJECT, client_id: null, created_by: 'user-1' })
  mocks.insert.mockImplementation(async (_sql: string, values: unknown[]) => ({ id: values[0] }))
  mocks.client.mockResolvedValue({ id: 'user-1' })
  mocks.all.mockReturnValue(false)
})

describe('private Pages image rendering', () => {
  it.each([image, gif])('rejects read-only callers before RPC/storage', async (handler) => {
    mocks.write.mockRejectedValueOnce(Object.assign(new Error('readonly'), { statusCode: 403 }))
    const f = fixture()
    await expect(handler(f.event)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.renderer.render).not.toHaveBeenCalled()
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('rejects cross-client requests before RPC/storage', async () => {
    mocks.fresh.mockResolvedValue({ client_id: 'foreign', created_by: 'user-1' })
    mocks.client.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    const f = fixture()
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.renderer.render).not.toHaveBeenCalled()
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('rejects foreign agency projects but allows all-client staff', async () => {
    mocks.fresh.mockResolvedValue({ client_id: null, created_by: 'other' })
    const f = fixture()
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 403 })
    mocks.all.mockReturnValue(true)
    await expect(image(f.event)).resolves.toHaveLength(1)
  })
  it.each([NaN, Infinity, 1.5, '2', 0])('validates all formats before any render: width %s', async (width) => {
    const f = fixture({ ...body(), formats: [format(), { ...format('bad'), width }] })
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 400 })
    expect(f.renderer.render).not.toHaveBeenCalled()
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('validates later batches and duplicate keys before side effects', async () => {
    for (const formats of [Array.from({ length: 5 }, (_, i) => ({ ...format(`key${i}`), height: i === 4 ? -1 : 3 })), [format(), format()]]) {
      const f = fixture({ ...body(), formats })
      await expect(image(f.event)).rejects.toMatchObject({ statusCode: 400 })
      expect(f.renderer.render).not.toHaveBeenCalled()
    }
  })
  it.each([{ quality: 1.2 }, { jpgQuality: NaN }, { jpgQuality: 101 }, { format: 'webp' }])('rejects invalid options %s', async (options) => {
    const f = fixture({ ...body(), ...options })
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 400 })
    expect(f.renderer.render).not.toHaveBeenCalled()
  })
  it.each([5.5, NaN, Infinity, '10', 16])('rejects invalid GIF fps %s', async (fps) => {
    const f = fixture({ projectId: PROJECT, formats: [format()], fps })
    await expect(gif(f.event)).rejects.toMatchObject({ statusCode: 400 })
    expect(f.renderer.render).not.toHaveBeenCalled()
  })
  it('fails closed for missing renderer or bucket without process env fallback', async () => {
    for (const name of ['BANNER_RENDERER_PRODUCTION', 'MEDIA_BUCKET']) {
      const f = fixture()
      Reflect.deleteProperty(f.event.context.cloudflare.env, name)
      vi.stubEnv(name, 'production')
      await expect(image(f.event)).rejects.toMatchObject({ statusCode: 503 })
      expect(f.renderer.render).not.toHaveBeenCalled()
      expect(f.bucket.put).not.toHaveBeenCalled()
      vi.unstubAllEnvs()
    }
  })
  it('rejects both environment bindings and forwards the exclusive staging binding environment', async () => {
    const f = fixture()
    f.event.context.cloudflare.env.BANNER_RENDERER_STAGING = f.renderer
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 503 })
    expect(f.renderer.render).not.toHaveBeenCalled()
    delete f.event.context.cloudflare.env.BANNER_RENDERER_PRODUCTION
    await image(f.event)
    expect(f.renderer.render).toHaveBeenCalledWith(expect.objectContaining({ expectedEnvironment: 'staging' }))
  })
  it('preserves unsaved HTML and CSS viewport at 2x, stores verified bytes and a private URL', async () => {
    const f = fixture({ ...body(), quality: 2 })
    const results = await image(f.event)
    expect(f.renderer.render).toHaveBeenCalledWith(expect.objectContaining({ output: 'png', items: [{ ...format(), scale: 2 }] }))
    const [key, bytes, options] = f.bucket.put.mock.calls[0]!
    expect(key).toMatch(new RegExp(`^banner-raster-exports/${PROJECT}/[a-f0-9-]{36}\\.png$`))
    expect(PNG.sync.read(Buffer.from(bytes))).toMatchObject({ width: 4, height: 6 })
    expect(options).toMatchObject({ httpMetadata: { contentType: 'image/png', cacheControl: 'private, no-store' } })
    expect(results).toEqual([{ formatKey: 'square', url: expect.stringMatching(/^\/api\/agency\/banner-studio\/exports\/[a-f0-9-]{36}\/download$/), fileSize: bytes.length }])
    expect(mocks.insert.mock.calls[0]![1]).toContain(results[0]!.url)
  })
  it('batches 25 formats in groups of at most 4', async () => {
    const f = fixture({ ...body(), formats: Array.from({ length: 25 }, (_, i) => format(`key${i}`)) })
    await expect(image(f.event)).resolves.toHaveLength(25)
    expect(f.renderer.render.mock.calls.map(([request]) => request.items.length)).toEqual([4, 4, 4, 4, 4, 4, 1])
  })
  it.each(['sha256', 'mime', 'pixelWidth', 'byteLength', 'key', 'frames', 'magic'])('rejects corrupt renderer %s before storage', async (field) => {
    const f = fixture()
    f.renderer.render.mockImplementation(async (request) => {
      const response = result(request)
      const item = response.value.items[0]!
      if (field === 'magic') {
        item.bytes[0] = 0
        item.sha256 = createHash('sha256').update(item.bytes).digest('hex')
      } else Object.assign(item, { [field]: field === 'sha256' ? '0'.repeat(64) : 'wrong' })
      return response
    })
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 502 })
    expect(f.bucket.put).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('cleans the unrecorded object if insert fails', async () => {
    const f = fixture()
    mocks.insert.mockRejectedValueOnce(new Error('database unavailable'))
    mocks.fresh.mockResolvedValueOnce({ client_id: null, created_by: 'user-1' }).mockResolvedValueOnce(null)
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 503 })
    expect(f.bucket.delete).toHaveBeenCalledWith(f.bucket.put.mock.calls[0]![0])
  })
  it('preserves JPEG options and verifies actual JPEG output', async () => {
    const f = fixture({ ...body(), format: 'jpg', jpgQuality: 72 })
    await expect(image(f.event)).resolves.toHaveLength(1)
    expect(f.renderer.render).toHaveBeenCalledWith(expect.objectContaining({ output: 'jpeg', jpegQuality: 72 }))
    expect(f.bucket.put.mock.calls[0]![0]).toMatch(/\.jpg$/)
  })
  it.each([5, 10, 12, 15])('verifies real two-frame GIF at %s fps including centisecond delays', async (fps) => {
    const f = fixture({ projectId: PROJECT, formats: [format()], fps })
    await expect(gif(f.event)).resolves.toHaveLength(1)
    expect(f.renderer.render).toHaveBeenCalledWith(expect.objectContaining({ output: 'gif', fps }))
    expect(f.bucket.put.mock.calls[0]![0]).toMatch(/\.gif$/)
  })
  it('rejects too many formats and aggregate HTML limits before RPC', async () => {
    for (const [formats, statusCode] of [
      [Array.from({ length: 26 }, (_, i) => format(`key${i}`)), 400],
      [Array.from({ length: 7 }, (_, i) => ({ ...format(`key${i}`), html: 'a'.repeat(1024 * 1024) })), 413]
    ] as const) {
      const f = fixture({ ...body(), formats })
      await expect(image(f.event)).rejects.toMatchObject({ statusCode })
      expect(f.renderer.render).not.toHaveBeenCalled()
    }
  })
  it('verifies all items in a batch before writing any, including encoded dimensions', async () => {
    const f = fixture({ ...body(), formats: [format(), format('second')] })
    f.renderer.render.mockImplementation(async (request) => {
      const response = result(request)
      const item = response.value.items[1]!
      new DataView(item.bytes.buffer, item.bytes.byteOffset).setUint32(16, 100)
      item.sha256 = createHash('sha256').update(item.bytes).digest('hex')
      return response
    })
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 502 })
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('does not reflect RPC exception details or render failure messages', async () => {
    const f = fixture()
    f.renderer.render.mockRejectedValueOnce(new Error('secret html https://private.example/path'))
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 503, statusMessage: 'Banner export service is unavailable' })
    f.renderer.render.mockResolvedValueOnce({ version: 1, ok: false, error: { code: 'RESOURCE_BLOCKED', message: 'private html' } } as unknown as ReturnType<typeof result>)
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 422, statusMessage: 'Banner rendering failed: RESOURCE_BLOCKED' })
    expect(f.bucket.put).not.toHaveBeenCalled()
  })
  it('cleans an object when the insert returns no record', async () => {
    const f = fixture()
    mocks.insert.mockResolvedValueOnce(null)
    mocks.fresh.mockResolvedValueOnce({ client_id: null, created_by: 'user-1' }).mockResolvedValueOnce(null)
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 503 })
    expect(f.bucket.delete).toHaveBeenCalledWith(f.bucket.put.mock.calls[0]![0])
  })
  it('preserves bytes when the insert commits but its response is lost', async () => {
    const f = fixture()
    mocks.insert.mockImplementationOnce(async (_sql: string, values: unknown[]) => {
      mocks.fresh.mockResolvedValueOnce({ id: values[0] })
      throw new Error('connection lost after commit')
    })
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 503 })
    expect(f.bucket.delete).not.toHaveBeenCalled()
    expect(mocks.fresh).toHaveBeenLastCalledWith(expect.stringContaining('FROM banner_exports WHERE id = $1'), [mocks.insert.mock.calls[0]![1][0]])
  })
  it('preserves bytes when both insert and its fresh outcome lookup fail', async () => {
    const f = fixture()
    mocks.insert.mockRejectedValueOnce(new Error('unknown commit'))
    mocks.fresh.mockResolvedValueOnce({ client_id: null, created_by: 'user-1' }).mockRejectedValueOnce(new Error('lookup unavailable'))
    await expect(image(f.event)).rejects.toMatchObject({ statusCode: 503 })
    expect(f.bucket.delete).not.toHaveBeenCalled()
  })
  it('downloads the exact verified bytes stored by the export through its persisted URL', async () => {
    const f = fixture()
    const [result] = await image(f.event)
    const [key, bytes] = f.bucket.put.mock.calls[0]!
    const id = result!.url.split('/').at(-2)!
    mocks.fresh.mockResolvedValue({ id, project_id: PROJECT, r2_key: key, export_type: 'png', file_size: bytes.length, client_id: null, created_by: 'user-1' })
    f.bucket.get.mockResolvedValue({ size: bytes.length, httpMetadata: { contentType: 'image/png' }, body: new Response(bytes as Uint8Array<ArrayBuffer>).body })
    f.event.context.params = { id }
    const response = await download(f.event)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(f.bucket.get).toHaveBeenCalledWith(key)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transform } from 'esbuild'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { signBannerAssetToken } from '~~/server/utils/bannerStorage'

const queryOne = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOne(...args)
}))

;(globalThis as Record<string, unknown>).defineEventHandler = <T>(handler: T) => handler

const SECRET = 'render-link-secret-with-at-least-thirty-two-bytes'
const ASSET_ID = '22222222-2222-4222-8222-222222222222'
const UPLOADER_ID = '11111111-1111-4111-8111-111111111111'
const KEY = `banner-assets/${UPLOADER_ID}/33333333-3333-4333-8333-333333333333/launch-car.jpg`
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function objectBody(body = 'image-bytes', range?: { offset: number, length: number }) {
  return {
    key: KEY,
    size: 11,
    etag: 'etag-1',
    httpEtag: '"etag-1"',
    uploaded: new Date('2026-08-06T00:00:00.000Z'),
    httpMetadata: { contentType: 'image/jpeg' },
    range,
    body: new Response(body).body,
    writeHttpMetadata(headers: Headers) {
      headers.set('content-type', 'image/jpeg')
    }
  }
}

async function request(options: {
  method?: 'GET' | 'HEAD'
  token?: string
  secret?: string
  bucket?: Record<string, unknown>
  headers?: Record<string, string>
} = {}) {
  const token = options.token ?? await signBannerAssetToken(ASSET_ID, SECRET)
  return {
    method: options.method ?? 'GET',
    headers: new Headers(options.headers),
    context: {
      params: { token },
      cloudflare: {
        env: {
          RENDER_LINK_SECRET: options.secret === undefined ? SECRET : options.secret,
          ...(options.bucket === undefined ? {} : { MEDIA_BUCKET: options.bucket })
        }
      }
    },
    node: {
      req: { method: options.method ?? 'GET', headers: options.headers ?? {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  }
}

type DeliveryEvent = Awaited<ReturnType<typeof request>>

async function loadHandler(): Promise<((event: DeliveryEvent) => Promise<Response>) | undefined> {
  return (await import('~~/server/api/public/banner-assets/[token].get').catch(() => ({ default: undefined }))).default
}

describe('GET /api/public/banner-assets/:token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryOne.mockResolvedValue({ id: ASSET_ID, r2Key: KEY, uploadedBy: UPLOADER_ID })
  })

  it('compiles the range implementation for the production ES2019 target without warnings', async () => {
    const source = await readFile(
      path.join(repositoryRoot, 'server/api/public/banner-assets/[token].get.ts'),
      'utf8'
    )
    const result = await transform(source, {
      loader: 'ts',
      format: 'esm',
      target: 'es2019',
      logLevel: 'silent'
    })

    expect(result.warnings).toEqual([])
  })

  it('streams a token-authorized private R2 object with bounded browser caching', async () => {
    const bucket = { get: vi.fn(async () => objectBody()), head: vi.fn(async () => objectBody()) }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ bucket }))

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('image-bytes')
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('etag')).toBe('"etag-1"')
    expect(response.headers.get('cache-control')).toBe('private, max-age=300, must-revalidate')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('FROM banner_assets'), [ASSET_ID])
    expect(bucket.get).toHaveBeenCalledWith(KEY, undefined)
  })

  it('serves HEAD metadata without reading the object body', async () => {
    const bucket = { get: vi.fn(), head: vi.fn(async () => objectBody()) }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ method: 'HEAD', bucket }))

    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
    expect(response.headers.get('content-length')).toBe('11')
    expect(bucket.head).toHaveBeenCalledWith(KEY)
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('returns a correct partial response for a bounded byte range', async () => {
    const bucket = {
      get: vi.fn(async () => objectBody('age', { offset: 2, length: 3 })),
      head: vi.fn(async () => objectBody())
    }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ bucket, headers: { range: 'bytes=2-4' } }))

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-4/11')
    expect(response.headers.get('content-length')).toBe('3')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(bucket.get).toHaveBeenCalledWith(KEY, { range: { offset: 2, length: 3 } })
  })

  it.each([
    ['suffix', 'bytes=-3', { suffix: 3 }, 'bytes 8-10/11', 'age'],
    ['open-ended', 'bytes=7-', { offset: 7, length: 4 }, 'bytes 7-10/11', 'ytes']
  ])('serves a satisfiable %s range from the exact parsed R2 range', async (
    _case,
    rangeHeader,
    expectedRange,
    contentRange,
    body
  ) => {
    const bucket = {
      head: vi.fn(async () => objectBody()),
      get: vi.fn(async () => objectBody(body))
    }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ bucket, headers: { range: rangeHeader } }))

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(contentRange)
    expect(bucket.get).toHaveBeenCalledWith(KEY, { range: expectedRange })
  })

  it.each(['bytes=5-2', 'bytes=99-100', 'bytes=-0']) (
    'returns a bounded 416 with object size for unsatisfiable range %s',
    async (range) => {
      const bucket = {
        head: vi.fn(async () => objectBody()),
        get: vi.fn(async () => objectBody('image-bytes', { offset: 0, length: 11 }))
      }
      const handler = await loadHandler()

      expect(handler).toBeTypeOf('function')
      if (!handler) return
      const response = await handler(await request({ bucket, headers: { range } }))

      expect(response.status).toBe(416)
      expect(response.headers.get('content-range')).toBe('bytes */11')
      expect(bucket.get).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['GET', { 'if-none-match': 'W/"etag-1"' }],
    ['HEAD', { 'if-none-match': '"other", "etag-1"' }],
    ['GET', { 'if-modified-since': 'Fri, 07 Aug 2026 00:00:00 GMT' }],
    ['HEAD', { 'if-modified-since': 'Fri, 07 Aug 2026 00:00:00 GMT' }]
  ] as const)('returns 304 for a satisfied %s cache validator', async (method, headers) => {
    const bucket = {
      head: vi.fn(async () => objectBody()),
      get: vi.fn(async () => objectBody())
    }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ method, bucket, headers }))

    expect(response.status).toBe(304)
    expect(response.body).toBeNull()
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', { 'if-match': '"other"' }],
    ['HEAD', { 'if-match': 'W/"etag-1"' }],
    ['GET', { 'if-unmodified-since': 'Wed, 05 Aug 2026 00:00:00 GMT' }]
  ] as const)('returns 412 for a failed %s write precondition', async (method, headers) => {
    const bucket = {
      head: vi.fn(async () => objectBody()),
      get: vi.fn(async () => objectBody())
    }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ method, bucket, headers }))

    expect(response.status).toBe(412)
    expect(response.body).toBeNull()
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('keeps HEAD status and representation headers in parity with ranged GET', async () => {
    const bucket = { head: vi.fn(async () => objectBody()), get: vi.fn() }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({
      method: 'HEAD',
      bucket,
      headers: { range: 'bytes=2-4' }
    }))

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-4/11')
    expect(response.headers.get('content-length')).toBe('3')
    expect(response.body).toBeNull()
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('maps a native InvalidRange race to a bounded 416 response', async () => {
    const bucket = {
      head: vi.fn(async () => objectBody()),
      get: vi.fn(async () => {
        throw Object.assign(new Error('private-key-details'), { name: 'InvalidRange' })
      })
    }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ bucket, headers: { range: 'bytes=2-4' } }))

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */11')
    await expect(response.text()).resolves.toBe('')
  })

  it('rejects malformed or multi-range requests before private object access', async () => {
    const bucket = { get: vi.fn(), head: vi.fn(async () => objectBody()) }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({
      bucket,
      headers: { range: 'bytes=0-1,4-5' }
    }))
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */11')
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('fails closed when an unconditional R2 read unexpectedly has no body', async () => {
    const metadataOnly = objectBody()
    Reflect.deleteProperty(metadataOnly, 'body')
    const bucket = { get: vi.fn(async () => metadataOnly), head: vi.fn(async () => objectBody()) }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    await expect(handler(await request({ bucket }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Banner asset storage is unavailable'
    })
  })

  it('fails closed for missing runtime secrets or request-scoped buckets', async () => {
    const handler = await loadHandler()
    const bucket = { get: vi.fn(), head: vi.fn() }

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    await expect(handler(await request({ secret: '', bucket }))).rejects.toMatchObject({ statusCode: 503 })
    await expect(handler(await request())).rejects.toMatchObject({ statusCode: 503 })
    expect(queryOne).not.toHaveBeenCalled()
  })

  it('rejects tampered capabilities before database or bucket access', async () => {
    const bucket = { get: vi.fn(), head: vi.fn() }
    const token = await signBannerAssetToken(ASSET_ID, SECRET)
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    await expect(handler(await request({ token: tampered, bucket }))).rejects.toMatchObject({ statusCode: 403 })
    expect(queryOne).not.toHaveBeenCalled()
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('makes database deletion revoke future origin fetches', async () => {
    const bucket = { get: vi.fn(), head: vi.fn() }
    queryOne.mockResolvedValueOnce(null)
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    await expect(handler(await request({ bucket }))).rejects.toMatchObject({ statusCode: 404 })
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('never permits a signed asset id to select an out-of-scope or traversing R2 key', async () => {
    const bucket = { get: vi.fn(), head: vi.fn() }
    queryOne.mockResolvedValueOnce({
      id: ASSET_ID,
      r2Key: 'banner-assets/../../email-lead-quarantine/raw.eml',
      uploadedBy: UPLOADER_ID
    })
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    await expect(handler(await request({ bucket }))).rejects.toMatchObject({ statusCode: 404 })
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('fails closed when persisted asset identity fields are malformed', async () => {
    const bucket = { get: vi.fn(), head: vi.fn() }
    queryOne.mockResolvedValueOnce({ id: null, r2Key: null, uploadedBy: null })
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    await expect(handler(await request({ bucket }))).rejects.toMatchObject({ statusCode: 404 })
    expect(bucket.get).not.toHaveBeenCalled()
  })
})

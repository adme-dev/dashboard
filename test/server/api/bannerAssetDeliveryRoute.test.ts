import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('streams a token-authorized private R2 object with bounded browser caching', async () => {
    const bucket = { get: vi.fn(async () => objectBody()), head: vi.fn() }
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
    expect(bucket.get).toHaveBeenCalledWith(KEY, {
      onlyIf: expect.any(Headers),
      range: expect.any(Headers)
    })
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
      head: vi.fn()
    }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ bucket, headers: { range: 'bytes=2-4' } }))

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-4/11')
    expect(response.headers.get('content-length')).toBe('3')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
  })

  it('rejects malformed or multi-range requests before private object access', async () => {
    const bucket = { get: vi.fn(), head: vi.fn() }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    await expect(handler(await request({
      bucket,
      headers: { range: 'bytes=0-1,4-5' }
    }))).rejects.toMatchObject({ statusCode: 416 })
    expect(bucket.get).not.toHaveBeenCalled()
  })

  it('returns 304 when R2 reports that the signed object is unchanged', async () => {
    const metadataOnly = objectBody()
    Reflect.deleteProperty(metadataOnly, 'body')
    const bucket = { get: vi.fn(async () => metadataOnly), head: vi.fn() }
    const handler = await loadHandler()

    expect(handler).toBeTypeOf('function')
    if (!handler) return
    const response = await handler(await request({ bucket, headers: { 'if-none-match': '"etag-1"' } }))

    expect(response.status).toBe(304)
    expect(response.body).toBeNull()
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

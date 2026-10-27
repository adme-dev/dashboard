import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fresh: vi.fn(), client: vi.fn(), all: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.fresh, queryOne: vi.fn() }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.client, hasAllSocialClientAccess: mocks.all }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
const get = (await import('~~/server/api/agency/banner-studio/exports/[id]/download.get').catch(() => ({ default: undefined }))).default
const head = (await import('~~/server/api/agency/banner-studio/exports/[id]/download.head').catch(() => ({ default: undefined }))).default
const PROJECT = '11111111-1111-4111-8111-111111111111'
const ID = '22222222-2222-4222-8222-222222222222'
const KEY = `banner-raster-exports/${PROJECT}/${ID}.png`
const row = () => ({ id: ID, project_id: PROJECT, r2_key: KEY, export_type: 'png', file_size: 3, client_id: null, created_by: 'user-1' })
function fixture(method = 'GET') {
  const object = () => ({ size: 3, httpEtag: '"etag"', httpMetadata: { contentType: 'image/png' }, body: new Response('png').body })
  const bucket = { head: vi.fn(async () => object()), get: vi.fn(async (): Promise<ReturnType<typeof object> | null> => object()) }
  const event = { method, context: { params: { id: ID }, cloudflare: { env: { MEDIA_BUCKET: bucket } } } } as unknown as H3Event
  return { event, bucket }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'user-1' })
  mocks.fresh.mockResolvedValue(row())
  mocks.client.mockResolvedValue({ id: 'user-1' })
  mocks.all.mockReturnValue(false)
})

describe('private raster export delivery', () => {
  it('streams bytes after a fresh project join with private attachment headers', async () => {
    const f = fixture()
    const response = await get!(f.event)
    await expect(response.text()).resolves.toBe('png')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe('3')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${ID}.png"`)
    expect(mocks.fresh).toHaveBeenCalledWith(expect.stringContaining('JOIN banner_projects'), [ID])
    expect(f.bucket.get).toHaveBeenCalledWith(KEY)
  })
  it('HEAD returns metadata without fetching the object body', async () => {
    const f = fixture('HEAD')
    const response = await head!(f.event)
    expect(response.body).toBeNull()
    expect(response.headers.get('content-length')).toBe('3')
    expect(f.bucket.head).toHaveBeenCalledWith(KEY)
    expect(f.bucket.get).not.toHaveBeenCalled()
  })
  it.each(['GET', 'HEAD'])('denies cross-client %s before R2 reads', async (method) => {
    mocks.fresh.mockResolvedValue({ ...row(), client_id: 'foreign' })
    mocks.client.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    const f = fixture(method)
    await expect((method === 'HEAD' ? head! : get!)(f.event)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.bucket.get).not.toHaveBeenCalled()
    expect(f.bucket.head).not.toHaveBeenCalled()
  })
  it('requires authentication before database or R2', async () => {
    mocks.auth.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { statusCode: 401 }))
    const f = fixture()
    await expect(get!(f.event)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.fresh).not.toHaveBeenCalled()
    expect(f.bucket.get).not.toHaveBeenCalled()
  })
  it('checks access again after project reassignment', async () => {
    const f = fixture()
    await get!(f.event)
    mocks.fresh.mockResolvedValue({ ...row(), created_by: 'other-user' })
    await expect(get!(f.event)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.bucket.get).toHaveBeenCalledTimes(1)
    mocks.all.mockReturnValue(true)
    await expect(get!(f.event)).resolves.toHaveProperty('status', 200)
  })
  it.each([
    { r2_key: `banner-raster-exports/${ID}/${ID}.png` },
    { r2_key: `banner-raster-exports/${PROJECT}/${PROJECT}.png` },
    { r2_key: `banner-raster-exports/${PROJECT}/${ID}.jpg` },
    { r2_key: `banner-images/${PROJECT}/${ID}.png` },
    { r2_key: `${KEY}/../secret` },
    { export_type: 'html' },
    { id: PROJECT }
  ])('rejects mismatched persisted identity or namespace %s', async (change) => {
    mocks.fresh.mockResolvedValue({ ...row(), ...change })
    const f = fixture()
    await expect(get!(f.event)).rejects.toMatchObject({ statusCode: 404 })
    expect(f.bucket.get).not.toHaveBeenCalled()
    expect(f.bucket.head).not.toHaveBeenCalled()
  })
  it('fails closed when the native bucket is missing despite a public URL', async () => {
    mocks.fresh.mockResolvedValue({ ...row(), url: 'https://public.example/leak.png' })
    const f = fixture()
    f.event.context.cloudflare.env = {}
    await expect(get!(f.event)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('rejects object size/type corruption and missing object', async () => {
    const f = fixture()
    f.bucket.get.mockResolvedValueOnce({ size: 4, httpMetadata: { contentType: 'image/png' }, body: new Response('oops').body } as Awaited<ReturnType<typeof f.bucket.get>>)
    await expect(get!(f.event)).rejects.toMatchObject({ statusCode: 503 })
    f.bucket.get.mockResolvedValueOnce({ size: 3, httpMetadata: { contentType: 'text/html' }, body: new Response('bad').body } as Awaited<ReturnType<typeof f.bucket.get>>)
    await expect(get!(f.event)).rejects.toMatchObject({ statusCode: 503 })
    f.bucket.get.mockResolvedValueOnce(null)
    await expect(get!(f.event)).rejects.toMatchObject({ statusCode: 404 })
  })
})

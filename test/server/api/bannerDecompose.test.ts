import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: vi.fn(), write: vi.fn(), query: vi.fn(), execute: vi.fn(), upload: vi.fn(), remove: vi.fn(), decompose: vi.fn(), clientAccess: vi.fn(), bucketGet: vi.fn(), bucketHead: vi.fn() }))
const userId = '11111111-1111-4111-8111-111111111111'
const assetId = '22222222-2222-4222-8222-222222222222'
const sourceKey = `banner-assets/${userId}/33333333-3333-4333-8333-333333333333/source.png`
const secret = 'test-signing-secret-32-characters-long'
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('useRuntimeConfig', () => ({}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth, requireWriteAccess: m.write }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.query, execute: m.execute }))
vi.mock('~~/server/utils/bannerStorage', async importOriginal => ({ ...await importOriginal<object>(), uploadBannerAsset: m.upload }))
vi.mock('~~/server/utils/storage', () => ({ deleteFile: m.remove, getDevR2BucketAdapter: () => ({ get: m.bucketGet, head: m.bucketHead }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ hasAllSocialClientAccess: () => false, requireSocialClientAccess: m.clientAccess }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.xeroflow.io' }))
vi.mock('~~/server/utils/qwenLayerDecomposer', () => ({ decomposeImageLayers: m.decompose }))
const handler = (await import('../../../server/api/agency/banner-studio/ai/decompose.post')).default
const event = () => ({ context: {}, body: { imageUrl: 'https://test.r2.dev/source.png' } })
const { signBannerAssetToken } = await import('~~/server/utils/bannerStorage')
async function signedEvent() {
  const token = await signBannerAssetToken(assetId, secret)
  return { context: {}, body: { imageUrl: `https://app.xeroflow.io/api/public/banner-assets/${token}` } }
}
const source = () => ({ id: assetId, r2Key: sourceKey, uploadedBy: userId, clientId: null, mimeType: 'image/png' })
beforeEach(() => {
  vi.resetAllMocks()
  m.auth.mockResolvedValue({ id: userId })
  m.write.mockResolvedValue({ id: userId })
  vi.stubGlobal('useRuntimeConfig', () => ({ renderLinkSecret: secret }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })))
  m.decompose.mockResolvedValue({ layers: [0, 1].map(index => ({ index, label: `Layer ${index}`, pngBuffer: Buffer.from([1]), width: 640, height: 480 })) })
  m.upload.mockImplementation(async (_buffer, name, _type, _user, key, native, deliveryUrl) => ({ key, url: native?.assetUrl || deliveryUrl || `https://test.r2.dev/${name}`, size: 1 }))
  m.query.mockImplementation(async sql => String(sql).includes('SELECT') ? source() : { id: 'asset' })
  m.bucketHead.mockResolvedValue({ size: 1 })
  m.bucketGet.mockImplementation(async () => ({ size: 1, body: new Response(new Uint8Array([1])).body }))
})
describe('Complete decomposition asset delivery', () => {
  it('requires write access and returns real registered frame dimensions', async () => {
    const result = await handler(event() as never)
    expect(m.write).toHaveBeenCalled()
    expect(result.layers).toHaveLength(2)
    expect(result.layers.every(layer => layer.width === 640 && layer.height === 480)).toBe(true)
    expect(fetch).toHaveBeenCalledWith(event().body.imageUrl, expect.objectContaining({ redirect: 'error' }))
  })
  it('fails the whole operation and removes created assets after an upload fails', async () => {
    m.upload.mockRejectedValueOnce(new Error('storage failed'))
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 502 })
    expect(m.remove).toHaveBeenCalledTimes(1)
  })
  it('cleans successful uploads and rows if a later database insert fails', async () => {
    m.query.mockResolvedValueOnce(source()).mockResolvedValueOnce({ id: 'a' }).mockRejectedValueOnce(new Error('database failed'))
    await expect(handler(event() as never)).rejects.toMatchObject({ statusCode: 502 })
    expect(m.remove).toHaveBeenCalledTimes(2)
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM banner_assets'), expect.any(Array))
  })
  it('reads current signed asset URLs directly from owned storage without fetching the URL', async () => {
    const result = await handler(await signedEvent() as never)
    expect(result.layers).toHaveLength(2)
    expect(fetch).not.toHaveBeenCalled()
    expect(m.bucketGet).toHaveBeenCalledWith(sourceKey)
    expect(result.layers[0]!.url).toMatch(/^https:\/\/app.xeroflow.io\/api\/public\/banner-assets\/v1\./)
  })
  it('uses request-scoped Pages bindings for reads, derived uploads and failed-upload cleanup', async () => {
    const input = await signedEvent()
    const bucket = { get: m.bucketGet, head: m.bucketHead, put: vi.fn(), delete: vi.fn() }
    input.context = { cloudflare: { env: { MEDIA_BUCKET: bucket, RENDER_LINK_SECRET: secret } } }
    vi.stubGlobal('useRuntimeConfig', () => ({}))
    m.upload.mockRejectedValueOnce(new Error('PUT persisted but HEAD failed'))
    await expect(handler(input as never)).rejects.toMatchObject({ statusCode: 502 })
    expect(m.bucketGet).toHaveBeenCalledWith(sourceKey)
    expect(m.upload).toHaveBeenCalledWith(expect.any(Buffer), expect.any(String), 'image/png', userId,
      expect.stringContaining(`banner-assets/${userId}/`), expect.objectContaining({ bucket, assetUrl: expect.stringContaining('/api/public/banner-assets/v1.') }), expect.any(String))
    expect(m.remove).toHaveBeenCalledWith(expect.stringContaining(`banner-assets/${userId}/`), bucket)
  })
  it.each(['https://evil.example/api/public/banner-assets/v1.fake.fake', 'https://app.xeroflow.io/api/admin/anything'])('rejects untrusted or arbitrary app URLs: %s', async (imageUrl) => {
    await expect(handler({ context: {}, body: { imageUrl } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetch).not.toHaveBeenCalled()
    expect(m.bucketGet).not.toHaveBeenCalled()
  })
  it('rejects oversized stored sources before downloading bytes', async () => {
    m.bucketHead.mockResolvedValue({ size: 10 * 1024 * 1024 + 1 })
    await expect(handler(await signedEvent() as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(m.bucketGet).not.toHaveBeenCalled()
  })
  it('rejects tampered signed links before reading storage or dispatching inference', async () => {
    const input = await signedEvent()
    input.body.imageUrl += 'tampered'
    await expect(handler(input as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.bucketGet).not.toHaveBeenCalled()
    expect(m.decompose).not.toHaveBeenCalled()
  })
  it.each(['signed', 'legacy'])('rejects another user\'s unscoped %s asset', async (kind) => {
    m.query.mockResolvedValue({ ...source(), uploadedBy: 'other-user' })
    await expect(handler((kind === 'signed' ? await signedEvent() : event()) as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(fetch).not.toHaveBeenCalled()
    expect(m.bucketGet).not.toHaveBeenCalled()
    expect(m.decompose).not.toHaveBeenCalled()
  })
  it('checks client access and preserves the source client on derived assets', async () => {
    const clientId = '44444444-4444-4444-8444-444444444444'
    m.query.mockResolvedValue({ ...source(), clientId })
    await handler(await signedEvent() as never)
    expect(m.clientAccess).toHaveBeenCalledWith(expect.anything(), clientId)
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_assets'), expect.arrayContaining([clientId]))
  })
  it('rejects denied client access before reading bytes', async () => {
    m.query.mockResolvedValue({ ...source(), clientId: '44444444-4444-4444-8444-444444444444' })
    m.clientAccess.mockRejectedValue(Object.assign(new Error('Denied'), { statusCode: 403 }))
    await expect(handler(await signedEvent() as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.bucketGet).not.toHaveBeenCalled()
  })
  it('rejects malformed generation options before fetching or inference', async () => {
    await expect(handler({ body: { ...event().body, numLayers: 'four' } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetch).not.toHaveBeenCalled()
    expect(m.decompose).not.toHaveBeenCalled()
  })
})

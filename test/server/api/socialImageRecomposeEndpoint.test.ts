import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn(), edit: vi.fn(), upload: vi.fn(), audit: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'user' }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: m.access }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.query }))
vi.mock('~~/server/utils/qwenImageEditor', () => ({ editImageWithAI: m.edit }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: m.audit }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: () => ({ signingSecret: 'secret' }) }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.xeroflow.io' }))
vi.mock('~~/server/utils/bannerStorage', () => ({
  createBannerAssetId: () => 'new-asset', createBannerAssetStorageKey: () => 'new-key',
  bannerAssetDeliveryUrl: async () => 'https://app.xeroflow.io/preview', uploadBannerAsset: m.upload
}))
vi.mock('~~/server/utils/storage', () => ({ readStoredObject: async () => ({ size: 8, body: new Blob([new Uint8Array([137,80,78,71,13,10,26,10])]).stream() }) }))
vi.stubGlobal('defineEventHandler', (f: unknown) => f)
vi.stubGlobal('readBody', async (e: { body: unknown }) => e.body)
vi.stubGlobal('createError', (e: { statusCode: number, statusMessage: string }) => Object.assign(new Error(e.statusMessage), e))
vi.stubGlobal('useRuntimeConfig', () => ({ r2AccountId: 'r2', r2BucketName: 'bucket' }))
const { default: handler } = await import('../../../server/api/agency/social/publishing/ai/recompose-image.post')
const client = '11111111-1111-4111-8111-111111111111'
const source = 'https://app.xeroflow.io/saved-image'
const body = { clientId: client, postId: '22222222-2222-4222-8222-222222222222', sourceUrl: source, format: 'portrait' }
const post = { client_id: client, created_by: 'user', status: 'draft', media_urls: [source] }
const invoke = () => handler({ body, context: {} } as never)
beforeEach(() => {
  vi.clearAllMocks()
  m.access.mockResolvedValue({ id: 'user' })
  m.query.mockReset().mockResolvedValueOnce(post).mockResolvedValueOnce({ r2_key: 'original-key', client_id: client, uploaded_by: 'user' }).mockResolvedValue({ id: 'new-asset' })
  m.edit.mockResolvedValue({ buffer: Buffer.from([137,80,78,71,13,10,26,10]), seed: 1 })
  m.upload.mockResolvedValue({ size: 8 })
})
describe('social image recomposition endpoint', () => {
  it('writes a new preview asset and never updates or publishes the post', async () => {
    expect(await invoke()).toMatchObject({ sourceUrl: source, width: 1152, height: 1440, assetId: 'new-asset' })
    expect(m.edit.mock.calls[0][2]).toMatchObject({ width: 1152, height: 1440, rewritePrompt: false })
    expect(m.query.mock.calls.map(c => c[0]).join(' ')).not.toMatch(/UPDATE social_posts|DELETE FROM/)
    expect(m.query.mock.calls[2][0]).toContain('INSERT INTO banner_assets')
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', clientId: client }))
  })
  it('stops before reading assets when client access is denied', async () => {
    m.access.mockRejectedValueOnce(new Error('Forbidden'))
    await expect(invoke()).rejects.toThrow('Forbidden')
    expect(m.query).not.toHaveBeenCalled()
    expect(m.edit).not.toHaveBeenCalled()
  })
  it('does not send a different client asset to the model', async () => {
    m.query.mockReset().mockResolvedValueOnce(post).mockResolvedValueOnce({ r2_key: 'other', client_id: 'other-client', uploaded_by: 'user' })
    await expect(invoke()).rejects.toThrow('not available for this client')
    expect(m.edit).not.toHaveBeenCalled()
  })
  it('blocks published posts', async () => {
    m.query.mockReset().mockResolvedValueOnce({ ...post, status: 'published' })
    await expect(invoke()).rejects.toThrow('Only draft')
    expect(m.edit).not.toHaveBeenCalled()
  })
  it('preserves the draft when the provider fails', async () => {
    m.edit.mockResolvedValueOnce(null)
    await expect(invoke()).rejects.toThrow('original is unchanged')
    expect(m.upload).not.toHaveBeenCalled()
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
  })
})

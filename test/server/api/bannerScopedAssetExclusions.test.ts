import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ one: vi.fn(), fresh: vi.fn(), rows: vi.fn(), effect: vi.fn(), storage: vi.fn(), sources: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', () => 'asset')
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('readBody', () => ({ name: 'Renamed', tags: ['font'] }))
vi.stubGlobal('setHeader', vi.fn())
vi.mock('~~/server/utils/db', () => ({ queryOne: m.one, queryOneFresh: m.fresh, queryRows: m.rows, queryRowsFresh: m.rows, execute: m.effect }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: 'owner' }), requireWriteAccess: async () => ({ id: 'owner' }) }))
vi.mock('~~/server/utils/bannerStorage', () => ({ deleteBannerFile: m.storage }))
vi.mock('~~/server/utils/storage', () => ({ getFileMetadata: m.storage, getPresignedDownloadUrl: m.storage }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: async () => {}, hasAllSocialClientAccess: () => true }))
vi.mock('~~/server/utils/email-marketing/access', () => ({ resolveEmailClientScope: async () => null, addEmailClientScopeCondition: () => {} }))
vi.mock('~~/server/utils/banner/platformQrCanvas', () => ({ preservePlatformQrAssetAttestations: (_previous: any, tags: any) => tags }))
vi.mock('~~/server/utils/video-generation/sourceAssetStore', () => ({ assertResolvableSources: (rows: any) => rows, loadSourceAssetsByIds: m.sources }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: m.effect }))
const removeAsset = (await import('../../../server/api/agency/banner-studio/assets/[id].delete')).default
const removeFont = (await import('../../../server/api/agency/banner-studio/fonts/[id].delete')).default
const updateAsset = (await import('../../../server/api/agency/banner-studio/assets/[id].patch')).default
const emailAssets = (await import('../../../server/api/agency/email/assets/index.get')).default
const { runCreativeComplianceCheck, requestCreativeComplianceVerdict } = await import('../../../server/utils/creativeCompliance')
const protectedAsset = { id: 'asset', r2_key: 'scoped-dissection-assets/job/attempt/asset.png', url: '/api/agency/banner-studio/dissect/job/assets/asset', client_id: 'client', uploaded_by: 'owner', tags: ['font'], file_size: 10, mime_type: 'image/png' }
beforeEach(() => {
  vi.clearAllMocks()
  m.one.mockResolvedValue(protectedAsset); m.fresh.mockResolvedValue(protectedAsset); m.rows.mockResolvedValue([]); m.sources.mockResolvedValue([])
})
describe('unsupported protected catalogue, asset mutation and model boundaries', () => {
  it.each([['asset deletion', removeAsset], ['font deletion', removeFont], ['asset patch', updateAsset]] as const)('rejects %s before storage or writes', async (_name, handler) => {
    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.storage).not.toHaveBeenCalled(); expect(m.effect).not.toHaveBeenCalled()
    expect(m.one.mock.calls.filter(([sql]) => /UPDATE|DELETE|INSERT/.test(sql))).toEqual([])
  })
  it('rejects a protected URL even if a legacy key was supplied by a malformed asset row', async () => {
    m.fresh.mockResolvedValue({ ...protectedAsset, r2_key: 'banner-assets/legacy.png' })
    await expect(removeAsset({} as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.storage).not.toHaveBeenCalled()
  })
  it('filters protected assets in SQL before email catalogue LIMIT', async () => {
    await emailAssets({} as any)
    const sql = m.rows.mock.calls[0][0] as string
    for (const predicate of ["r2_key NOT LIKE 'scoped-dissection-assets/%'", "r2_key NOT LIKE 'scoped-banner-exports/%'", "url NOT LIKE '/api/agency/banner-studio/dissect/%'"]) {
      expect(sql).toContain(predicate)
      expect(sql.indexOf(predicate)).toBeLessThan(sql.indexOf('LIMIT'))
    }
  })
  it('rejects compliance image inspection before presigning, storage, model or evidence writes', async () => {
    const provider = vi.fn(); vi.stubGlobal('fetch', provider)
    await expect(runCreativeComplianceCheck({ assetId: 'asset', clientId: 'client', createdBy: 'owner', subjectType: 'non_vehicle', referenceSourceAssetIds: [] })).rejects.toMatchObject({ statusCode: 409 })
    expect(m.storage).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled(); expect(m.effect).not.toHaveBeenCalled()
  })
  it('rejects direct protected model URLs before credential/gateway handling', async () => {
    const provider = vi.fn()
    await expect(requestCreativeComplianceVerdict({ subjectType: 'non_vehicle', imageUrls: [protectedAsset.url] }, { gatewayUrl: '', groqApiKey: '', fetchImpl: provider })).rejects.toMatchObject({ statusCode: 409 })
    expect(provider).not.toHaveBeenCalled()
  })
  it('preserves legacy asset deletion', async () => {
    const legacy = { ...protectedAsset, r2_key: 'banner-assets/legacy.png', url: '/api/public/banner-assets/token' }
    m.one.mockResolvedValue(legacy); m.fresh.mockResolvedValue(legacy)
    await expect(removeAsset({} as any)).resolves.toMatchObject({ success: true })
    expect(m.storage).toHaveBeenCalledWith(legacy.r2_key)
    expect(m.effect).toHaveBeenCalledWith('DELETE FROM banner_assets WHERE id = $1', ['asset'])
  })
})

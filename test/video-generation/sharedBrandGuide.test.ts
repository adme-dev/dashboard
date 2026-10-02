import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadVideoClientProfile } from '~~/server/utils/video-generation/clientProfile'

const mocks = vi.hoisted(() => ({ fresh: vi.fn(), query: vi.fn(), access: vi.fn(), permission: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.fresh, transaction: async (fn: (db: unknown) => unknown) => fn({ query: mocks.query }) }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: async () => ({ id: 'manager' }), requirePermission: mocks.permission }))
vi.mock('~~/server/utils/audio/projects', () => ({ getProjectWithCurrentTimeline: async () => ({ project: { mediaType: 'av', clientId: 'client-a' } }) }))
vi.mock('~~/server/utils/video-generation/timelineStillSource', () => ({ canUseVideoGenerationProject: () => true }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
const { default: handler } = await import('../../server/api/agency/video/client-profile.put')
const put = handler as unknown as (event: { body: unknown }) => Promise<unknown>
const kitId = '376a1122-0675-47dc-8ae8-7dc9b916f28a'
const profile = { enabled: true, monthlyCapCents: 2000, allowedModelIds: ['aigateway/seedance-25-i2v'], brandName: 'DriveAgent', brandWebsite: 'https://driveagent.io', styleGuide: 'local fallback', templatePrompt: 'Motion', socialBrief: 'Caption' }
const row = { enabled: true, monthly_cap_cents: 2000, allowed_model_ids: profile.allowedModelIds, brand_name: 'DriveAgent', brand_website: profile.brandWebsite, style_guide: 'local fallback', template_prompt: 'Motion', social_brief: 'Caption' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.query.mockResolvedValue({ rows: [] })
})
describe('shared client brand guide', () => {
  it('reads a linked guide freshly while retaining the local fallback and generation policy', async () => {
    mocks.fresh.mockResolvedValue({ ...row, linked_kit_id: kitId, linked_kit_name: 'Product guide', linked_guidelines: 'Master guide' })
    expect(await loadVideoClientProfile('client-a')).toEqual({ ...profile, brandKitId: kitId, localStyleGuide: 'local fallback', guideKitName: 'Product guide', styleGuide: 'Master guide' })
    mocks.fresh.mockResolvedValue({ ...row, linked_kit_id: kitId, linked_kit_name: 'Product guide', linked_guidelines: '' })
    expect((await loadVideoClientProfile('client-a'))?.styleGuide).toBe('')
    expect(mocks.fresh.mock.calls[0][0]).toContain('bk.client_id = p.client_id')
  })
  it('falls back when a linked kit has been removed or belongs to another client', async () => {
    mocks.fresh.mockResolvedValue({ ...row, brand_kit_id: kitId, linked_kit_id: null })
    const saved = await loadVideoClientProfile('client-a')
    expect(saved?.styleGuide).toBe('local fallback')
    expect(saved?.brandKitId).toBeNull()
  })
  it('rejects a foreign kit before updating settings', async () => {
    await expect(put({ body: { projectId: 'd860f561-8d03-456c-8565-9a45bda1464e', profile: { ...profile, brandKitId: kitId } } }))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
    expect(mocks.query.mock.calls[1][1]).toEqual([kitId, 'client-a'])
    expect(mocks.permission).toHaveBeenCalledWith(expect.anything(), 'MANAGEMENT')
  })
  it('links only an owned kit and retains its client policy and local guide', async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM brand_kits') ? [{ id: kitId }] : [] }))
    await put({ body: { projectId: 'd860f561-8d03-456c-8565-9a45bda1464e', profile: { ...profile, brandKitId: kitId } } })
    const [sql, params] = mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO'))!
    expect(sql).toContain('CASE WHEN $12')
    expect(params).toEqual(['client-a', true, 2000, JSON.stringify(profile.allowedModelIds), 'DriveAgent', profile.brandWebsite, 'local fallback', 'Motion', 'Caption', 'manager', kitId, true])
  })
  it.each([undefined, null])('distinguishes legacy omission from explicit unlinking (%s)', async (brandKitId) => {
    await put({ body: { projectId: 'd860f561-8d03-456c-8565-9a45bda1464e', profile: { ...profile, ...(brandKitId === undefined ? {} : { brandKitId }) } } })
    const [, params] = mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO'))!
    expect(params[10]).toBeNull()
    expect(params[11]).toBe(brandKitId !== undefined)
  })
})

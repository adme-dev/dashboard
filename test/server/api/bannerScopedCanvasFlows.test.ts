import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ query: vi.fn(), fresh: vi.fn(), rows: vi.fn(), tx: vi.fn(), db: vi.fn(), create: vi.fn(), provider: vi.fn(), credential: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', (event: any) => event.id)
vi.stubGlobal('getQuery', (event: any) => event.query || {})
vi.stubGlobal('readBody', (event: any) => event.body)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('queryOne', m.query)
vi.stubGlobal('execute', m.query)
const actor = '11111111-1111-4111-8111-111111111111'
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: '11111111-1111-4111-8111-111111111111' }), requireWriteAccess: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) }))
vi.stubGlobal('requireAuth', async () => ({ id: actor }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.query, queryOneFresh: m.fresh, queryRows: m.rows, queryRowsFresh: m.rows, transactionWithoutRetry: m.tx }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: async () => {}, hasAllSocialClientAccess: () => false, hasSocialClientPermission: () => true }))
vi.mock('~~/server/utils/banner/platformQrCanvas', () => ({ validateBannerPlatformQrCanvas: async () => {} }))
vi.mock('~~/server/utils/banner/godModeProjectCreation', () => ({ executeGodModeBannerProjectCreation: m.create }))
vi.mock('~~/server/utils/banner/thebriefProjectImport', () => ({ readTheBriefProjectIdentity: () => null, findExistingTheBriefProject: async () => null }))
vi.mock('~~/server/utils/metaClient', () => ({ uploadAdImage: m.provider, uploadAdImageByUrl: m.provider, createAdCreative: m.provider, createAd: m.provider }))
vi.mock('~~/server/utils/googleCredentialProfiles', () => ({ GOOGLE_CREDENTIAL_PROFILE_JOIN: '', GOOGLE_CREDENTIAL_PROFILE_SELECT: '', persistGoogleCredentialRefresh: m.credential, resolveGoogleCredential: m.credential }))
const routes = {
  detail: (await import('../../../server/api/agency/banner-studio/projects/[id].get')).default,
  list: (await import('../../../server/api/agency/banner-studio/projects/index.get')).default,
  create: (await import('../../../server/api/agency/banner-studio/projects/index.post')).default,
  duplicate: (await import('../../../server/api/agency/banner-studio/projects/[id]/duplicate.post')).default,
  update: (await import('../../../server/api/agency/banner-studio/projects/[id].patch')).default,
  version: (await import('../../../server/api/agency/banner-studio/versions/[id].get')).default,
  versions: (await import('../../../server/api/agency/banner-studio/versions/index.get')).default,
  snapshot: (await import('../../../server/api/agency/banner-studio/versions/index.post')).default,
  restore: (await import('../../../server/api/agency/banner-studio/versions/restore.post')).default,
  template: (await import('../../../server/api/agency/banner-studio/templates/index.post')).default,
  fromProject: (await import('../../../server/api/agency/banner-studio/templates/from-project.post')).default,
  templateUpdate: (await import('../../../server/api/agency/banner-studio/templates/[id].patch')).default,
  schedule: (await import('../../../server/api/agency/banner-studio/schedule.post')).default,
  google: (await import('../../../server/api/agency/banner-studio/ad-publish/google.post')).default,
  meta: (await import('../../../server/api/agency/banner-studio/ad-publish/meta.post')).default,
}
const projectId = '22222222-2222-4222-8222-222222222222'
const canvas = { square: { dissectionSource: { jobId: '33333333-3333-4333-8333-333333333333', sourceSha256: 'a'.repeat(64) }, layers: [{ text: 'confidential' }] } }
const saved = () => ({ id: projectId, projectId, name: 'Artwork', canvasData: canvas, canvas_data: canvas, clientId: null, createdBy: actor, updatedAt: '2026-10-27T00:00:00.000Z', thumbnailUrl: 'private-preview' })
const event = (body = {}, query = {}) => ({ id: projectId, body, query }) as any
beforeEach(() => {
  vi.clearAllMocks()
  m.fresh.mockImplementation(async (sql: string) => sql.includes('FROM banner_published')
    ? { id: projectId, projectId, formatKey: 'square', url: 'https://example.com/banner.png' } : saved())
  m.rows.mockResolvedValue([saved()])
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes('social_connections')) return { accessToken: 'unused', access_token: 'unused', scopes: ['ads_management'], accountId: 'account', account_id: 'account' }
    if (/INSERT|UPDATE|DELETE/.test(sql)) return { id: projectId }
    return saved()
  })
  m.db.mockResolvedValue({ rows: [] }) // Deleted/revoked source job; no authority fallback.
  m.tx.mockImplementation((fn: any) => fn({ query: m.db }))
  m.create.mockImplementation((_event: any, fn: any) => fn({ query: m.db }))
})
function noEffects() {
  expect(m.query.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE|social_connections/.test(sql))).toEqual([])
  expect(m.db.mock.calls.filter(([sql]) => /INSERT|UPDATE banner_|DELETE/.test(sql))).toEqual([])
  expect(m.provider).not.toHaveBeenCalled()
  expect(m.credential).not.toHaveBeenCalled()
}
describe('protected project and version boundaries', () => {
  it.each(['detail', 'version', 'versions'] as const)('denies revoked source in %s without returning text or preview', async name => {
    await expect(routes[name](event({}, { projectId }))).rejects.toMatchObject({ statusCode: 403 })
    noEffects()
  })
  it.each(['revoked', 'malformed', 'encoded'] as const)('redacts %s rows without poisoning a paginated list', async reason => {
    const privateRow = saved()
    if (reason === 'malformed') privateRow.canvasData = { square: { layers: [{ src: 'scoped-banner-exports/x.png' }] } } as any
    if (reason === 'encoded') privateRow.canvasData = { square: { layers: [{ src: 'a%2Fbanner-studio%2Fdissect%2Fx.png' }] } } as any
    const ordinary = { id: 'ordinary', name: 'Ordinary project', canvasData: {}, thumbnailUrl: 'public-preview' }
    m.rows.mockResolvedValue([ordinary, privateRow, { ...ordinary, id: 'later' }])
    const result = await routes.list(event({}, { limit: '3', offset: '6' }))
    expect(result).toEqual([ordinary, { id: projectId, name: 'Restricted artwork', status: 'restricted', restricted: true }, { ...ordinary, id: 'later' }])
    expect(m.rows.mock.calls[0][0]).toMatch(/LIMIT \$\d+ OFFSET \$\d+/)
    expect(m.rows.mock.calls[0][1]).toEqual([actor, 3, 6])
    noEffects()
  })
  it('does not hide authority 503 failures behind restricted placeholders', async () => {
    m.db.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM banner_dissections')) return { rows: [{ job_id: canvas.square.dissectionSource.jobId, user_id: actor, manifest: {} }] }
      throw new Error('Database unavailable')
    })
    await expect(routes.list(event())).rejects.toMatchObject({ statusCode: 503 })
    noEffects()
  })
  it.each(['create', 'duplicate', 'update', 'snapshot'] as const)('denies revoked source before %s mutations', async name => {
    await expect(routes[name](event({ projectId, name: 'Copy', canvasData: canvas }))).rejects.toMatchObject({ statusCode: 403 })
    noEffects()
  })
  it('rejects stripped snapshot source lineage before writes', async () => {
    await expect(routes.snapshot(event({ projectId, canvasData: {} }))).rejects.toMatchObject({ statusCode: 409 })
    noEffects()
  })
  it('explicitly rejects protected restore before snapshot or update', async () => {
    await expect(routes.restore(event({ versionId: projectId }))).rejects.toMatchObject({ statusCode: 409 })
    noEffects()
  })
  it('rejects removing the protected format during save', async () => {
    await expect(routes.update(event({ canvasData: {} }))).rejects.toMatchObject({ statusCode: 409 })
    noEffects()
  })
})
describe('protected content cannot enter shared templates or publishing', () => {
  it.each(['template', 'fromProject', 'templateUpdate'] as const)('denies %s before shared write', async name => {
    await expect(routes[name](event({ projectId, name: 'Shared', canvasData: canvas }))).rejects.toMatchObject({ statusCode: 409 })
    noEffects()
  })
  it('denies schedule creation from saved protected canvas even when caller omits provenance', async () => {
    await expect(routes.schedule(event({ projectId, formatKeys: ['square'], scheduledAt: '2099-01-01' }))).rejects.toMatchObject({ statusCode: 409 })
    noEffects()
  })
  it.each(['google', 'meta'] as const)('denies %s before credentials/provider/effects', async name => {
    await expect(routes[name](event({ publishedId: projectId, connectionId: projectId, campaignId: 'campaign', adGroupId: 'group', adSetId: 'set', pageId: 'page', primaryTexts: ['hello'], headlines: ['hello'], callToAction: 'LEARN_MORE', linkUrl: 'https://example.com' }))).rejects.toMatchObject({ statusCode: 409 })
    noEffects()
  })
})

describe('publication rechecks after credential loading', () => {
  it('stops Google intent writes when the project becomes protected during credential resolution', async () => {
    let protectedNow = false
    m.fresh.mockImplementation(async (sql: string) => sql.includes('FROM banner_published')
      ? { id: projectId, projectId, formatKey: 'square', url: 'https://example.com/banner.png' }
      : { canvas_data: protectedNow ? canvas : {} })
    m.credential.mockImplementation(async () => { protectedNow = true; return { accessToken: 'unused' } })
    await expect(routes.google(event({ publishedId: projectId, connectionId: projectId, campaignId: 'campaign', adGroupId: 'group' }))).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toEqual([])
  })

  it('stops Meta upload when the saved project becomes protected after the first gate', async () => {
    let protectedNow = false
    m.fresh.mockImplementation(async (sql: string) => sql.includes('FROM banner_published')
      ? { id: projectId, projectId, formatKey: 'square', url: 'https://example.com/banner.png' }
      : { canvas_data: protectedNow ? canvas : {} })
    m.query.mockImplementation(async (sql: string) => {
      if (sql.includes('social_connections')) {
        protectedNow = true
        return { accessToken: 'unused', scopes: ['ads_management'], accountId: 'account' }
      }
      return { id: projectId }
    })
    await expect(routes.meta(event({ publishedId: projectId, connectionId: projectId, campaignId: 'campaign', adSetId: 'set', pageId: 'page', primaryTexts: ['hello'], headlines: ['hello'], callToAction: 'LEARN_MORE', linkUrl: 'https://example.com' }))).rejects.toMatchObject({ statusCode: 409 })
    expect(m.provider).not.toHaveBeenCalled()
    expect(m.query.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toEqual([])
  })
})

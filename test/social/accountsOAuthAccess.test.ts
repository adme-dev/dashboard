import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string>, body?: unknown }
type TestHandler = (event: TestEvent) => Promise<unknown>
type TestGlobal = typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (e: TestEvent) => Record<string, string>
  readBody: (e: TestEvent) => Promise<unknown>
  createError: (i: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
  getRequestURL: () => { origin: string }
  sendRedirect: ReturnType<typeof vi.fn>
}
const g = globalThis as TestGlobal
g.defineEventHandler = fn => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: { statusCode: number, statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)
g.getRequestURL = () => ({ origin: 'https://app.example.test' })
g.sendRedirect = vi.fn(async (_event: unknown, location: string, code?: number) => ({ location, code }))

const mockRequireRole = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockVerifyState = vi.fn()
const mockSignState = vi.fn()
const mockGetPending = vi.fn()
const mockDelPending = vi.fn()
const mockBuildMetaAuthUrl = vi.fn()
const mockBuildGoogleBusinessAuthUrl = vi.fn()
const mockBuildYouTubeAuthUrl = vi.fn()
const mockBuildLinkedInOrganicAuthUrl = vi.fn()
const mockBuildTikTokContentAuthUrl = vi.fn()
const mockUpsertSocialAccount = vi.fn()
const mockMarkWebhookSubscribed = vi.fn()
const mockSubscribePageWebhook = vi.fn()
const mockMapPagesToAccountRows = vi.fn()
const mockMapGoogleBusinessLocationsToAccountRows = vi.fn()
const mockMapYouTubeChannelsToAccountRows = vi.fn()
const mockMapLinkedInOrganizationsToAccountRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a) }))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
  execute: (...a: unknown[]) => mockExecute(...a)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a)
}))
vi.mock('~~/server/utils/socialOAuth/state', () => ({
  verifyState: (...a: unknown[]) => mockVerifyState(...a),
  signState: (...a: unknown[]) => mockSignState(...a)
}))
vi.mock('~~/server/utils/socialOAuth/pending', () => ({
  getPending: (...a: unknown[]) => mockGetPending(...a),
  delPending: (...a: unknown[]) => mockDelPending(...a)
}))
vi.mock('~~/server/utils/socialOAuth/env', () => ({
  getSocialOauthStateSecret: () => 'secret',
  isGoogleBusinessConnectionEnabled: () => true,
  getGoogleBusinessOAuthConfig: () => ({ clientId: 'google-client', clientSecret: 'google-secret' }),
  buildGoogleBusinessRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/google-business',
  isYouTubeConnectionEnabled: () => true,
  getYouTubeOAuthConfig: () => ({ clientId: 'youtube-client', clientSecret: 'youtube-secret' }),
  buildYouTubeRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/youtube',
  isLinkedInOrganicConnectionEnabled: () => true,
  getLinkedInOrganicOAuthConfig: () => ({ clientId: 'linkedin-client', clientSecret: 'linkedin-secret' }),
  buildLinkedInOrganicRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/linkedin',
  isTikTokContentConnectionEnabled: () => true,
  getTikTokContentOAuthConfig: () => ({ clientKey: 'tiktok-client-key', clientSecret: 'tiktok-secret' }),
  buildTikTokContentRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/tiktok'
}))
vi.mock('~~/server/utils/socialOAuth/meta', () => ({
  buildMetaAuthUrl: (...a: unknown[]) => mockBuildMetaAuthUrl(...a),
  isSocialDmEnabled: () => false,
  mapPagesToAccountRows: (...a: unknown[]) => mockMapPagesToAccountRows(...a),
  subscribePageWebhook: (...a: unknown[]) => mockSubscribePageWebhook(...a)
}))
vi.mock('~~/server/utils/socialOAuth/googleBusiness', () => ({
  buildGoogleBusinessAuthUrl: (...a: unknown[]) => mockBuildGoogleBusinessAuthUrl(...a),
  mapGoogleBusinessLocationsToAccountRows: (...a: unknown[]) => mockMapGoogleBusinessLocationsToAccountRows(...a)
}))
vi.mock('~~/server/utils/socialOAuth/youtube', () => ({
  buildYouTubeAuthUrl: (...a: unknown[]) => mockBuildYouTubeAuthUrl(...a),
  mapYouTubeChannelsToAccountRows: (...a: unknown[]) => mockMapYouTubeChannelsToAccountRows(...a)
}))
vi.mock('~~/server/utils/socialOAuth/linkedin', () => ({
  buildLinkedInOrganicAuthUrl: (...a: unknown[]) => mockBuildLinkedInOrganicAuthUrl(...a),
  mapLinkedInOrganizationsToAccountRows: (...a: unknown[]) => mockMapLinkedInOrganizationsToAccountRows(...a)
}))
vi.mock('~~/server/utils/socialOAuth/tiktok', () => ({
  buildTikTokContentAuthUrl: (...a: unknown[]) => mockBuildTikTokContentAuthUrl(...a)
}))
vi.mock('~~/server/utils/socialOAuth/store', () => ({
  upsertSocialAccount: (...a: unknown[]) => mockUpsertSocialAccount(...a),
  markWebhookSubscribed: (...a: unknown[]) => mockMarkWebhookSubscribed(...a)
}))

const { default: connectMetaH } = await import('../../server/api/agency/social/publishing/accounts/connect/meta.get') as { default: TestHandler }
const { default: connectGoogleH } = await import('../../server/api/agency/social/publishing/accounts/connect/google-business.get') as { default: TestHandler }
const { default: connectYouTubeH } = await import('../../server/api/agency/social/publishing/accounts/connect/youtube.get') as { default: TestHandler }
const { default: connectLinkedInH } = await import('../../server/api/agency/social/publishing/accounts/connect/linkedin.get') as { default: TestHandler }
const { default: connectTikTokH } = await import('../../server/api/agency/social/publishing/accounts/connect/tiktok.get') as { default: TestHandler }
const { default: pendingH } = await import('../../server/api/agency/social/publishing/accounts/pending.get') as { default: TestHandler }
const { default: completeH } = await import('../../server/api/agency/social/publishing/accounts/complete.post') as { default: TestHandler }

describe('social publishing account OAuth client access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.META_APP_ID = 'meta-app'
    process.env.META_APP_SECRET = 'meta-secret'
    process.env.SOCIAL_OAUTH_STATE_SECRET = 'state-secret'
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue(null)
    mockExecute.mockResolvedValue(1)
    mockVerifyState.mockReturnValue({ nonce: 'nonce-1', clientId: 'C1', userId: 'U1' })
    mockSignState.mockReturnValue('signed-state')
    mockGetPending.mockResolvedValue({ clientId: 'C1', userId: 'U1', pages: [], expiresAt: null })
    mockDelPending.mockResolvedValue(undefined)
    mockBuildMetaAuthUrl.mockReturnValue('https://facebook.example/oauth')
    mockBuildGoogleBusinessAuthUrl.mockReturnValue('https://google.example/oauth')
    mockBuildYouTubeAuthUrl.mockReturnValue('https://youtube.example/oauth')
    mockBuildLinkedInOrganicAuthUrl.mockReturnValue('https://linkedin.example/oauth')
    mockBuildTikTokContentAuthUrl.mockReturnValue('https://tiktok.example/oauth')
    mockSubscribePageWebhook.mockResolvedValue({ ok: true })
    mockMapPagesToAccountRows.mockReturnValue([{ platform: 'facebook', account_name: 'Page', metadata: {} }])
    mockMapGoogleBusinessLocationsToAccountRows.mockReturnValue([{ platform: 'google-business', account_name: 'Store', metadata: {} }])
    mockMapYouTubeChannelsToAccountRows.mockReturnValue([{ platform: 'youtube', account_name: 'Channel', metadata: {} }])
    mockMapLinkedInOrganizationsToAccountRows.mockReturnValue([{ platform: 'linkedin', account_name: 'Organization', metadata: {} }])
    mockUpsertSocialAccount.mockResolvedValue({ status: 'ok', id: 'A1' })
    mockMarkWebhookSubscribed.mockResolvedValue(undefined)
  })

  it('requires client access before starting Meta OAuth', async () => {
    const event: TestEvent = { query: { clientId: 'C1' } }

    await connectMetaH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(g.sendRedirect).toHaveBeenCalledWith(event, 'https://facebook.example/oauth', 302)
  })

  it('requires client access before starting Google Business OAuth', async () => {
    const event: TestEvent = { query: { clientId: 'C1' } }

    await connectGoogleH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(g.sendRedirect).toHaveBeenCalledWith(event, 'https://google.example/oauth', 302)
  })

  it('requires client access before starting YouTube OAuth', async () => {
    const event: TestEvent = { query: { clientId: 'C1' } }

    await connectYouTubeH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(g.sendRedirect).toHaveBeenCalledWith(event, 'https://youtube.example/oauth', 302)
  })

  it('requires client access before starting LinkedIn organic OAuth', async () => {
    const event: TestEvent = { query: { clientId: 'C1' } }

    await connectLinkedInH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(g.sendRedirect).toHaveBeenCalledWith(event, 'https://linkedin.example/oauth', 302)
  })

  it('requires client access before starting TikTok Content Posting OAuth', async () => {
    const event: TestEvent = { query: { clientId: 'C1' } }

    await connectTikTokH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(g.sendRedirect).toHaveBeenCalledWith(event, 'https://tiktok.example/oauth', 302)
  })

  it('requires client access before exposing pending account selections', async () => {
    const event: TestEvent = { query: { token: 'selection-token' } }
    mockGetPending.mockResolvedValueOnce({
      clientId: 'C1',
      userId: 'U1',
      pages: [{ id: 'PAGE1', name: 'Page', accessToken: 'token' }],
      expiresAt: null
    })

    await pendingH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
  })

  it('exposes pending YouTube channel selections without OAuth tokens', async () => {
    const event: TestEvent = { query: { token: 'selection-token' } }
    mockGetPending.mockResolvedValueOnce({
      clientId: 'C1',
      userId: 'U1',
      platform: 'youtube',
      expiresAt: '2026-01-01T00:00:00.000Z',
      youtube: {
        accessToken: 'AT',
        refreshToken: 'RT',
        channels: [
          { id: 'UC1', name: 'Channel One', handle: '@one' },
          { id: 'UC2', name: 'Channel Two', handle: '@two' }
        ]
      }
    })
    mockQueryRows.mockResolvedValueOnce([{ platform_account_id: 'UC2', client_id: 'OTHER' }])

    const result = await pendingH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(result).toEqual([
      { id: 'UC1', name: 'Channel One', subtitle: '@one', platform: 'youtube', status: 'new' },
      { id: 'UC2', name: 'Channel Two', subtitle: '@two', platform: 'youtube', status: 'conflict' }
    ])
    expect(JSON.stringify(result)).not.toContain('AT')
    expect(JSON.stringify(result)).not.toContain('RT')
  })

  it('exposes pending LinkedIn organization selections without OAuth tokens', async () => {
    const event: TestEvent = { query: { token: 'selection-token' } }
    mockGetPending.mockResolvedValueOnce({
      clientId: 'C1',
      userId: 'U1',
      platform: 'linkedin',
      expiresAt: '2026-01-01T00:00:00.000Z',
      linkedin: {
        accessToken: 'AT',
        refreshToken: 'RT',
        organizations: [
          { id: '79988552', name: 'First Demo', vanityName: 'firstdemo', role: 'ADMINISTRATOR' },
          { id: '27056405', name: 'Second Demo', vanityName: null, role: 'ADMINISTRATOR' }
        ]
      }
    })
    mockQueryRows.mockResolvedValueOnce([{ platform_account_id: '27056405', client_id: 'OTHER' }])

    const result = await pendingH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(result).toEqual([
      { id: '79988552', name: 'First Demo', subtitle: 'firstdemo', platform: 'linkedin', status: 'new' },
      { id: '27056405', name: 'Second Demo', subtitle: 'LinkedIn organization', platform: 'linkedin', status: 'conflict' }
    ])
    expect(JSON.stringify(result)).not.toContain('AT')
    expect(JSON.stringify(result)).not.toContain('RT')
  })

  it('requires client access before consuming and completing a pending selection', async () => {
    const event: TestEvent = { body: { token: 'selection-token', pageIds: ['PAGE1'] } }
    mockGetPending.mockResolvedValueOnce({
      clientId: 'C1',
      userId: 'U1',
      pages: [{ id: 'PAGE1', name: 'Page', accessToken: 'token' }],
      expiresAt: null
    })

    await completeH(event)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(mockRequireSocialClientAccess.mock.invocationCallOrder[0])
      .toBeLessThan(mockDelPending.mock.invocationCallOrder[0])
    expect(mockUpsertSocialAccount).toHaveBeenCalledOnce()
  })

  it('completes a pending YouTube channel selection through the shared account upsert', async () => {
    const event: TestEvent = { body: { token: 'selection-token', pageIds: ['UC1'] } }
    mockGetPending.mockResolvedValueOnce({
      clientId: 'C1',
      userId: 'U1',
      platform: 'youtube',
      expiresAt: '2026-01-01T00:00:00.000Z',
      youtube: {
        accessToken: 'AT',
        refreshToken: 'RT',
        channels: [{ id: 'UC1', name: 'Channel One', handle: '@one' }]
      }
    })

    const result = await completeH(event)

    expect(mockMapYouTubeChannelsToAccountRows).toHaveBeenCalledWith(
      [{ id: 'UC1', name: 'Channel One', handle: '@one' }],
      'AT',
      'RT',
      '2026-01-01T00:00:00.000Z'
    )
    expect(mockUpsertSocialAccount).toHaveBeenCalledOnce()
    expect(result).toEqual({ connected: ['Channel'], conflicts: [] })
  })

  it('completes a pending LinkedIn organization selection through the shared account upsert', async () => {
    const event: TestEvent = { body: { token: 'selection-token', pageIds: ['79988552'] } }
    mockGetPending.mockResolvedValueOnce({
      clientId: 'C1',
      userId: 'U1',
      platform: 'linkedin',
      expiresAt: '2026-01-01T00:00:00.000Z',
      linkedin: {
        accessToken: 'AT',
        refreshToken: 'RT',
        organizations: [{ id: '79988552', name: 'First Demo', vanityName: 'firstdemo', role: 'ADMINISTRATOR' }]
      }
    })

    const result = await completeH(event)

    expect(mockMapLinkedInOrganizationsToAccountRows).toHaveBeenCalledWith(
      [{ id: '79988552', name: 'First Demo', vanityName: 'firstdemo', role: 'ADMINISTRATOR' }],
      'AT',
      'RT',
      '2026-01-01T00:00:00.000Z'
    )
    expect(mockUpsertSocialAccount).toHaveBeenCalledOnce()
    expect(result).toEqual({ connected: ['Organization'], conflicts: [] })
  })
})

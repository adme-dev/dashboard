import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string> }
type TestGlobal = typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (e: TestEvent) => Record<string, string>
  sendRedirect: ReturnType<typeof vi.fn>
}
const g = globalThis as TestGlobal
const sendRedirectMock = vi.fn(async (_event: unknown, location: string, code?: number) => ({ location, code }))

g.defineEventHandler = fn => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.sendRedirect = sendRedirectMock

const mockVerifyState = vi.fn()
const mockSignState = vi.fn()
const mockExchangeYouTubeCode = vi.fn()
const mockDiscoverYouTubeChannels = vi.fn()
const mockMapYouTubeChannelsToAccountRows = vi.fn()
const mockUpsertSocialAccount = vi.fn()
const mockPutPending = vi.fn()
const mockRequireSocialClientAccess = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  execute: vi.fn()
}))
vi.mock('~~/server/utils/socialOAuth/state', () => ({
  verifyState: (...a: unknown[]) => mockVerifyState(...a),
  signState: (...a: unknown[]) => mockSignState(...a)
}))
vi.mock('~~/server/utils/socialOAuth/env', () => ({
  getYouTubeOAuthConfig: () => ({ clientId: 'youtube-client', clientSecret: 'youtube-secret' }),
  getSocialOauthStateSecret: () => 'secret',
  buildYouTubeRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/youtube'
}))
vi.mock('~~/server/utils/socialOAuth/youtube', () => ({
  exchangeYouTubeCode: (...a: unknown[]) => mockExchangeYouTubeCode(...a),
  discoverYouTubeChannels: (...a: unknown[]) => mockDiscoverYouTubeChannels(...a),
  getYouTubeDiscoveryErrorReason: () => 'youtube_channel_list_failed',
  mapYouTubeChannelsToAccountRows: (...a: unknown[]) => mockMapYouTubeChannelsToAccountRows(...a)
}))
vi.mock('~~/server/utils/socialOAuth/store', () => ({
  upsertSocialAccount: (...a: unknown[]) => mockUpsertSocialAccount(...a)
}))
vi.mock('~~/server/utils/socialOAuth/pending', () => ({
  putPending: (...a: unknown[]) => mockPutPending(...a)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a)
}))

const { default: callbackH } = await import('../../server/api/agency/social/publishing/accounts/callback/youtube.get')

describe('YouTube publishing account callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyState.mockReturnValue({ clientId: 'C1', userId: 'U1', platform: 'youtube' })
    mockSignState.mockReturnValue('signed-selection')
    mockExchangeYouTubeCode.mockResolvedValue({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })
    mockDiscoverYouTubeChannels.mockResolvedValue([
      { id: 'UC1', name: 'Acme Channel', handle: '@acme', thumbnailUrl: null, subscriberCount: null, videoCount: null }
    ])
    mockMapYouTubeChannelsToAccountRows.mockReturnValue([
      { platform: 'youtube', platform_account_id: 'UC1', account_name: 'Acme Channel', metadata: {} }
    ])
    mockUpsertSocialAccount.mockResolvedValue({ status: 'inserted', id: 'A1' })
    mockPutPending.mockResolvedValue(true)
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('returns single-channel success to the publishing accounts page', async () => {
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(mockExchangeYouTubeCode).toHaveBeenCalledWith(
      'CODE',
      'youtube-client',
      'youtube-secret',
      'https://app.example.test/api/agency/social/publishing/accounts/callback/youtube'
    )
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_connected=1&client=C1',
      302
    )
  })

  it('returns multi-channel selection to the publishing accounts page', async () => {
    mockDiscoverYouTubeChannels.mockResolvedValueOnce([
      { id: 'UC1', name: 'Channel 1', handle: '@one', thumbnailUrl: null, subscriberCount: null, videoCount: null },
      { id: 'UC2', name: 'Channel 2', handle: '@two', thumbnailUrl: null, subscriberCount: null, videoCount: null }
    ])
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockPutPending).toHaveBeenCalledWith(event, expect.any(String), expect.objectContaining({
      clientId: 'C1',
      userId: 'U1',
      platform: 'youtube',
      youtube: expect.objectContaining({
        accessToken: 'AT',
        refreshToken: 'RT'
      })
    }))
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_select=signed-selection&client=C1',
      302
    )
  })

  it('redirects before token exchange when callback client access is no longer valid', async () => {
    mockRequireSocialClientAccess.mockRejectedValueOnce(new Error('No access'))
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockExchangeYouTubeCode).not.toHaveBeenCalled()
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_error=client_access_required&client=C1',
      302
    )
  })
})

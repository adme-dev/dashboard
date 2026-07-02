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
const mockExchangeTikTokContentCode = vi.fn()
const mockDiscoverTikTokCreator = vi.fn()
const mockMapTikTokCreatorToAccountRow = vi.fn()
const mockUpsertSocialAccount = vi.fn()
const mockRequireSocialClientAccess = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  execute: vi.fn()
}))
vi.mock('~~/server/utils/socialOAuth/state', () => ({
  verifyState: (...a: unknown[]) => mockVerifyState(...a)
}))
vi.mock('~~/server/utils/socialOAuth/env', () => ({
  getTikTokContentOAuthConfig: () => ({ clientKey: 'tiktok-client-key', clientSecret: 'tiktok-secret' }),
  getSocialOauthStateSecret: () => 'secret',
  buildTikTokContentRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/tiktok'
}))
vi.mock('~~/server/utils/socialOAuth/tiktok', () => ({
  exchangeTikTokContentCode: (...a: unknown[]) => mockExchangeTikTokContentCode(...a),
  discoverTikTokCreator: (...a: unknown[]) => mockDiscoverTikTokCreator(...a),
  getTikTokContentDiscoveryErrorReason: () => 'tiktok_creator_info_failed',
  mapTikTokCreatorToAccountRow: (...a: unknown[]) => mockMapTikTokCreatorToAccountRow(...a)
}))
vi.mock('~~/server/utils/socialOAuth/store', () => ({
  upsertSocialAccount: (...a: unknown[]) => mockUpsertSocialAccount(...a)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a)
}))

const { default: callbackH } = await import('../../server/api/agency/social/publishing/accounts/callback/tiktok.get')

describe('TikTok Content Posting account callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyState.mockReturnValue({ clientId: 'C1', userId: 'U1', platform: 'tiktok' })
    mockExchangeTikTokContentCode.mockResolvedValue({ access_token: 'AT', refresh_token: 'RT', expires_in: 86_400 })
    mockDiscoverTikTokCreator.mockResolvedValue({
      openId: 'open-1',
      displayName: 'Acme Creator',
      username: 'acme',
      avatarUrl: null,
      profileDeepLink: 'https://www.tiktok.com/@acme',
      isVerified: false
    })
    mockMapTikTokCreatorToAccountRow.mockReturnValue({
      platform: 'tiktok',
      platform_account_id: 'open-1',
      account_name: 'Acme Creator',
      metadata: {}
    })
    mockUpsertSocialAccount.mockResolvedValue({ status: 'inserted', id: 'A1' })
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('stores the creator account and returns success to the publishing accounts page', async () => {
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(mockExchangeTikTokContentCode).toHaveBeenCalledWith(
      'CODE',
      'tiktok-client-key',
      'tiktok-secret',
      'https://app.example.test/api/agency/social/publishing/accounts/callback/tiktok'
    )
    expect(mockDiscoverTikTokCreator).toHaveBeenCalledWith('AT')
    expect(mockMapTikTokCreatorToAccountRow).toHaveBeenCalledWith(
      expect.objectContaining({ openId: 'open-1' }),
      'AT',
      'RT',
      expect.any(String)
    )
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_connected=1&client=C1',
      302
    )
  })

  it('returns a guarded error when the creator is owned by another client', async () => {
    mockUpsertSocialAccount.mockResolvedValueOnce({ status: 'conflict', conflictClientName: 'Other Client' })
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_error=tiktok_creator_owned_by_another_client&client=C1',
      302
    )
  })

  it('redirects before token exchange when callback client access is no longer valid', async () => {
    mockRequireSocialClientAccess.mockRejectedValueOnce(new Error('No access'))
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockExchangeTikTokContentCode).not.toHaveBeenCalled()
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_error=client_access_required&client=C1',
      302
    )
  })
})

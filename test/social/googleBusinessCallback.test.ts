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
const mockExchangeGoogleBusinessCode = vi.fn()
const mockDiscoverGoogleBusinessLocations = vi.fn()
const mockMapGoogleBusinessLocationsToAccountRows = vi.fn()
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
  getGoogleBusinessOAuthConfig: () => ({ clientId: 'google-client', clientSecret: 'google-secret' }),
  getSocialOauthStateSecret: () => 'secret',
  buildGoogleBusinessRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/google-business'
}))
vi.mock('~~/server/utils/socialOAuth/googleBusiness', () => ({
  exchangeGoogleBusinessCode: (...a: unknown[]) => mockExchangeGoogleBusinessCode(...a),
  discoverGoogleBusinessLocations: (...a: unknown[]) => mockDiscoverGoogleBusinessLocations(...a),
  getGoogleBusinessDiscoveryErrorReason: () => 'location_list_failed',
  mapGoogleBusinessLocationsToAccountRows: (...a: unknown[]) => mockMapGoogleBusinessLocationsToAccountRows(...a)
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

const { default: callbackH } = await import('../../server/api/agency/social/publishing/accounts/callback/google-business.get')

describe('Google Business publishing account callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyState.mockReturnValue({ clientId: 'C1', userId: 'U1', platform: 'google-business' })
    mockSignState.mockReturnValue('signed-selection')
    mockExchangeGoogleBusinessCode.mockResolvedValue({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })
    mockDiscoverGoogleBusinessLocations.mockResolvedValue([
      { id: 'acc1:loc1', name: 'Store', accountId: 'acc1', accountName: 'Acme', locationId: 'loc1', locationResourceName: 'accounts/acc1/locations/loc1', address: null }
    ])
    mockMapGoogleBusinessLocationsToAccountRows.mockReturnValue([
      { platform: 'google-business', platform_account_id: 'acc1:loc1', account_name: 'Store', metadata: {} }
    ])
    mockUpsertSocialAccount.mockResolvedValue({ status: 'inserted', id: 'A1' })
    mockPutPending.mockResolvedValue(true)
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('returns single-location success to the publishing accounts page', async () => {
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_connected=1&client=C1',
      302
    )
  })

  it('returns multi-location selection to the publishing accounts page', async () => {
    mockDiscoverGoogleBusinessLocations.mockResolvedValueOnce([
      { id: 'acc1:loc1', name: 'Store 1', accountId: 'acc1', accountName: 'Acme', locationId: 'loc1', locationResourceName: 'accounts/acc1/locations/loc1', address: null },
      { id: 'acc1:loc2', name: 'Store 2', accountId: 'acc1', accountName: 'Acme', locationId: 'loc2', locationResourceName: 'accounts/acc1/locations/loc2', address: null }
    ])
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

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

    expect(mockExchangeGoogleBusinessCode).not.toHaveBeenCalled()
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_error=client_access_required&client=C1',
      302
    )
  })
})

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
const mockExchangeLinkedInOrganicCode = vi.fn()
const mockDiscoverLinkedInOrganizations = vi.fn()
const mockMapLinkedInOrganizationsToAccountRows = vi.fn()
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
  getLinkedInOrganicOAuthConfig: () => ({ clientId: 'linkedin-client', clientSecret: 'linkedin-secret' }),
  getSocialOauthStateSecret: () => 'secret',
  buildLinkedInOrganicRedirectUri: () => 'https://app.example.test/api/agency/social/publishing/accounts/callback/linkedin'
}))
vi.mock('~~/server/utils/socialOAuth/linkedin', () => ({
  exchangeLinkedInOrganicCode: (...a: unknown[]) => mockExchangeLinkedInOrganicCode(...a),
  discoverLinkedInOrganizations: (...a: unknown[]) => mockDiscoverLinkedInOrganizations(...a),
  getLinkedInDiscoveryErrorReason: () => 'linkedin_organization_list_failed',
  mapLinkedInOrganizationsToAccountRows: (...a: unknown[]) => mockMapLinkedInOrganizationsToAccountRows(...a)
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

const { default: callbackH } = await import('../../server/api/agency/social/publishing/accounts/callback/linkedin.get')

describe('LinkedIn organic publishing account callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyState.mockReturnValue({ clientId: 'C1', userId: 'U1', platform: 'linkedin' })
    mockSignState.mockReturnValue('signed-selection')
    mockExchangeLinkedInOrganicCode.mockResolvedValue({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })
    mockDiscoverLinkedInOrganizations.mockResolvedValue([
      { id: '79988552', urn: 'urn:li:organization:79988552', name: 'First Demo', vanityName: 'firstdemo', role: 'ADMINISTRATOR' }
    ])
    mockMapLinkedInOrganizationsToAccountRows.mockReturnValue([
      { platform: 'linkedin', platform_account_id: '79988552', account_name: 'First Demo', metadata: {} }
    ])
    mockUpsertSocialAccount.mockResolvedValue({ status: 'inserted', id: 'A1' })
    mockPutPending.mockResolvedValue(true)
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
  })

  it('returns single-organization success to the publishing accounts page', async () => {
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(event, 'C1')
    expect(mockExchangeLinkedInOrganicCode).toHaveBeenCalledWith(
      'CODE',
      'linkedin-client',
      'linkedin-secret',
      'https://app.example.test/api/agency/social/publishing/accounts/callback/linkedin'
    )
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_connected=1&client=C1',
      302
    )
  })

  it('returns multi-organization selection to the publishing accounts page', async () => {
    mockDiscoverLinkedInOrganizations.mockResolvedValueOnce([
      { id: '79988552', urn: 'urn:li:organization:79988552', name: 'First Demo', vanityName: 'firstdemo', role: 'ADMINISTRATOR' },
      { id: '27056405', urn: 'urn:li:organization:27056405', name: 'Second Demo', vanityName: null, role: 'ADMINISTRATOR' }
    ])
    const event: TestEvent = { query: { code: 'CODE', state: 'STATE' } }

    await callbackH(event as never)

    expect(mockPutPending).toHaveBeenCalledWith(event, expect.any(String), expect.objectContaining({
      clientId: 'C1',
      userId: 'U1',
      platform: 'linkedin',
      linkedin: expect.objectContaining({
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

    expect(mockExchangeLinkedInOrganicCode).not.toHaveBeenCalled()
    expect(sendRedirectMock).toHaveBeenCalledWith(
      event,
      '/agency/social/publishing/accounts?social_error=client_access_required&client=C1',
      302
    )
  })
})

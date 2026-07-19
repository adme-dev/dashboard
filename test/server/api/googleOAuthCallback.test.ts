import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  consumeAttempt: vi.fn(),
  storeProfile: vi.fn(),
  sendRedirect: vi.fn((_event, location: string, statusCode: number) => ({ location, statusCode })),
  exchangeGoogleCode: vi.fn(),
  listAccessibleCustomers: vi.fn(),
  getCustomerInfo: vi.fn(),
  listClientAccounts: vi.fn()
}))

vi.mock('h3', () => ({
  sendRedirect: mocks.sendRedirect,
  getRequestURL: vi.fn(() => new URL('https://app.xeroflow.io/api/agency/social/google/callback'))
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' }))
}))

vi.mock('~~/server/utils/googleCredentialProfiles', () => ({
  consumeGoogleOAuthAttempt: mocks.consumeAttempt,
  storeGoogleCredentialProfile: mocks.storeProfile
}))

vi.mock('~~/server/utils/googleAdsClient', () => ({
  exchangeGoogleCode: mocks.exchangeGoogleCode,
  GOOGLE_ADS_OAUTH_SCOPES: [
    'https://www.googleapis.com/auth/adwords',
    'https://www.googleapis.com/auth/datamanager'
  ],
  listAccessibleCustomers: mocks.listAccessibleCustomers,
  getCustomerInfo: mocks.getCustomerInfo,
  listClientAccounts: mocks.listClientAccounts
}))

vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: vi.fn(() => ({
    googleClientId: 'client-id',
    googleClientSecret: 'client-secret',
    googleDeveloperToken: 'developer-token'
  }))
}))

describe('Google OAuth callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('eventHandler', (handler: unknown) => handler)
    vi.stubGlobal('getQuery', () => ({ code: 'approved-code', state: 'approved-state' }))
    vi.stubGlobal('useRuntimeConfig', () => ({
      googleRedirectUri: '/api/agency/social/google/callback'
    }))
    mocks.consumeAttempt.mockResolvedValue({ id: 'attempt-id' })
    mocks.exchangeGoogleCode.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager'
    })
    mocks.listAccessibleCustomers.mockResolvedValue(['1234567890'])
    mocks.listClientAccounts.mockResolvedValue([{
      customerId: '9876543210',
      name: 'Child account',
      currencyCode: 'AUD',
      descriptiveName: 'Child account'
    }])
    mocks.storeProfile.mockResolvedValue({ profileId: 'profile-id', storedCount: 1 })
  })

  it('persists the parent manager with the credential profile for child accounts', async () => {
    const handler = (await import(
      '~~/server/api/agency/social/google/callback.get'
    )).default as (event: unknown) => Promise<unknown>

    await handler({})

    expect(mocks.storeProfile).toHaveBeenCalledWith(expect.objectContaining({
      accounts: [expect.objectContaining({
        customerId: '9876543210',
        managerCustomerId: '1234567890'
      })]
    }))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createAttempt: vi.fn(),
  consumeAttempt: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  listAccessibleCustomers: vi.fn(),
  listClientAccounts: vi.fn(),
  getCustomerInfo: vi.fn(),
  storeProfile: vi.fn(),
  sendRedirect: vi.fn(),
  query: {} as Record<string, unknown>,
}))

vi.mock('h3', () => ({
  getRequestURL: () => new URL('https://app.xeroflow.io/api/agency/social/google/connect'),
  sendRedirect: (...args: unknown[]) => mocks.sendRedirect(...args),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mocks.requireAuth(...args),
}))

vi.mock('~~/server/utils/googleCredentialProfiles', () => ({
  createGoogleOAuthAttempt: (...args: unknown[]) => mocks.createAttempt(...args),
  consumeGoogleOAuthAttempt: (...args: unknown[]) => mocks.consumeAttempt(...args),
  storeGoogleCredentialProfile: (...args: unknown[]) => mocks.storeProfile(...args),
}))

vi.mock('~~/server/utils/googleAdsClient', () => ({
  GOOGLE_ADS_OAUTH_SCOPES: ['https://www.googleapis.com/auth/adwords'],
  getGoogleAuthUrl: (...args: unknown[]) => mocks.getGoogleAuthUrl(...args),
  exchangeGoogleCode: (...args: unknown[]) => mocks.exchangeCode(...args),
  listAccessibleCustomers: (...args: unknown[]) => mocks.listAccessibleCustomers(...args),
  listClientAccounts: (...args: unknown[]) => mocks.listClientAccounts(...args),
  getCustomerInfo: (...args: unknown[]) => mocks.getCustomerInfo(...args),
}))

vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: () => ({
    googleClientId: 'client-id',
    googleClientSecret: 'client-secret',
    googleDeveloperToken: 'developer-token',
    googleAdsLoginCustomerId: '',
  }),
}))

;(globalThis as any).eventHandler = (handler: unknown) => handler
;(globalThis as any).useRuntimeConfig = () => ({ googleRedirectUri: '/api/agency/social/google/callback' })
;(globalThis as any).getQuery = () => mocks.query
;(globalThis as any).createError = (input: unknown) => input

describe('Google multi-profile OAuth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = {}
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
    mocks.createAttempt.mockResolvedValue({ attemptId: 'attempt-1', state: 'state-1' })
    mocks.getGoogleAuthUrl.mockReturnValue('https://accounts.google.test/oauth')
    mocks.sendRedirect.mockImplementation((_event, location, statusCode) => ({ location, statusCode }))
  })

  it('creates a server-persisted OAuth attempt instead of a shared cookie', async () => {
    const handler = (await import('~~/server/api/agency/social/google/connect.get')).default
    const result = await handler({} as never)

    expect(mocks.createAttempt).toHaveBeenCalledWith('user-1')
    expect(mocks.getGoogleAuthUrl).toHaveBeenCalledWith(
      'client-id',
      'https://app.xeroflow.io/api/agency/social/google/callback',
      'state-1',
    )
    expect(result).toEqual({ url: 'https://accounts.google.test/oauth', attemptId: 'attempt-1' })
  })

  it('rejects invalid or replayed state before exchanging a code', async () => {
    mocks.query = { code: 'authorization-code', state: 'replayed-state' }
    mocks.consumeAttempt.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/google/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.exchangeCode).not.toHaveBeenCalled()
    expect(result).toMatchObject({ statusCode: 302 })
    expect(result.location).toContain('Invalid%20OAuth%20state')
  })

  it('records manager context and stores one profile for all discovered accounts', async () => {
    mocks.query = { code: 'authorization-code', state: 'valid-state' }
    mocks.consumeAttempt.mockResolvedValue({ id: 'attempt-1' })
    mocks.exchangeCode.mockResolvedValue({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/adwords',
    })
    mocks.listAccessibleCustomers.mockResolvedValue(['1111111111', '3333333333'])
    mocks.listClientAccounts
      .mockResolvedValueOnce([{ customerId: '2222222222', name: 'CP Ford', currencyCode: 'AUD' }])
      .mockResolvedValueOnce([])
    mocks.getCustomerInfo.mockResolvedValue({ customerId: '3333333333', name: 'Direct Account', currencyCode: 'AUD' })
    mocks.storeProfile.mockResolvedValue({ profileId: 'profile-1', storedCount: 2 })
    const handler = (await import('~~/server/api/agency/social/google/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.storeProfile).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      accessibleCustomerIds: ['1111111111', '3333333333'],
      accounts: [
        expect.objectContaining({ customerId: '2222222222', managerCustomerId: '1111111111' }),
        expect.objectContaining({ customerId: '3333333333', managerCustomerId: null }),
      ],
    }))
    expect(result.location).toContain('success=true')
    expect(result.location).toContain('accounts=2')
    expect(result.location).toContain('profile=profile-1')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  deleteCookie: vi.fn(),
  sendRedirect: vi.fn((_event, location: string, statusCode: number) => ({ location, statusCode })),
  exchangeGoogleCode: vi.fn(),
  listAccessibleCustomers: vi.fn(),
  getCustomerInfo: vi.fn(),
  listClientAccounts: vi.fn()
}))

vi.mock('h3', () => ({
  getCookie: vi.fn(() => 'approved-state'),
  deleteCookie: mocks.deleteCookie,
  sendRedirect: mocks.sendRedirect,
  getRequestURL: vi.fn(() => new URL('https://app.xeroflow.io/api/agency/social/google/callback'))
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' }))
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne
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
    mocks.queryOne.mockResolvedValue({ id: 'connection-id' })
  })

  it('persists the parent manager as the Data Manager login account for child accounts', async () => {
    const handler = (await import(
      '~~/server/api/agency/social/google/callback.get'
    )).default as (event: unknown) => Promise<unknown>

    await handler({})

    const insertParameters = mocks.queryOne.mock.calls[0]?.[1] as unknown[]
    const metadata = JSON.parse(String(insertParameters[8]))
    expect(metadata.google_login_customer_id).toBe('1234567890')
  })
})

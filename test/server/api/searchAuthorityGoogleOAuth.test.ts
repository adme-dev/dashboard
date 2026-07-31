import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  requireAuth: vi.fn(),
  requireAccess: vi.fn(),
  createAttempt: vi.fn(),
  consumeAttempt: vi.fn(),
  resolveConfig: vi.fn(),
  buildRedirectUri: vi.fn(),
  exchangeCode: vi.fn(),
  getUserInfo: vi.fn(),
  storeCredential: vi.fn(),
  sendRedirect: vi.fn()
}))

vi.mock('h3', () => ({
  getQuery: () => mocks.query,
  sendRedirect: (...args: unknown[]) => mocks.sendRedirect(...args)
}))
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: mocks.requireAuth
}))
vi.mock('~~/server/utils/searchAuthority/access', () => ({
  requireAgencySearchAuthorityAccess: mocks.requireAccess
}))
vi.mock('~~/server/utils/googleCredentialProfiles', () => ({
  createGoogleOAuthAttempt: mocks.createAttempt,
  consumeGoogleOAuthAttempt: mocks.consumeAttempt
}))
vi.mock('~~/server/utils/googleOAuthRuntimeConfig', () => ({
  SEARCH_CONSOLE_CALLBACK_PATH: '/api/agency/search-authority/google/callback',
  resolveGoogleOAuthRuntimeConfig: mocks.resolveConfig,
  buildGoogleOAuthRedirectUri: mocks.buildRedirectUri
}))
vi.mock('~~/server/utils/googleAdsClient', () => ({
  exchangeGoogleCode: mocks.exchangeCode
}))
vi.mock('~~/server/utils/ga4Client', () => ({
  getGoogleUserInfo: mocks.getUserInfo
}))
vi.mock('~~/server/utils/searchAuthority/credentials', () => ({
  storeSearchConsoleCredentialProfile: mocks.storeCredential
}))

vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', () => mocks.query)

describe('Search Authority Google OAuth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = {}
    mocks.requireAuth.mockResolvedValue({ id: USER_ID, role: 'owner' })
    mocks.requireAccess.mockResolvedValue({ id: USER_ID, role: 'owner' })
    mocks.createAttempt.mockResolvedValue({
      attemptId: 'attempt-1',
      state: 'state-1'
    })
    mocks.resolveConfig.mockReturnValue({
      googleClientId: 'google-client',
      googleClientSecret: 'google-secret',
      searchConsoleRedirectUri: '/api/agency/search-authority/google/callback'
    })
    mocks.buildRedirectUri.mockReturnValue(
      'https://app.xeroflow.io/api/agency/search-authority/google/callback'
    )
    mocks.sendRedirect.mockImplementation((_event, location, statusCode) => ({
      location,
      statusCode
    }))
  })

  it('binds the selected client and Search Console purpose to one-time OAuth state', async () => {
    mocks.query = { clientId: CLIENT_ID }

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/connect.get'
    )).default
    const result = await handler({} as never)

    expect(mocks.createAttempt).toHaveBeenCalledWith(USER_ID, {
      purpose: 'search_console',
      context: { clientId: CLIENT_ID }
    })
    expect(result.url).toContain('webmasters.readonly')
    expect(result.url).not.toContain('adwords')
  })

  it('consumes denied consent state and redirects without exchanging a code', async () => {
    mocks.query = {
      state: 'denied-state',
      error: 'access_denied',
      error_description: 'User denied access'
    }
    mocks.consumeAttempt.mockResolvedValue({
      id: 'attempt-1',
      context: { clientId: CLIENT_ID }
    })

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/callback.get'
    )).default
    const result = await handler({} as never)

    expect(mocks.consumeAttempt).toHaveBeenCalledWith(
      'denied-state',
      USER_ID,
      { purpose: 'search_console' }
    )
    expect(mocks.exchangeCode).not.toHaveBeenCalled()
    expect(result.location).toContain('platform=search-console')
    expect(result.location).toContain('success=false')
  })

  it('rejects replayed or cross-purpose state before token exchange', async () => {
    mocks.query = { state: 'replayed-state', code: 'authorization-code' }
    mocks.consumeAttempt.mockResolvedValue(null)

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/callback.get'
    )).default
    await handler({} as never)

    expect(mocks.exchangeCode).not.toHaveBeenCalled()
    expect(mocks.storeCredential).not.toHaveBeenCalled()
  })

  it('stores an approved grant only through encrypted Search Console persistence', async () => {
    mocks.query = { state: 'valid-state', code: 'authorization-code' }
    mocks.consumeAttempt.mockResolvedValue({
      id: 'attempt-1',
      context: { clientId: CLIENT_ID }
    })
    mocks.exchangeCode.mockResolvedValue({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid email https://www.googleapis.com/auth/webmasters.readonly'
    })
    mocks.getUserInfo.mockResolvedValue({
      sub: 'google-subject',
      email: 'buyer@example.com'
    })
    mocks.storeCredential.mockResolvedValue({
      connectionId: 'connection-1',
      profileId: 'profile-1'
    })

    const handler = (await import(
      '~~/server/api/agency/search-authority/google/callback.get'
    )).default
    const result = await handler({} as never)

    expect(mocks.requireAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(mocks.storeCredential).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      userId: USER_ID,
      googleSub: 'google-subject',
      email: 'buyer@example.com',
      tokens: expect.objectContaining({
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret'
      })
    }))
    expect(result.location).toContain('success=true')
    expect(result.location).not.toContain('access-secret')
    expect(result.location).not.toContain('refresh-secret')
  })
})

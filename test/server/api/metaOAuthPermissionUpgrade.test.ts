import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createAttempt: vi.fn(),
  consumeAttempt: vi.fn(),
  getMetaAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  exchangeLongToken: vi.fn(),
  getAdAccounts: vi.fn(),
  listGrantedPermissions: vi.fn(),
  queryOne: vi.fn(),
  sendRedirect: vi.fn((_event, location: string, statusCode: number) => ({ location, statusCode })),
  query: {} as Record<string, unknown>,
  runtimeConfig: {
    metaAppId: 'app-id',
    metaAppSecret: 'app-secret',
    metaRedirectUri: '/api/agency/social/meta/callback'
  } as Record<string, string>
}))

vi.mock('h3', () => ({
  getRequestURL: () => new URL('https://app.xeroflow.io/api/agency/social/meta/connect'),
  sendRedirect: (...args: unknown[]) => mocks.sendRedirect(...args)
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => mocks.requireAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mocks.queryOne(...args) }))
vi.mock('~~/server/utils/metaOAuthAttempts', () => ({
  createMetaOAuthAttempt: (...args: unknown[]) => mocks.createAttempt(...args),
  consumeMetaOAuthAttempt: (...args: unknown[]) => mocks.consumeAttempt(...args)
}))
vi.mock('~~/server/utils/metaClient', () => ({
  getMetaAuthUrl: (...args: unknown[]) => mocks.getMetaAuthUrl(...args),
  exchangeMetaCode: (...args: unknown[]) => mocks.exchangeCode(...args),
  exchangeForLongLivedToken: (...args: unknown[]) => mocks.exchangeLongToken(...args),
  getAdAccounts: (...args: unknown[]) => mocks.getAdAccounts(...args)
}))
vi.mock('~~/server/utils/metaCatalogProvider', () => ({
  createMetaCatalogProvider: () => ({ listGrantedPermissions: mocks.listGrantedPermissions })
}))

const globals = globalThis as unknown as Record<string, unknown>
globals.eventHandler = (fn: (event: unknown) => unknown) => fn
globals.getQuery = () => mocks.query
globals.useRuntimeConfig = () => mocks.runtimeConfig
globals.createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('Meta catalogue permission upgrade OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query = {}
    mocks.runtimeConfig = {
      metaAppId: 'app-id',
      metaAppSecret: 'app-secret',
      metaRedirectUri: '/api/agency/social/meta/callback'
    }
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
    mocks.createAttempt.mockResolvedValue({ attemptId: 'attempt-1', state: 'state-1' })
    mocks.getMetaAuthUrl.mockReturnValue('https://facebook.example/oauth')
    mocks.exchangeCode.mockResolvedValue({ access_token: 'short-token' })
    mocks.exchangeLongToken.mockResolvedValue({ access_token: 'long-token', expires_in: 3600 })
    mocks.listGrantedPermissions.mockResolvedValue(['ads_read', 'business_management', 'catalog_management'])
    mocks.getAdAccounts.mockResolvedValue([{
      account_id: '1444686743700725',
      id: 'act_1444686743700725',
      name: 'Geelong GWM',
      currency: 'AUD',
      account_status: 1
    }])
    mocks.consumeAttempt.mockResolvedValue({ id: 'attempt-1', intent: 'catalog_management' })
    mocks.queryOne.mockResolvedValue({ id: 'connection-1' })
  })

  it('creates a server-persisted catalogue rerequest attempt', async () => {
    mocks.query = { intent: 'catalog_management' }
    const handler = (await import('~~/server/api/agency/social/meta/connect.get')).default

    const result = await handler({} as never)

    expect(mocks.createAttempt).toHaveBeenCalledWith('user-1', 'catalog_management')
    expect(mocks.getMetaAuthUrl).toHaveBeenCalledWith(
      'app-id',
      'https://app.xeroflow.io/api/agency/social/meta/callback',
      'state-1',
      { intent: 'catalog_management' }
    )
    expect(result).toEqual({ url: 'https://facebook.example/oauth', attemptId: 'attempt-1' })
  })

  it('uses Cloudflare request bindings when build-time Meta runtime config is empty', async () => {
    mocks.query = { intent: 'catalog_management' }
    mocks.runtimeConfig = {
      metaAppId: '',
      metaAppSecret: '',
      metaRedirectUri: '/api/agency/social/meta/callback'
    }
    const handler = (await import('~~/server/api/agency/social/meta/connect.get')).default

    const result = await handler({
      context: {
        cloudflare: {
          env: {
            META_APP_ID: 'binding-app-id',
            META_APP_SECRET: 'binding-app-secret',
            META_REDIRECT_URI: '/api/agency/social/meta/callback'
          }
        }
      }
    } as never)

    expect(mocks.getMetaAuthUrl).toHaveBeenCalledWith(
      'binding-app-id',
      'https://app.xeroflow.io/api/agency/social/meta/callback',
      'state-1',
      { intent: 'catalog_management' }
    )
    expect(result).toEqual({ url: 'https://facebook.example/oauth', attemptId: 'attempt-1' })
  })

  it('rejects invalid or replayed state before exchanging a token', async () => {
    mocks.query = { code: 'code', state: 'replayed' }
    mocks.consumeAttempt.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/meta/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.exchangeCode).not.toHaveBeenCalled()
    expect(result.location).toContain('Invalid%20OAuth%20state')
  })

  it('stores the permissions Meta actually granted without deleting client mappings', async () => {
    mocks.query = { code: 'code', state: 'valid-state' }
    const handler = (await import('~~/server/api/agency/social/meta/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (platform, account_id)'), expect.arrayContaining([
      'meta',
      '1444686743700725',
      'Geelong GWM',
      'long-token',
      expect.any(Date),
      ['ads_read', 'business_management', 'catalog_management']
    ]))
    const sql = String(mocks.queryOne.mock.calls[0]?.[0])
    expect(sql).not.toContain('client_id = EXCLUDED')
    expect(result.location).toContain('intent=catalog_management')
  })

  it('uses Cloudflare request bindings to exchange the catalogue permission callback', async () => {
    mocks.query = { code: 'code', state: 'valid-state' }
    mocks.runtimeConfig = {
      metaAppId: '',
      metaAppSecret: '',
      metaRedirectUri: '/api/agency/social/meta/callback'
    }
    const handler = (await import('~~/server/api/agency/social/meta/callback.get')).default

    await handler({
      context: {
        cloudflare: {
          env: {
            META_APP_ID: 'binding-app-id',
            META_APP_SECRET: 'binding-app-secret',
            META_REDIRECT_URI: '/api/agency/social/meta/callback'
          }
        }
      }
    } as never)

    expect(mocks.exchangeCode).toHaveBeenCalledWith(
      'code',
      'binding-app-id',
      'binding-app-secret',
      'https://app.xeroflow.io/api/agency/social/meta/callback'
    )
    expect(mocks.exchangeLongToken).toHaveBeenCalledWith(
      'short-token',
      'binding-app-id',
      'binding-app-secret'
    )
  })
})

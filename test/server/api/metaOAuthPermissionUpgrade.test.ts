import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createAttempt: vi.fn(),
  consumeAttempt: vi.fn(),
  getMetaAuthUrl: vi.fn(),
  exchangeCode: vi.fn(),
  exchangeLongToken: vi.fn(),
  getPermissionEvidence: vi.fn(),
  debugToken: vi.fn(),
  getTargetIds: vi.fn(),
  queryOne: vi.fn(),
  sendRedirect: vi.fn((_event, location: string, statusCode: number) => ({ location, statusCode })),
  query: {} as Record<string, unknown>,
  runtimeConfig: {
    metaAppId: 'app-id',
    metaAppSecret: 'app-secret',
    metaRedirectUri: '/api/agency/social/meta/callback',
    metaLoginConfigId: '',
  } as Record<string, string>,
}))

vi.mock('h3', () => ({
  getRequestURL: () => new URL('https://app.xeroflow.io/api/agency/social/meta/connect'),
  sendRedirect: (...args: unknown[]) => mocks.sendRedirect(...args),
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => mocks.requireAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mocks.queryOne(...args) }))
vi.mock('~~/server/utils/metaOAuthAttempts', () => ({
  createMetaOAuthAttempt: (...args: unknown[]) => mocks.createAttempt(...args),
  consumeMetaOAuthAttempt: (...args: unknown[]) => mocks.consumeAttempt(...args),
}))
vi.mock('~~/server/utils/metaClient', () => ({
  getMetaAuthUrl: (...args: unknown[]) => mocks.getMetaAuthUrl(...args),
  exchangeMetaCode: (...args: unknown[]) => mocks.exchangeCode(...args),
  exchangeForLongLivedToken: (...args: unknown[]) => mocks.exchangeLongToken(...args),
}))
vi.mock('~~/server/utils/metaPermissionEvidence', () => ({
  getEffectiveMetaPermissionEvidence: (...args: unknown[]) => mocks.getPermissionEvidence(...args),
}))
vi.mock('~~/server/utils/metaTokenDebug', () => ({
  debugMetaAccessToken: (...args: unknown[]) => mocks.debugToken(...args),
  getMetaGranularTargetIds: (...args: unknown[]) => mocks.getTargetIds(...args),
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
      metaRedirectUri: '/api/agency/social/meta/callback',
      metaLoginConfigId: '',
    }
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
    mocks.createAttempt.mockResolvedValue({ attemptId: 'attempt-1', state: 'state-1' })
    mocks.consumeAttempt.mockResolvedValue({
      id: 'attempt-1',
      intent: 'catalog_management',
      targetConnectionId: 'connection-1',
    })
    mocks.getMetaAuthUrl.mockReturnValue('https://facebook.example/oauth')
    mocks.exchangeCode.mockResolvedValue({ access_token: 'configured-token', expires_in: 3600 })
    mocks.exchangeLongToken.mockResolvedValue({ access_token: 'long-token', expires_in: 3600 })
    mocks.debugToken.mockRejectedValue(new Error('debug unavailable'))
    mocks.getTargetIds.mockReturnValue([])
    mocks.getPermissionEvidence.mockResolvedValue({
      scopes: ['ads_management', 'business_management', 'catalog_management'],
      adAccounts: [{
        account_id: '1444686743700725',
        id: 'act_1444686743700725',
        name: 'Geelong GWM',
        currency: 'AUD',
        account_status: 1,
      }],
      businesses: [{ id: 'business-1', name: 'Geelong GWM' }],
      evidence: {
        permissionsEndpoint: true,
        adsManagement: true,
        businessManagement: true,
        catalogManagement: true,
      },
    })
    mocks.queryOne.mockResolvedValue({ id: 'connection-1' })
  })

  it('creates a server-persisted catalogue attempt for the legacy intent alias', async () => {
    mocks.query = { intent: 'catalog_management' }
    const handler = (await import('~~/server/api/agency/social/meta/connect.get')).default

    const result = await handler({} as never)

    expect(mocks.createAttempt).toHaveBeenCalledWith('user-1', 'catalog_management')
    expect(mocks.getMetaAuthUrl).toHaveBeenCalledWith(
      'app-id',
      'https://app.xeroflow.io/api/agency/social/meta/callback',
      'state-1',
      { intent: 'catalog_management' },
    )
    expect(result).toEqual({ url: 'https://facebook.example/oauth', attemptId: 'attempt-1' })
  })

  it('uses Cloudflare bindings when build-time Meta config is empty', async () => {
    mocks.query = { intent: 'catalog' }
    mocks.runtimeConfig = {
      metaAppId: '',
      metaAppSecret: '',
      metaRedirectUri: '/api/agency/social/meta/callback',
      metaLoginConfigId: '',
    }
    const handler = (await import('~~/server/api/agency/social/meta/connect.get')).default

    await handler({
      context: {
        cloudflare: {
          env: {
            META_APP_ID: 'binding-app-id',
            META_APP_SECRET: 'binding-app-secret',
            META_REDIRECT_URI: '/api/agency/social/meta/callback',
          },
        },
      },
    } as never)

    expect(mocks.getMetaAuthUrl).toHaveBeenCalledWith(
      'binding-app-id',
      'https://app.xeroflow.io/api/agency/social/meta/callback',
      'state-1',
      { intent: 'catalog_management' },
    )
  })

  it('binds catalogue consent to one active Meta connection', async () => {
    const connectionId = 'a864afee-99c4-4815-81ef-e0bb7577173e'
    mocks.query = { intent: 'catalog', connectionId }
    mocks.queryOne.mockResolvedValue({ id: connectionId })
    const handler = (await import('~~/server/api/agency/social/meta/connect.get')).default

    await handler({} as never)

    expect(mocks.queryOne).toHaveBeenCalledWith(
      expect.stringContaining("platform = 'meta'"),
      [connectionId, 'user-1'],
    )
    expect(mocks.createAttempt).toHaveBeenCalledWith(
      'user-1',
      'catalog_management',
      { targetConnectionId: connectionId },
    )
  })

  it('rejects a malformed target connection before querying storage', async () => {
    mocks.query = { intent: 'catalog', connectionId: 'not-a-uuid' }
    const handler = (await import('~~/server/api/agency/social/meta/connect.get')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Meta connection ID',
    })
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.createAttempt).not.toHaveBeenCalled()
  })

  it('rejects invalid or replayed state before exchanging a token', async () => {
    mocks.query = { code: 'code', state: 'replayed' }
    mocks.consumeAttempt.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/meta/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.exchangeCode).not.toHaveBeenCalled()
    expect(result.location).toContain('Invalid%20OAuth%20state')
  })

  it('retains the Business Login token and stores proven scopes', async () => {
    mocks.query = { code: 'code', state: 'valid-state' }
    const handler = (await import('~~/server/api/agency/social/meta/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.exchangeLongToken).not.toHaveBeenCalled()
    expect(mocks.getPermissionEvidence).toHaveBeenCalledWith(
      'configured-token',
      'catalog',
      { businessTargetIds: [] },
    )
    expect(mocks.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (platform, account_id)'),
      expect.arrayContaining([
        'meta',
        '1444686743700725',
        'Geelong GWM',
        'configured-token',
        expect.any(Date),
        ['ads_management', 'business_management', 'catalog_management'],
      ]),
    )
    expect(String(mocks.queryOne.mock.calls[0]?.[0])).not.toContain('client_id = EXCLUDED')
    expect(result.location).toContain('intent=catalog')
  })

  it('persists a Business-scoped connection when no ad account is returned', async () => {
    mocks.query = { code: 'code', state: 'valid-state' }
    mocks.getPermissionEvidence.mockResolvedValue({
      scopes: ['ads_management', 'business_management', 'catalog_management'],
      adAccounts: [],
      businesses: [{ id: 'business-1', name: 'Geelong GWM' }],
      evidence: {
        permissionsEndpoint: true,
        adsManagement: true,
        businessManagement: true,
        catalogManagement: true,
      },
    })
    const handler = (await import('~~/server/api/agency/social/meta/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (platform, account_id)'),
      expect.arrayContaining(['meta', 'business_business-1', 'Geelong GWM (Meta Business)', 'configured-token']),
    )
    expect(result.location).toContain('accounts=0')
    expect(result.location).toContain('intent=catalog')
  })

  it('fails closed when Meta does not prove catalogue access', async () => {
    mocks.query = { code: 'code', state: 'valid-state' }
    mocks.getPermissionEvidence.mockResolvedValue({
      scopes: ['ads_management', 'business_management'],
      adAccounts: [],
      businesses: [{ id: 'business-1', name: 'Geelong GWM' }],
      evidence: {
        permissionsEndpoint: true,
        adsManagement: true,
        businessManagement: true,
        catalogManagement: false,
      },
    })
    const handler = (await import('~~/server/api/agency/social/meta/callback.get')).default

    const result = await handler({} as never)

    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(result.location).toContain('success=false')
    expect(result.location).toContain('catalog_management')
  })
})

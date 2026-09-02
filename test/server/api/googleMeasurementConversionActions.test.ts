import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_ID = 'ddd19405-5cbd-4e2f-8d9c-4f820ed75b32'
const CONNECTION_ID = '96ba2b11-ba1c-4e8f-b459-0f36f6aa8959'

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  queryOne: vi.fn(),
  resolveCredential: vi.fn(),
  persistRefresh: vi.fn(),
  refreshToken: vi.fn(),
  resolveConfig: vi.fn(),
  list: vi.fn(),
  listInventory: vi.fn()
}))

let query: Record<string, string> = {}

vi.mock('~~/server/utils/measurement/access', () => ({
  requireMeasurementClientAccess: (...args: unknown[]) => mocks.requireClientAccess(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args)
}))
vi.mock('~~/server/utils/googleCredentialProfiles', () => ({
  GOOGLE_CREDENTIAL_PROFILE_JOIN: 'LEFT JOIN credential_profile',
  GOOGLE_CREDENTIAL_PROFILE_SELECT: 'credential_profile_fields',
  resolveGoogleCredential: (...args: unknown[]) => mocks.resolveCredential(...args),
  persistGoogleCredentialRefresh: (...args: unknown[]) => mocks.persistRefresh(...args)
}))
vi.mock('~~/server/utils/googleAdsClient', () => ({
  refreshGoogleToken: (...args: unknown[]) => mocks.refreshToken(...args)
}))
vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: (...args: unknown[]) => mocks.resolveConfig(...args)
}))
vi.mock('~~/server/utils/googleConversionActions', () => ({
  GoogleConversionActionDiscoveryError: class extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  },
  googleConversionActionDiscovery: {
    list: (...args: unknown[]) => mocks.list(...args)
  }
}))
vi.mock('~~/server/utils/googleAds/inventory', () => ({
  listGoogleAdsInventory: (...args: unknown[]) => mocks.listInventory(...args)
}))
vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => CLIENT_ID,
  getQuery: () => query,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('GET client Google conversion actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query = { connectionId: CONNECTION_ID, page: '1', pageSize: '50' }
    mocks.requireClientAccess.mockResolvedValue({ id: '6a5d2e15-315c-4790-b64e-5e3e17001c8e' })
    mocks.queryOne.mockResolvedValue({
      id: CONNECTION_ID,
      client_id: CLIENT_ID,
      account_id: '3584435581',
      account_name: 'Courtney & Patterson Ford',
      status: 'active',
      metadata: { google_login_customer_id: '5250473322' }
    })
    mocks.resolveCredential.mockResolvedValue({
      accessToken: 'secret-access-token',
      refreshToken: 'secret-refresh-token',
      tokenExpiresAt: '2099-01-01T00:00:00.000Z',
      profileId: '4ec76e64-1187-44f9-92c8-95e45865ee10'
    })
    mocks.resolveConfig.mockReturnValue({
      googleClientId: 'secret-client-id',
      googleClientSecret: 'secret-client-secret',
      googleDeveloperToken: 'secret-developer-token'
    })
    mocks.list.mockResolvedValue({
      items: [{
        id: '9001',
        resourceName: 'customers/3584435581/conversionActions/9001',
        name: 'XeroFlow qualified lead',
        status: 'ENABLED',
        type: 'UPLOAD_CLICKS',
        category: 'QUALIFIED_LEAD',
        origin: 'WEBSITE',
        isPrimary: false,
        includesInConversions: true,
        deliveryMode: 'offline_click'
      }],
      pagination: { page: 1, pageSize: 50, hasNextPage: false }
    })
    mocks.listInventory.mockResolvedValue({
      customerId: '3584435581',
      kind: 'conversion_action',
      items: [{
        id: '9002', name: 'Clicks to call', type: 'CLICK_TO_CALL', origin: 'GOOGLE_HOSTED',
        deliveryClass: 'google_hosted_call', managementOwner: 'google',
        primaryState: 'secondary', goalBiddability: 'not_biddable'
      }]
    })
  })

  it('scopes the connection to the authorised client and returns no credential material', async () => {
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mocks.requireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'view')
    expect(String(mocks.queryOne.mock.calls[0]?.[0])).toContain('sc.client_id = $1')
    expect(mocks.queryOne.mock.calls[0]?.[1]).toEqual([CLIENT_ID, CONNECTION_ID])
    expect(mocks.list).toHaveBeenCalledWith({
      accountId: '3584435581',
      accessToken: 'secret-access-token',
      developerToken: 'secret-developer-token',
      loginCustomerId: '5250473322',
      page: 1,
      pageSize: 50
    })
    expect(result).toEqual({
      connection: {
        id: CONNECTION_ID,
        accountId: '3584435581',
        accountName: 'Courtney & Patterson Ford'
      },
      items: expect.any(Array),
      pagination: { page: 1, pageSize: 50, hasNextPage: false }
    })
    expect(JSON.stringify(result)).not.toMatch(/secret|accessToken|refreshToken|developerToken/i)
  })

  it('returns a classified registry through the exact tenant-bound connection', async () => {
    query = { connectionId: CONNECTION_ID, page: '1', pageSize: '50', mode: 'registry' }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mocks.listInventory).toHaveBeenCalledWith({
      kind: 'conversion_action', customerId: '3584435581', status: 'ALL', maxResults: 50,
      activityWindow: 'LAST_30_DAYS',
      auth: {
        accessToken: 'secret-access-token', developerToken: 'secret-developer-token',
        loginCustomerId: '5250473322'
      }
    })
    expect(result).toMatchObject({
      items: [expect.objectContaining({ deliveryClass: 'google_hosted_call' })]
    })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/secret|accessToken|refreshToken|developerToken/i)
  })

  it('refreshes an expiring profile credential without exposing the replacement token', async () => {
    mocks.resolveCredential.mockResolvedValue({
      accessToken: 'expired-access',
      refreshToken: 'secret-refresh-token',
      tokenExpiresAt: '2020-01-01T00:00:00.000Z',
      profileId: '4ec76e64-1187-44f9-92c8-95e45865ee10'
    })
    mocks.refreshToken.mockResolvedValue({ access_token: 'replacement-access', expires_in: 3600 })
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.get'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mocks.persistRefresh).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: CONNECTION_ID,
      profileId: '4ec76e64-1187-44f9-92c8-95e45865ee10',
      accessToken: 'replacement-access'
    }))
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'replacement-access' }))
    expect(JSON.stringify(result)).not.toContain('replacement-access')
  })

  it('does not reveal whether a connection belongs to another client', async () => {
    mocks.queryOne.mockResolvedValue(null)
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.get'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Google Ads connection not found'
    })
    expect(mocks.resolveCredential).not.toHaveBeenCalled()
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('rejects malformed pagination before loading provider credentials', async () => {
    query = { connectionId: CONNECTION_ID, page: '0', pageSize: '5000' }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.get'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid conversion-action query'
    })
    expect(mocks.queryOne).not.toHaveBeenCalled()
  })
})

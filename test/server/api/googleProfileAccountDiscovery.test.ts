import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROFILE_ID = '47030c6c-f67a-4150-968a-258c24e2c124'
const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireWriteAccess: vi.fn(),
  queryOne: vi.fn(),
  resolveCredential: vi.fn(),
  persistRefresh: vi.fn(),
  refreshToken: vi.fn(),
  findAccount: vi.fn(),
  linkAccount: vi.fn(),
  executeGodMode: vi.fn(),
  resolveConfig: vi.fn()
}))

let body: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mocks.requireRole(...args),
  requireWriteAccess: (...args: unknown[]) => mocks.requireWriteAccess(...args)
}))
vi.mock('~~/server/utils/permissions', () => ({
  PERMISSIONS: { MEDIA_BUYING: 'MEDIA_BUYING' }
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mocks.queryOne(...args)
}))
vi.mock('~~/server/utils/googleAdsClient', () => ({
  refreshGoogleToken: (...args: unknown[]) => mocks.refreshToken(...args)
}))
vi.mock('~~/server/utils/googleCredentialProfiles', () => ({
  findGoogleProfileAccount: (...args: unknown[]) => mocks.findAccount(...args),
  linkGoogleCredentialProfileAccount: (...args: unknown[]) => mocks.linkAccount(...args),
  persistGoogleCredentialRefresh: (...args: unknown[]) => mocks.persistRefresh(...args),
  resolveGoogleCredential: (...args: unknown[]) => mocks.resolveCredential(...args)
}))
vi.mock('~~/server/utils/social/googleProfileAccountDiscoveryGodMode', () => ({
  executeGodModeGoogleProfileAccountDiscovery: (...args: unknown[]) => mocks.executeGodMode(...args)
}))
vi.mock('~~/server/utils/spendSync', () => ({
  resolveGoogleAdsRuntimeConfig: (...args: unknown[]) => mocks.resolveConfig(...args)
}))
vi.mock('h3', () => ({
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  ),
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => PROFILE_ID,
  readBody: () => body
}))

async function loadHandler() {
  const module = await import(
    '~~/server/api/agency/social/google/profiles/[id]/discover-account.post'
  )
  return module.default
}

describe('POST Google profile account discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    body = { customerId: '389-217-6492' }
    mocks.requireRole.mockResolvedValue({ id: 'user-1' })
    mocks.queryOne.mockResolvedValue({
      id: PROFILE_ID,
      google_credential_profile_id: PROFILE_ID,
      connected_by: 'user-1',
      scopes: ['https://www.googleapis.com/auth/adwords'],
      metadata: { managerCustomerIds: ['5250473322'] }
    })
    mocks.resolveCredential.mockResolvedValue({
      accessToken: 'secret-access-token',
      refreshToken: 'secret-refresh-token',
      tokenExpiresAt: '2099-01-01T00:00:00.000Z',
      profileId: PROFILE_ID
    })
    mocks.resolveConfig.mockReturnValue({ googleDeveloperToken: 'secret-developer-token' })
    mocks.findAccount.mockResolvedValue({
      customerId: '3892176492',
      name: 'Knox LDV',
      currencyCode: 'AUD',
      descriptiveName: 'Knox LDV',
      managerCustomerId: '5250473322'
    })
    mocks.linkAccount.mockResolvedValue({
      connectionId: 'connection-knox',
      accountId: '3892176492',
      accountName: 'Knox LDV',
      managerCustomerId: '5250473322'
    })
    mocks.executeGodMode.mockImplementation(async (_event, mutate) => await mutate({ query: vi.fn() }))
  })

  it('links only the exact accessible customer and returns no credentials', async () => {
    const handler = await loadHandler()
    const result = await handler({ context: {} })

    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), 'MEDIA_BUYING')
    expect(mocks.requireWriteAccess).toHaveBeenCalled()
    expect(mocks.findAccount).toHaveBeenCalledWith({
      accessToken: 'secret-access-token',
      developerToken: 'secret-developer-token',
      targetCustomerId: '3892176492',
      profileMetadata: { managerCustomerIds: ['5250473322'] }
    })
    expect(mocks.linkAccount).toHaveBeenCalledWith(expect.objectContaining({
      profileId: PROFILE_ID,
      userId: 'user-1',
      account: expect.objectContaining({ customerId: '3892176492' })
    }), expect.objectContaining({ runTransaction: expect.any(Function) }))
    expect(result).toEqual({
      connectionId: 'connection-knox',
      accountId: '3892176492',
      accountName: 'Knox LDV',
      managerCustomerId: '5250473322'
    })
    expect(JSON.stringify(result)).not.toMatch(/secret|token/i)
  })

  it('rejects malformed customer IDs before loading encrypted credentials', async () => {
    body = { customerId: '389217649' }
    const handler = await loadHandler()

    await expect(handler({ context: {} })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid Google account discovery request'
    })
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.resolveCredential).not.toHaveBeenCalled()
  })
})

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
  ensure: vi.fn(),
  executeGodMode: vi.fn()
}))

let body: Record<string, unknown> = {}

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
vi.mock('~~/server/utils/measurement/googleConversionActionGodMode', () => ({
  executeGodModeGoogleConversionActionProvision: (...args: unknown[]) => mocks.executeGodMode(...args)
}))
vi.mock('~~/server/utils/googleConversionActions', async () => {
  const { z } = await import('zod')
  return {
    GoogleConversionActionNameSchema: z.enum([
      'Stock Enquiry',
      'Finance Enquiry',
      'Test Drive Enquiry',
      'Contact Us',
      'Model Variant Enquiry'
    ]),
    GoogleConversionActionDiscoveryError: class extends Error {
      code: string
      constructor(code: string) {
        super(code)
        this.code = code
      }
    },
    googleConversionActionProvisioner: {
      ensure: (...args: unknown[]) => mocks.ensure(...args)
    }
  }
})
vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => CLIENT_ID,
  readBody: () => body,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
}))

describe('POST client Google conversion action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    body = { connectionId: CONNECTION_ID, name: 'Stock Enquiry' }
    mocks.requireClientAccess.mockResolvedValue({ id: '6a5d2e15-315c-4790-b64e-5e3e17001c8e' })
    mocks.queryOne.mockResolvedValue({
      id: CONNECTION_ID,
      client_id: CLIENT_ID,
      account_id: '389-217-6492',
      account_name: 'Knox LDV',
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
    mocks.ensure.mockResolvedValue({
      created: true,
      item: {
        id: '91001',
        resourceName: 'customers/3892176492/conversionActions/91001',
        name: 'Stock Enquiry',
        status: 'ENABLED',
        type: 'UPLOAD_CLICKS',
        category: 'SUBMIT_LEAD_FORM',
        origin: 'WEBSITE',
        isPrimary: true,
        includesInConversions: true,
        deliveryMode: 'offline_click'
      }
    })
    mocks.executeGodMode.mockImplementation(async (_event, provision) => await provision())
  })

  it('scopes the mutation to the authorised client connection and returns no credentials', async () => {
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.post'
    )).default

    const result = await handler({ context: {} } as never)

    expect(mocks.requireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID, 'configure')
    expect(String(mocks.queryOne.mock.calls[0]?.[0])).toContain('sc.client_id = $1')
    expect(mocks.queryOne.mock.calls[0]?.[1]).toEqual([CLIENT_ID, CONNECTION_ID])
    expect(mocks.ensure).toHaveBeenCalledWith({
      accountId: '3892176492',
      accessToken: 'secret-access-token',
      developerToken: 'secret-developer-token',
      loginCustomerId: '5250473322',
      name: 'Stock Enquiry'
    })
    expect(mocks.executeGodMode).toHaveBeenCalledWith(expect.anything(), expect.any(Function))
    expect(result).toMatchObject({ created: true, item: { name: 'Stock Enquiry' } })
    expect(JSON.stringify(result)).not.toMatch(/secret|accessToken|refreshToken|developerToken/i)
  })

  it('rejects an unapproved action name before loading connection credentials', async () => {
    body = { connectionId: CONNECTION_ID, name: 'Unapproved Conversion' }
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid conversion-action request'
    })
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.ensure).not.toHaveBeenCalled()
  })

  it('does not reveal whether a connection belongs to another client', async () => {
    mocks.queryOne.mockResolvedValue(null)
    const handler = (await import(
      '~~/server/api/agency/measurement/clients/[clientId]/google-conversion-actions.post'
    )).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Google Ads connection not found'
    })
    expect(mocks.ensure).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'

const config = {
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  customerId: '1234567890'
}

describe('Google PMax provider connection loader', () => {
  it('loads and resolves credentials only for the exact tenant, client, and connection', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      id: config.connectionId,
      client_id: config.clientId,
      account_id: '123-456-7890',
      status: 'active',
      metadata: { managerCustomerId: '999-999-9999' },
      access_token: 'stored', refresh_token: 'refresh', token_expires_at: '2026-08-08T00:00:00.000Z'
    })
    const resolveCredential = vi.fn().mockResolvedValue({
      accessToken: 'resolved-access', refreshToken: 'refresh',
      tokenExpiresAt: '2026-08-08T00:00:00.000Z', profileId: null
    })
    const resolveAuth = vi.fn().mockResolvedValue({
      accessToken: 'fresh-access', loginCustomerId: '9999999999'
    })

    const result = await loadGooglePmaxProviderConnection(config as never, {
      queryOne,
      getRuntimeConfig: () => ({
        googleClientId: 'client', googleClientSecret: 'secret',
        googleDeveloperToken: 'developer', googleAdsLoginCustomerId: ''
      }),
      resolveCredential,
      resolveAuth
    })

    expect(result).toEqual({
      id: config.connectionId,
      clientId: config.clientId,
      status: 'active',
      customerId: config.customerId,
      accessToken: 'fresh-access',
      developerToken: 'developer',
      loginCustomerId: '9999999999'
    })
    expect(queryOne.mock.calls[0][1]).toEqual([config.connectionId, config.clientId, config.tenantId])
    expect(resolveAuth).toHaveBeenCalledWith(expect.objectContaining({
      id: config.connectionId, account_id: config.customerId, access_token: 'resolved-access'
    }), expect.objectContaining({ googleAdsLoginCustomerId: '999-999-9999' }), expect.any(Object))
  })

  it('forces a fresh OAuth token for a Merchant publication boundary', async () => {
    const resolveAuth = vi.fn().mockResolvedValue({
      accessToken: 'fresh-merchant-access', loginCustomerId: '9999999999'
    })
    await loadGooglePmaxProviderConnection({ ...config, forceTokenRefresh: true } as never, {
      queryOne: vi.fn().mockResolvedValue({
        id: config.connectionId, client_id: config.clientId, account_id: config.customerId,
        status: 'active', metadata: {}, access_token: 'stored', refresh_token: 'refresh',
        token_expires_at: '2026-08-13T23:00:00.000Z'
      }),
      getRuntimeConfig: () => ({
        googleClientId: 'client', googleClientSecret: 'secret',
        googleDeveloperToken: 'developer', googleAdsLoginCustomerId: ''
      }),
      resolveCredential: vi.fn().mockResolvedValue({
        accessToken: 'stored', refreshToken: 'refresh',
        tokenExpiresAt: '2026-08-13T23:00:00.000Z', profileId: null
      }),
      resolveAuth
    })

    expect(resolveAuth.mock.calls[0]?.[0]).toMatchObject({
      access_token: 'stored',
      refresh_token: 'refresh',
      token_expires_at: '1970-01-01T00:00:00.000Z'
    })
  })

  it('authorizes a Merchant publication from the exact active source tenant when Xero is disconnected', async () => {
    const sourceId = '55555555-5555-4555-8555-555555555555'
    const queryOne = vi.fn().mockResolvedValue({
      id: config.connectionId,
      client_id: config.clientId,
      account_id: config.customerId,
      status: 'active',
      metadata: {},
      access_token: 'stored',
      refresh_token: 'refresh',
      token_expires_at: '2026-08-18T00:00:00.000Z'
    })

    await loadGooglePmaxProviderConnection({ ...config, sourceId } as never, {
      queryOne,
      getRuntimeConfig: () => ({
        googleClientId: 'client', googleClientSecret: 'secret',
        googleDeveloperToken: 'developer', googleAdsLoginCustomerId: ''
      }),
      resolveCredential: vi.fn().mockResolvedValue({
        accessToken: 'stored', refreshToken: 'refresh',
        tokenExpiresAt: '2026-08-18T00:00:00.000Z', profileId: null
      }),
      resolveAuth: vi.fn().mockResolvedValue({ accessToken: 'stored' })
    })

    expect(queryOne.mock.calls[0]?.[0]).toContain('FROM crm_catalog_sources source')
    expect(queryOne.mock.calls[0]?.[0]).toContain('source.connection_config #>> \'{merchant,tenant_id}\' = $3::text')
    expect(queryOne.mock.calls[0]?.[1]).toEqual([
      config.connectionId,
      config.clientId,
      config.tenantId,
      sourceId
    ])
  })

  it('fails closed for missing, inactive, or differently-scoped connections', async () => {
    await expect(loadGooglePmaxProviderConnection(config as never, {
      queryOne: vi.fn().mockResolvedValue(null),
      getRuntimeConfig: () => ({
        googleClientId: 'client', googleClientSecret: 'secret',
        googleDeveloperToken: 'developer', googleAdsLoginCustomerId: ''
      })
    })).rejects.toMatchObject({ code: 'PMAX_PROVIDER_CONNECTION_NOT_FOUND' })
  })

  it('requires Google Ads runtime credentials without exposing which secret is absent', async () => {
    await expect(loadGooglePmaxProviderConnection(config as never, {
      queryOne: vi.fn().mockResolvedValue({
        id: config.connectionId, client_id: config.clientId, account_id: config.customerId,
        status: 'active', metadata: {}, access_token: 'stored', refresh_token: null, token_expires_at: null
      }),
      getRuntimeConfig: () => ({
        googleClientId: '', googleClientSecret: '', googleDeveloperToken: '', googleAdsLoginCustomerId: ''
      }),
      resolveCredential: vi.fn().mockResolvedValue({
        accessToken: 'stored', refreshToken: null, tokenExpiresAt: null, profileId: null
      })
    })).rejects.toMatchObject({ code: 'PMAX_PROVIDER_RUNTIME_NOT_CONFIGURED' })
  })
})

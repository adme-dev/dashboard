import { describe, expect, it, vi } from 'vitest'
import {
  loadGoogleAdsControlConnection,
  resolveGoogleAdsControlSession
} from '~~/server/utils/googleAds/controlSession'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222'

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    client_id: CLIENT_ID,
    account_id: '123-456-7890',
    platform: 'google',
    status: 'active',
    access_token: 'legacy-access',
    refresh_token: 'refresh',
    token_expires_at: '2026-08-31T00:00:00.000Z',
    metadata: { managerCustomerId: '999-999-9999' },
    google_credential_profile_id: null,
    ...overrides
  }
}

describe('Google Ads control connection loading', () => {
  it('queries through the selected client, connection, platform, and active status', async () => {
    const queryOne = vi.fn().mockResolvedValue(connection())
    await loadGoogleAdsControlConnection(CLIENT_ID, CONNECTION_ID, { queryOne })

    expect(queryOne.mock.calls[0]?.[0]).toContain('sc.client_id = $1')
    expect(queryOne.mock.calls[0]?.[0]).toContain('sc.id = $2')
    expect(queryOne.mock.calls[0]?.[0]).toContain('sc.platform = \'google\'')
    expect(queryOne.mock.calls[0]?.[0]).toContain('sc.status = \'active\'')
    expect(queryOne.mock.calls[0]?.[1]).toEqual([CLIENT_ID, CONNECTION_ID])
  })
})

describe('resolveGoogleAdsControlSession', () => {
  it('resolves refreshed internal auth and the connection manager ID', async () => {
    const persistAccessToken = vi.fn().mockResolvedValue(undefined)
    const resolveWriteAuth = vi.fn().mockImplementation(async (_connection, config, deps) => {
      await deps.updateToken(CONNECTION_ID, 'fresh-access', new Date('2026-09-01T01:00:00.000Z'))
      return {
        accessToken: 'fresh-access',
        loginCustomerId: config.googleAdsLoginCustomerId
      }
    })

    await expect(resolveGoogleAdsControlSession({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID
    }, {
      loadConnection: vi.fn().mockResolvedValue(connection()),
      resolveCredential: vi.fn().mockResolvedValue({
        accessToken: 'legacy-access',
        refreshToken: 'refresh',
        tokenExpiresAt: '2026-08-31T00:00:00.000Z',
        profileId: null,
        source: 'legacy'
      }),
      resolveConfig: vi.fn().mockReturnValue({
        googleClientId: 'client-id',
        googleClientSecret: 'client-secret',
        googleDeveloperToken: 'developer-token',
        googleAdsLoginCustomerId: ''
      }),
      resolveWriteAuth,
      refreshGoogleToken: vi.fn(),
      listAccessibleCustomers: vi.fn(),
      persistAccessToken
    })).resolves.toEqual({
      connection: {
        clientId: CLIENT_ID,
        connectionId: CONNECTION_ID,
        customerId: '1234567890',
        platform: 'google',
        status: 'active'
      },
      auth: {
        accessToken: 'fresh-access',
        developerToken: 'developer-token',
        loginCustomerId: '9999999999'
      }
    })

    expect(persistAccessToken).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: CONNECTION_ID,
      profileId: null,
      accessToken: 'fresh-access'
    }))
  })

  it('fails before credential resolution when the loaded row is outside the selected client', async () => {
    const resolveCredential = vi.fn()
    await expect(resolveGoogleAdsControlSession({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID
    }, {
      loadConnection: vi.fn().mockResolvedValue(connection({
        client_id: '33333333-3333-4333-8333-333333333333'
      })),
      resolveCredential,
      resolveConfig: vi.fn(),
      resolveWriteAuth: vi.fn(),
      refreshGoogleToken: vi.fn(),
      listAccessibleCustomers: vi.fn(),
      persistAccessToken: vi.fn()
    })).rejects.toThrow('not assigned to the selected client')
    expect(resolveCredential).not.toHaveBeenCalled()
  })

  it('fails closed when the developer token is absent', async () => {
    await expect(resolveGoogleAdsControlSession({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID
    }, {
      loadConnection: vi.fn().mockResolvedValue(connection()),
      resolveCredential: vi.fn().mockResolvedValue({
        accessToken: 'access', refreshToken: null, tokenExpiresAt: null, profileId: null, source: 'legacy'
      }),
      resolveConfig: vi.fn().mockReturnValue({
        googleClientId: '', googleClientSecret: '', googleDeveloperToken: '', googleAdsLoginCustomerId: ''
      }),
      resolveWriteAuth: vi.fn(),
      refreshGoogleToken: vi.fn(),
      listAccessibleCustomers: vi.fn(),
      persistAccessToken: vi.fn()
    })).rejects.toThrow('developer token is not configured')
  })
})

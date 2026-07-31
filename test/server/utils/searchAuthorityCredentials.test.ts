import { describe, expect, it, vi } from 'vitest'

async function loadCredentials() {
  return import('../../../server/utils/searchAuthority/credentials').catch(() => null)
}

describe('Search Console credential persistence', () => {
  it('stores tokens only in a separate encrypted profile and reconnects by Google subject', async () => {
    const credentials = await loadCredentials()
    expect(credentials).not.toBeNull()

    const queries: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        if (sql.includes('connection.google_credential_profile_id')) {
          return { rows: [{ google_credential_profile_id: 'old-profile' }] }
        }
        if (sql.includes('INSERT INTO google_credential_profiles')) {
          return { rows: [{ id: 'profile-2' }] }
        }
        if (sql.includes('INSERT INTO search_console_connections')) {
          return { rows: [{ id: 'connection-1' }] }
        }
        return { rows: [] }
      })
    }
    const encrypt = vi.fn(async (token: string) => ({
      ciphertext: new Uint8Array([token === 'access-secret' ? 1 : 2]),
      iv: new Uint8Array([9])
    }))

    const result = await credentials!.storeSearchConsoleCredentialProfile({
      clientId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      googleSub: 'google-subject',
      email: 'buyer@example.com',
      tokens: {
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        scopes: [
          'openid',
          'email',
          'https://www.googleapis.com/auth/webmasters.readonly'
        ]
      }
    }, {
      encrypt,
      runTransaction: async callback => callback(db)
    })

    expect(result).toEqual({
      connectionId: 'connection-1',
      profileId: 'profile-2'
    })

    const profileInsert = queries.find(entry =>
      entry.sql.includes('INSERT INTO google_credential_profiles'))
    expect(profileInsert?.params[0]).toBe('Search Console · buyer@example.com')
    expect(JSON.parse(String(profileInsert?.params[7]))).toEqual({
      purpose: 'search_console',
      googleSub: 'google-subject',
      email: 'buyer@example.com'
    })

    const connectionUpsert = queries.find(entry =>
      entry.sql.includes('INSERT INTO search_console_connections'))
    expect(connectionUpsert?.sql).not.toMatch(/\baccess_token\b|\brefresh_token\b/i)
    expect(JSON.stringify(connectionUpsert?.params)).not.toContain('access-secret')
    expect(JSON.stringify(connectionUpsert?.params)).not.toContain('refresh-secret')
    expect(connectionUpsert?.sql).toContain('ON CONFLICT (client_id, google_subject)')

    const oldProfileUpdate = queries.find(entry =>
      entry.sql.includes(`metadata->>'purpose' = 'search_console'`))
    expect(oldProfileUpdate?.params).toEqual(['old-profile'])
  })

  it('decrypts only the active encrypted profile linked to the requested connection', async () => {
    const credentials = await loadCredentials()
    expect(credentials).not.toBeNull()

    const decrypted = ['access-token', 'refresh-token']
    const result = await credentials!.resolveSearchConsoleCredential('connection-1', {
      loadConnection: async () => ({
        id: 'connection-1',
        client_id: '11111111-1111-4111-8111-111111111111',
        google_subject: 'google-subject',
        google_email: 'buyer@example.com',
        scopes: ['openid', 'email', 'https://www.googleapis.com/auth/webmasters.readonly'],
        status: 'active',
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        google_credential_profile_id: 'profile-2',
        profile_access_token_encrypted: new Uint8Array([1]),
        profile_access_token_iv: new Uint8Array([9]),
        profile_refresh_token_encrypted: new Uint8Array([2]),
        profile_refresh_token_iv: new Uint8Array([9]),
        profile_token_expires_at: '2026-08-01T00:00:00.000Z'
      }),
      decrypt: async () => decrypted.shift()!
    })

    expect(result).toEqual({
      connectionId: 'connection-1',
      clientId: '11111111-1111-4111-8111-111111111111',
      googleSub: 'google-subject',
      email: 'buyer@example.com',
      scopes: ['openid', 'email', 'https://www.googleapis.com/auth/webmasters.readonly'],
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: '2026-08-01T00:00:00.000Z',
      profileId: 'profile-2'
    })
  })

  it('preserves the encrypted offline token when Google omits it on reconnect', async () => {
    const credentials = await loadCredentials()
    expect(credentials).not.toBeNull()

    const previousCiphertext = new Uint8Array([7])
    const previousIv = new Uint8Array([8])
    let profileParams: unknown[] = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('connection.google_credential_profile_id')) {
          return {
            rows: [{
              google_credential_profile_id: 'old-profile',
              refresh_token_encrypted: previousCiphertext,
              refresh_token_iv: previousIv
            }]
          }
        }
        if (sql.includes('INSERT INTO google_credential_profiles')) {
          profileParams = params
          return { rows: [{ id: 'profile-2' }] }
        }
        if (sql.includes('INSERT INTO search_console_connections')) {
          return { rows: [{ id: 'connection-1' }] }
        }
        return { rows: [] }
      })
    }

    await credentials!.storeSearchConsoleCredentialProfile({
      clientId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      googleSub: 'google-subject',
      email: 'buyer@example.com',
      tokens: {
        accessToken: 'new-access',
        refreshToken: null,
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
      }
    }, {
      encrypt: async () => ({
        ciphertext: new Uint8Array([1]),
        iv: new Uint8Array([2])
      }),
      runTransaction: async callback => callback(db)
    })

    expect(profileParams[3]).toBe(previousCiphertext)
    expect(profileParams[4]).toBe(previousIv)
  })

  it('refreshes through Google and persists the new access token to the encrypted profile', async () => {
    const credentials = await loadCredentials()
    expect(credentials).not.toBeNull()

    const persistRefresh = vi.fn(async () => undefined)
    const refreshed = await credentials!.refreshSearchConsoleCredential('connection-1', {
      now: () => new Date('2026-07-31T00:00:00.000Z'),
      resolveCredential: async () => ({
        connectionId: 'connection-1',
        clientId: '11111111-1111-4111-8111-111111111111',
        googleSub: 'google-subject',
        email: 'buyer@example.com',
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        accessToken: 'old-access',
        refreshToken: 'refresh-secret',
        tokenExpiresAt: '2026-07-31T00:00:00.000Z',
        profileId: 'profile-2'
      }),
      resolveConfig: () => ({
        googleClientId: 'client-id',
        googleClientSecret: 'client-secret'
      }),
      refreshToken: async () => ({
        access_token: 'new-access',
        expires_in: 3600,
        token_type: 'Bearer'
      }),
      persistRefresh
    })

    expect(refreshed.accessToken).toBe('new-access')
    expect(refreshed.tokenExpiresAt).toBe('2026-07-31T01:00:00.000Z')
    expect(persistRefresh).toHaveBeenCalledWith({
      connectionId: 'connection-1',
      profileId: 'profile-2',
      accessToken: 'new-access',
      expiresAt: new Date('2026-07-31T01:00:00.000Z')
    })
  })

  it('refuses to refresh a connection without an offline refresh token', async () => {
    const credentials = await loadCredentials()
    expect(credentials).not.toBeNull()

    await expect(credentials!.refreshSearchConsoleCredential('connection-1', {
      resolveCredential: async () => ({
        connectionId: 'connection-1',
        clientId: '11111111-1111-4111-8111-111111111111',
        googleSub: 'google-subject',
        email: 'buyer@example.com',
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        accessToken: 'old-access',
        refreshToken: null,
        tokenExpiresAt: null,
        profileId: 'profile-2'
      })
    })).rejects.toThrow('offline refresh token')
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  linkGoogleCredentialProfileAccount,
  storeGoogleCredentialProfile
} from '~~/server/utils/googleCredentialProfiles'

describe('storeGoogleCredentialProfile', () => {
  it('encrypts tokens once and preserves existing connection identity while linking profile membership', async () => {
    const encrypt = vi.fn()
      .mockResolvedValueOnce({ ciphertext: new Uint8Array([1]), iv: new Uint8Array([2]) })
      .mockResolvedValueOnce({ ciphertext: new Uint8Array([3]), iv: new Uint8Array([4]) })
    const queries: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params })
        if (sql.includes('INSERT INTO google_credential_profiles')) return { rows: [{ id: 'profile-1' }] }
        if (sql.includes('INSERT INTO social_connections')) return { rows: [{ id: 'connection-existing' }] }
        return { rows: [] }
      })
    }
    const runTransaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))

    const result = await storeGoogleCredentialProfile({
      userId: 'user-1',
      identityEmail: 'advertising@adme.net.au',
      tokens: {
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        expiresAt: new Date('2026-07-19T03:00:00.000Z'),
        scopes: ['scope-a']
      },
      accessibleCustomerIds: ['1111111111'],
      accounts: [{
        customerId: '2222222222',
        name: 'CP Ford',
        currencyCode: 'AUD',
        descriptiveName: 'Courtney & Patterson Ford',
        managerCustomerId: '1111111111'
      }]
    }, { encrypt, runTransaction: runTransaction as never })

    expect(result).toEqual({ profileId: 'profile-1', storedCount: 1 })
    expect(encrypt).toHaveBeenCalledTimes(2)
    expect(queries.find(q => q.sql.includes('INSERT INTO social_connections'))?.sql)
      .toContain('ON CONFLICT (platform, account_id)')
    expect(queries.find(q => q.sql.includes('INSERT INTO social_connections'))?.sql)
      .toContain('google_credential_profile_id = EXCLUDED.google_credential_profile_id')
    expect(queries.find(q => q.sql.includes('INSERT INTO social_connections'))?.sql)
      .toContain('access_token = NULL')
    expect(queries.find(q => q.sql.includes('INSERT INTO social_connections'))?.sql)
      .toContain('refresh_token = NULL')
    expect(queries.some(q => q.sql.includes('INSERT INTO google_credential_profile_accounts'))).toBe(true)
    const profileParams = queries.find(q => q.sql.includes('INSERT INTO google_credential_profiles'))?.params
    expect(JSON.parse(String(profileParams?.[7]))).toMatchObject({
      googleEmail: 'advertising@adme.net.au'
    })
    const connectionParams = queries.find(q => q.sql.includes('INSERT INTO social_connections'))?.params
    expect(JSON.parse(String(connectionParams?.[4]))).toMatchObject({
      managerCustomerId: '1111111111',
      google_login_customer_id: '1111111111'
    })
    expect(JSON.stringify(queries)).not.toContain('access-secret')
    expect(JSON.stringify(queries)).not.toContain('refresh-secret')
  })
})

describe('linkGoogleCredentialProfileAccount', () => {
  it('adds a newly discovered customer to an existing profile without replacing its client mapping', async () => {
    const queries: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params })
        if (sql.includes('INSERT INTO social_connections')) {
          return { rows: [{ id: 'connection-knox' }] }
        }
        return { rows: [] }
      })
    }
    const runTransaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))

    await expect(linkGoogleCredentialProfileAccount({
      profileId: 'profile-1',
      userId: 'user-1',
      tokenExpiresAt: new Date('2026-08-22T00:00:00.000Z'),
      scopes: ['https://www.googleapis.com/auth/adwords'],
      account: {
        customerId: '3892176492',
        name: 'Knox LDV',
        currencyCode: 'AUD',
        descriptiveName: 'Knox LDV',
        managerCustomerId: '5250473322'
      }
    }, { runTransaction })).resolves.toEqual({
      connectionId: 'connection-knox',
      accountId: '3892176492',
      accountName: 'Knox LDV',
      managerCustomerId: '5250473322'
    })

    const connection = queries.find(query => query.sql.includes('INSERT INTO social_connections'))
    expect(connection?.sql).toContain('ON CONFLICT (platform, account_id)')
    expect(connection?.sql).not.toContain('client_id = EXCLUDED.client_id')
    expect(connection?.sql).toContain(
      'social_connections.google_credential_profile_id = EXCLUDED.google_credential_profile_id'
    )
    expect(connection?.params.slice(0, 2)).toEqual(['3892176492', 'Knox LDV'])
    expect(JSON.parse(String(connection?.params[4]))).toEqual({
      currencyCode: 'AUD',
      descriptiveName: 'Knox LDV',
      managerCustomerId: '5250473322',
      google_login_customer_id: '5250473322'
    })
    expect(queries.some(query => query.sql.includes('INSERT INTO google_credential_profile_accounts'))).toBe(true)
  })
})

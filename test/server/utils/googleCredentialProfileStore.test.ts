import { describe, expect, it, vi } from 'vitest'
import { storeGoogleCredentialProfile } from '~~/server/utils/googleCredentialProfiles'

describe('storeGoogleCredentialProfile', () => {
  it('encrypts tokens once and preserves existing connection identity while linking profile membership', async () => {
    const encrypt = vi.fn()
      .mockResolvedValueOnce({ ciphertext: new Uint8Array([1]), iv: new Uint8Array([2]) })
      .mockResolvedValueOnce({ ciphertext: new Uint8Array([3]), iv: new Uint8Array([4]) })
    const queries: Array<{ sql: string; params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        queries.push({ sql, params })
        if (sql.includes('INSERT INTO google_credential_profiles')) return { rows: [{ id: 'profile-1' }] }
        if (sql.includes('INSERT INTO social_connections')) return { rows: [{ id: 'connection-existing' }] }
        return { rows: [] }
      }),
    }
    const runTransaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))

    const result = await storeGoogleCredentialProfile({
      userId: 'user-1',
      tokens: {
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        expiresAt: new Date('2026-07-19T03:00:00.000Z'),
        scopes: ['scope-a'],
      },
      accessibleCustomerIds: ['1111111111'],
      accounts: [{
        customerId: '2222222222',
        name: 'CP Ford',
        currencyCode: 'AUD',
        descriptiveName: 'Courtney & Patterson Ford',
        managerCustomerId: '1111111111',
      }],
    }, { encrypt, runTransaction: runTransaction as never })

    expect(result).toEqual({ profileId: 'profile-1', storedCount: 1 })
    expect(encrypt).toHaveBeenCalledTimes(2)
    expect(queries.find(q => q.sql.includes('INSERT INTO social_connections'))?.sql)
      .toContain('ON CONFLICT (platform, account_id)')
    expect(queries.find(q => q.sql.includes('INSERT INTO social_connections'))?.sql)
      .toContain('google_credential_profile_id = EXCLUDED.google_credential_profile_id')
    expect(queries.some(q => q.sql.includes('INSERT INTO google_credential_profile_accounts'))).toBe(true)
    expect(JSON.stringify(queries)).not.toContain('access-secret')
    expect(JSON.stringify(queries)).not.toContain('refresh-secret')
  })
})

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { encryptToken } from '../../server/utils/tokenCrypto'
import { createGoogleRefreshTokenResolver } from '../../workers/measurement-delivery/src/credential'
import { createMeasurementDeliveryRepository } from '../../workers/measurement-delivery/src/repository'
import { createMeasurementDiagnosticRepository } from '../../workers/measurement-delivery/src/diagnosticRepository'

const now = new Date('2026-10-26T00:00:00Z')
const encryptionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
const row = {
  delivery_id: 'delivery-1', client_id: 'tenant-1', destination_id: 'destination-1',
  platform: 'google_data_manager', account_id: '258-121-4895',
  metadata: { google_login_customer_id: '525-047-3322' }, scopes: ['https://www.googleapis.com/auth/datamanager'],
  refresh_token: null as string | null, google_credential_profile_id: 'profile-1' as string | null,
  profile_refresh_token_encrypted: null as Uint8Array | null,
  profile_refresh_token_iv: null as Uint8Array | null,
  occurred_at: now, diagnostic_started_at: now, attribution: {},
}

beforeAll(async () => {
  vi.stubEnv('REPO_TOKEN_ENCRYPTION_KEY', encryptionKey)
  const encrypted = await encryptToken('delegated-refresh-fixture')
  row.profile_refresh_token_encrypted = encrypted.ciphertext
  row.profile_refresh_token_iv = encrypted.iv
})
afterAll(() => vi.unstubAllEnvs())

for (const mode of ['delivery', 'diagnostic'] as const) {
  describe(`${mode} delegated Google credentials`, () => {
    function claim(overrides: Partial<typeof row> = {}, key: string | undefined = encryptionKey) {
      const query = vi.fn(async (sql: string, _params?: unknown[]) => ({ rows: sql.trim().startsWith('SELECT')
        ? [{ ...row, ...overrides }] : [{ attempt_count: 1, diagnostic_check_count: 1 }] }))
      const deps = {
        transaction: async <T>(callback: (db: { query: typeof query }) => Promise<T>) => callback({ query }),
        resolveRefreshToken: createGoogleRefreshTokenResolver(key)
      }
      const result = mode === 'delivery'
        ? createMeasurementDeliveryRepository(deps).claimNext({ schemaVersion: 1, clientId: 'tenant-1', eventId: 'event-1', enqueuedAt: now.toISOString() }, 'worker-1', now)
        : createMeasurementDiagnosticRepository(deps).claimNext('worker-1', now)
      return { result, query }
    }

    it('decrypts a Pages-encrypted delegated token and preserves the manager account', async () => {
      const { result } = claim()
      const value = await result
      expect(value?.refreshToken).toBe('delegated-refresh-fixture')
      if (mode === 'delivery') expect(value).toMatchObject({ operatingAccountId: '2581214895', loginAccountId: '5250473322' })
    })

    it('preserves direct OAuth without requiring the profile encryption key', async () => {
      const { result } = claim({ google_credential_profile_id: null, refresh_token: 'direct-refresh-fixture' }, '')
      expect((await result)?.refreshToken).toBe('direct-refresh-fixture')
    })

    it('does not fall back to a legacy token when an inactive or missing profile is excluded by the join', async () => {
      const { result } = claim({ refresh_token: 'stale-legacy-token', profile_refresh_token_encrypted: null, profile_refresh_token_iv: null })
      expect((await result)?.refreshToken).toBeNull()
    })

    it.each(['profile_refresh_token_encrypted', 'profile_refresh_token_iv'] as const)('rejects a partial profile missing %s', async field => {
      const { result } = claim({ [field]: null, refresh_token: 'stale-legacy-token' })
      await expect(result).rejects.toThrow('Google credential profile is incomplete')
    })

    it.each(['', btoa('short'), btoa(String.fromCharCode(...new Uint8Array(32).fill(8)))])('fails closed for an unavailable, invalid, or incorrect decryption key (%#)', async key => {
      await expect(claim({}, key).result).rejects.toThrow()
    })

    it('rejects tampered profile ciphertext without using a legacy token', async () => {
      const ciphertext = new Uint8Array(row.profile_refresh_token_encrypted!)
      ciphertext[0] ^= 1
      await expect(claim({ profile_refresh_token_encrypted: ciphertext, refresh_token: 'stale-legacy-token' }).result).rejects.toThrow()
    })

    it('selects credentials only through the active connection belonging to the destination tenant', async () => {
      const { result, query } = claim()
      await result
      // SQL is the external database boundary: losing any of these predicates
      // would permit a mismatched tenant or inactive profile to supply a token.
      const sql = query.mock.calls[0]![0]
      expect(sql).toMatch(/dest\.client_id = d\.client_id/)
      expect(sql).toMatch(/sc\.client_id = dest\.client_id/)
      expect(sql).toMatch(/sc\.id = dest\.social_connection_id/)
      expect(sql).toMatch(/sc\.status = 'active'/)
      expect(sql).toMatch(/gcp\.id = sc\.google_credential_profile_id\s+AND gcp\.status = 'active'/)
      expect(sql).toContain('gcp.refresh_token_encrypted AS profile_refresh_token_encrypted')
      expect(sql).toContain('gcp.refresh_token_iv AS profile_refresh_token_iv')
      if (mode === 'delivery') {
        expect(sql).toContain('d.client_id = $1')
        expect(query.mock.calls[0]![1]).toEqual(['tenant-1', 'event-1', now.toISOString()])
      }
    })
  })
}

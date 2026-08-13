import { describe, expect, it, vi } from 'vitest'
import { loadGoogleMerchantCredentialProfile } from '../../../server/utils/googleMerchantCredentialProfile'

const input = {
  profileId: '11111111-1111-4111-8111-111111111111',
  merchantAccountId: '5507471616',
  developerEmail: 'advertising@adme.net.au',
  forceTokenRefresh: true
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: input.profileId,
    status: 'active',
    scopes: ['https://www.googleapis.com/auth/content'],
    metadata: {
      purpose: 'merchant',
      merchantParentId: '551257489',
      merchantCenterIds: ['5507471616'],
      googleAccountEmail: 'advertising@adme.net.au'
    },
    access_token_encrypted: new Uint8Array([1]),
    access_token_iv: new Uint8Array([2]),
    refresh_token_encrypted: new Uint8Array([3]),
    refresh_token_iv: new Uint8Array([4]),
    token_expires_at: '2026-08-13T02:00:00.000Z',
    ...overrides
  }
}

describe('agency Merchant credential profile', () => {
  it('refreshes a verified agency profile scoped to the exact client Merchant account', async () => {
    const persistRefresh = vi.fn()
    const result = await loadGoogleMerchantCredentialProfile(input, {
      queryOne: vi.fn().mockResolvedValue(row()),
      resolveCredential: vi.fn().mockResolvedValue({
        accessToken: 'old-access', refreshToken: 'refresh-token',
        tokenExpiresAt: '2026-08-13T02:00:00.000Z', profileId: input.profileId, source: 'profile'
      }),
      getRuntimeConfig: () => ({ googleClientId: 'client', googleClientSecret: 'secret' }),
      refreshToken: vi.fn().mockResolvedValue({ access_token: 'new-access', expires_in: 3600 }),
      persistRefresh
    })

    expect(result).toEqual({
      profileId: input.profileId,
      accessToken: 'new-access',
      registrationAccountId: '551257489'
    })
    expect(persistRefresh).toHaveBeenCalledWith(expect.objectContaining({
      profileId: input.profileId,
      accessToken: 'new-access'
    }))
  })

  it('fails closed when the agency profile does not list the client Merchant account', async () => {
    await expect(loadGoogleMerchantCredentialProfile(input, {
      queryOne: vi.fn().mockResolvedValue(row({
        metadata: {
          purpose: 'merchant', merchantParentId: '551257489',
          merchantCenterIds: ['5817965641'], googleAccountEmail: 'advertising@adme.net.au'
        }
      }))
    })).rejects.toMatchObject({ code: 'MERCHANT_CREDENTIAL_PROFILE_SCOPE_MISMATCH' })
  })
})

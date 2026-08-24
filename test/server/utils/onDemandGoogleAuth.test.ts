import { describe, expect, it, vi } from 'vitest'
import { refreshGoogleAccessTokenIfNeeded } from '~~/server/utils/onDemandSync'

const expiredConnection = {
  access_token: 'expired-access-token',
  refresh_token: 'refresh-token',
  token_expires_at: '2026-08-24T03:20:18.409Z',
  google_credential_profile_id: 'profile-1',
}

describe('refreshGoogleAccessTokenIfNeeded', () => {
  it('fails closed when an expired Google token cannot be refreshed', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('invalid client credentials'))

    await expect(refreshGoogleAccessTokenIfNeeded(expiredConnection, 'connection-1', {
      now: () => new Date('2026-08-24T03:55:00.000Z').getTime(),
      resolveConfig: () => ({
        googleClientId: 'cloudflare-client-id',
        googleClientSecret: 'cloudflare-client-secret',
        googleDeveloperToken: 'cloudflare-developer-token',
        googleAdsLoginCustomerId: '5250473322',
      }),
      refreshToken,
      persistRefresh: vi.fn(),
    })).rejects.toThrow(/token refresh failed.*invalid client credentials/i)
  })

  it('uses the resolved Cloudflare-aware client credentials and returns the refreshed token', async () => {
    const refreshToken = vi.fn().mockResolvedValue({ access_token: 'fresh-access-token', expires_in: 3600 })
    const persistRefresh = vi.fn().mockResolvedValue(undefined)

    await expect(refreshGoogleAccessTokenIfNeeded(expiredConnection, 'connection-1', {
      now: () => new Date('2026-08-24T03:55:00.000Z').getTime(),
      resolveConfig: () => ({
        googleClientId: 'cloudflare-client-id',
        googleClientSecret: 'cloudflare-client-secret',
        googleDeveloperToken: 'cloudflare-developer-token',
        googleAdsLoginCustomerId: '5250473322',
      }),
      refreshToken,
      persistRefresh,
    })).resolves.toBe('fresh-access-token')

    expect(refreshToken).toHaveBeenCalledWith(
      'refresh-token',
      'cloudflare-client-id',
      'cloudflare-client-secret',
    )
    expect(persistRefresh).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: 'connection-1',
      profileId: 'profile-1',
      accessToken: 'fresh-access-token',
    }))
  })
})

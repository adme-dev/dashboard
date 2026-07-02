import { describe, expect, it, vi } from 'vitest'
import { resolveSocialInboxAccessToken } from '~~/server/utils/socialInbox/tokenRefresh'

const NOW = Date.parse('2026-06-30T00:00:00.000Z')

function account(overrides: Partial<Parameters<typeof resolveSocialInboxAccessToken>[0]['account']> = {}) {
  return {
    id: 'acct-1',
    platform: 'google-business',
    access_token: 'old-access-token',
    refresh_token: 'stored-refresh-token',
    token_expires_at: new Date(NOW + 60_000).toISOString(),
    ...overrides
  }
}

describe('resolveSocialInboxAccessToken', () => {
  it('refreshes an expiring Google Business token and persists it before inbox polling', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const refreshGoogleBusinessToken = vi.fn().mockResolvedValue({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer'
    })

    const token = await resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account(),
      deps: {
        now: () => NOW,
        refreshGoogleBusinessToken,
        getGoogleBusinessOAuthConfig: () => ({
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          redirectUri: '/callback'
        })
      }
    })

    expect(token).toBe('new-access-token')
    expect(refreshGoogleBusinessToken).toHaveBeenCalledWith(
      'stored-refresh-token',
      'google-client-id',
      'google-client-secret'
    )
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE social_accounts'),
      ['acct-1', 'new-access-token', 'new-refresh-token', '2026-06-30T01:00:00.000Z']
    )
  })

  it('keeps a valid Google Business token without hitting the refresh endpoint', async () => {
    const execute = vi.fn()
    const refreshGoogleBusinessToken = vi.fn()

    const token = await resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account({ token_expires_at: new Date(NOW + 20 * 60_000).toISOString() }),
      deps: {
        now: () => NOW,
        refreshGoogleBusinessToken,
        getGoogleBusinessOAuthConfig: () => ({
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          redirectUri: '/callback'
        })
      }
    })

    expect(token).toBe('old-access-token')
    expect(refreshGoogleBusinessToken).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('refreshes Google Business tokens when the stored expiry is unknown', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const refreshGoogleBusinessToken = vi.fn().mockResolvedValue({
      access_token: 'new-access-token',
      expires_in: 3600,
      token_type: 'Bearer'
    })

    const token = await resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account({ token_expires_at: null }),
      deps: {
        now: () => NOW,
        refreshGoogleBusinessToken,
        getGoogleBusinessOAuthConfig: () => ({
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          redirectUri: '/callback'
        })
      }
    })

    expect(token).toBe('new-access-token')
    expect(refreshGoogleBusinessToken).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE social_accounts'),
      ['acct-1', 'new-access-token', 'stored-refresh-token', '2026-06-30T01:00:00.000Z']
    )
  })

  it('records account last_error when provider token refresh fails', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const refreshGoogleBusinessToken = vi.fn().mockRejectedValue(new Error('invalid_grant'))

    await expect(resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account(),
      deps: {
        now: () => NOW,
        refreshGoogleBusinessToken,
        getGoogleBusinessOAuthConfig: () => ({
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          redirectUri: '/callback'
        })
      }
    })).rejects.toThrow('invalid_grant')

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('last_error = $2'),
      ['acct-1', 'Google Business token refresh failed: invalid_grant']
    )
  })

  it('leaves non-Google Business inbox accounts alone', async () => {
    const execute = vi.fn()
    const refreshGoogleBusinessToken = vi.fn()

    const token = await resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account({
        platform: 'facebook',
        refresh_token: null,
        token_expires_at: new Date(NOW - 60_000).toISOString()
      }),
      deps: {
        now: () => NOW,
        refreshGoogleBusinessToken,
        getGoogleBusinessOAuthConfig: () => ({
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          redirectUri: '/callback'
        })
      }
    })

    expect(token).toBe('old-access-token')
    expect(refreshGoogleBusinessToken).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('refreshes expiring YouTube tokens with Google OAuth credentials', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const refreshYouTubeToken = vi.fn().mockResolvedValue({
      access_token: 'new-youtube-token',
      refresh_token: 'new-youtube-refresh',
      expires_in: 7200,
      token_type: 'Bearer'
    })

    const token = await resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account({ platform: 'youtube' }),
      deps: {
        now: () => NOW,
        refreshYouTubeToken,
        getYouTubeOAuthConfig: () => ({
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          redirectUri: '/youtube-callback'
        })
      }
    })

    expect(token).toBe('new-youtube-token')
    expect(refreshYouTubeToken).toHaveBeenCalledWith(
      'stored-refresh-token',
      'google-client-id',
      'google-client-secret'
    )
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE social_accounts'),
      ['acct-1', 'new-youtube-token', 'new-youtube-refresh', '2026-06-30T02:00:00.000Z']
    )
  })

  it('refreshes expiring LinkedIn organic tokens with LinkedIn credentials', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const refreshLinkedInOrganicToken = vi.fn().mockResolvedValue({
      access_token: 'new-linkedin-token',
      refresh_token: 'new-linkedin-refresh',
      expires_in: 3600
    })

    const token = await resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account({ platform: 'linkedin' }),
      deps: {
        now: () => NOW,
        refreshLinkedInOrganicToken,
        getLinkedInOrganicOAuthConfig: () => ({
          clientId: 'linkedin-client-id',
          clientSecret: 'linkedin-client-secret',
          redirectUri: '/linkedin-callback'
        })
      }
    })

    expect(token).toBe('new-linkedin-token')
    expect(refreshLinkedInOrganicToken).toHaveBeenCalledWith(
      'stored-refresh-token',
      'linkedin-client-id',
      'linkedin-client-secret'
    )
  })

  it('refreshes expiring TikTok Content Posting tokens with TikTok credentials', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    const refreshTikTokContentToken = vi.fn().mockResolvedValue({
      access_token: 'new-tiktok-token',
      refresh_token: 'new-tiktok-refresh',
      expires_in: 86_400
    })

    const token = await resolveSocialInboxAccessToken({
      event: undefined,
      db: { execute },
      account: account({ platform: 'tiktok' }),
      deps: {
        now: () => NOW,
        refreshTikTokContentToken,
        getTikTokContentOAuthConfig: () => ({
          clientKey: 'tiktok-client-key',
          clientSecret: 'tiktok-client-secret',
          redirectUri: '/tiktok-callback'
        })
      }
    })

    expect(token).toBe('new-tiktok-token')
    expect(refreshTikTokContentToken).toHaveBeenCalledWith(
      'stored-refresh-token',
      'tiktok-client-key',
      'tiktok-client-secret'
    )
  })
})

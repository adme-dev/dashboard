import { beforeEach, describe, it, expect, vi } from 'vitest'

import {
  publishPost,
  publishedTargetsForAccount,
  resolvePlatformContent,
  stampUtms,
  type PublishablePost
} from '~~/server/utils/socialPublishing'

const providerMocks = vi.hoisted(() => ({
  post: vi.fn(),
  comment: vi.fn()
}))
const tokenRefreshMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  refreshGoogleBusinessToken: vi.fn(),
  getGoogleBusinessOAuthConfig: vi.fn()
}))

// publishPost dispatches through the registry; mock it so no real network calls happen.
vi.mock('~~/server/utils/social-providers/registry', () => ({
  getProviderOrThrow: (platform: string) => ({
    identifier: platform,
    name: platform,
    post: (params: unknown) => providerMocks.post(platform, params),
    comment: (params: unknown) => providerMocks.comment(platform, params)
  })
}))
vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => tokenRefreshMocks.execute(...args)
}))
vi.mock('~~/server/utils/socialOAuth/googleBusiness', () => ({
  refreshGoogleBusinessToken: (...args: unknown[]) => tokenRefreshMocks.refreshGoogleBusinessToken(...args)
}))
vi.mock('~~/server/utils/socialOAuth/env', () => ({
  getGoogleBusinessOAuthConfig: (...args: unknown[]) => tokenRefreshMocks.getGoogleBusinessOAuthConfig(...args),
  getYouTubeOAuthConfig: () => ({ clientId: '', clientSecret: '', redirectUri: '' }),
  getLinkedInOrganicOAuthConfig: () => ({ clientId: '', clientSecret: '', redirectUri: '' }),
  getTikTokContentOAuthConfig: () => ({ clientKey: '', clientSecret: '', redirectUri: '' })
}))

const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  mockConsoleWarn.mockClear()
  providerMocks.post.mockReset()
  providerMocks.comment.mockReset()
  providerMocks.post.mockImplementation(async (platform: string) => ({
    platformPostId: `pid_${platform}`,
    url: `https://x/${platform}`,
    status: 'success'
  }))
  providerMocks.comment.mockImplementation(async (platform: string) => ({
    platformPostId: `comment_${platform}`,
    url: `https://x/${platform}#comment`,
    status: 'success'
  }))
  tokenRefreshMocks.execute.mockReset()
  tokenRefreshMocks.execute.mockResolvedValue(1)
  tokenRefreshMocks.refreshGoogleBusinessToken.mockReset()
  tokenRefreshMocks.refreshGoogleBusinessToken.mockResolvedValue({
    access_token: 'new-gbp-token',
    refresh_token: 'new-gbp-refresh',
    expires_in: 3600
  })
  tokenRefreshMocks.getGoogleBusinessOAuthConfig.mockReset()
  tokenRefreshMocks.getGoogleBusinessOAuthConfig.mockReturnValue({
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
    redirectUri: '/callback'
  })
})

describe('resolvePlatformContent', () => {
  const base = { content: 'Base', mediaUrls: ['a.jpg'] }
  it('inherits base when no override', () => {
    expect(resolvePlatformContent(base, {}, 'instagram')).toEqual(base)
  })
  it('applies a per-network content override, inheriting media', () => {
    const ov = { instagram: { content: 'IG copy' } }
    expect(resolvePlatformContent(base, ov, 'instagram')).toEqual({ content: 'IG copy', mediaUrls: ['a.jpg'] })
  })
  it('applies a per-network media override, inheriting content', () => {
    const ov = { instagram: { mediaUrls: ['b.jpg'] } }
    expect(resolvePlatformContent(base, ov, 'instagram')).toEqual({ content: 'Base', mediaUrls: ['b.jpg'] })
  })
})

describe('stampUtms', () => {
  it('adds utm params for a platform', () => {
    const u = stampUtms('https://x.com/p', 'facebook', 'post123')!
    expect(u).toContain('utm_source=facebook')
    expect(u).toContain('utm_medium=social')
    expect(u).toContain('utm_campaign=post_post123')
  })
  it('returns null for null url', () => {
    expect(stampUtms(null, 'facebook', 'p')).toBeNull()
  })
  it('returns the original string when url is unparseable', () => {
    expect(stampUtms('not a url', 'facebook', 'p')).toBe('not a url')
  })
})

describe('publishPost', () => {
  const post: PublishablePost = {
    id: 'X', content: 'hi', media_urls: ['a.jpg'], link_url: null,
    platforms: ['facebook', 'instagram'], platform_overrides: {},
    accounts: [
      { id: 'a1', platform: 'facebook', platform_account_id: 'PG', access_token: 't', account_name: 'FB' },
      { id: 'a2', platform: 'instagram', platform_account_id: 'IG', access_token: 't', account_name: 'IG' }
    ]
  }

  it('publishes each platform and aggregates to published', async () => {
    const res = await publishPost(post)
    expect(res.status).toBe('published')
    expect(Object.keys(res.platformResults)).toHaveLength(2)
    expect(res.platformResults.facebook.status).toBe('success')
  })

  it('marks a platform failed when no connected account exists', async () => {
    const res = await publishPost({ ...post, platforms: ['facebook', 'linkedin'] })
    expect(res.status).toBe('partially_published')
    expect(res.platformResults.linkedin.status).toBe('failed')
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      postId: 'X',
      platform: 'linkedin',
      resultKey: 'linkedin',
      error: 'No connected account'
    }))
  })

  it('fails LinkedIn, TikTok, and YouTube before provider dispatch when no OAuth account exists', async () => {
    const res = await publishPost({
      ...post,
      platforms: ['linkedin', 'tiktok', 'youtube'],
      accounts: []
    })
    expect(res.status).toBe('failed')
    expect(res.platformResults.linkedin.error).toBe('No connected account')
    expect(res.platformResults.tiktok.error).toBe('No connected account')
    expect(res.platformResults.youtube.error).toBe('No connected account')
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      platform: 'linkedin',
      error: 'No connected account'
    }))
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      platform: 'tiktok',
      error: 'No connected account'
    }))
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      platform: 'youtube',
      error: 'No connected account'
    }))
  })

  it('publishes every selected account for a platform without overwriting results', async () => {
    const res = await publishPost({
      ...post,
      platforms: ['facebook'],
      accounts: [
        { id: 'fb1', platform: 'facebook', platform_account_id: 'PAGE1', access_token: 't1', account_name: 'Page 1' },
        { id: 'fb2', platform: 'facebook', platform_account_id: 'PAGE2', access_token: 't2', account_name: 'Page 2' }
      ]
    })
    expect(res.status).toBe('published')
    expect(Object.keys(res.platformResults).sort()).toEqual(['facebook:fb1', 'facebook:fb2'])
    expect(res.platformResults['facebook:fb1'].accountId).toBe('fb1')
    expect(res.platformResults['facebook:fb2'].accountId).toBe('fb2')
  })

  it('prefers explicit publish_targets over implicit same-platform fan-out', async () => {
    const res = await publishPost({
      ...post,
      platforms: ['facebook'],
      publish_targets: [
        { platform: 'facebook', accountId: 'fb2' }
      ],
      accounts: [
        { id: 'fb1', platform: 'facebook', platform_account_id: 'PAGE1', access_token: 't1', account_name: 'Page 1' },
        { id: 'fb2', platform: 'facebook', platform_account_id: 'PAGE2', access_token: 't2', account_name: 'Page 2' }
      ]
    })

    expect(res.status).toBe('published')
    expect(Object.keys(res.platformResults)).toEqual(['facebook:fb2'])
    expect(providerMocks.post).toHaveBeenCalledTimes(1)
    expect(providerMocks.post).toHaveBeenCalledWith('facebook', expect.objectContaining({
      accountId: 'PAGE2',
      accessToken: 't2'
    }))
  })

  it('passes supported links as structured provider options instead of appending them to copy', async () => {
    const res = await publishPost({
      ...post,
      content: 'Launch copy',
      media_urls: [],
      link_url: 'https://dealer.example.com/new',
      platforms: ['facebook'],
      accounts: [
        { id: 'fb1', platform: 'facebook', platform_account_id: 'PAGE1', access_token: 't1', account_name: 'Page 1' }
      ]
    })

    expect(res.status).toBe('published')
    expect(providerMocks.post).toHaveBeenCalledWith('facebook', expect.objectContaining({
      content: 'Launch copy',
      options: expect.objectContaining({
        link: expect.stringContaining('utm_source=facebook')
      })
    }))
  })

  it('maps linkUrl to a Google Business CTA while preserving location options', async () => {
    await publishPost({
      ...post,
      content: 'Service special',
      link_url: 'https://dealer.example.com/service',
      platforms: ['google-business'],
      accounts: [
        {
          id: 'gbp1',
          platform: 'google-business',
          platform_account_id: 'accounts/1:locations/2',
          access_token: 't1',
          account_name: 'GBP',
          metadata: { googleBusinessAccountId: 'accounts/1', googleBusinessLocationId: 'locations/2' }
        }
      ]
    })

    expect(providerMocks.post).toHaveBeenCalledWith('google-business', expect.objectContaining({
      content: 'Service special',
      options: expect.objectContaining({
        locationId: 'locations/2',
        callToAction: {
          actionType: 'LEARN_MORE',
          url: expect.stringContaining('utm_source=google-business')
        }
      })
    }))
  })

  it('refreshes expiring Google Business tokens before dispatch and clears stale account errors', async () => {
    await publishPost({
      ...post,
      content: 'Service special',
      platforms: ['google-business'],
      accounts: [
        {
          id: 'gbp1',
          platform: 'google-business',
          platform_account_id: 'accounts/1:locations/2',
          access_token: 'old-gbp-token',
          refresh_token: 'stored-gbp-refresh',
          token_expires_at: '2026-01-01T00:00:00.000Z',
          account_name: 'GBP',
          last_error: 'temporary upstream timeout',
          metadata: { googleBusinessAccountId: 'accounts/1', googleBusinessLocationId: 'locations/2' }
        }
      ]
    })

    expect(tokenRefreshMocks.refreshGoogleBusinessToken).toHaveBeenCalledWith(
      'stored-gbp-refresh',
      'google-client-id',
      'google-client-secret'
    )
    expect(tokenRefreshMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('last_error = NULL'),
      ['gbp1', 'new-gbp-token', 'new-gbp-refresh', expect.any(String)]
    )
    expect(providerMocks.post).toHaveBeenCalledWith('google-business', expect.objectContaining({
      accessToken: 'new-gbp-token'
    }))
  })

  it('publishes first_comment after a successful provider post when comments are supported', async () => {
    const res = await publishPost({
      ...post,
      first_comment: 'Inventory links and finance notes are in this thread.',
      platforms: ['facebook'],
      accounts: [
        { id: 'fb1', platform: 'facebook', platform_account_id: 'PAGE1', access_token: 't1', account_name: 'Page 1' }
      ]
    })

    expect(res.status).toBe('published')
    expect(providerMocks.comment).toHaveBeenCalledWith('facebook', expect.objectContaining({
      accountId: 'PAGE1',
      accessToken: 't1',
      postId: 'pid_facebook',
      content: 'Inventory links and finance notes are in this thread.'
    }))
    expect(res.platformResults.facebook.firstComment).toEqual(expect.objectContaining({
      status: 'success',
      platformPostId: 'comment_facebook'
    }))
  })

  it('passes validated per-platform provider options through dispatch', async () => {
    await publishPost({
      ...post,
      media_urls: ['https://cdn.example.com/reel.mp4'],
      platforms: ['instagram'],
      platform_overrides: {
        instagram: {
          options: { type: 'reel', collaborators: ['creator_1'] }
        }
      },
      accounts: [
        { id: 'ig1', platform: 'instagram', platform_account_id: 'IG', access_token: 't1', account_name: 'IG' }
      ]
    })

    expect(providerMocks.post).toHaveBeenCalledWith('instagram', expect.objectContaining({
      options: expect.objectContaining({
        type: 'reel',
        collaborators: ['creator_1']
      })
    }))
  })

  it('fails an account that requires reconnect before provider dispatch', async () => {
    const res = await publishPost({
      ...post,
      platforms: ['facebook'],
      accounts: [
        {
          id: 'fb-expired',
          platform: 'facebook',
          platform_account_id: 'PAGE1',
          access_token: 'expired-token',
          account_name: 'Expired Page',
          token_expires_at: '2026-01-01T00:00:00.000Z'
        }
      ]
    })

    expect(res.status).toBe('failed')
    expect(res.platformResults.facebook).toEqual(expect.objectContaining({
      status: 'failed',
      accountId: 'fb-expired',
      error: 'Publishing account requires reconnect'
    }))
    expect(providerMocks.post).not.toHaveBeenCalled()
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      postId: 'X',
      platform: 'facebook',
      resultKey: 'facebook',
      accountId: 'fb-expired',
      error: 'Publishing account requires reconnect'
    }))
  })

  it('fails planned providers before provider dispatch even when a connected account exists', async () => {
    const res = await publishPost({
      ...post,
      platforms: ['tiktok'],
      accounts: [
        {
          id: 'tt1',
          platform: 'tiktok',
          platform_account_id: 'open-1',
          access_token: 'AT',
          refresh_token: 'RT',
          token_expires_at: '2026-08-01T00:00:00.000Z',
          account_name: 'Acme Creator'
        }
      ]
    })

    expect(res.status).toBe('failed')
    expect(res.platformResults.tiktok).toEqual(expect.objectContaining({
      status: 'failed',
      accountId: 'tt1',
      error: expect.stringContaining('TikTok publishing is not production-ready')
    }))
    expect(providerMocks.post).not.toHaveBeenCalled()
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      postId: 'X',
      platform: 'tiktok',
      resultKey: 'tiktok',
      accountId: 'tt1',
      error: expect.stringContaining('TikTok publishing is not production-ready')
    }))
  })

  it('fails Instagram before provider dispatch when no media is available', async () => {
    const res = await publishPost({ ...post, media_urls: [], platforms: ['instagram'] })
    expect(res.status).toBe('failed')
    expect(res.platformResults.instagram.status).toBe('failed')
    expect(res.platformResults.instagram.error).toMatch(/requires media/)
  })

  it('fails YouTube before provider dispatch while upload publishing is not production-ready', async () => {
    const res = await publishPost({
      ...post,
      media_urls: ['https://cdn.example.com/image.jpg'],
      platforms: ['youtube'],
      accounts: [{ id: 'yt1', platform: 'youtube', platform_account_id: 'YT', access_token: 't', account_name: 'YT' }]
    })
    expect(res.status).toBe('failed')
    expect(res.platformResults.youtube.status).toBe('failed')
    expect(res.platformResults.youtube.error).toMatch(/not production-ready/)
    expect(mockConsoleWarn).toHaveBeenCalledWith('social-publish.target_failed', expect.objectContaining({
      postId: 'X',
      platform: 'youtube',
      resultKey: 'youtube',
      accountId: 'yt1',
      error: expect.stringContaining('YouTube publishing is not production-ready')
    }))
  })
})

describe('publishedTargetsForAccount', () => {
  it('extracts only matching target-keyed post results for metric sync', () => {
    const results = {
      'facebook:fb1': { platform: 'facebook', accountId: 'fb1', platformAccountId: 'PAGE1', platformPostId: 'post_page_1' },
      'facebook:fb2': { platform: 'facebook', accountId: 'fb2', platformAccountId: 'PAGE2', platformPostId: 'post_page_2' }
    }
    expect(publishedTargetsForAccount('P1', results, {
      id: 'fb2',
      platform: 'facebook',
      platform_account_id: 'PAGE2'
    })).toEqual([{ postId: 'P1', platformPostId: 'post_page_2' }])
  })

  it('keeps legacy platform-keyed results readable', () => {
    expect(publishedTargetsForAccount('P1', {
      facebook: { platformPostId: 'legacy_post' }
    }, {
      id: 'fb1',
      platform: 'facebook',
      platform_account_id: 'PAGE1'
    })).toEqual([{ postId: 'P1', platformPostId: 'legacy_post' }])
  })
})

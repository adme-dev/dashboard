import { describe, it, expect, vi } from 'vitest'

// publishPost dispatches through the registry; mock it so no real network calls happen.
vi.mock('~~/server/utils/social-providers/registry', () => ({
  getProviderOrThrow: (platform: string) => ({
    identifier: platform,
    name: platform,
    post: vi.fn(async () => ({ platformPostId: `pid_${platform}`, url: `https://x/${platform}`, status: 'success' })),
  }),
}))

import { resolvePlatformContent, stampUtms, publishPost } from '~~/server/utils/socialPublishing'

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
  const post = {
    id: 'X', content: 'hi', media_urls: ['a.jpg'], link_url: null,
    platforms: ['facebook', 'instagram'], platform_overrides: {},
    accounts: [
      { id: 'a1', platform: 'facebook', platform_account_id: 'PG', access_token: 't', account_name: 'FB' },
      { id: 'a2', platform: 'instagram', platform_account_id: 'IG', access_token: 't', account_name: 'IG' },
    ],
  }

  it('publishes each platform and aggregates to published', async () => {
    const res = await publishPost(post as any)
    expect(res.status).toBe('published')
    expect(Object.keys(res.platformResults)).toHaveLength(2)
    expect(res.platformResults.facebook.status).toBe('success')
  })

  it('marks a platform failed when no connected account exists', async () => {
    const res = await publishPost({ ...post, platforms: ['facebook', 'linkedin'] } as any)
    expect(res.status).toBe('partially_published')
    expect(res.platformResults.linkedin.status).toBe('failed')
  })
})

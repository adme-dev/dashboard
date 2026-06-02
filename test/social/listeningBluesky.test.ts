import { describe, it, expect } from 'vitest'
import { normalizeBlueskyPosts } from '~~/server/utils/socialListening/sources/bluesky'

describe('normalizeBlueskyPosts', () => {
  const payload = { posts: [
    { uri: 'at://did:plc:abc/app.bsky.feed.post/1', author: { handle: 'jane.bsky.social' },
      record: { text: 'love acme', createdAt: '2026-06-01T00:00:00Z', langs: ['en'] } },
  ] }
  it('maps bluesky posts to RawMentions with an https permalink', () => {
    const out = normalizeBlueskyPosts(payload)
    expect(out[0]).toMatchObject({ source: 'bluesky', externalId: 'at://did:plc:abc/app.bsky.feed.post/1', author: 'jane.bsky.social', content: 'love acme', lang: 'en' })
    expect(out[0].url).toBe('https://bsky.app/profile/jane.bsky.social/post/1')
    expect(out[0].publishedAt).toBe('2026-06-01T00:00:00Z')
  })
  it('returns [] for malformed payloads', () => { expect(normalizeBlueskyPosts({})).toEqual([]) })
})

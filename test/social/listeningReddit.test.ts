import { describe, it, expect } from 'vitest'
import { normalizeRedditListing } from '~~/server/utils/socialListening/sources/reddit'

describe('normalizeRedditListing', () => {
  const listing = { data: { children: [
    { data: { id: 't3_1', permalink: '/r/x/comments/1', title: 'ACME rocks', selftext: 'love it',
              author: 'jane', created_utc: 1780000000, subreddit: 'gadgets' } },
    { data: { id: 't3_2', permalink: '/r/x/comments/2', title: 'meh', selftext: '', author: 'bob', created_utc: 1780000100 } },
  ] } }
  it('maps reddit children to RawMentions with absolute urls + ISO dates', () => {
    const out = normalizeRedditListing(listing)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ source: 'reddit', externalId: 't3_1', author: 'jane', title: 'ACME rocks', content: 'love it' })
    expect(out[0].url).toBe('https://www.reddit.com/r/x/comments/1')
    expect(out[0].publishedAt).toContain('20')
  })
  it('returns [] for malformed payloads', () => {
    expect(normalizeRedditListing(null)).toEqual([])
    expect(normalizeRedditListing({})).toEqual([])
  })
})

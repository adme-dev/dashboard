import { describe, it, expect } from 'vitest'
import { normalizeYoutubeSearch } from '~~/server/utils/socialListening/sources/youtube'

describe('normalizeYoutubeSearch', () => {
  const payload = { items: [
    { id: { videoId: 'v1' }, snippet: { title: 'ACME review', description: 'great', channelTitle: 'Tech', publishedAt: '2026-06-01T00:00:00Z' } },
    { id: { channelId: 'c1' }, snippet: { title: 'channel' } },
  ] }
  it('maps video search items to RawMentions and skips non-videos', () => {
    const out = normalizeYoutubeSearch(payload)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ source: 'youtube', externalId: 'v1', title: 'ACME review', content: 'great', author: 'Tech' })
    expect(out[0].url).toBe('https://www.youtube.com/watch?v=v1')
    expect(out[0].publishedAt).toBe('2026-06-01T00:00:00Z')
  })
  it('returns [] for malformed payloads', () => { expect(normalizeYoutubeSearch(null)).toEqual([]) })
})

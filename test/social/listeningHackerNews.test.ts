import { describe, it, expect, vi } from 'vitest'
import { normalizeHackerNews, hackernewsSource } from '~~/server/utils/socialListening/sources/hackernews'

const PAYLOAD = {
  hits: [
    {
      objectID: '4567', title: 'Show HN: Acme', story_title: null, comment_text: null,
      story_text: 'we built acme', author: 'pg', created_at: '2026-06-01T10:00:00.000Z',
      points: 42, num_comments: 7, _tags: ['story', 'author_pg'],
    },
    {
      objectID: '4568', title: null, story_title: 'Acme thread', comment_text: 'acme is great',
      story_text: null, author: 'jane', created_at: '2026-06-01T11:00:00.000Z', _tags: ['comment'],
    },
  ],
}

describe('normalizeHackerNews', () => {
  it('maps stories and comments to RawMentions with HN item permalinks', () => {
    const out = normalizeHackerNews(PAYLOAD)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      source: 'hackernews', externalId: 'hn:4567', url: 'https://news.ycombinator.com/item?id=4567',
      author: 'pg', title: 'Show HN: Acme', content: 'we built acme', publishedAt: '2026-06-01T10:00:00.000Z',
    })
    expect(out[0].raw).toMatchObject({ points: 42, num_comments: 7 })
  })
  it('falls back story_title→title and comment_text→content', () => {
    const out = normalizeHackerNews(PAYLOAD)
    expect(out[1]).toMatchObject({ externalId: 'hn:4568', title: 'Acme thread', content: 'acme is great', author: 'jane' })
  })
  it('skips hits with no objectID and returns [] for malformed payloads', () => {
    expect(normalizeHackerNews({ hits: [{ title: 'no id' }] })).toEqual([])
    expect(normalizeHackerNews(null)).toEqual([])
    expect(normalizeHackerNews({})).toEqual([])
  })
})

describe('hackernewsSource', () => {
  it('is default-on (no key required)', () => {
    expect(hackernewsSource.isEnabled({})).toBe(true)
  })
  it('queries the Algolia API with the joined terms and normalizes the response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as unknown as typeof fetch
    const out = await hackernewsSource.search({ terms: ['acme', 'widget'], limit: 25, fetchImpl, env: {} })
    expect(out).toHaveLength(2)
    const calledUrl = (fetchImpl as any).mock.calls[0][0] as string
    expect(calledUrl).toContain('hn.algolia.com/api/v1/search')
    expect(calledUrl).toContain('query=acme%20widget')
  })
  it('returns [] on empty terms and on non-ok responses', async () => {
    const okFetch = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as unknown as typeof fetch
    expect(await hackernewsSource.search({ terms: [], limit: 25, fetchImpl: okFetch, env: {} })).toEqual([])
    const badFetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await hackernewsSource.search({ terms: ['acme'], limit: 25, fetchImpl: badFetch, env: {} })).toEqual([])
  })
})

import { describe, it, expect, vi } from 'vitest'
import { collectForQuery } from '~~/server/utils/socialListening/collect'
import type { ListeningSource } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

const mk = (id: string, content: string): RawMention => ({
  source: 'reddit', externalId: id, url: null, author: null, title: null, content,
  lang: null, publishedAt: null, raw: {},
})
const fakeSource = (key: any, enabled: boolean, hits: RawMention[]): ListeningSource => ({
  key, isEnabled: () => enabled, search: vi.fn(async () => hits),
})

const query = { include_terms: ['acme'], exclude_terms: ['stock'], sources: ['reddit', 'news'] }

describe('collectForQuery', () => {
  it('runs only enabled sources that the query selected, and filters by matchesQuery', async () => {
    const reddit = fakeSource('reddit', true, [mk('r1', 'love acme'), mk('r2', 'acme stock dump')])
    const news = fakeSource('news', false, [mk('n1', 'acme news')])
    const yt = fakeSource('youtube', true, [mk('y1', 'acme video')])
    const out = await collectForQuery(query, [reddit, news, yt], {}, fetch)
    expect(out.map(m => m.externalId)).toEqual(['r1'])
    expect(news.search).not.toHaveBeenCalled()
    expect(yt.search).not.toHaveBeenCalled()
  })
  it('returns [] when no selected source is enabled', async () => {
    const reddit = fakeSource('reddit', false, [mk('r1', 'acme')])
    expect(await collectForQuery(query, [reddit], {}, fetch)).toEqual([])
  })
  it('isolates a throwing source (one bad source does not sink the batch)', async () => {
    const bad: ListeningSource = { key: 'reddit', isEnabled: () => true, search: vi.fn(async () => { throw new Error('boom') }) }
    const newsQuery = { include_terms: ['acme'], exclude_terms: [], sources: ['reddit', 'news'] }
    const news = fakeSource('news', true, [mk('n1', 'acme')])
    const out = await collectForQuery(newsQuery, [bad, news], {}, fetch)
    expect(out.map(m => m.externalId)).toEqual(['n1'])
  })
})

import { describe, it, expect } from 'vitest'
import { normalizeRssItems } from '~~/server/utils/socialListening/sources/news'

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title>ACME launches widget</title><link>https://news.example/a</link>
    <description>The new ACME widget ships today.</description>
    <pubDate>Mon, 01 Jun 2026 10:00:00 GMT</pubDate><guid>news-a</guid></item>
  <item><title>Unrelated</title><link>https://news.example/b</link>
    <description>nothing</description><pubDate>Mon, 01 Jun 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`

describe('normalizeRssItems', () => {
  it('maps RSS <item>s to RawMentions (guid or link as external id)', () => {
    const out = normalizeRssItems(RSS, 'https://news.example/feed')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      source: 'news', externalId: 'news-a', url: 'https://news.example/a',
      title: 'ACME launches widget', content: 'The new ACME widget ships today.',
    })
    expect(out[0].publishedAt).toContain('2026-06-01')
    expect(out[1].externalId).toBe('https://news.example/b')
  })
  it('returns [] for non-XML / empty input', () => {
    expect(normalizeRssItems('', 'f')).toEqual([])
    expect(normalizeRssItems('not xml', 'f')).toEqual([])
  })
})

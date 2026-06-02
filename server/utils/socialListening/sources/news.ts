// server/utils/socialListening/sources/news.ts
// News/RSS listening source. No API key — searches Google News RSS for the query terms and parses
// the returned feed. Pure normalizer (normalizeRssItems) + thin fetch. SSRF-guarded feed URLs.
import { safePublicUrl } from '~~/app/utils/safe-url'
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  if (!m) return null
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() || null
}

/** Parse an RSS document into RawMentions. Tolerant of missing fields; never throws. */
export function normalizeRssItems(xml: string, feedUrl: string): RawMention[] {
  if (!xml || !/<item[\s>]/i.test(xml)) return []
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  const out: RawMention[] = []
  for (const item of items) {
    const link = tag(item, 'link')
    const guid = tag(item, 'guid')
    const externalId = guid || link
    if (!externalId) continue
    const pub = tag(item, 'pubDate')
    let publishedAt: string | null = null
    if (pub) { const d = new Date(pub); if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString() }
    out.push({
      source: 'news', externalId, url: link, author: tag(item, 'source') || null,
      title: tag(item, 'title'), content: tag(item, 'description'), lang: null,
      publishedAt, raw: { feedUrl },
    })
  }
  return out
}

export const newsSource: ListeningSource = {
  key: 'news',
  isEnabled: () => true,
  async search({ terms, fetchImpl }: SourceSearchInput): Promise<RawMention[]> {
    const q = encodeURIComponent(terms.join(' OR '))
    const feedUrl = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
    if (!safePublicUrl(feedUrl)) return []
    const resp = await fetchImpl(feedUrl, { headers: { 'user-agent': 'XeroFlowListening/1.0' } })
    if (!resp.ok) return []
    return normalizeRssItems(await resp.text(), feedUrl)
  },
}

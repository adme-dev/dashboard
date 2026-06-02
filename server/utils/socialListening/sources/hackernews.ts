// server/utils/socialListening/sources/hackernews.ts
// Hacker News listening source via the free Algolia HN Search API. No API key (default-on, like
// `news`). Pure normalizer (normalizeHackerNews) + thin injected fetch. Highest-ROI free add for
// B2B / SaaS / dev-tool clients. ⚠️ Verify the Algolia hit shape live if fields ever change.
import { safePublicUrl } from '~~/app/utils/safe-url'
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

/** Map an HN Algolia search response into RawMentions. Tolerant of missing fields; never throws. */
export function normalizeHackerNews(payload: any): RawMention[] {
  const hits = payload?.hits
  if (!Array.isArray(hits)) return []
  const out: RawMention[] = []
  for (const h of hits) {
    const objectID = h?.objectID
    if (!objectID) continue
    out.push({
      source: 'hackernews',
      externalId: `hn:${objectID}`,
      url: `https://news.ycombinator.com/item?id=${objectID}`,
      author: h.author ?? null,
      title: h.title ?? h.story_title ?? null,
      content: h.comment_text ?? h.story_text ?? null,
      lang: null,
      publishedAt: h.created_at ?? null,
      raw: { points: h.points ?? null, num_comments: h.num_comments ?? null, tags: h._tags ?? null },
    })
  }
  return out
}

export const hackernewsSource: ListeningSource = {
  key: 'hackernews',
  isEnabled: () => true,
  async search({ terms, limit, fetchImpl }: SourceSearchInput): Promise<RawMention[]> {
    const q = encodeURIComponent(terms.join(' ').trim())
    if (!q) return []
    // tags=(story,comment) is HN's OR syntax — leave the parens unencoded or the OR semantics break.
    const url = `https://hn.algolia.com/api/v1/search?query=${q}&tags=(story,comment)&hitsPerPage=${Math.min(limit, 50)}`
    if (!safePublicUrl(url)) return []
    const resp = await fetchImpl(url, { headers: { 'user-agent': 'XeroFlowListening/1.0' } })
    if (!resp.ok) return []
    return normalizeHackerNews(await resp.json())
  },
}

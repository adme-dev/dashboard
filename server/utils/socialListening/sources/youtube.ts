// server/utils/socialListening/sources/youtube.ts
// YouTube listening source via Data API search.list. Pure normalizer + thin fetch.
// ⚠️ Verify the live search.list response shape before trusting prod.
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

export function normalizeYoutubeSearch(payload: any): RawMention[] {
  const items = payload?.items
  if (!Array.isArray(items)) return []
  const out: RawMention[] = []
  for (const it of items) {
    const videoId = it?.id?.videoId
    if (!videoId) continue
    const s = it.snippet ?? {}
    out.push({
      source: 'youtube', externalId: String(videoId), url: `https://www.youtube.com/watch?v=${videoId}`,
      author: s.channelTitle ?? null, title: s.title ?? null, content: s.description ?? null,
      lang: null, publishedAt: s.publishedAt ?? null, raw: {},
    })
  }
  return out
}

export const youtubeSource: ListeningSource = {
  key: 'youtube',
  isEnabled: (env) => !!env.YOUTUBE_API_KEY,
  async search({ terms, limit, fetchImpl, env }: SourceSearchInput): Promise<RawMention[]> {
    const q = encodeURIComponent(terms.join(' | '))
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=${Math.min(limit, 50)}&q=${q}&key=${env.YOUTUBE_API_KEY}`
    const resp = await fetchImpl(url)
    if (!resp.ok) return []
    return normalizeYoutubeSearch(await resp.json())
  },
}

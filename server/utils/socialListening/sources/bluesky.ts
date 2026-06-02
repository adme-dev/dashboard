// server/utils/socialListening/sources/bluesky.ts
// Bluesky listening source via the public app.bsky.feed.searchPosts XRPC. Pure normalizer + fetch.
// ⚠️ Verify the live searchPosts response shape before trusting prod.
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

export function normalizeBlueskyPosts(payload: any): RawMention[] {
  const posts = payload?.posts
  if (!Array.isArray(posts)) return []
  const out: RawMention[] = []
  for (const p of posts) {
    if (!p?.uri) continue
    const handle = p.author?.handle ?? null
    const rkey = String(p.uri).split('/').pop()
    out.push({
      source: 'bluesky', externalId: String(p.uri),
      url: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null,
      author: handle, title: null, content: p.record?.text ?? null,
      lang: Array.isArray(p.record?.langs) ? (p.record.langs[0] ?? null) : null,
      publishedAt: p.record?.createdAt ?? null, raw: {},
    })
  }
  return out
}

export const blueskySource: ListeningSource = {
  key: 'bluesky',
  isEnabled: (env) => env.SOCIAL_LISTENING_BLUESKY_ENABLED === 'true',
  async search({ terms, limit, fetchImpl }: SourceSearchInput): Promise<RawMention[]> {
    const q = encodeURIComponent(terms.join(' '))
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${q}&limit=${Math.min(limit, 25)}`
    const resp = await fetchImpl(url)
    if (!resp.ok) return []
    return normalizeBlueskyPosts(await resp.json())
  },
}

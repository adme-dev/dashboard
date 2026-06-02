// server/utils/socialListening/sources/lemmy.ts
// Lemmy listening source. Searches each operator-configured instance's public /api/v3/search.
// Reuses the mastodon multi-instance + SSRF-guard pattern almost verbatim. Pure normalizer
// (normalizeLemmyResults) + thin injected fetch. ⚠️ Verify the v3 search shape live; instance
// URLs are SSRF-guarded.
import { isSafeInstanceUrl } from '~~/server/utils/socialListening/sources/mastodon'
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

/** Map a Lemmy /api/v3/search response (post_view[]) into RawMentions. Tolerant; never throws. */
export function normalizeLemmyResults(payload: any, instance: string): RawMention[] {
  const posts = payload?.posts
  if (!Array.isArray(posts)) return []
  const out: RawMention[] = []
  for (const view of posts) {
    const post = view?.post
    if (!post?.id) continue
    out.push({
      source: 'lemmy',
      externalId: `lemmy:${post.id}`,
      url: post.ap_id ?? null,
      author: view.creator?.name ?? null,
      title: post.name ?? null,
      content: post.body ?? null,
      lang: null,
      publishedAt: post.published ?? null,
      raw: { instance, community: view.community?.name ?? null },
    })
  }
  return out
}

export const lemmySource: ListeningSource = {
  key: 'lemmy',
  isEnabled: (env) => !!env.SOCIAL_LISTENING_LEMMY_INSTANCES,
  async search({ terms, limit, fetchImpl, env }: SourceSearchInput): Promise<RawMention[]> {
    const instances = (env.SOCIAL_LISTENING_LEMMY_INSTANCES ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const q = encodeURIComponent(terms.join(' ').trim())
    if (!q) return []
    const all: RawMention[] = []
    for (const inst of instances) {
      const base = inst.replace(/\/$/, '')
      if (!isSafeInstanceUrl(base)) continue   // SSRF guard: block loopback/private/link-local hosts
      const url = `${base}/api/v3/search?q=${q}&type_=All&sort=New&limit=${Math.min(limit, 25)}`
      try {
        const resp = await fetchImpl(url)
        if (!resp.ok) continue
        all.push(...normalizeLemmyResults(await resp.json(), base))
      } catch { /* skip a bad instance */ }
    }
    return all
  },
}

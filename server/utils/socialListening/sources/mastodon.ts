// server/utils/socialListening/sources/mastodon.ts
// Mastodon listening source. Searches each operator-configured instance's public /api/v2/search.
// Pure normalizer + thin fetch. ⚠️ Verify the v2 search shape live; instance URLs are SSRF-guarded.
import { safePublicUrl } from '~~/app/utils/safe-url'
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

const stripHtml = (s: string): string => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim()

export function normalizeMastodonResults(payload: any, instance: string): RawMention[] {
  const statuses = payload?.statuses
  if (!Array.isArray(statuses)) return []
  const out: RawMention[] = []
  for (const s of statuses) {
    if (!s?.id) continue
    out.push({
      source: 'mastodon', externalId: s.url || `${instance}/${s.id}`, url: s.url ?? null,
      author: s.account?.acct ?? null, title: null,
      content: typeof s.content === 'string' ? stripHtml(s.content) : null,
      lang: s.language ?? null, publishedAt: s.created_at ?? null, raw: { instance },
    })
  }
  return out
}

export const mastodonSource: ListeningSource = {
  key: 'mastodon',
  isEnabled: (env) => !!env.SOCIAL_LISTENING_MASTODON_INSTANCES,
  async search({ terms, limit, fetchImpl, env }: SourceSearchInput): Promise<RawMention[]> {
    const instances = (env.SOCIAL_LISTENING_MASTODON_INSTANCES ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const q = encodeURIComponent(terms.join(' '))
    const all: RawMention[] = []
    for (const inst of instances) {
      const base = inst.replace(/\/$/, '')
      const url = `${base}/api/v2/search?q=${q}&type=statuses&limit=${Math.min(limit, 25)}`
      if (!safePublicUrl(url)) continue
      try {
        const resp = await fetchImpl(url)
        if (!resp.ok) continue
        all.push(...normalizeMastodonResults(await resp.json(), base))
      } catch { /* skip a bad instance */ }
    }
    return all
  },
}

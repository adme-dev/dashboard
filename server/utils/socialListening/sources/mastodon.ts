// server/utils/socialListening/sources/mastodon.ts
// Mastodon listening source. Searches each operator-configured instance's public /api/v2/search.
// Pure normalizer + thin fetch. ⚠️ Verify the v2 search shape live; instance URLs are SSRF-guarded.
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

// Mirror of the leads webhook SSRF blocklist (server/utils/leads/destinations/webhook.ts) — the
// operator supplies these instance URLs and we fetch them server-side, so plain protocol validation
// (safePublicUrl) is not enough; block localhost/loopback/private/link-local hosts.
const PRIVATE_HOST_RE = /^(?:localhost$|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|::ffff:|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i

/** True only for an https/http URL whose host is public (not loopback/private/link-local). */
export function isSafeInstanceUrl(value: string): boolean {
  let u: URL
  try { u = new URL(value) } catch { return false }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (!host || PRIVATE_HOST_RE.test(host)) return false
  return true
}

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
      if (!isSafeInstanceUrl(base)) continue   // SSRF guard: block loopback/private/link-local hosts
      const url = `${base}/api/v2/search?q=${q}&type=statuses&limit=${Math.min(limit, 25)}`
      try {
        const resp = await fetchImpl(url)
        if (!resp.ok) continue
        all.push(...normalizeMastodonResults(await resp.json(), base))
      } catch { /* skip a bad instance */ }
    }
    return all
  },
}

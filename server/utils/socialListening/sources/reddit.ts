// server/utils/socialListening/sources/reddit.ts
// Reddit listening source. App-only OAuth token, then /search. Pure normalizer + thin fetch.
// ⚠️ Verify the live token + search response shape before trusting prod numbers.
import type { ListeningSource, SourceSearchInput, SourceEnv } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

export function normalizeRedditListing(payload: any): RawMention[] {
  const children = payload?.data?.children
  if (!Array.isArray(children)) return []
  const out: RawMention[] = []
  for (const c of children) {
    const d = c?.data
    if (!d?.id) continue
    let publishedAt: string | null = null
    if (typeof d.created_utc === 'number') publishedAt = new Date(d.created_utc * 1000).toISOString()
    out.push({
      source: 'reddit', externalId: String(d.id),
      url: d.permalink ? `https://www.reddit.com${d.permalink}` : (d.url ?? null),
      author: d.author ?? null, title: d.title ?? null, content: d.selftext ?? null,
      lang: null, publishedAt, raw: { subreddit: d.subreddit },
    })
  }
  return out
}

async function getToken(env: SourceEnv, fetchImpl: typeof fetch): Promise<string | null> {
  const id = env.REDDIT_CLIENT_ID, secret = env.REDDIT_CLIENT_SECRET
  if (!id || !secret) return null
  const resp = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'XeroFlowListening/1.0',
    },
    body: 'grant_type=client_credentials',
  })
  if (!resp.ok) return null
  return (await resp.json() as any)?.access_token ?? null
}

export const redditSource: ListeningSource = {
  key: 'reddit',
  isEnabled: (env) => !!(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET),
  async search({ terms, limit, fetchImpl, env }: SourceSearchInput): Promise<RawMention[]> {
    const token = await getToken(env, fetchImpl)
    if (!token) return []
    const q = encodeURIComponent(terms.join(' OR '))
    const resp = await fetchImpl(`https://oauth.reddit.com/search?q=${q}&limit=${limit}&sort=new&type=link`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'XeroFlowListening/1.0' },
    })
    if (!resp.ok) return []
    return normalizeRedditListing(await resp.json())
  },
}

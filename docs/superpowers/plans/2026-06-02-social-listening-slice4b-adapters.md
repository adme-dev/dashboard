# Social Listening — Slice 4b (External Source Adapters) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the five pluggable external listening sources (Reddit, News/RSS, YouTube, Bluesky, Mastodon) behind per-source gates, a poll-cron endpoint that runs enabled queries against enabled sources and upserts matched mentions, and a `social-listening-cron` companion Worker. All dormant until an operator provisions keys.

**Architecture:** A `ListeningSource` interface (`isEnabled(env)` + injected-fetch `search(query)`); a small registry of the five adapters; a pure orchestrator that runs a query against the enabled sources, applies `matchesQuery`, and returns `RawMention[]`; the cron endpoint loops a client's enabled queries × enabled sources → `upsertMentions` (from 4a). Each adapter splits into a **pure normalizer** (fixture payload → `RawMention[]`, fully unit-tested) and a **thin injected fetch** (the live HTTP call). Builds on 4a (`social_listening_mentions`, `upsertMentions`, `matchesQuery`, `RawMention`). No migration.

**Tech Stack:** Nitro server utils (`~~/server/utils/...`); Vitest; Cloudflare Worker (cron). SSRF guard via `~~/app/utils/safe-url` for News/RSS.

> ⚠️ **External API caveat (read first):** the live request/response shapes for Reddit, YouTube, Bluesky, and Mastodon are coded from documented v-current shapes and **must be verified against the live APIs before trusting prod data** — same posture as the 3a Graph metric names and the audio MiniMax integration. This is safe because every adapter ships **gated/dormant** (no key/flag → never called). The **pure normalizers are the tested contract**; the fetch wrappers are thin and clearly marked. Keep the normalizer tolerant of missing fields.

---

## Conventions (same as 4a)

- Isolated worktree off latest `origin/main`; symlink `node_modules`; `pnpm exec nuxt prepare` before vitest.
- Server imports `~~/server/utils/...`; importing `app/utils/*` from server uses `~~/app/utils/...`.
- Tests in `test/social/`; run one file: `pnpm exec vitest run test/social/<file>`.
- Typecheck gate: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck`; bar = 0 errors referencing new files.
- Cron endpoints: verify `x-cron-secret` against `process.env.CRON_SECRET` (skip in `import.meta.dev`). Mirror `server/api/cron/sync-social-metrics.post.ts`.
- Companion worker: copy `workers/social-report-cron/` structure (scheduled() → fetch POST with `x-cron-secret`).
- **Gating:** an adapter's `isEnabled(env)` returns false when its key/flag is absent → it is never called. No env set → the whole cron is a no-op.

---

## File structure

| File | Responsibility |
|---|---|
| `server/utils/socialListening/sources/types.ts` | `ListeningSource` interface, `SourceSearchInput`, `SourceEnv` |
| `server/utils/socialListening/sources/news.ts` | News/RSS adapter — `normalizeRssItems` (pure) + `newsSource` |
| `server/utils/socialListening/sources/reddit.ts` | Reddit adapter — `normalizeRedditListing` (pure) + `redditSource` |
| `server/utils/socialListening/sources/youtube.ts` | YouTube adapter — `normalizeYoutubeSearch` (pure) + `youtubeSource` |
| `server/utils/socialListening/sources/bluesky.ts` | Bluesky adapter — `normalizeBlueskyPosts` (pure) + `blueskySource` |
| `server/utils/socialListening/sources/mastodon.ts` | Mastodon adapter — `normalizeMastodonResults` (pure) + `mastodonSource` |
| `server/utils/socialListening/sources/registry.ts` | `LISTENING_SOURCES` array + `enabledSources(env)` |
| `server/utils/socialListening/collect.ts` | pure `collectForQuery(query, sources, env, fetchImpl)` → matched `RawMention[]` |
| `server/api/cron/sync-social-listening.post.ts` | poll cron: loop clients→queries→sources, upsert |
| `workers/social-listening-cron/{src/index.ts,wrangler.toml,package.json}` | companion Worker |
| `test/social/listeningSourcesNormalize.test.ts` | normalizer tests (all 5) |
| `test/social/listeningCollect.test.ts` | orchestrator test (fake sources) |

---

## Task 1: Source interface + pure orchestrator

**Files:** create `server/utils/socialListening/sources/types.ts`, `server/utils/socialListening/collect.ts`; test `test/social/listeningCollect.test.ts`.

- [ ] **Step 1: Types**

```ts
// server/utils/socialListening/sources/types.ts
import type { RawMention } from '~~/server/utils/socialListening/types'

/** Env bag passed to adapters (subset of process.env, injected for testability). */
export type SourceEnv = Record<string, string | undefined>

export interface SourceSearchInput {
  terms: string[]                 // include terms (OR)
  limit: number                   // max hits to request
  fetchImpl: typeof fetch         // injected fetch
  env: SourceEnv
}

export interface ListeningSource {
  key: 'reddit' | 'news' | 'youtube' | 'bluesky' | 'mastodon'
  isEnabled(env: SourceEnv): boolean
  search(input: SourceSearchInput): Promise<RawMention[]>
}
```

- [ ] **Step 2: Failing test `test/social/listeningCollect.test.ts`**

```ts
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
    const news = fakeSource('news', false, [mk('n1', 'acme news')])   // disabled → skipped
    const yt = fakeSource('youtube', true, [mk('y1', 'acme video')])  // enabled but not in query.sources → skipped
    const out = await collectForQuery(query, [reddit, news, yt], {}, fetch)
    expect(out.map(m => m.externalId)).toEqual(['r1'])  // r2 dropped by exclude 'stock'; news/yt skipped
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
```

- [ ] **Step 3: Run → FAIL.** `pnpm exec vitest run test/social/listeningCollect.test.ts`

- [ ] **Step 4: Implement `server/utils/socialListening/collect.ts`**

```ts
// server/utils/socialListening/collect.ts
// Pure orchestrator: run one listening query against the enabled+selected sources, apply the
// query's include/exclude matching, and return deduped RawMentions. Deps injected (fetch, env,
// the source list) so it's fully unit-testable. One source throwing must not sink the batch.
import { matchesQuery } from '~~/app/utils/socialListeningMatch'
import type { ListeningSource, SourceEnv } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

export interface QueryLike {
  include_terms: string[]
  exclude_terms: string[]
  sources: string[]
}

const PER_SOURCE_LIMIT = 25

export async function collectForQuery(
  query: QueryLike, sources: ListeningSource[], env: SourceEnv, fetchImpl: typeof fetch,
): Promise<RawMention[]> {
  const selected = new Set(query.sources ?? [])
  const active = sources.filter(s => selected.has(s.key) && s.isEnabled(env))
  const out: RawMention[] = []
  const seen = new Set<string>()
  for (const src of active) {
    let hits: RawMention[] = []
    try {
      hits = await src.search({ terms: query.include_terms, limit: PER_SOURCE_LIMIT, fetchImpl, env })
    } catch (err) {
      console.error('listening.source.error', { source: src.key, error: String(err) })
      continue
    }
    for (const h of hits) {
      const text = `${h.title ?? ''} ${h.content ?? ''}`
      if (!matchesQuery(text, query.include_terms, query.exclude_terms)) continue
      const dedupeKey = `${h.source}:${h.externalId}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      out.push(h)
    }
  }
  return out
}
```

- [ ] **Step 5: Run → PASS (3 tests).**

- [ ] **Step 6: Commit**

```bash
git add server/utils/socialListening/sources/types.ts server/utils/socialListening/collect.ts test/social/listeningCollect.test.ts
git commit -m "feat(listening): source interface + pure collectForQuery orchestrator"
```

---

## Task 2: News/RSS adapter

**Files:** create `server/utils/socialListening/sources/news.ts`; test `test/social/listeningSourcesNormalize.test.ts` (shared normalizer test file — start it here, extend in later tasks).

> News/RSS is the most stable + verifiable source (plain RSS XML, no key). It is **enabled by default** (no key needed) but the cron only runs it for queries that selected `news`. SSRF-guard every feed URL with `safePublicUrl`.

- [ ] **Step 1: Failing test (create `test/social/listeningSourcesNormalize.test.ts`)**

```ts
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
    expect(out[1].externalId).toBe('https://news.example/b')  // falls back to link when no guid
  })
  it('returns [] for non-XML / empty input', () => {
    expect(normalizeRssItems('', 'f')).toEqual([])
    expect(normalizeRssItems('not xml', 'f')).toEqual([])
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `server/utils/socialListening/sources/news.ts`**

```ts
// server/utils/socialListening/sources/news.ts
// News/RSS listening source. No API key — searches Google News RSS for the query terms and parses
// the returned feed. Pure normalizer (normalizeRssItems) + thin fetch. SSRF-guarded feed URLs.
import { safePublicUrl } from '~~/app/utils/safe-url'
import type { ListeningSource, SourceSearchInput } from '~~/server/utils/socialListening/sources/types'
import type { RawMention } from '~~/server/utils/socialListening/types'

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  if (!m) return null
  return m[1].replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, '$1')
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
  isEnabled: () => true,                       // no key required
  async search({ terms, fetchImpl }: SourceSearchInput): Promise<RawMention[]> {
    const q = encodeURIComponent(terms.join(' OR '))
    const feedUrl = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
    if (!safePublicUrl(feedUrl)) return []      // SSRF guard (defensive; host is constant here)
    const resp = await fetchImpl(feedUrl, { headers: { 'user-agent': 'XeroFlowListening/1.0' } })
    if (!resp.ok) return []
    return normalizeRssItems(await resp.text(), feedUrl)
  },
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialListening/sources/news.ts test/social/listeningSourcesNormalize.test.ts
git commit -m "feat(listening): News/RSS source adapter"
```

---

## Task 3: Reddit adapter

**Files:** create `server/utils/socialListening/sources/reddit.ts`; extend `test/social/listeningSourcesNormalize.test.ts`.

> Gated on `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`. ⚠️ Verify the OAuth token + `/search` response shape live before trusting prod.

- [ ] **Step 1: Add failing test (append to the normalize test file)**

```ts
import { normalizeRedditListing } from '~~/server/utils/socialListening/sources/reddit'

describe('normalizeRedditListing', () => {
  const listing = { data: { children: [
    { data: { id: 't3_1', permalink: '/r/x/comments/1', title: 'ACME rocks', selftext: 'love it',
              author: 'jane', created_utc: 1780000000, subreddit: 'gadgets' } },
    { data: { id: 't3_2', permalink: '/r/x/comments/2', title: 'meh', selftext: '', author: 'bob', created_utc: 1780000100 } },
  ] } }
  it('maps reddit children to RawMentions with absolute urls + ISO dates', () => {
    const out = normalizeRedditListing(listing)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ source: 'reddit', externalId: 't3_1', author: 'jane', title: 'ACME rocks', content: 'love it' })
    expect(out[0].url).toBe('https://www.reddit.com/r/x/comments/1')
    expect(out[0].publishedAt).toContain('20')  // ISO from created_utc
  })
  it('returns [] for malformed payloads', () => {
    expect(normalizeRedditListing(null)).toEqual([])
    expect(normalizeRedditListing({})).toEqual([])
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `server/utils/socialListening/sources/reddit.ts`**

```ts
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
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(listening): Reddit source adapter`.

---

## Task 4: YouTube adapter

**Files:** create `server/utils/socialListening/sources/youtube.ts`; extend the normalize test.

> Gated on `YOUTUBE_API_KEY`. ⚠️ Verify `search.list` response shape live.

- [ ] **Step 1: Add failing test**

```ts
import { normalizeYoutubeSearch } from '~~/server/utils/socialListening/sources/youtube'

describe('normalizeYoutubeSearch', () => {
  const payload = { items: [
    { id: { videoId: 'v1' }, snippet: { title: 'ACME review', description: 'great', channelTitle: 'Tech', publishedAt: '2026-06-01T00:00:00Z' } },
    { id: { channelId: 'c1' }, snippet: { title: 'channel' } },  // not a video → skipped
  ] }
  it('maps video search items to RawMentions and skips non-videos', () => {
    const out = normalizeYoutubeSearch(payload)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ source: 'youtube', externalId: 'v1', title: 'ACME review', content: 'great', author: 'Tech' })
    expect(out[0].url).toBe('https://www.youtube.com/watch?v=v1')
    expect(out[0].publishedAt).toBe('2026-06-01T00:00:00Z')
  })
  it('returns [] for malformed payloads', () => { expect(normalizeYoutubeSearch(null)).toEqual([]) })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(listening): YouTube source adapter`.

---

## Task 5: Bluesky adapter

**Files:** create `server/utils/socialListening/sources/bluesky.ts`; extend the normalize test.

> Gated on `SOCIAL_LISTENING_BLUESKY_ENABLED === 'true'` (public search, no key, but opt-in). ⚠️ Verify `app.bsky.feed.searchPosts` shape live.

- [ ] **Step 1: Add failing test**

```ts
import { normalizeBlueskyPosts } from '~~/server/utils/socialListening/sources/bluesky'

describe('normalizeBlueskyPosts', () => {
  const payload = { posts: [
    { uri: 'at://did:plc:abc/app.bsky.feed.post/1', author: { handle: 'jane.bsky.social' },
      record: { text: 'love acme', createdAt: '2026-06-01T00:00:00Z', langs: ['en'] } },
  ] }
  it('maps bluesky posts to RawMentions with an https permalink', () => {
    const out = normalizeBlueskyPosts(payload)
    expect(out[0]).toMatchObject({ source: 'bluesky', externalId: 'at://did:plc:abc/app.bsky.feed.post/1', author: 'jane.bsky.social', content: 'love acme', lang: 'en' })
    expect(out[0].url).toBe('https://bsky.app/profile/jane.bsky.social/post/1')
    expect(out[0].publishedAt).toBe('2026-06-01T00:00:00Z')
  })
  it('returns [] for malformed payloads', () => { expect(normalizeBlueskyPosts({})).toEqual([]) })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(listening): Bluesky source adapter`.

---

## Task 6: Mastodon adapter

**Files:** create `server/utils/socialListening/sources/mastodon.ts`; extend the normalize test.

> Gated on `SOCIAL_LISTENING_MASTODON_INSTANCES` (comma-separated instance base URLs). Searches each configured instance's public `/api/v2/search`. ⚠️ Verify the v2 search shape live; SSRF-guard each instance URL.

- [ ] **Step 1: Add failing test**

```ts
import { normalizeMastodonResults } from '~~/server/utils/socialListening/sources/mastodon'

describe('normalizeMastodonResults', () => {
  const payload = { statuses: [
    { id: '111', url: 'https://mas.to/@jane/111', account: { acct: 'jane@mas.to' },
      content: '<p>love acme</p>', created_at: '2026-06-01T00:00:00Z', language: 'en' },
  ] }
  it('maps statuses to RawMentions, stripping HTML from content', () => {
    const out = normalizeMastodonResults(payload, 'https://mas.to')
    expect(out[0]).toMatchObject({ source: 'mastodon', externalId: 'https://mas.to/@jane/111', author: 'jane@mas.to', content: 'love acme', lang: 'en' })
    expect(out[0].url).toBe('https://mas.to/@jane/111')
  })
  it('returns [] for malformed payloads', () => { expect(normalizeMastodonResults(null, 'x')).toEqual([]) })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(listening): Mastodon source adapter`.

---

## Task 7: Registry + poll cron endpoint

**Files:** create `server/utils/socialListening/sources/registry.ts`, `server/api/cron/sync-social-listening.post.ts`.

- [ ] **Step 1: Registry**

```ts
// server/utils/socialListening/sources/registry.ts
import type { ListeningSource } from '~~/server/utils/socialListening/sources/types'
import { newsSource } from '~~/server/utils/socialListening/sources/news'
import { redditSource } from '~~/server/utils/socialListening/sources/reddit'
import { youtubeSource } from '~~/server/utils/socialListening/sources/youtube'
import { blueskySource } from '~~/server/utils/socialListening/sources/bluesky'
import { mastodonSource } from '~~/server/utils/socialListening/sources/mastodon'

export const LISTENING_SOURCES: ListeningSource[] = [
  newsSource, redditSource, youtubeSource, blueskySource, mastodonSource,
]
```

- [ ] **Step 2: Cron endpoint (mirror `sync-social-metrics.post.ts` — secret + tenant loop)**

```ts
// server/api/cron/sync-social-listening.post.ts
// Slice 4b poll collector. Invoked by the social-listening-cron companion Worker (Pages has no
// scheduled()). For each enabled listening query, runs the selected+enabled external sources,
// matches include/exclude terms, and upserts mentions (4a upsertMentions). External mentions land
// un-enriched (enriched_at NULL) for the 4c Groq pass. Sources are gated per key/flag — with no
// keys set this is a no-op. No send, no gate flag of its own (collection is read-only inbound).
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { collectForQuery } from '~~/server/utils/socialListening/collect'
import { upsertMentions } from '~~/server/utils/socialListening/store'
import { LISTENING_SOURCES } from '~~/server/utils/socialListening/sources/registry'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const env = process.env as Record<string, string | undefined>

  const queries = await queryRows<any>(
    `SELECT id, client_id, include_terms, exclude_terms, sources FROM social_listening_queries WHERE enabled = TRUE`,
  )
  let queriesRun = 0
  let mentionsUpserted = 0
  for (const q of queries) {
    if (!Array.isArray(q.sources) || q.sources.length === 0) continue
    const hits = await collectForQuery(q, LISTENING_SOURCES, env, fetch)
    if (hits.length) mentionsUpserted += await upsertMentions({ queryRows, queryOne, execute }, q.client_id, q.id, hits)
    queriesRun++
  }
  return { ok: true, queriesRun, mentionsUpserted }
})
```

- [ ] **Step 3: Typecheck gate** (`NODE_OPTIONS=... nuxt typecheck`; zero refs to new files).

- [ ] **Step 4: Commit**

```bash
git add server/utils/socialListening/sources/registry.ts server/api/cron/sync-social-listening.post.ts
git commit -m "feat(listening): source registry + sync-social-listening poll cron"
```

---

## Task 8: Companion Worker

**Files:** create `workers/social-listening-cron/{src/index.ts,wrangler.toml,package.json}` (copy `workers/social-report-cron/` and adapt).

- [ ] **Step 1: `workers/social-listening-cron/src/index.ts`**

```ts
// workers/social-listening-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's listening collector (Slice 4b). Pages has no
// scheduled() handler, so this companion Worker POSTs /api/cron/sync-social-listening. The endpoint
// is a no-op until at least one external source's key/flag is set (per-source gated).
interface Env { APP_BASE_URL: string; CRON_SECRET: string }

export default {
  async scheduled(_c: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_BASE_URL}/api/cron/sync-social-listening`
    const resp = await fetch(url, { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET } })
    console.log('social-listening-cron.run', { status: resp.status, body: (await resp.text()).slice(0, 200) })
  },
}
```

- [ ] **Step 2: `workers/social-listening-cron/wrangler.toml`**

```toml
name = "social-listening-cron"
main = "src/index.ts"
compatibility_date = "2025-12-01"

# Poll external listening sources a few times a day. The endpoint is idempotent (upsert by
# source+external_id), so overlapping ticks are harmless.
[triggers]
crons = [
  "40 */6 * * *"   # every 6 hours at :40
]

[vars]
APP_BASE_URL = "https://agency-dashboard-6cm.pages.dev"

# CRON_SECRET is a secret (not a var) — must match the Pages project's CRON_SECRET.
#   wrangler secret put CRON_SECRET
# Deploy from an isolated copy OUTSIDE the repo tree (root .wrangler/deploy/config.json redirect
# breaks sub-worker `wrangler deploy`).
```

- [ ] **Step 3: `workers/social-listening-cron/package.json`** (copy from `workers/social-report-cron/package.json`, change `name` to `social-listening-cron`).

- [ ] **Step 4: Full test run + typecheck**

Run: `pnpm exec vitest run test/social/ && echo OK`
Expected: all social tests pass (4a's 248 + 4b's normalizer/collect tests).
Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -E 'socialListening|sync-social-listening' || echo "ZERO refs to new files"`

- [ ] **Step 5: Commit**

```bash
git add workers/social-listening-cron/
git commit -m "feat(listening): social-listening-cron companion Worker"
```

---

## Operator activation (post-merge, all gated)

- Reddit: set `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` (free Reddit app).
- YouTube: set `YOUTUBE_API_KEY`.
- Bluesky: set `SOCIAL_LISTENING_BLUESKY_ENABLED=true`.
- Mastodon: set `SOCIAL_LISTENING_MASTODON_INSTANCES=https://mastodon.social,https://...`.
- News/RSS: works with no key.
- Deploy `social-listening-cron` (from an isolated copy outside the repo tree) + `CRON_SECRET`.
- ⚠️ **Verify each external API's live request/response shape** before trusting prod data (normalizers are tolerant; fetch shapes are best-effort). Nothing collects until a key/flag is set.

---

## Self-review notes

- **Spec coverage (§4 + §8 of the design):** all five adapters (Tasks 2–6), pluggable interface + registry (Tasks 1, 7), poll cron + companion worker (Tasks 7, 8), per-source gating (each adapter's `isEnabled`), SSRF guard on News + Mastodon. ✅ Enrichment/alerting/portal remain 4c/4d.
- **Type consistency:** all adapters implement `ListeningSource` from Task 1; all normalizers return `RawMention` (4a type); `collectForQuery` consumes `ListeningSource[]` + `QueryLike`; the cron passes DB query rows (snake_case `include_terms`/`exclude_terms`/`sources`) which match `QueryLike`. `upsertMentions` signature matches 4a.
- **Placeholder scan:** none — every adapter has complete fetch + normalizer code. The regex-based RSS/HTML parsing is intentional (no XML dep in the Nitro bundle) and tested.
- **Caveat honored:** external fetch shapes flagged inline as verify-live; all sources gated so dormant-safe.
```

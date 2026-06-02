# Social Listening — Slice 4e: source expansion (design note)

**Date:** 2026-06-02
**Status:** Design approved-in-principle; implement after Slice 4 (4a–4d, merged #91/#94/#97/#99) is settled.
**Builds on:** the Slice 4b pluggable adapter layer — `server/utils/socialListening/sources/` (`types.ts`, `reddit.ts`, `news.ts`, `youtube.ts`, `bluesky.ts`, `mastodon.ts`, `registry.ts`) + `collect.ts` orchestrator.

---

## 1. Why

Slice 4 ships five off-property sources (reddit, news/RSS, youtube, bluesky, mastodon) + owned signals. They're all **conversation** sources. This note adds (a) more free conversation sources, and (b) a genuinely new axis — **reviews/reputation** — plus the data-model nudges they need. Scope philosophy is unchanged: **free / no recurring vendor bill**; paid firehoses (X, Brandwatch, …) remain an explicit non-goal, parked as a future "Pro Listening" flag.

## 2. The adapter contract (unchanged)

Each new source is the same shape as the existing five:

```ts
// server/utils/socialListening/sources/types.ts
interface ListeningSource {
  key: ExternalSource                              // add to the union
  isEnabled(env: SourceEnv): boolean               // per-source key/flag gate
  search(input: SourceSearchInput): Promise<RawMention[]>   // { terms, limit, fetchImpl, env }
}
```

Pure `normalizeX(payload): RawMention[]` + thin injected-fetch `search()`; register in `LISTENING_SOURCES`; TDD with a fixture (no live network in tests). One adapter file + one test, ~the cost of any of the existing five.

**Two source archetypes** (this is the only real design fork):

- **Term-search** (reddit-like): runs `query.include_terms`, returns hits. No data-model change. → HN, Lemmy, GitHub, Stack Exchange, ListenNotes, Tumblr.
- **Configured-target**: doesn't take free-text terms — needs an operator-supplied target per query (a feed URL, a business id, a place id). → feeds (Google Alerts / App Store / blogs), Yelp, Google reviews. These need a small data-model add (§4).

## 3. Sources, by phase

### 4e-1 — free, no-key, term-search (drop-in; ship first)

| key | endpoint | gate | RawMention mapping |
|---|---|---|---|
| **`hackernews`** | `https://hn.algolia.com/api/v1/search?query=<terms>&tags=(story,comment)` (or `/search_by_date` for recency) | none (default-on, like `news`) | `externalId=hn:${objectID}`, `url=https://news.ycombinator.com/item?id=${objectID}`, `title=title??story_title`, `content=comment_text??story_text`, `author=author`, `publishedAt=created_at`, `raw={points,num_comments,_tags}` |
| **`lemmy`** | per-instance `/api/v3/search?q=<terms>&type_=All&sort=New` (operator instance list, like mastodon) | `SOCIAL_LISTENING_LEMMY_INSTANCES` | `externalId=lemmy:${post.id}`, `url=post.ap_id`, `title=post.name`, `content=post.body`, `author=creator.name`, `publishedAt=post.published` |

HN is the single highest-ROI add (free, no auth, big for B2B/SaaS/tech clients). Lemmy reuses the mastodon multi-instance + SSRF pattern almost verbatim.

### 4e-2 — `feeds` adapter (RSS **and** Atom; configured-target)

One generic adapter that fetches **operator-supplied feed URLs per query** and parses them — covers **Google Alerts**, **App Store reviews**, and arbitrary blog/podcast feeds in one stroke.

- Extends `news.ts`'s `normalizeRssItems` to also handle **Atom** `<entry>` (App Store + many blogs are Atom, not RSS `<item>`).
- SSRF-guard every URL (reuse `app/utils/safe-url` / the mastodon `isSafeInstanceUrl` blocklist).
- **Google Alerts:** operator creates a per-brand Alert → pastes its RSS feed URL. Leans on Google's crawl of the *whole web* — cheapest broad coverage available.
- **App Store reviews:** `https://itunes.apple.com/<cc>/rss/customerreviews/id=<appId>/sortBy=mostRecent/xml` (Atom). Map `im:rating` → sentiment directly (§5).
- Gate: none (URLs are the config). Per-query `feed_urls TEXT[]` (§4).

### 4e-3 — reviews / per-business (configured-target; highest new value for local + e-comm)

Distinct from chatter — these monitor a **specific business**, not free-text terms.

| key | endpoint | gate | notes |
|---|---|---|---|
| **`yelp`** | `GET /v3/businesses/{id}/reviews` (resolve id via `/v3/businesses/search`) | `YELP_API_KEY` (Bearer) | returns 3 excerpt reviews/business; `rating` field → sentiment |
| **`google_reviews`** | Places **Details** (`fields=reviews`) for a `place_id` | `GOOGLE_PLACES_API_KEY` (you already hold a Google key) | up to 5 reviews/place; `rating` → sentiment |

Needs a per-client **monitored-business** identifier on the query/config (§4) — `place_id` / Yelp business id, not terms.

### 4e-4 — niche keyed term-search (add on demand, per client vertical)

`github` (issues/discussions, dev-tool brands, `GITHUB_TOKEN`), `stackexchange` (`/2.3/search/advanced`, key optional), `listennotes` (podcast episodes, free tier key — unique modality), `tumblr` (blog search, OAuth key — beauty/fashion/fandom). All term-search, drop-in.

## 4. Data-model touches (additive migration)

- `social_listening_queries.feed_urls TEXT[]` — for the `feeds` adapter (4e-2).
- `social_listening_queries.monitored_targets JSONB` — `[{source:'yelp'|'google_reviews', id:'…'}]` for reviews (4e-3). Keep it a flat list on the query; no new typed entities (consistent with the slice's YAGNI stance).
- New `source` enum values: `hackernews|lemmy|feeds|appstore|yelp|google_reviews|github|stackexchange|listennotes|tumblr`. `social_listening_mentions.source` is already free `TEXT` — no constraint change, just docs.

## 5. Review sentiment shortcut

Reviews arrive **pre-scored** (star rating). Map `rating` → `sentiment` (`>=4`→positive, `==3`→neutral, `<=2`→negative) and **stamp `enriched_at = NOW()`** on insert — same trick the owned-signal projection uses — so the 4c Groq pass skips them (saves tokens; the human star rating is more reliable than LLM sentiment anyway). `sentiment_score = rating/5`.

## 6. Testing

Per source: a pure-`normalize` unit test against a trimmed fixture of the real payload (the discipline that's kept every slice at 0 new type errors). `isEnabled` gate test. No live network. The `feeds` Atom-vs-RSS parser gets both a `<item>` and an `<entry>` fixture.

## 7. Non-goals (unchanged + explicit)

- **X / Twitter** — paid-only; the biggest real gap. Park as a future **Pro Listening** per-client flag, not in 4e.
- **Instagram / Facebook / Threads / LinkedIn / TikTok** — no public *keyword* search; only @-mentions of connected accounts, already covered by the Slice 2 inbox. TikTok's Research API is gated to approved academics.
- **Managed vendors** (Brandwatch / Talkwalker / Brand24) — recurring bill; enterprise-tier only.

## 8. Recommended sequence

1. **4e-1** — Hacker News + Lemmy (free, no data-model change, immediate value). *Ship this first.*
2. **4e-2** — `feeds` (Atom support + `feed_urls`) → unlocks Google Alerts (broad web) + App Store reviews cheaply.
3. **4e-3** — Yelp + Google reviews (the new reputation axis; needs `monitored_targets`).
4. **4e-4** — niche keyed sources, added per client vertical on demand.

Each phase is its own PR off latest `origin/main`, gated/dormant until an operator sets the key/flag (same posture as 4b). Marketing-page sync (`/features/*`) when the reputation axis (4e-3) lands, since "review monitoring" is a sellable capability.

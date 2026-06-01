# Social Suite — Slice 4: Social Listening (design)

**Date:** 2026-06-02
**Status:** Design approved; implementation pending (writing-plans next).
**Series:** Slice 1 Publishing (LIVE) → Slice 2 Inbox (built, dormant) → Slice 3 Reporting (complete) → **Slice 4 Listening**.
**Port source (read-only ref):** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` — note its `social-listening-signals.ts` aggregates *owned* signals only (not web crawling); its competitor-monitoring is automotive-marketplace-specific and **not reusable here**.

---

## 1. Purpose & scope

A per-client **brand-listening** layer that unifies two streams into one searchable, sentiment-scored, topic-tagged feed with trends and alerts:

- **Owned signals** — FB/IG comments, DMs, @-mentions, and reviews already captured by Slice 2, plus post engagement from Slice 3. Zero new external cost; already in our DB.
- **Off-property mentions** — pulled by pluggable source adapters searching a client's listening-query terms across genuinely-free sources.

**Scope decision (operator-confirmed):** *Hybrid — owned + free sources.* Explicitly **NOT** a paid firehose (X/Twitter paid API, Brandwatch/Talkwalker/Mention). The original 4-slice plan deferred listening as "highest external-data cost, most commoditized"; this design delivers real off-property reach at modest/zero cost without a recurring vendor bill. True paid listening remains a possible future phase, out of scope here.

**Why these sources:** X/Twitter is paid-only; Meta/IG expose no public keyword search (only @-tags of connected accounts, already handled in Slice 2). The free, stable menu is Reddit, News/RSS, YouTube, Bluesky, Mastodon — all five ship in v1.

---

## 2. Architecture & data flow

```
listening_queries (per client: include/exclude terms, sources, category)
        │
   poll cron  ──fan-out──►  source adapters (reddit / news / youtube / bluesky / mastodon)
   (companion        │           each: search terms → raw hits
    worker)          │
        │            ▼
        │      normalize → matchesQuery(include/exclude) → dedupe by (source, external_id) → upsert mentions
        │            │
        │      owned-signal projection: Slice-2 conversations/reviews → source='owned' mentions
        │            ▼
        │      enrich NEW mentions: Groq batch → sentiment + topics (fail-safe → 'unknown')
        │            ▼
        │      detect: negative-sentiment + volume-spike → notifications.ts (gated)
        ▼
   /agency/social/listening   +   /portal/social-listening (read-only)
```

**Established-pattern conformance:**
- Cloudflare **Pages has no `scheduled()`** → polling runs via a **companion worker** (`social-listening-cron`) hitting an `x-cron-secret` endpoint (same pattern as `social-dispatch-cron`, `social-inbox-cron`, `social-metrics-cron`, `social-report-cron`). **Deploy sub-workers from an isolated copy OUTSIDE the repo tree** (root `.wrangler/deploy/config.json` redirect breaks sub-worker `wrangler deploy`).
- **Pure / injected units** for normalize, `matchesQuery`, owned projection, enrichment parsing, dedupe, and the two detectors → fully unit-testable with fixtures, no live network in tests (same discipline as inbox provider mappers / reporting cores).
- **Auth:** agency endpoints use bare `requireAuth` (agency staff manage ALL clients — established 2a/2b/3b precedent; do NOT add `client_team_assignments` scoping). Portal endpoints scope to session `client.clientId`, never request input (tenant isolation unit-tested, like `socialInbox/portal.ts` / `socialReporting/portal.ts`).
- **Dormant by default:** each source adapter is gated behind its own key/flag; alerting behind its own flag. Nothing polls or sends until an operator provisions it. Manual "run now" is human-initiated and ungated (like the reporting `preview` endpoint).

---

## 3. Data model

One migration (next free number — **verify at execution**, expected ~155; other sessions add migrations concurrently). Additive, `IF NOT EXISTS` guards.

### `social_listening_queries`
| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID FK → agency_clients | ON DELETE CASCADE |
| `name` | TEXT | display name |
| `include_terms` | TEXT[] | match if any present |
| `exclude_terms` | TEXT[] | drop if any present (noise control) |
| `sources` | TEXT[] | which adapters to run (subset of reddit/news/youtube/bluesky/mastodon) |
| `category` | TEXT | brand \| competitor \| product \| campaign (enables share-of-voice / benchmarking) |
| `enabled` | BOOL | default true |
| `created_by` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### `social_listening_mentions`
| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID FK | |
| `query_id` | UUID FK → social_listening_queries | nullable for owned-only |
| `source` | TEXT | reddit \| news \| youtube \| bluesky \| mastodon \| owned |
| `external_id` | TEXT | source's native id |
| `url` | TEXT | permalink |
| `author` | TEXT | |
| `title` | TEXT | |
| `content` | TEXT | |
| `lang` | TEXT | |
| `published_at` | TIMESTAMPTZ | |
| `sentiment` | TEXT | positive \| neutral \| negative \| unknown |
| `sentiment_score` | REAL | nullable |
| `topics` | TEXT[] | |
| `enriched_at` | TIMESTAMPTZ | null = needs enrichment |
| `raw` | JSONB | original payload |
| `created_at` | TIMESTAMPTZ | |

- **`UNIQUE(source, external_id)`** → idempotent upserts (same dedupe discipline as the inbox).
- Indexes: `(client_id, published_at DESC)`, `(query_id)`, partial index on `enriched_at IS NULL` for the enrichment queue.

Owned signals are projected into `source='owned'` rows from existing Slice-2 tables — **no duplication of the source of truth**; a thin sync keyed by the conversation/message id, carrying through the inbox's existing sentiment where present.

---

## 4. Source adapters

Pluggable interface so a sixth source is cheap to add:

```ts
interface ListeningSource {
  key: 'reddit' | 'news' | 'youtube' | 'bluesky' | 'mastodon'
  isEnabled(env): boolean                       // gate: required key/flag present?
  search(query, opts): Promise<RawMention[]>    // terms → raw hits (injected fetch)
}
```

Each adapter = **pure normalization + injected fetch** (tested against fixture payloads; no live calls in tests).

| adapter | mechanism | gate |
|---|---|---|
| **reddit** | OAuth app token; `/search` over terms across subreddits + comments | `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` |
| **news** | Google News RSS + arbitrary feeds; HTTP fetch + XML parse; **SSRF-guard feed URLs** (reuse `safe-url`) | no key — enabled by default (cheap/safe) |
| **youtube** | Data API `search.list` + top comment threads | `YOUTUBE_API_KEY` (Google key already in use) |
| **bluesky** | public AT-proto `searchPosts` | simple enable flag |
| **mastodon** | per-instance `/api/v2/search`; operator supplies instance URL(s) | configured instance list |

**Matching/noise control:** pure `matchesQuery(text, include, exclude)` — keep if any include term present and no exclude term present. Only matched hits are persisted + enriched.

**Owned-signal projection:** pure mapper turns `social_conversations`/messages + reviews into `source='owned'` mentions, so on-property + off-property show side by side.

---

## 5. Enrichment

In the cron, after upsert: select rows where `enriched_at IS NULL`, **Groq batch-classify** → `sentiment` + up to ~5 `topics`, stamp `enriched_at`. Reuses the existing Groq integration (same as reporting AI summaries). **Fail-safe:** Groq unavailable or malformed → `sentiment='unknown'`, empty topics, row still persists (mirrors `aiSummary` / `normalizeSentiment`). Only new rows are enriched, so token cost scales with new-mention volume, not total.

---

## 6. Alerting (reuse notifications, gated)

Two **pure detectors** run per poll cycle over the fresh batch:
- **Negative-sentiment** — new `sentiment='negative'` mentions (optional per-query severity threshold).
- **Volume spike** — today's matched volume for a query vs its trailing baseline (e.g. ≥Nσ or ≥X× median).

Detected events raise through the existing **`notifications.ts`** (already handles quiet-hours / digest / fan-out) behind **`SOCIAL_LISTENING_ALERTS_ENABLED`** (default off). No new alert infra. Poll-cadence timing is acceptable since mentions arrive on the cron.

---

## 7. API & UI surface

**Agency endpoints** `server/api/agency/social/listening/**`:
- queries CRUD (`requireAuth`)
- `mentions.get` — filter by query / source / sentiment / date; paginated
- `overview.get` — volume trend, sentiment split, share-of-voice by category (brand vs competitor), top topics, top sources
- `run.post` — manual "run now" for a query (human-initiated, **ungated**, like reporting `preview`)

**Portal mirror** `server/api/client-portal/social/listening/**` — read-only, session-scoped (`requireClientAuth`).

**UI** under the existing social nav:
- `/agency/social/listening` — query manager (reuse the UFormField / USlideover patterns from 3c-2), a mentions stream (source + sentiment badges, permalink out), and a dashboard strip (sentiment-over-time, volume trend, share-of-voice, top topics).
- `/portal/social-listening` — read-only client view.

Marketing-page sync (`/features/*` + MarketingNav) included when the slice lands (also clears the deferred social-arc marketing catch-up for listening).

---

## 8. Testing & phasing

**TDD pure units:** each adapter normalizer, `matchesQuery`, owned-signal projection, the two detectors, enrichment parsing, dedupe. Injected deps for store/cron (no live network in tests) — the discipline that's kept every prior slice at 0 new type errors.

**Phasing (each its own PR, off latest `origin/main` in an isolated worktree):**
- **4a — foundation:** data model + query CRUD + UI shell + owned-signal projection. Fully verifiable in-repo with no external keys.
- **4b — external adapters:** the five source adapters + poll endpoint + `social-listening-cron` companion worker. Gated/dormant.
- **4c — enrichment + analytics:** Groq enrichment pass + the dashboard analytics (sentiment/volume/share-of-voice/topics).
- **4d — alerting + portal:** detectors + `notifications.ts` integration (gated) + portal read surface.

4a is provable end-to-end; 4b–4d ship dormant.

---

## 9. Operator activation (post-merge, gated)

- **Sources:** set `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, `YOUTUBE_API_KEY`, enable Bluesky flag, configure Mastodon instance(s). News/RSS works with no key.
- **Cron:** deploy `social-listening-cron` companion worker + `CRON_SECRET` (matching the Pages project), from an isolated copy outside the repo tree.
- **Alerts:** set `SOCIAL_LISTENING_ALERTS_ENABLED=true` only with sign-off (respects quiet hours / digest).

⚠️ Never enable alerts or trigger fan-out without explicit go-ahead (same posture as `SOCIAL_AUTOMATION_ENABLED` / `SOCIAL_DM_ENABLED` / `SOCIAL_REPORTS_ENABLED`).

---

## 10. Explicit non-goals (YAGNI)

- No paid data providers (X firehose, Brandwatch, etc.).
- No real-time DO push for listening (poll cadence is sufficient; alerting via notifications).
- No typed Brand/Competitor/Product entities — a `category` tag on flat queries covers benchmarking for v1.
- No influencer scoring, no automated response from listening (that's the inbox's job).

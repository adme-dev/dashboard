# Social Listening — Slice 4a (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation of Social Listening — the data model, per-client listening-query CRUD, the owned-signal projection (Slice-2 conversations → listening mentions), the mentions API, and a UI shell — fully verifiable in-repo with **no external API keys**.

**Architecture:** Two new tables (`social_listening_queries`, `social_listening_mentions`). Pure units (`matchesQuery`, sentiment bucketing, owned-signal projection) + an injected-runner store (`socialListening/store.ts`) mirroring `socialReporting/store.ts`. Agency API under `server/api/agency/social/listening/**` (bare `requireAuth` — staff manage all clients). A Nuxt page `/agency/social/listening` with a query manager (USlideover, reusing 3c-2 form patterns) and a mentions stream. External source adapters, enrichment, alerting, and the portal surface are later phases (4b–4d) — out of scope here.

**Tech Stack:** Nuxt 4 / Vue 3 / Nuxt UI v4; Nitro; Neon Postgres via `~~/server/utils/db` (`queryRows`/`queryOne`/`execute`); Vitest (`test/**`, alias `~` & `~~` → repo root).

---

## Conventions (read before starting)

- **Run from an isolated worktree off latest `origin/main`** with its own/symlinked `node_modules`; run `pnpm exec nuxt prepare` once before vitest (fresh worktree needs `.nuxt`).
- **Server imports use `~~/server/utils/...`** (double-tilde). **Frontend code importing `app/utils/*` uses `~~/app/utils/...`** (NOT `~/app/utils/...` — runtime `~` = app dir). Tests import via `~/app/utils/...` or `~~/server/utils/...` (vitest maps both to repo root).
- **DB helpers:** `import { queryRows, queryOne, execute } from '~~/server/utils/db'`. Inside `transaction()` use `client.query()` directly.
- **Migration:** next free number is **155** — re-verify at exec time with `ls server/database/migrations | grep -oE '^[0-9]+' | sort -n | tail -1` (other sessions add migrations concurrently). Run it against the DB: `export DATABASE_URL=$(grep DATABASE_URL /Users/paulgiurin/Documents/Projects/dashboard/.env | cut -d= -f2-); psql "$DATABASE_URL" -f server/database/migrations/155_social_listening.sql`.
- **Typecheck gate:** `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` — bar is **0 errors referencing the new files** (baseline is ~1272 pre-existing). Grep the log for the new paths.
- **Nuxt UI v4:** `USelectMenu` uses `:items` + `value-key="value"`; never `value: ''`. Wrap fields in `UFormField`. No native `confirm()`/`alert()` — use `UModal`/`useToast`.

---

## File structure

| File | Responsibility |
|---|---|
| `server/database/migrations/155_social_listening.sql` | Create the two tables + indexes |
| `app/utils/socialListeningMatch.ts` | Pure: `matchesQuery`, `bucketSentiment` (client+server safe, unit-tested) |
| `server/utils/socialListening/types.ts` | Shared TS types (`MentionSource`, `Sentiment`, `RawMention`, row interfaces) |
| `server/utils/socialListening/ownedProjection.ts` | Pure: `projectConversationToMention` (conversation row → `RawMention`) |
| `server/utils/socialListening/store.ts` | Injected-runner store: query CRUD + `upsertMentions` + `listMentions` + `syncOwnedSignals` |
| `server/api/agency/social/listening/queries/index.get.ts` | List a client's queries |
| `server/api/agency/social/listening/queries/index.post.ts` | Create a query |
| `server/api/agency/social/listening/queries/[id].patch.ts` | Update a query |
| `server/api/agency/social/listening/queries/[id].delete.ts` | Delete a query |
| `server/api/agency/social/listening/mentions.get.ts` | List mentions (filtered, paginated) |
| `server/api/agency/social/listening/sync-owned.post.ts` | Project owned signals → mentions for a client (ungated, human/cron-triggerable) |
| `app/composables/useSocialListening.ts` | Data layer for the page (queries CRUD + mentions load + sync-owned) |
| `app/components/social/ListeningQueryManager.vue` | USlideover: list + create/edit/delete listening queries |
| `app/pages/agency/social/listening/index.vue` | Listening page: client picker, query manager trigger, mentions stream |
| `test/social/listeningMatch.test.ts` | Tests for `matchesQuery` + `bucketSentiment` |
| `test/social/listeningOwnedProjection.test.ts` | Tests for `projectConversationToMention` |
| `test/social/listeningStore.test.ts` | Tests for `upsertMentions`/`syncOwnedSignals` with a fake runner |
| `app/components/AppNavigation.vue` (or the social nav file) | Add a "Listening" nav entry (locate the existing social group) |

---

## Task 1: Migration — listening tables

**Files:**
- Create: `server/database/migrations/155_social_listening.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 155_social_listening.sql — Social Suite Slice 4: brand listening.
-- Additive + idempotent. External source adapters, enrichment, and alerting are later
-- phases (4b–4d) and ship dormant; this migration only adds storage.

CREATE TABLE IF NOT EXISTS social_listening_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  include_terms TEXT[] NOT NULL DEFAULT '{}'::text[],
  exclude_terms TEXT[] NOT NULL DEFAULT '{}'::text[],
  sources TEXT[] NOT NULL DEFAULT '{}'::text[],   -- subset of reddit|news|youtube|bluesky|mastodon
  category TEXT,                                   -- brand|competitor|product|campaign
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listening_queries_client ON social_listening_queries(client_id, enabled);

CREATE TABLE IF NOT EXISTS social_listening_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  query_id UUID REFERENCES social_listening_queries(id) ON DELETE SET NULL,
  source TEXT NOT NULL,                            -- reddit|news|youtube|bluesky|mastodon|owned
  external_id TEXT NOT NULL,
  url TEXT,
  author TEXT,
  title TEXT,
  content TEXT,
  lang TEXT,
  published_at TIMESTAMPTZ,
  sentiment TEXT,                                  -- positive|neutral|negative|unknown
  sentiment_score REAL,
  topics TEXT[] NOT NULL DEFAULT '{}'::text[],
  enriched_at TIMESTAMPTZ,                         -- null = needs enrichment (4c)
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_listening_mentions_client ON social_listening_mentions(client_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_listening_mentions_query ON social_listening_mentions(query_id);
CREATE INDEX IF NOT EXISTS idx_listening_mentions_unenriched ON social_listening_mentions(client_id) WHERE enriched_at IS NULL;
```

- [ ] **Step 2: Run the migration**

Run: `export DATABASE_URL=$(grep DATABASE_URL /Users/paulgiurin/Documents/Projects/dashboard/.env | cut -d= -f2-); psql "$DATABASE_URL" -f server/database/migrations/155_social_listening.sql`
Expected: `CREATE TABLE` / `CREATE INDEX` (or `NOTICE ... already exists, skipping` on re-run).

- [ ] **Step 3: Verify the tables exist**

Run: `psql "$DATABASE_URL" -c "\d social_listening_mentions"`
Expected: column listing incl. the `UNIQUE (source, external_id)` constraint.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/155_social_listening.sql
git commit -m "feat(listening): migration 155 — social_listening tables"
```

---

## Task 2: Pure matching + sentiment bucketing

**Files:**
- Create: `app/utils/socialListeningMatch.ts`
- Test: `test/social/listeningMatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { matchesQuery, bucketSentiment } from '~/app/utils/socialListeningMatch'

describe('matchesQuery', () => {
  it('keeps text containing any include term (case-insensitive)', () => {
    expect(matchesQuery('Love the new ACME widget', ['acme'], [])).toBe(true)
  })
  it('drops text with no include term', () => {
    expect(matchesQuery('unrelated chatter', ['acme'], [])).toBe(false)
  })
  it('drops text containing an exclude term even if an include term matches', () => {
    expect(matchesQuery('ACME stock price jumped', ['acme'], ['stock'])).toBe(false)
  })
  it('empty include terms never match (avoids capturing the whole firehose)', () => {
    expect(matchesQuery('anything', [], [])).toBe(false)
  })
  it('matches whole words and substrings alike, trimming terms', () => {
    expect(matchesQuery('AcmeCorp rocks', ['  acme '], [])).toBe(true)
  })
})

describe('bucketSentiment', () => {
  it('buckets numeric scores with the +/-0.2 thresholds', () => {
    expect(bucketSentiment(0.5)).toBe('positive')
    expect(bucketSentiment(-0.5)).toBe('negative')
    expect(bucketSentiment(0)).toBe('neutral')
  })
  it('returns unknown for null/NaN', () => {
    expect(bucketSentiment(null)).toBe('unknown')
    expect(bucketSentiment(Number.NaN)).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/social/listeningMatch.test.ts`
Expected: FAIL — cannot find module `socialListeningMatch`.

- [ ] **Step 3: Write the implementation**

```ts
// app/utils/socialListeningMatch.ts
// Pure helpers for Social Listening (client + server safe). No I/O.

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'unknown'

/** Keep text iff it contains at least one include term and no exclude term (case-insensitive). */
export function matchesQuery(text: string, include: string[], exclude: string[]): boolean {
  const hay = (text || '').toLowerCase()
  const inc = include.map(t => t.trim().toLowerCase()).filter(Boolean)
  if (inc.length === 0) return false
  if (!inc.some(t => hay.includes(t))) return false
  const exc = exclude.map(t => t.trim().toLowerCase()).filter(Boolean)
  return !exc.some(t => hay.includes(t))
}

/** Bucket a numeric sentiment score (e.g. inbox `sentiment NUMERIC`) into a label. */
export function bucketSentiment(value: number | null | undefined): Sentiment {
  if (value == null || Number.isNaN(value)) return 'unknown'
  if (value > 0.2) return 'positive'
  if (value < -0.2) return 'negative'
  return 'neutral'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/social/listeningMatch.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add app/utils/socialListeningMatch.ts test/social/listeningMatch.test.ts
git commit -m "feat(listening): pure matchesQuery + bucketSentiment"
```

---

## Task 3: Shared types + owned-signal projection

**Files:**
- Create: `server/utils/socialListening/types.ts`
- Create: `server/utils/socialListening/ownedProjection.ts`
- Test: `test/social/listeningOwnedProjection.test.ts`

- [ ] **Step 1: Write the types**

```ts
// server/utils/socialListening/types.ts
import type { Sentiment } from '~~/app/utils/socialListeningMatch'

export type MentionSource = 'reddit' | 'news' | 'youtube' | 'bluesky' | 'mastodon' | 'owned'

/** A normalized hit, pre-persist. Adapters (4b) and the owned projection both emit this. */
export interface RawMention {
  source: MentionSource
  externalId: string
  url: string | null
  author: string | null
  title: string | null
  content: string | null
  lang: string | null
  publishedAt: string | null          // ISO
  sentiment?: Sentiment               // set for owned (known); left undefined for external (4c enriches)
  sentimentScore?: number | null
  raw: Record<string, unknown>
}

/** Row shape of social_conversations (subset used by the owned projection). */
export interface ConversationRow {
  id: string
  platform: string
  channel_type: string
  permalink: string | null
  participant_name: string | null
  last_message_preview: string | null
  sentiment: number | null
  last_message_at: string | null
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { projectConversationToMention } from '~~/server/utils/socialListening/ownedProjection'
import type { ConversationRow } from '~~/server/utils/socialListening/types'

const conv = (o: Partial<ConversationRow>): ConversationRow => ({
  id: 'c1', platform: 'facebook', channel_type: 'mention', permalink: 'https://fb/x',
  participant_name: 'Jane', last_message_preview: 'love it', sentiment: 0.6, last_message_at: '2026-06-01T00:00:00Z', ...o,
})

describe('projectConversationToMention', () => {
  it('maps a conversation to an owned RawMention with bucketed sentiment', () => {
    const m = projectConversationToMention(conv({}))
    expect(m.source).toBe('owned')
    expect(m.externalId).toBe('owned:c1')
    expect(m.url).toBe('https://fb/x')
    expect(m.author).toBe('Jane')
    expect(m.content).toBe('love it')
    expect(m.publishedAt).toBe('2026-06-01T00:00:00Z')
    expect(m.sentiment).toBe('positive')
    expect(m.raw.platform).toBe('facebook')
    expect(m.raw.channel_type).toBe('mention')
  })
  it('buckets a negative numeric sentiment and unknown when null', () => {
    expect(projectConversationToMention(conv({ sentiment: -0.5 })).sentiment).toBe('negative')
    expect(projectConversationToMention(conv({ sentiment: null })).sentiment).toBe('unknown')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run test/social/listeningOwnedProjection.test.ts`
Expected: FAIL — cannot find module `ownedProjection`.

- [ ] **Step 4: Write the implementation**

```ts
// server/utils/socialListening/ownedProjection.ts
// Pure: project an inbox conversation (Slice 2) into an owned listening mention.
import { bucketSentiment } from '~~/app/utils/socialListeningMatch'
import type { ConversationRow, RawMention } from '~~/server/utils/socialListening/types'

export function projectConversationToMention(c: ConversationRow): RawMention {
  return {
    source: 'owned',
    externalId: `owned:${c.id}`,
    url: c.permalink,
    author: c.participant_name,
    title: null,
    content: c.last_message_preview,
    lang: null,
    publishedAt: c.last_message_at,
    sentiment: bucketSentiment(c.sentiment),
    sentimentScore: c.sentiment,
    raw: { platform: c.platform, channel_type: c.channel_type, conversation_id: c.id },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/social/listeningOwnedProjection.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/utils/socialListening/types.ts server/utils/socialListening/ownedProjection.ts test/social/listeningOwnedProjection.test.ts
git commit -m "feat(listening): types + owned-signal projection"
```

---

## Task 4: Store (injected runner) — upsert + sync-owned

**Files:**
- Create: `server/utils/socialListening/store.ts`
- Test: `test/social/listeningStore.test.ts`

- [ ] **Step 1: Write the failing test (fake runner)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { upsertMentions, syncOwnedSignals, type ListeningDbRunner } from '~~/server/utils/socialListening/store'
import type { RawMention } from '~~/server/utils/socialListening/types'

function fakeRunner(rows: any[] = []): ListeningDbRunner & { calls: any[] } {
  const calls: any[] = []
  return {
    calls,
    queryRows: vi.fn(async (sql: string, params?: any[]) => { calls.push({ sql, params }); return rows }),
    queryOne: vi.fn(async () => null),
    execute: vi.fn(async (sql: string, params?: any[]) => { calls.push({ sql, params }); return 1 }),
  }
}

const raw = (o: Partial<RawMention> = {}): RawMention => ({
  source: 'owned', externalId: 'owned:c1', url: null, author: null, title: null,
  content: 'x', lang: null, publishedAt: '2026-06-01T00:00:00Z', sentiment: 'positive', raw: {}, ...o,
})

describe('upsertMentions', () => {
  it('returns 0 and runs no SQL for an empty batch', async () => {
    const db = fakeRunner()
    expect(await upsertMentions(db, 'client1', 'q1', [])).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('upserts each mention and sets enriched_at only when sentiment is provided', async () => {
    const db = fakeRunner()
    const n = await upsertMentions(db, 'client1', 'q1', [raw({ sentiment: 'positive' }), raw({ externalId: 'reddit:1', source: 'reddit', sentiment: undefined })])
    expect(n).toBe(2)
    const owned = db.calls.find(c => c.params?.includes('owned:c1'))
    const reddit = db.calls.find(c => c.params?.includes('reddit:1'))
    expect(owned.sql).toContain('ON CONFLICT (source, external_id)')
    expect(owned.sql).toContain('enriched_at')          // owned: enriched stamped
    expect(reddit.sql).not.toContain('NOW() AS enriched') // external: left null for 4c
  })
})

describe('syncOwnedSignals', () => {
  it('reads conversations for the client and upserts projected mentions', async () => {
    const db = fakeRunner([
      { id: 'c1', platform: 'facebook', channel_type: 'mention', permalink: null, participant_name: 'A', last_message_preview: 'hi', sentiment: 0.5, last_message_at: '2026-06-01T00:00:00Z' },
    ])
    const n = await syncOwnedSignals(db, 'client1')
    expect(n).toBe(1)
    const select = db.calls.find(c => /FROM social_conversations/.test(c.sql))
    expect(select.params).toEqual(['client1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/social/listeningStore.test.ts`
Expected: FAIL — cannot find module `store`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/socialListening/store.ts
// Injected-runner data layer for Social Listening. Mirrors socialReporting/store.ts:
// all SQL lives here, deps injected so the upsert/sync logic is unit-testable with a fake runner.
import { projectConversationToMention } from '~~/server/utils/socialListening/ownedProjection'
import type { ConversationRow, RawMention } from '~~/server/utils/socialListening/types'

export interface ListeningDbRunner {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>
  execute: (sql: string, params?: any[]) => Promise<number>
}

/** Idempotent upsert of a batch of mentions. enriched_at is stamped only when sentiment is known
 *  (owned signals); external mentions leave it null so the 4c enrichment pass picks them up. */
export async function upsertMentions(
  db: ListeningDbRunner, clientId: string, queryId: string | null, mentions: RawMention[],
): Promise<number> {
  let n = 0
  for (const m of mentions) {
    const enrichedFrag = m.sentiment !== undefined ? 'NOW()' : 'NULL'
    await db.execute(
      `INSERT INTO social_listening_mentions
         (client_id, query_id, source, external_id, url, author, title, content, lang, published_at,
          sentiment, sentiment_score, enriched_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,${enrichedFrag},$13::jsonb)
       ON CONFLICT (source, external_id) DO UPDATE SET
         url = EXCLUDED.url, author = EXCLUDED.author, title = EXCLUDED.title,
         content = EXCLUDED.content, published_at = EXCLUDED.published_at, raw = EXCLUDED.raw`,
      [clientId, queryId, m.source, m.externalId, m.url, m.author, m.title, m.content, m.lang,
       m.publishedAt, m.sentiment ?? null, m.sentimentScore ?? null, JSON.stringify(m.raw ?? {})],
    )
    n++
  }
  return n
}

/** Project the client's inbox conversations (Slice 2) into owned mentions and upsert them. */
export async function syncOwnedSignals(db: ListeningDbRunner, clientId: string): Promise<number> {
  const rows = await db.queryRows<ConversationRow>(
    `SELECT id, platform, channel_type, permalink, participant_name, last_message_preview,
            sentiment, last_message_at
       FROM social_conversations WHERE client_id = $1`, [clientId])
  const mentions = rows.map(projectConversationToMention)
  return upsertMentions(db, clientId, null, mentions)
}
```

> Note: the `enriched_at` test asserts the SQL string differs between owned and external. The fragment `NOW()` vs `NULL` is inlined (not a param) so it appears in the SQL text — safe, no user input.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/social/listeningStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialListening/store.ts test/social/listeningStore.test.ts
git commit -m "feat(listening): injected store — upsertMentions + syncOwnedSignals"
```

---

## Task 5: Query CRUD endpoints

**Files:**
- Create: `server/api/agency/social/listening/queries/index.get.ts`
- Create: `server/api/agency/social/listening/queries/index.post.ts`
- Create: `server/api/agency/social/listening/queries/[id].patch.ts`
- Create: `server/api/agency/social/listening/queries/[id].delete.ts`

> These follow the exact shape of `server/api/agency/social/reporting/schedules/*` (bare `requireAuth`, array-param sanitizing, conditional PATCH builder). No new unit test — covered by typecheck + the manual smoke in Task 9.

- [ ] **Step 1: List endpoint**

```ts
// server/api/agency/social/listening/queries/index.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/listening/queries?clientId= — list a client's listening queries. */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return queryRows(
    `SELECT * FROM social_listening_queries WHERE client_id = $1 ORDER BY created_at DESC`, [clientId])
})
```

- [ ] **Step 2: Create endpoint**

```ts
// server/api/agency/social/listening/queries/index.post.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const CATEGORIES = new Set(['brand', 'competitor', 'product', 'campaign'])
const SOURCES = new Set(['reddit', 'news', 'youtube', 'bluesky', 'mastodon'])
const cleanArr = (v: any, allow?: Set<string>): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x: any) => String(x).trim()).filter((x: string) => x && (!allow || allow.has(x))))] : []

/** POST /api/agency/social/listening/queries — create a listening query. */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const b = await readBody(event)
  if (!b?.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  if (!b?.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })
  const include = cleanArr(b.includeTerms)
  if (!include.length) throw createError({ statusCode: 400, statusMessage: 'at least one include term required' })
  const exclude = cleanArr(b.excludeTerms)
  const sources = cleanArr(b.sources, SOURCES)
  const category = b.category && CATEGORIES.has(b.category) ? b.category : null
  return queryOne(
    `INSERT INTO social_listening_queries (client_id, name, include_terms, exclude_terms, sources, category, enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.clientId, String(b.name).trim(), include, exclude, sources, category, b.enabled !== false, String(user.id)])
})
```

- [ ] **Step 3: Patch endpoint**

```ts
// server/api/agency/social/listening/queries/[id].patch.ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const CATEGORIES = new Set(['brand', 'competitor', 'product', 'campaign'])
const SOURCES = new Set(['reddit', 'news', 'youtube', 'bluesky', 'mastodon'])
const cleanArr = (v: any, allow?: Set<string>): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x: any) => String(x).trim()).filter((x: string) => x && (!allow || allow.has(x))))] : []

/** PATCH /api/agency/social/listening/queries/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (frag: string, val: any) => { params.push(val); sets.push(frag.replace('$?', `$${params.length}`)) }

  if (b.name?.trim()) set('name = $?', String(b.name).trim())
  if (b.includeTerms !== undefined) set('include_terms = $?', cleanArr(b.includeTerms))
  if (b.excludeTerms !== undefined) set('exclude_terms = $?', cleanArr(b.excludeTerms))
  if (b.sources !== undefined) set('sources = $?', cleanArr(b.sources, SOURCES))
  if (b.category !== undefined) set('category = $?', b.category && CATEGORIES.has(b.category) ? b.category : null)
  if (b.enabled !== undefined) set('enabled = $?', !!b.enabled)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })

  params.push(id)
  await execute(`UPDATE social_listening_queries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  return { ok: true }
})
```

- [ ] **Step 4: Delete endpoint**

```ts
// server/api/agency/social/listening/queries/[id].delete.ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/** DELETE /api/agency/social/listening/queries/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  await execute(`DELETE FROM social_listening_queries WHERE id = $1`, [id])
  return { ok: true }
})
```

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/social/listening/queries/
git commit -m "feat(listening): query CRUD endpoints"
```

---

## Task 6: Mentions + sync-owned endpoints

**Files:**
- Create: `server/api/agency/social/listening/mentions.get.ts`
- Create: `server/api/agency/social/listening/sync-owned.post.ts`

- [ ] **Step 1: Mentions list endpoint**

```ts
// server/api/agency/social/listening/mentions.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/listening/mentions?clientId=&queryId=&source=&sentiment=&limit=&offset= */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const where: string[] = ['client_id = $1']
  const params: any[] = [clientId]
  const add = (frag: string, val: any) => { params.push(val); where.push(frag.replace('$?', `$${params.length}`)) }
  if (q.queryId) add('query_id = $?', q.queryId)
  if (q.source) add('source = $?', String(q.source))
  if (q.sentiment) add('sentiment = $?', String(q.sentiment))

  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
  params.push(limit, offset)
  return queryRows(
    `SELECT * FROM social_listening_mentions WHERE ${where.join(' AND ')}
       ORDER BY published_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`, params)
})
```

- [ ] **Step 2: Sync-owned endpoint**

```ts
// server/api/agency/social/listening/sync-owned.post.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { syncOwnedSignals } from '~~/server/utils/socialListening/store'

/** POST /api/agency/social/listening/sync-owned { clientId } — project inbox conversations into
 *  owned listening mentions. Ungated, human/cron-triggerable (no external calls, no sends). */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const b = await readBody(event)
  if (!b?.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const count = await syncOwnedSignals({ queryRows, queryOne, execute }, String(b.clientId))
  return { ok: true, synced: count }
})
```

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/listening/mentions.get.ts server/api/agency/social/listening/sync-owned.post.ts
git commit -m "feat(listening): mentions list + sync-owned endpoints"
```

---

## Task 7: Composable

**Files:**
- Create: `app/composables/useSocialListening.ts`

- [ ] **Step 1: Write the composable**

```ts
// app/composables/useSocialListening.ts
import type { Ref } from 'vue'

export interface ListeningQuery {
  id: string
  client_id: string
  name: string
  include_terms: string[]
  exclude_terms: string[]
  sources: string[]
  category: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface ListeningQueryInput {
  name: string
  includeTerms: string[]
  excludeTerms: string[]
  sources: string[]
  category: string | null
  enabled: boolean
}

const QBASE = '/api/agency/social/listening/queries'

export function useSocialListening(clientId: Ref<string | null>) {
  const queries = ref<ListeningQuery[]>([])
  const mentions = ref<any[]>([])
  const loading = ref(false)
  const filterSource = ref('all')
  const filterSentiment = ref('all')

  async function loadQueries() {
    if (!clientId.value) { queries.value = []; return }
    queries.value = await $fetch<ListeningQuery[]>(QBASE, { query: { clientId: clientId.value } })
  }

  async function loadMentions() {
    if (!clientId.value) { mentions.value = []; return }
    const query: Record<string, any> = { clientId: clientId.value, limit: 100 }
    if (filterSource.value !== 'all') query.source = filterSource.value
    if (filterSentiment.value !== 'all') query.sentiment = filterSentiment.value
    mentions.value = await $fetch<any[]>('/api/agency/social/listening/mentions', { query })
  }

  async function load() {
    if (!clientId.value) { queries.value = []; mentions.value = []; return }
    loading.value = true
    try { await Promise.all([loadQueries(), loadMentions()]) } finally { loading.value = false }
  }

  async function createQuery(input: ListeningQueryInput) {
    if (!clientId.value) return
    await $fetch(QBASE, { method: 'POST', body: { clientId: clientId.value, ...input } })
    await loadQueries()
  }
  async function updateQuery(id: string, input: Partial<ListeningQueryInput>) {
    await $fetch(`${QBASE}/${id}`, { method: 'PATCH', body: input })
    await loadQueries()
  }
  async function removeQuery(id: string) {
    await $fetch(`${QBASE}/${id}`, { method: 'DELETE' })
    await loadQueries()
  }
  async function syncOwned() {
    if (!clientId.value) return
    await $fetch('/api/agency/social/listening/sync-owned', { method: 'POST', body: { clientId: clientId.value } })
    await loadMentions()
  }

  return { queries, mentions, loading, filterSource, filterSentiment, load, loadQueries, loadMentions, createQuery, updateQuery, removeQuery, syncOwned }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/composables/useSocialListening.ts
git commit -m "feat(listening): useSocialListening composable"
```

---

## Task 8: Query manager component + listening page

**Files:**
- Create: `app/components/social/ListeningQueryManager.vue`  (auto-import: `<SocialListeningQueryManager>`)
- Create: `app/pages/agency/social/listening/index.vue`

- [ ] **Step 1: Query manager (USlideover list + editor, reusing the 3c-2 form patterns)**

```vue
<script setup lang="ts">
// Slice 4a — listening query manager. Mirrors ReportSchedulesManager (3c-2): USlideover with a
// list + an editor form (UFormField, term chips, delete-via-UModal). No native dialogs.
import { useSocialListening, type ListeningQuery, type ListeningQueryInput } from '~/composables/useSocialListening'

const props = defineProps<{ open: boolean; clientId: string | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const toast = useToast()
const clientIdRef = computed(() => props.clientId)
const { queries, loadQueries, createQuery, updateQuery, removeQuery } = useSocialListening(clientIdRef)

const localOpen = computed({ get: () => props.open, set: (v: boolean) => emit('update:open', v) })

const categoryOptions = [
  { label: 'Brand', value: 'brand' },
  { label: 'Competitor', value: 'competitor' },
  { label: 'Product', value: 'product' },
  { label: 'Campaign', value: 'campaign' },
]
const sourceOptions = [
  { label: 'Reddit', value: 'reddit' },
  { label: 'News / RSS', value: 'news' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Bluesky', value: 'bluesky' },
  { label: 'Mastodon', value: 'mastodon' },
]

type Mode = 'list' | 'edit'
const mode = ref<Mode>('list')
const editingId = ref<string | null>(null)
const form = reactive<ListeningQueryInput>({ name: '', includeTerms: [], excludeTerms: [], sources: [], category: 'brand', enabled: true })
const includeRaw = ref('')
const excludeRaw = ref('')
const parseTerms = (raw: string) => [...new Set(raw.split(/[\n,]+/).map(t => t.trim()).filter(Boolean))]
const includeTerms = computed(() => parseTerms(includeRaw.value))
const excludeTerms = computed(() => parseTerms(excludeRaw.value))
const saving = ref(false)
const pendingDelete = ref<ListeningQuery | null>(null)
const deleting = ref(false)

function startCreate() {
  editingId.value = null
  form.name = ''; form.category = 'brand'; form.sources = []; form.enabled = true
  includeRaw.value = ''; excludeRaw.value = ''
  mode.value = 'edit'
}
function startEdit(q: ListeningQuery) {
  editingId.value = q.id
  form.name = q.name; form.category = q.category ?? 'brand'; form.sources = [...(q.sources ?? [])]; form.enabled = q.enabled
  includeRaw.value = (q.include_terms ?? []).join(', ')
  excludeRaw.value = (q.exclude_terms ?? []).join(', ')
  mode.value = 'edit'
}
function backToList() { mode.value = 'list'; editingId.value = null }

async function save() {
  if (!form.name.trim()) { toast.add({ title: 'Name required', color: 'error' }); return }
  if (!includeTerms.value.length) { toast.add({ title: 'Add at least one include term', color: 'error' }); return }
  saving.value = true
  const payload: ListeningQueryInput = { ...form, includeTerms: includeTerms.value, excludeTerms: excludeTerms.value }
  try {
    if (editingId.value) await updateQuery(editingId.value, payload)
    else await createQuery(payload)
    toast.add({ title: editingId.value ? 'Query updated' : 'Query created', color: 'success' })
    backToList()
  } catch { toast.add({ title: 'Could not save query', color: 'error' }) }
  finally { saving.value = false }
}
async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try { await removeQuery(pendingDelete.value.id); toast.add({ title: 'Query deleted', color: 'success' }); pendingDelete.value = null }
  catch { toast.add({ title: 'Could not delete query', color: 'error' }) }
  finally { deleting.value = false }
}

watch(() => [props.open, props.clientId], ([isOpen]) => { if (isOpen) { backToList(); loadQueries() } })
</script>

<template>
  <USlideover v-model:open="localOpen" title="Listening queries" description="Keywords this client is monitored for">
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-lucide-radar"
          color="neutral"
          variant="subtle"
          title="External sources activate later"
          description="Queries are saved now. Off-property sources (Reddit, News, YouTube, Bluesky, Mastodon) start collecting once an operator enables them; owned mentions from your inbox show immediately."
        />

        <template v-if="mode === 'list'">
          <div v-if="queries.length" class="space-y-2">
            <div v-for="q in queries" :key="q.id" class="rounded-lg border border-default bg-default p-3 flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-medium truncate">{{ q.name }}</p>
                  <UBadge v-if="q.category" color="primary" variant="subtle" size="xs">{{ q.category }}</UBadge>
                  <UBadge v-if="!q.enabled" color="neutral" variant="subtle" size="xs">Paused</UBadge>
                </div>
                <p class="text-xs text-muted mt-0.5 truncate">{{ (q.include_terms ?? []).join(', ') || 'no terms' }}</p>
                <p class="text-xs text-muted mt-1">{{ (q.sources ?? []).length }} external source(s)</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" aria-label="Edit" @click="startEdit(q)" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete" @click="pendingDelete = q" />
              </div>
            </div>
          </div>
          <div v-else class="rounded-lg border border-dashed border-default p-6 text-center">
            <UIcon name="i-lucide-radar" class="text-muted size-6 mx-auto" />
            <p class="text-sm text-muted mt-2">No listening queries yet.</p>
          </div>
        </template>

        <template v-else>
          <UFormField label="Name" required>
            <UInput v-model="form.name" placeholder="e.g. ACME brand mentions" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Category">
              <USelectMenu v-model="form.category" :items="categoryOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="External sources">
              <USelectMenu v-model="form.sources" :items="sourceOptions" value-key="value" multiple class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Include terms" help="Match if any of these appear. Separate with commas or new lines." required>
            <UTextarea v-model="includeRaw" :rows="2" placeholder="acme, acme widget, @acme" class="w-full" />
          </UFormField>
          <div v-if="includeTerms.length" class="flex flex-wrap gap-1.5 -mt-2">
            <UBadge v-for="t in includeTerms" :key="t" color="primary" variant="subtle" size="sm">{{ t }}</UBadge>
          </div>
          <UFormField label="Exclude terms" help="Drop hits containing any of these (noise control).">
            <UTextarea v-model="excludeRaw" :rows="2" placeholder="stock, acme corp legal" class="w-full" />
          </UFormField>
          <div v-if="excludeTerms.length" class="flex flex-wrap gap-1.5 -mt-2">
            <UBadge v-for="t in excludeTerms" :key="t" color="neutral" variant="subtle" size="sm">{{ t }}</UBadge>
          </div>
          <UFormField label="Enabled" help="Paused queries are skipped by the collector.">
            <USwitch v-model="form.enabled" />
          </UFormField>
        </template>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex items-center justify-end w-full gap-2">
        <template v-if="mode === 'list'">
          <UButton variant="ghost" color="neutral" label="Close" @click="close" />
          <UButton icon="i-lucide-plus" color="primary" label="New query" :disabled="!clientId" @click="startCreate" />
        </template>
        <template v-else>
          <UButton variant="ghost" color="neutral" label="Cancel" @click="backToList" />
          <UButton color="primary" label="Save" :loading="saving" @click="save" />
        </template>
      </div>
    </template>
  </USlideover>

  <UModal :open="!!pendingDelete" title="Delete query" @update:open="(v: boolean) => { if (!v) pendingDelete = null }">
    <template #body>
      <p class="text-sm">Delete <span class="font-medium">{{ pendingDelete?.name }}</span>? This can't be undone.</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" color="neutral" label="Cancel" @click="pendingDelete = null" />
        <UButton color="error" label="Delete" :loading="deleting" @click="confirmDelete" />
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Listening page**

```vue
<script setup lang="ts">
import { useSocialListening } from '~/composables/useSocialListening'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
useHead({ title: 'Social Listening' })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { mentions, loading, filterSource, filterSentiment, load, loadMentions, syncOwned } = useSocialListening(clientId)

const showQueries = ref(false)
const syncing = ref(false)
async function onSync() { syncing.value = true; try { await syncOwned() } finally { syncing.value = false } }

const sourceFilterOptions = [
  { label: 'All sources', value: 'all' }, { label: 'Owned (inbox)', value: 'owned' },
  { label: 'Reddit', value: 'reddit' }, { label: 'News', value: 'news' }, { label: 'YouTube', value: 'youtube' },
  { label: 'Bluesky', value: 'bluesky' }, { label: 'Mastodon', value: 'mastodon' },
]
const sentimentFilterOptions = [
  { label: 'All sentiment', value: 'all' }, { label: 'Positive', value: 'positive' },
  { label: 'Neutral', value: 'neutral' }, { label: 'Negative', value: 'negative' }, { label: 'Unknown', value: 'unknown' },
]
function sentimentColor(s: string) { return s === 'positive' ? 'success' : s === 'negative' ? 'error' : 'neutral' }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString() : '' }

watch(clientId, load)
watch([filterSource, filterSentiment], loadMentions)
onMounted(load)
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center gap-3 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">Listening</h1>
        <p class="text-sm text-muted mt-0.5">Brand mentions across your inbox and the open web.</p>
      </div>
      <div class="flex items-center gap-2 ml-auto">
        <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Client" class="w-52" />
        <USelectMenu v-model="filterSource" :items="sourceFilterOptions" value-key="value" class="w-40" />
        <USelectMenu v-model="filterSentiment" :items="sentimentFilterOptions" value-key="value" class="w-40" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="subtle" label="Sync inbox" :loading="syncing" :disabled="!clientId" @click="onSync" />
        <UButton icon="i-lucide-radar" color="neutral" variant="subtle" label="Queries" :disabled="!clientId" @click="showQueries = true" />
      </div>
    </div>

    <SocialListeningQueryManager v-model:open="showQueries" :client-id="clientId" />

    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <template v-else-if="clientId">
      <div v-if="mentions.length" class="space-y-2">
        <div v-for="m in mentions" :key="m.id" class="rounded-lg border border-default bg-default p-3">
          <div class="flex items-center gap-2 text-xs text-muted mb-1">
            <UBadge color="neutral" variant="subtle" size="xs">{{ m.source }}</UBadge>
            <UBadge :color="sentimentColor(m.sentiment) as any" variant="subtle" size="xs">{{ m.sentiment || 'unknown' }}</UBadge>
            <span v-if="m.author">{{ m.author }}</span>
            <span class="ml-auto">{{ fmtDate(m.published_at) }}</span>
          </div>
          <p v-if="m.title" class="text-sm font-medium">{{ m.title }}</p>
          <p class="text-sm text-muted line-clamp-3">{{ m.content || '(no text)' }}</p>
          <div v-if="(m.topics ?? []).length" class="flex flex-wrap gap-1 mt-1">
            <UBadge v-for="t in m.topics" :key="t" color="primary" variant="subtle" size="xs">{{ t }}</UBadge>
          </div>
          <UButton v-if="m.url" :to="m.url" target="_blank" icon="i-lucide-external-link" variant="ghost" size="xs" class="mt-1" label="Open" />
        </div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-default p-10 text-center">
        <UIcon name="i-lucide-radar" class="text-muted size-8 mx-auto" />
        <p class="text-sm text-muted mt-2">No mentions yet. Add a listening query, then "Sync inbox" to pull owned mentions.</p>
      </div>
    </template>
    <div v-else class="text-sm text-muted">Select a client to view listening.</div>
  </div>
</template>
```

- [ ] **Step 3: Run typecheck (gate)**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | tee /tmp/listen-tc.log; grep -E 'socialListening|useSocialListening|listening/index|ListeningQueryManager' /tmp/listen-tc.log || echo "ZERO refs to new files"`
Expected: no errors referencing the new files.

- [ ] **Step 4: Commit**

```bash
git add app/components/social/ListeningQueryManager.vue app/pages/agency/social/listening/index.vue
git commit -m "feat(listening): query manager + listening page (4a shell)"
```

---

## Task 9: Navigation entry + manual smoke

**Files:**
- Modify: the social nav group (find it: `grep -rl "social/reporting" app/components app/layouts app/composables` — the file listing `/agency/social/reporting` is where the Reporting entry lives; add Listening beside it)

- [ ] **Step 1: Locate the nav source**

Run: `grep -rn "/agency/social/reporting" app/ | grep -iE 'label|to:|title'`
Expected: the nav definition line for "Reporting".

- [ ] **Step 2: Add the Listening entry**

Mirror the adjacent Reporting entry exactly (same object shape). Example shape (match whatever the file uses):

```ts
{ label: 'Listening', icon: 'i-lucide-radar', to: '/agency/social/listening' },
```

- [ ] **Step 3: Manual smoke (dev server)**

Run: `pnpm dev` then:
- Visit `/agency/social/listening` → page renders, client picker populated.
- Open "Queries" → create a query (name + include term "test") → it appears in the list.
- Click "Sync inbox" → if the client has inbox conversations, owned mentions appear; otherwise the empty state shows (both are correct).
- Edit the query, toggle Paused, delete it → list updates; toasts fire.

Expected: all interactions work; no console errors; no native dialogs.

- [ ] **Step 4: Full test run + typecheck**

Run: `pnpm exec vitest run test/social/ && echo OK`
Expected: all social tests pass (prior 236 + the new listening tests).

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -cE 'error TS'`
Expected: equals the pre-existing baseline (no new errors in the new files — grep the log for the new paths to confirm zero).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(listening): add Listening nav entry (4a)"
```

---

## Self-review notes (done while writing)

- **Spec coverage:** 4a items from §8 — data model (Task 1), query CRUD (Task 5), UI shell (Tasks 7–9), owned-signal projection (Tasks 3–4, 6). ✅ External adapters / enrichment / alerting / portal are explicitly deferred to 4b–4d.
- **Type consistency:** `RawMention`, `ConversationRow`, `ListeningDbRunner`, `MentionSource`, `Sentiment` defined in Task 3/4 and reused consistently; `matchesQuery`/`bucketSentiment` (Task 2) imported by the owned projection (Task 3) and store. `matchesQuery` is unused in 4a's runtime path (owned signals don't filter on terms) — it's tested now and consumed by the 4b adapters; this is intentional and called out here so it isn't deleted as "dead code."
- **Placeholder scan:** no TBD/TODO; every code step is complete. The one lookup-by-grep is Task 9 Step 1 (nav file location varies) — handled with an exact grep command rather than a guessed path.
- **Gating:** 4a adds no external calls and no sends; `sync-owned` is internal-only. Nothing here needs an env gate. External-source gating arrives with the adapters in 4b.
```

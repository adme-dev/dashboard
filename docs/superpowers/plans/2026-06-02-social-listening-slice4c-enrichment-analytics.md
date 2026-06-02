# Social Listening — Slice 4c (Enrichment + Analytics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Enrich captured mentions with sentiment + topics via Groq (batched, fail-safe), and surface a listening analytics dashboard (sentiment split, volume-over-time, share-of-voice by category, top topics/sources) on `/agency/social/listening`.

**Architecture:** Pure enrichment core (prompt builder + tolerant JSON parser) + an injected `enrichUnenriched(db, groqFn)` orchestrator wired into the `sync-social-listening` cron after upsert. Pure analytics aggregators over mention rows. An `overview.get` endpoint (joins mentions→queries for category). A dashboard strip on the existing listening page. Builds on 4a (`social_listening_mentions`, `enriched_at` queue column) + 4b (cron). **No migration.**

**Tech Stack:** Groq via `~~/server/utils/groqClient` (`generateGroqInsight(prompt, {maxTokens, systemPrompt})`); Nitro; Nuxt UI v4; Vitest.

---

## Conventions (same as 4a/4b)

- Worktree off latest `origin/main`; symlink `node_modules`; `pnpm exec nuxt prepare` before vitest.
- Server imports `~~/server/utils/...`; frontend→app-util imports `~~/app/utils/...`.
- Typecheck gate: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck`; bar = 0 errors referencing new files. **Watch `noUncheckedIndexedAccess`** — guard array/regex index access (`m?.[1]`, `arr[0]` → check before use).
- No migration. Enrichment is read-only + writes to existing `social_listening_mentions` columns.

---

## File structure

| File | Responsibility |
|---|---|
| `server/utils/socialListening/enrich.ts` | pure `buildEnrichmentPrompt` + `parseEnrichmentResponse`; injected `enrichUnenriched` |
| `server/utils/socialListening/analytics.ts` | pure aggregators: `sentimentSplit`, `volumeByDay`, `shareOfVoice`, `topTopics`, `topSources`, `buildListeningOverview` |
| `server/api/cron/sync-social-listening.post.ts` | MODIFY — call `enrichUnenriched` after the collect/upsert loop |
| `server/api/agency/social/listening/overview.get.ts` | analytics endpoint (joins mentions→queries for category) |
| `app/composables/useSocialListening.ts` | MODIFY — add `overview` + `loadOverview` |
| `app/pages/agency/social/listening/index.vue` | MODIFY — add the dashboard strip |
| `test/social/listeningEnrich.test.ts` | enrichment prompt/parse + orchestrator tests |
| `test/social/listeningAnalytics.test.ts` | aggregator tests |

---

## Task 1: Enrichment core (prompt + parser)

**Files:** create `server/utils/socialListening/enrich.ts`; test `test/social/listeningEnrich.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildEnrichmentPrompt, parseEnrichmentResponse } from '~~/server/utils/socialListening/enrich'

describe('buildEnrichmentPrompt', () => {
  it('includes each mention id + text and asks for strict JSON', () => {
    const p = buildEnrichmentPrompt([
      { id: 'm1', text: 'love the acme widget' },
      { id: 'm2', text: 'acme support is terrible' },
    ])
    expect(p).toContain('m1'); expect(p).toContain('m2')
    expect(p).toContain('love the acme widget')
    expect(p.toLowerCase()).toContain('json')
  })
})

describe('parseEnrichmentResponse', () => {
  it('parses a clean JSON array into an id→{sentiment,topics} map', () => {
    const out = parseEnrichmentResponse('[{"id":"m1","sentiment":"positive","topics":["product","quality"]}]')
    expect(out.m1).toEqual({ sentiment: 'positive', topics: ['product', 'quality'] })
  })
  it('tolerates code fences / prose around the JSON', () => {
    const out = parseEnrichmentResponse('Here you go:\n```json\n[{"id":"m2","sentiment":"negative","topics":["support"]}]\n```')
    expect(out.m2.sentiment).toBe('negative')
  })
  it('coerces invalid sentiment to unknown and caps/cleans topics', () => {
    const out = parseEnrichmentResponse('[{"id":"m3","sentiment":"meh","topics":["a","a","b","c","d","e","f"]}]')
    expect(out.m3.sentiment).toBe('unknown')
    expect(out.m3.topics.length).toBeLessThanOrEqual(5)
    expect(out.m3.topics).toEqual(['a', 'b', 'c', 'd', 'e'])  // dedupe + cap 5
  })
  it('returns {} for unparseable input (fail-safe)', () => {
    expect(parseEnrichmentResponse('not json at all')).toEqual({})
    expect(parseEnrichmentResponse('')).toEqual({})
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `server/utils/socialListening/enrich.ts` (prompt + parser only for now; orchestrator in Task 2 — but write the whole file now)**

```ts
// server/utils/socialListening/enrich.ts
// Groq enrichment for listening mentions: classify sentiment + topics. Pure prompt builder +
// tolerant JSON parser (fail-safe) + an injected orchestrator. Mirrors socialReporting/aiSummary
// posture: any LLM/parse failure degrades to 'unknown', never throws into the cron.
import type { Sentiment } from '~~/app/utils/socialListeningMatch'

export interface EnrichInput { id: string; text: string }
export interface EnrichResult { sentiment: Sentiment; topics: string[] }
const VALID: Sentiment[] = ['positive', 'neutral', 'negative', 'unknown']

/** Pure: build the batch classification prompt. */
export function buildEnrichmentPrompt(items: EnrichInput[]): string {
  const lines = items.map(i => `- id ${i.id}: ${(i.text || '').slice(0, 400).replace(/\s+/g, ' ')}`)
  return [
    'Classify each social mention below for sentiment and up to 5 short topic tags.',
    'Sentiment must be exactly one of: positive, neutral, negative.',
    'Respond with ONLY a JSON array, one object per mention, no prose:',
    '[{"id":"<id>","sentiment":"positive|neutral|negative","topics":["tag1","tag2"]}]',
    '',
    'Mentions:',
    ...lines,
  ].join('\n')
}

/** Pure: parse the LLM response into a map. Tolerant of code fences / prose. Fail-safe → {}. */
export function parseEnrichmentResponse(text: string): Record<string, EnrichResult> {
  const out: Record<string, EnrichResult> = {}
  if (!text) return out
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return out
  let arr: any
  try { arr = JSON.parse(text.slice(start, end + 1)) } catch { return out }
  if (!Array.isArray(arr)) return out
  for (const row of arr) {
    const id = row?.id != null ? String(row.id) : ''
    if (!id) continue
    const s = String(row?.sentiment ?? '').toLowerCase() as Sentiment
    const sentiment: Sentiment = (VALID.includes(s) && s !== 'unknown') ? s : 'unknown'
    const topics = Array.isArray(row?.topics)
      ? [...new Set(row.topics.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 5)
      : []
    out[id] = { sentiment, topics }
  }
  return out
}

export interface EnrichDbRunner {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  execute: (sql: string, params?: any[]) => Promise<number>
}
export type GroqFn = (prompt: string) => Promise<string>

/**
 * Enrich a batch of un-enriched mentions. On a successful Groq call every row in the batch is
 * stamped enriched_at (sentiment from the parse, else 'unknown') so it is not retried forever; on
 * a Groq exception nothing is stamped (retried next run). Returns the number of rows enriched.
 */
export async function enrichUnenriched(db: EnrichDbRunner, groq: GroqFn, batchSize = 20): Promise<number> {
  const rows = await db.queryRows<{ id: string; title: string | null; content: string | null }>(
    `SELECT id, title, content FROM social_listening_mentions
       WHERE enriched_at IS NULL ORDER BY created_at ASC LIMIT $1`, [batchSize])
  if (!rows.length) return 0
  const items: EnrichInput[] = rows.map(r => ({ id: r.id, text: `${r.title ?? ''} ${r.content ?? ''}`.trim() }))
  let parsed: Record<string, EnrichResult>
  try {
    parsed = parseEnrichmentResponse(await groq(buildEnrichmentPrompt(items)))
  } catch {
    return 0  // Groq unavailable → leave un-enriched, retry next run
  }
  let n = 0
  for (const r of rows) {
    const res = parsed[r.id] ?? { sentiment: 'unknown' as Sentiment, topics: [] }
    await db.execute(
      `UPDATE social_listening_mentions SET sentiment = $1, topics = $2, enriched_at = NOW() WHERE id = $3`,
      [res.sentiment, res.topics, r.id])
    n++
  }
  return n
}
```

- [ ] **Step 4: Run → PASS (parser/prompt tests).**

- [ ] **Step 5: Commit** `git add server/utils/socialListening/enrich.ts test/social/listeningEnrich.test.ts && git commit -m "feat(listening): Groq enrichment core (prompt + parser + orchestrator)"`

---

## Task 2: Orchestrator test + wire into cron

**Files:** extend `test/social/listeningEnrich.test.ts`; modify `server/api/cron/sync-social-listening.post.ts`.

- [ ] **Step 1: Add orchestrator test**

```ts
import { enrichUnenriched } from '~~/server/utils/socialListening/enrich'
import { vi } from 'vitest'

describe('enrichUnenriched', () => {
  const rows = [{ id: 'm1', title: null, content: 'love acme' }, { id: 'm2', title: null, content: 'hate acme' }]
  it('stamps every batch row on a successful groq call (parsed → value, missing → unknown)', async () => {
    const updates: any[] = []
    const db = {
      queryRows: vi.fn(async () => rows),
      execute: vi.fn(async (_sql: string, params?: any[]) => { updates.push(params); return 1 }),
    }
    const groq = vi.fn(async () => '[{"id":"m1","sentiment":"positive","topics":["x"]}]')  // m2 missing
    const n = await enrichUnenriched(db, groq, 20)
    expect(n).toBe(2)
    expect(updates.find(p => p[2] === 'm1')[0]).toBe('positive')
    expect(updates.find(p => p[2] === 'm2')[0]).toBe('unknown')  // missing → unknown, still stamped
  })
  it('enriches nothing and stamps nothing when groq throws', async () => {
    const db = { queryRows: vi.fn(async () => rows), execute: vi.fn(async () => 1) }
    const groq = vi.fn(async () => { throw new Error('groq down') })
    expect(await enrichUnenriched(db, groq, 20)).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('no-ops on an empty queue', async () => {
    const db = { queryRows: vi.fn(async () => []), execute: vi.fn(async () => 1) }
    expect(await enrichUnenriched(db, vi.fn(), 20)).toBe(0)
  })
})
```

- [ ] **Step 2: Run → PASS.**

- [ ] **Step 3: Wire into the cron.** In `server/api/cron/sync-social-listening.post.ts`:
  - Add imports at the top:
    ```ts
    import { enrichUnenriched } from '~~/server/utils/socialListening/enrich'
    import { generateGroqInsight } from '~~/server/utils/groqClient'
    ```
  - After the `for (const q of queries)` loop and before `return`, add:
    ```ts
      // Enrich any mentions still missing sentiment/topics (this run's + any backlog). Fail-safe.
      const enriched = await enrichUnenriched(
        { queryRows, execute },
        (prompt) => generateGroqInsight(prompt, { maxTokens: 500, systemPrompt: 'You are a precise social-media sentiment classifier. Output only JSON.' }),
      )
      return { ok: true, queriesRun, mentionsUpserted, enriched }
    ```
  - Remove the old `return { ok: true, queriesRun, mentionsUpserted }` line.

- [ ] **Step 4: Run the full social suite** `pnpm exec vitest run test/social/` → all pass.

- [ ] **Step 5: Commit** `git add server/utils/socialListening/enrich.ts test/social/listeningEnrich.test.ts server/api/cron/sync-social-listening.post.ts && git commit -m "feat(listening): wire Groq enrichment into the poll cron"`

---

## Task 3: Analytics aggregators (pure)

**Files:** create `server/utils/socialListening/analytics.ts`; test `test/social/listeningAnalytics.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { sentimentSplit, volumeByDay, shareOfVoice, topTopics, topSources, buildListeningOverview } from '~~/server/utils/socialListening/analytics'

type Row = { source: string; sentiment: string | null; topics: string[] | null; published_at: string | null; category: string | null }
const rows: Row[] = [
  { source: 'reddit', sentiment: 'positive', topics: ['price', 'quality'], published_at: '2026-06-01T10:00:00Z', category: 'brand' },
  { source: 'reddit', sentiment: 'negative', topics: ['support'], published_at: '2026-06-01T12:00:00Z', category: 'brand' },
  { source: 'news', sentiment: 'neutral', topics: ['price'], published_at: '2026-06-02T08:00:00Z', category: 'competitor' },
]

describe('listening analytics', () => {
  it('sentimentSplit counts by bucket', () => {
    expect(sentimentSplit(rows)).toEqual({ positive: 1, neutral: 1, negative: 1, unknown: 0 })
  })
  it('volumeByDay groups by UTC date ascending', () => {
    expect(volumeByDay(rows)).toEqual([{ date: '2026-06-01', count: 2 }, { date: '2026-06-02', count: 1 }])
  })
  it('shareOfVoice counts mentions per category', () => {
    expect(shareOfVoice(rows)).toEqual([{ category: 'brand', count: 2 }, { category: 'competitor', count: 1 }])
  })
  it('topTopics ranks flattened topics', () => {
    expect(topTopics(rows, 2)).toEqual([{ topic: 'price', count: 2 }, { topic: 'quality', count: 1 }])
  })
  it('topSources ranks by source', () => {
    expect(topSources(rows)).toEqual([{ source: 'reddit', count: 2 }, { source: 'news', count: 1 }])
  })
  it('buildListeningOverview bundles everything + total', () => {
    const o = buildListeningOverview(rows)
    expect(o.total).toBe(3)
    expect(o.sentiment.positive).toBe(1)
    expect(o.volume.length).toBe(2)
    expect(o.shareOfVoice[0]).toEqual({ category: 'brand', count: 2 })
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `server/utils/socialListening/analytics.ts`**

```ts
// server/utils/socialListening/analytics.ts
// Pure aggregators for the listening dashboard. Operate on already-fetched mention rows (joined
// with their query's category). No I/O — fully unit-testable.

export interface MentionRow {
  source: string
  sentiment: string | null
  topics: string[] | null
  published_at: string | null
  category: string | null
}

export function sentimentSplit(rows: MentionRow[]): { positive: number; neutral: number; negative: number; unknown: number } {
  const out = { positive: 0, neutral: 0, negative: 0, unknown: 0 }
  for (const r of rows) {
    const s = (r.sentiment ?? 'unknown') as keyof typeof out
    if (s in out) out[s]++; else out.unknown++
  }
  return out
}

function rankCounts(pairs: string[]): Array<{ key: string; count: number }> {
  const m = new Map<string, number>()
  for (const k of pairs) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export function volumeByDay(rows: MentionRow[]): Array<{ date: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.published_at) continue
    const date = r.published_at.slice(0, 10)
    m.set(date, (m.get(date) ?? 0) + 1)
  }
  return [...m.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date))
}

export function shareOfVoice(rows: MentionRow[]): Array<{ category: string; count: number }> {
  return rankCounts(rows.map(r => r.category ?? 'uncategorized')).map(({ key, count }) => ({ category: key, count }))
}

export function topTopics(rows: MentionRow[], n = 10): Array<{ topic: string; count: number }> {
  return rankCounts(rows.flatMap(r => r.topics ?? [])).slice(0, n).map(({ key, count }) => ({ topic: key, count }))
}

export function topSources(rows: MentionRow[]): Array<{ source: string; count: number }> {
  return rankCounts(rows.map(r => r.source)).map(({ key, count }) => ({ source: key, count }))
}

export function buildListeningOverview(rows: MentionRow[]) {
  return {
    total: rows.length,
    sentiment: sentimentSplit(rows),
    volume: volumeByDay(rows),
    shareOfVoice: shareOfVoice(rows),
    topTopics: topTopics(rows, 10),
    topSources: topSources(rows),
  }
}
```

- [ ] **Step 4: Run → PASS (6 tests).**

- [ ] **Step 5: Commit** `git add server/utils/socialListening/analytics.ts test/social/listeningAnalytics.test.ts && git commit -m "feat(listening): pure analytics aggregators"`

---

## Task 4: Overview endpoint

**Files:** create `server/api/agency/social/listening/overview.get.ts`.

- [ ] **Step 1: Implement (joins mentions→queries for category; window-filtered)**

```ts
// server/api/agency/social/listening/overview.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildListeningOverview, type MentionRow } from '~~/server/utils/socialListening/analytics'

/** GET /api/agency/social/listening/overview?clientId=&days= — aggregated listening analytics. */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365)

  const rows = await queryRows<MentionRow>(
    `SELECT m.source, m.sentiment, m.topics, m.published_at, q.category
       FROM social_listening_mentions m
       LEFT JOIN social_listening_queries q ON q.id = m.query_id
      WHERE m.client_id = $1
        AND COALESCE(m.published_at, m.created_at) > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, days])
  return buildListeningOverview(rows)
})
```

- [ ] **Step 2: Commit** `git add server/api/agency/social/listening/overview.get.ts && git commit -m "feat(listening): analytics overview endpoint"`

---

## Task 5: Dashboard UI

**Files:** modify `app/composables/useSocialListening.ts`, `app/pages/agency/social/listening/index.vue`.

- [ ] **Step 1: Composable — add overview load.** In `useSocialListening.ts`, inside the function:
  - add state: `const overview = ref<any | null>(null)`  and  `const days = ref(30)`
  - add loader:
    ```ts
    async function loadOverview() {
      if (!clientId.value) { overview.value = null; return }
      overview.value = await $fetch<any>('/api/agency/social/listening/overview', { query: { clientId: clientId.value, days: days.value } })
    }
    ```
  - call `loadOverview()` inside `load()`'s `Promise.all([...])`
  - return `overview`, `days`, `loadOverview` alongside the rest.

- [ ] **Step 2: Page — add a dashboard strip** above the mentions stream in `app/pages/agency/social/listening/index.vue`. Pull `overview, days, loadOverview` from the composable; add `watch(days, () => { loadMentions(); loadOverview() })` (extend the existing watch). Insert before the mentions list:

```vue
      <!-- Analytics dashboard -->
      <div v-if="overview && overview.total" class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted">Mentions</div>
          <div class="text-2xl font-semibold mt-1">{{ overview.total }}</div>
        </div>
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted mb-2">Sentiment</div>
          <div class="flex items-center gap-2 text-sm">
            <UBadge color="success" variant="subtle" size="xs">+{{ overview.sentiment.positive }}</UBadge>
            <UBadge color="neutral" variant="subtle" size="xs">~{{ overview.sentiment.neutral }}</UBadge>
            <UBadge color="error" variant="subtle" size="xs">-{{ overview.sentiment.negative }}</UBadge>
          </div>
        </div>
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted mb-2">Share of voice</div>
          <div class="space-y-1">
            <div v-for="s in overview.shareOfVoice" :key="s.category" class="flex justify-between text-xs">
              <span class="capitalize">{{ s.category }}</span><span class="tabular-nums text-muted">{{ s.count }}</span>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-default bg-default p-4">
          <div class="text-xs text-muted mb-2">Top topics</div>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="t in overview.topTopics.slice(0, 8)" :key="t.topic" color="primary" variant="subtle" size="xs">{{ t.topic }} {{ t.count }}</UBadge>
            <span v-if="!overview.topTopics.length" class="text-xs text-muted">—</span>
          </div>
        </div>
      </div>
```

Also add a days selector next to the existing filters:
```vue
        <USelectMenu v-model="days" :items="[{label:'7d',value:7},{label:'30d',value:30},{label:'90d',value:90}]" value-key="value" class="w-28" />
```

- [ ] **Step 3: Typecheck gate** (zero refs to new/modified listening files).

- [ ] **Step 4: Full social test run** — all pass.

- [ ] **Step 5: Commit** `git add app/composables/useSocialListening.ts app/pages/agency/social/listening/index.vue && git commit -m "feat(listening): analytics dashboard strip (4c)"`

---

## Self-review notes

- **Spec coverage (§5 + §8/4c):** Groq enrichment (Tasks 1-2), dashboard analytics — sentiment/volume/share-of-voice/topics (Tasks 3-5). ✅ Alerting + portal remain 4d.
- **Type consistency:** `Sentiment` reused from 4a; `EnrichDbRunner`/`GroqFn` injected; `MentionRow` shared between `analytics.ts` and the overview endpoint; `enrichUnenriched` uses `{queryRows, execute}` (subset of the db helpers).
- **Fail-safe:** enrichment degrades to 'unknown' on parse-miss, stamps the batch on Groq success (no infinite retry), stamps nothing on Groq throw (retry later). The cron's existing `mentionsUpserted` return is preserved and `enriched` added.
- **noUncheckedIndexedAccess:** `parseEnrichmentResponse` guards `text.indexOf`/`slice`; analytics use `.get() ?? 0`. No raw `arr[i]` deref without a guard.
- **Placeholder scan:** none — full code in every step.
```

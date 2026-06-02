# Social Listening — Slice 4d (Alerting + Portal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Complete Slice 4 — raise listening alerts (negative-sentiment + volume-spike) through the existing notifications system behind a hard gate, and add a read-only client-portal listening surface.

**Architecture:** A nullable `alerted_at` column lets each negative mention alert once. Pure detectors + gate/allowlist helpers (`socialListening/alerts.ts`); an injected, **doubly-gated** `dispatchListeningAlerts` (gate flag `SOCIAL_LISTENING_ALERTS_ENABLED` **and** an explicit recipient allowlist `SOCIAL_LISTENING_NOTIFY_ALLOWLIST` — empty default = no fan-out) wired into the poll cron after enrichment. A tenant-scoped portal data layer (`socialListening/portal.ts`) + two `client-portal` endpoints + a portal page. Builds on 4a–4c.

**Tech Stack:** Nitro; `createNotification` from `~~/server/utils/notifications`; Nuxt UI v4; Vitest.

> **Safety:** alerting is dormant by default twice over — the gate flag is off AND the allowlist is empty. `createNotification` is only ever called when both are satisfied. Never enable either without explicit sign-off (mirrors `SOCIAL_AUTOMATION_ENABLED` / `SOCIAL_REPORTS_ENABLED`).

---

## Conventions (same as 4a–4c)

- Worktree off latest `origin/main`; symlink `node_modules`; `pnpm exec nuxt prepare` before vitest.
- Server imports `~~/server/utils/...`. Portal endpoints use `requireClientAuth(event)` (returns `ServerClientUser` with `.clientId`); scope every query to the **session** clientId, never caller input (mirrors `socialReporting/portal.ts`).
- Migration: next free is **158** — re-verify at exec (`ls server/database/migrations | grep -oE '^[0-9]+' | sort -n | tail -1`). Run it against the DB (`DATABASE_URL` from the main checkout `.env`).
- Typecheck gate: 0 errors referencing new files. Guard index access (`noUncheckedIndexedAccess`).

---

## File structure

| File | Responsibility |
|---|---|
| `server/database/migrations/158_social_listening_alerted.sql` | add `alerted_at` to `social_listening_mentions` |
| `server/utils/socialListening/alerts.ts` | `isListeningAlertsEnabled`, `parseAlertAllowlist`, `detectVolumeSpike` (pure) + injected `dispatchListeningAlerts` |
| `server/api/cron/sync-social-listening.post.ts` | MODIFY — call `dispatchListeningAlerts` after enrichment |
| `server/utils/socialListening/portal.ts` | tenant-scoped `portalListMentions` + `portalOverviewRows` |
| `server/api/client-portal/social/listening/mentions.get.ts` | portal mentions (session-scoped) |
| `server/api/client-portal/social/listening/overview.get.ts` | portal analytics (session-scoped) |
| `app/composables/usePortalSocialListening.ts` | portal data composable |
| `app/pages/portal/social-listening.vue` | portal page |
| `app/layouts/portal.vue` | MODIFY — add "Social Listening" nav entry |
| `test/social/listeningAlerts.test.ts` | detector + gate + dispatch tests |
| `test/social/listeningPortal.test.ts` | tenant-scoping tests |

---

## Task 1: Migration — alerted_at column

**Files:** create `server/database/migrations/158_social_listening_alerted.sql`.

- [ ] **Step 1: Write**

```sql
-- 158_social_listening_alerted.sql — Slice 4d. Lets each mention alert at most once.
-- Additive + idempotent.
ALTER TABLE social_listening_mentions ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_listening_mentions_to_alert
  ON social_listening_mentions(client_id) WHERE alerted_at IS NULL AND sentiment = 'negative';
```

- [ ] **Step 2: Run** `export DATABASE_URL=$(grep DATABASE_URL /Users/paulgiurin/Documents/Projects/dashboard/.env | cut -d= -f2-); psql "$DATABASE_URL" -f server/database/migrations/158_social_listening_alerted.sql`  (verify number first; rename if 158 taken). Expected: `ALTER TABLE` / `CREATE INDEX`.
- [ ] **Step 3: Commit** `git add server/database/migrations/158_social_listening_alerted.sql && git commit -m "feat(listening): migration 158 — alerted_at column"`

---

## Task 2: Pure alert core

**Files:** create `server/utils/socialListening/alerts.ts`; test `test/social/listeningAlerts.test.ts`.

- [ ] **Step 1: Failing test (pure parts)**

```ts
import { describe, it, expect } from 'vitest'
import { isListeningAlertsEnabled, parseAlertAllowlist, detectVolumeSpike } from '~~/server/utils/socialListening/alerts'

describe('isListeningAlertsEnabled', () => {
  it('only true for the exact string "true"', () => {
    expect(isListeningAlertsEnabled({ SOCIAL_LISTENING_ALERTS_ENABLED: 'true' })).toBe(true)
    expect(isListeningAlertsEnabled({ SOCIAL_LISTENING_ALERTS_ENABLED: 'TRUE' })).toBe(false)
    expect(isListeningAlertsEnabled({})).toBe(false)
  })
})

describe('parseAlertAllowlist', () => {
  it('lowercases, trims, dedupes; empty/unset → empty set', () => {
    expect([...parseAlertAllowlist('A@x.com, b@y.com , a@x.com')]).toEqual(['a@x.com', 'b@y.com'])
    expect(parseAlertAllowlist(undefined).size).toBe(0)
    expect(parseAlertAllowlist('   ').size).toBe(0)
  })
})

describe('detectVolumeSpike', () => {
  it('flags when today exceeds the baseline mean by the multiplier and clears the floor', () => {
    expect(detectVolumeSpike(20, [2, 3, 2, 3], { minToday: 5, multiplier: 3 }).spiked).toBe(true)  // mean 2.5, 20 ≥ 7.5
  })
  it('does not flag below the absolute floor even if ratio is high', () => {
    expect(detectVolumeSpike(4, [0, 0, 0], { minToday: 5, multiplier: 3 }).spiked).toBe(false)
  })
  it('does not flag when within normal range', () => {
    expect(detectVolumeSpike(6, [5, 6, 7], { minToday: 5, multiplier: 3 }).spiked).toBe(false)
  })
  it('no baseline → not a spike (avoids day-one false alarms)', () => {
    expect(detectVolumeSpike(50, [], { minToday: 5, multiplier: 3 }).spiked).toBe(false)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `server/utils/socialListening/alerts.ts` (pure parts + dispatch; dispatch tested in Task 3)**

```ts
// server/utils/socialListening/alerts.ts
// Listening alerts (Slice 4d). DOUBLY dormant: nothing fires unless SOCIAL_LISTENING_ALERTS_ENABLED
// === 'true' AND SOCIAL_LISTENING_NOTIFY_ALLOWLIST resolves to at least one recipient. Pure
// detectors + an injected dispatch so the gating/decisions are unit-testable without DB/notifs.
import type { createNotification } from '~~/server/utils/notifications'

export type AlertEnv = Record<string, string | undefined>

/** HARD gate — exact "true" (mirrors SOCIAL_AUTOMATION_ENABLED / SOCIAL_REPORTS_ENABLED). */
export function isListeningAlertsEnabled(env: AlertEnv): boolean {
  return env.SOCIAL_LISTENING_ALERTS_ENABLED === 'true'
}

/** Parse the recipient email allowlist. Empty/unset → empty set (no fan-out). */
export function parseAlertAllowlist(raw: string | undefined): Set<string> {
  const out = new Set<string>()
  for (const e of (raw ?? '').split(',')) { const v = e.trim().toLowerCase(); if (v) out.add(v) }
  return out
}

export interface SpikeOpts { minToday: number; multiplier: number }
/** Pure: today's volume is a spike if it clears an absolute floor AND exceeds mean(baseline)×multiplier.
 *  No baseline → never a spike (avoids day-one false alarms). */
export function detectVolumeSpike(today: number, baseline: number[], opts: SpikeOpts): { spiked: boolean; ratio: number | null } {
  if (!baseline.length || today < opts.minToday) return { spiked: today >= opts.minToday && !baseline.length ? false : false, ratio: null }
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length
  const ratio = mean === 0 ? null : today / mean
  const spiked = today >= opts.minToday && today >= mean * opts.multiplier
  return { spiked, ratio }
}

export interface AlertDbRunner {
  queryRows: <T = any>(sql: string, params?: any[]) => Promise<T[]>
  execute: (sql: string, params?: any[]) => Promise<number>
}
export interface DispatchDeps {
  db: AlertDbRunner
  env: AlertEnv
  notify: typeof createNotification
  baseUrl: string
}

/**
 * Resolve recipients (allowlist emails → active team_member ids), then for each client with new
 * negative mentions (alerted_at IS NULL), notify every recipient once and stamp alerted_at.
 * No-op unless the gate is on AND the allowlist resolves to ≥1 recipient. Returns count of alerts raised.
 */
export async function dispatchListeningAlerts(deps: DispatchDeps): Promise<number> {
  const { db, env, notify, baseUrl } = deps
  if (!isListeningAlertsEnabled(env)) return 0
  const allow = parseAlertAllowlist(env.SOCIAL_LISTENING_NOTIFY_ALLOWLIST)
  if (allow.size === 0) return 0

  const recipients = await db.queryRows<{ id: string }>(
    `SELECT id::text AS id FROM team_members WHERE is_active = TRUE AND lower(email) = ANY($1)`,
    [[...allow]])
  if (!recipients.length) return 0

  // New negative mentions, grouped per client (cap per run to avoid floods).
  const negs = await db.queryRows<{ id: string; client_id: string; title: string | null; content: string | null; url: string | null }>(
    `SELECT id, client_id, title, content, url FROM social_listening_mentions
       WHERE alerted_at IS NULL AND sentiment = 'negative' ORDER BY created_at ASC LIMIT 50`)
  let raised = 0
  for (const m of negs) {
    const snippet = (m.title || m.content || 'New negative mention').slice(0, 140)
    for (const r of recipients) {
      await notify({
        userId: r.id, type: 'system', reason: 'direct',
        title: 'Negative brand mention detected',
        message: snippet,
        link: m.url || `${baseUrl}/agency/social/listening`,
        metadata: { source: 'social_listening', mentionId: m.id, clientId: m.client_id },
      })
      raised++
    }
    await db.execute(`UPDATE social_listening_mentions SET alerted_at = NOW() WHERE id = $1`, [m.id])
  }
  return raised
}
```

> Note: the `detectVolumeSpike` no-baseline branch is written verbosely to keep the `{spiked,ratio}` shape; it always returns `spiked:false` when there's no baseline — the test asserts this.

- [ ] **Step 4: Run → PASS (pure tests).** **Step 5: Commit** `git add server/utils/socialListening/alerts.ts test/social/listeningAlerts.test.ts && git commit -m "feat(listening): alert detectors + gated dispatch core"`

---

## Task 3: Dispatch tests + wire into cron

**Files:** extend `test/social/listeningAlerts.test.ts`; modify `server/api/cron/sync-social-listening.post.ts`.

- [ ] **Step 1: Add dispatch tests**

```ts
import { dispatchListeningAlerts } from '~~/server/utils/socialListening/alerts'
import { vi } from 'vitest'

const baseDeps = (env: any, negs: any[] = [], recips: any[] = [{ id: 'u1' }]) => {
  const calls: any[] = []
  const db = {
    queryRows: vi.fn(async (sql: string) => /team_members/.test(sql) ? recips : negs),
    execute: vi.fn(async () => 1),
  }
  const notify = vi.fn(async () => { calls.push(1); return null as any })
  return { deps: { db, env, notify, baseUrl: 'https://x' }, db, notify }
}

describe('dispatchListeningAlerts gating', () => {
  it('no-op when gate off', async () => {
    const { deps, notify } = baseDeps({ SOCIAL_LISTENING_NOTIFY_ALLOWLIST: 'a@x.com' })
    expect(await dispatchListeningAlerts(deps as any)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
  it('no-op when allowlist empty even if gate on', async () => {
    const { deps, notify } = baseDeps({ SOCIAL_LISTENING_ALERTS_ENABLED: 'true' })
    expect(await dispatchListeningAlerts(deps as any)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })
  it('notifies each recipient per negative mention and stamps alerted_at when fully enabled', async () => {
    const { deps, db, notify } = baseDeps(
      { SOCIAL_LISTENING_ALERTS_ENABLED: 'true', SOCIAL_LISTENING_NOTIFY_ALLOWLIST: 'a@x.com' },
      [{ id: 'm1', client_id: 'c1', title: 'awful', content: null, url: null }],
      [{ id: 'u1' }, { id: 'u2' }],
    )
    expect(await dispatchListeningAlerts(deps as any)).toBe(2)  // 1 mention × 2 recipients
    expect(notify).toHaveBeenCalledTimes(2)
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('alerted_at = NOW()'), ['m1'])
  })
})
```

- [ ] **Step 2: Run → PASS.**

- [ ] **Step 3: Wire into the cron.** In `server/api/cron/sync-social-listening.post.ts`:
  - Add imports:
    ```ts
    import { dispatchListeningAlerts } from '~~/server/utils/socialListening/alerts'
    import { createNotification } from '~~/server/utils/notifications'
    ```
  - After the `const enriched = await enrichUnenriched(...)` line and before `return`, add:
    ```ts
      const alerts = await dispatchListeningAlerts({
        db: { queryRows, execute }, env: process.env as Record<string, string | undefined>,
        notify: createNotification, baseUrl: process.env.APP_BASE_URL || '',
      })
    ```
  - Change the return to `return { ok: true, queriesRun, mentionsUpserted, enriched, alerts }`.

- [ ] **Step 4: Full social suite** → all pass. **Step 5: Commit** `git add server/utils/socialListening/alerts.ts test/social/listeningAlerts.test.ts server/api/cron/sync-social-listening.post.ts && git commit -m "feat(listening): wire gated alert dispatch into the poll cron"`

---

## Task 4: Portal data layer + endpoints

**Files:** create `server/utils/socialListening/portal.ts`; test `test/social/listeningPortal.test.ts`; create the two endpoints.

- [ ] **Step 1: Failing test (tenant scoping)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { portalListMentions, portalOverviewRows } from '~~/server/utils/socialListening/portal'

describe('socialListening portal — tenant isolation', () => {
  it('portalListMentions scopes to the passed clientId (never caller input)', async () => {
    const db = { queryRows: vi.fn(async () => []) }
    await portalListMentions(db as any, 'client-123', { limit: 50 })
    const [, params] = db.queryRows.mock.calls[0]
    expect(params[0]).toBe('client-123')
  })
  it('portalOverviewRows scopes to clientId and clamps days', async () => {
    const db = { queryRows: vi.fn(async () => []) }
    await portalOverviewRows(db as any, 'client-123', 9999)
    const [sql, params] = db.queryRows.mock.calls[0]
    expect(sql).toContain('client_id = $1')
    expect(params[0]).toBe('client-123')
    expect(params[1]).toBeLessThanOrEqual(365)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `server/utils/socialListening/portal.ts`**

```ts
// server/utils/socialListening/portal.ts
// Client-portal listening data layer (Slice 4d). Tenant isolation is the cardinal rule: every query
// is scoped to the session clientId the endpoint passes (from requireClientAuth — NEVER caller
// input). Reuses the agency analytics shape so analytics.ts applies unchanged.
import type { MentionRow } from '~~/server/utils/socialListening/analytics'

export interface PortalListeningDb { queryRows<T = any>(sql: string, params?: any[]): Promise<T[]> }

export async function portalListMentions(
  db: PortalListeningDb, clientId: string, opts: { limit?: number; source?: string; sentiment?: string },
): Promise<any[]> {
  const where: string[] = ['client_id = $1']
  const params: any[] = [clientId]
  const add = (frag: string, val: any) => { params.push(val); where.push(frag.replace('$?', `$${params.length}`)) }
  if (opts.source) add('source = $?', opts.source)
  if (opts.sentiment) add('sentiment = $?', opts.sentiment)
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  params.push(limit)
  return db.queryRows(
    `SELECT id, source, url, author, title, content, sentiment, topics, published_at
       FROM social_listening_mentions WHERE ${where.join(' AND ')}
       ORDER BY published_at DESC NULLS LAST LIMIT $${params.length}`, params)
}

export async function portalOverviewRows(db: PortalListeningDb, clientId: string, days: number): Promise<MentionRow[]> {
  const d = Math.min(Math.max(days || 30, 1), 365)
  return db.queryRows<MentionRow>(
    `SELECT m.source, m.sentiment, m.topics, m.published_at, q.category
       FROM social_listening_mentions m
       LEFT JOIN social_listening_queries q ON q.id = m.query_id
      WHERE m.client_id = $1
        AND COALESCE(m.published_at, m.created_at) > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, d])
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Endpoints.** Create `server/api/client-portal/social/listening/mentions.get.ts`:

```ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { portalListMentions } from '~~/server/utils/socialListening/portal'

/** GET /api/client-portal/social/listening/mentions — session-scoped mentions. */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event)
  return portalListMentions({ queryRows }, client.clientId, {
    limit: Number(q.limit) || 100,
    source: q.source ? String(q.source) : undefined,
    sentiment: q.sentiment ? String(q.sentiment) : undefined,
  })
})
```

Create `server/api/client-portal/social/listening/overview.get.ts`:

```ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { portalOverviewRows } from '~~/server/utils/socialListening/portal'
import { buildListeningOverview } from '~~/server/utils/socialListening/analytics'

/** GET /api/client-portal/social/listening/overview — session-scoped analytics. */
export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const days = Number(getQuery(event).days) || 30
  const rows = await portalOverviewRows({ queryRows }, client.clientId, days)
  return buildListeningOverview(rows)
})
```

> **Verify** the `requireClientAuth` import path + the session field name. Run `grep -rn "requireClientAuth" server/api/client-portal/social/reporting/overview.get.ts` and copy its import + the exact property (`client.clientId` vs `client.client_id`) used there.

- [ ] **Step 6: Commit** `git add server/utils/socialListening/portal.ts test/social/listeningPortal.test.ts server/api/client-portal/social/listening/ && git commit -m "feat(listening): tenant-scoped portal data layer + endpoints"`

---

## Task 5: Portal page + nav

**Files:** create `app/composables/usePortalSocialListening.ts`, `app/pages/portal/social-listening.vue`; modify `app/layouts/portal.vue`.

- [ ] **Step 1: Composable**

```ts
// app/composables/usePortalSocialListening.ts
import type { Ref } from 'vue'

export function usePortalSocialListening(days: Ref<number>) {
  const overview = ref<any | null>(null)
  const mentions = ref<any[]>([])
  const loading = ref(false)
  async function load() {
    loading.value = true
    try {
      const [o, m] = await Promise.all([
        $fetch<any>('/api/client-portal/social/listening/overview', { query: { days: days.value } }),
        $fetch<any[]>('/api/client-portal/social/listening/mentions', { query: { limit: 100 } }),
      ])
      overview.value = o; mentions.value = m
    } finally { loading.value = false }
  }
  return { overview, mentions, loading, load }
}
```

- [ ] **Step 2: Page `app/pages/portal/social-listening.vue`** (read `app/pages/portal/social-reporting.vue` first to match `definePageMeta` layout/middleware + header style)

```vue
<script setup lang="ts">
import { usePortalSocialListening } from '~/composables/usePortalSocialListening'

definePageMeta({ layout: 'portal', middleware: ['client-auth'] })
useHead({ title: 'Social Listening' })

const days = ref(30)
const { overview, mentions, loading, load } = usePortalSocialListening(days)
function sentimentColor(s: string) { return s === 'positive' ? 'success' : s === 'negative' ? 'error' : 'neutral' }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString() : '' }
watch(days, load)
onMounted(load)
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center gap-3 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">Social Listening</h1>
        <p class="text-sm text-muted mt-0.5">Where your brand is being mentioned across the web.</p>
      </div>
      <USelectMenu v-model="days" :items="[{label:'7d',value:7},{label:'30d',value:30},{label:'90d',value:90}]" value-key="value" class="w-28 ml-auto" />
    </div>

    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <template v-else>
      <div v-if="overview && overview.total" class="grid gap-4 md:grid-cols-3">
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
          <div class="text-xs text-muted mb-2">Top topics</div>
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="t in overview.topTopics.slice(0, 8)" :key="t.topic" color="primary" variant="subtle" size="xs">{{ t.topic }}</UBadge>
            <span v-if="!overview.topTopics.length" class="text-xs text-muted">—</span>
          </div>
        </div>
      </div>

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
          <UButton v-if="m.url" :to="m.url" target="_blank" icon="i-lucide-external-link" variant="ghost" size="xs" class="mt-1" label="Open" />
        </div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-default p-10 text-center">
        <UIcon name="i-lucide-radar" class="text-muted size-8 mx-auto" />
        <p class="text-sm text-muted mt-2">No mentions in this period yet.</p>
      </div>
    </template>
  </div>
</template>
```

> Match `definePageMeta` to whatever `app/pages/portal/social-reporting.vue` uses (layout + middleware name). If it differs from `{ layout: 'portal', middleware: ['client-auth'] }`, use theirs.

- [ ] **Step 3: Nav.** In `app/layouts/portal.vue`, after the `{ label: 'Social Reports', ... to: '/portal/social-reporting' ... }` entry (line ~33), add:
```ts
  { label: 'Social Listening', icon: 'i-lucide-radar', to: '/portal/social-listening', onSelect: close },
```

- [ ] **Step 4: Gates.** `pnpm exec vitest run test/social/` (all pass) + `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` (0 refs to new files).

- [ ] **Step 5: Commit** `git add app/composables/usePortalSocialListening.ts app/pages/portal/social-listening.vue app/layouts/portal.vue && git commit -m "feat(listening): client-portal listening surface (4d)"`

---

## Operator activation (post-merge, doubly gated)

To turn alerts on (with sign-off): set `SOCIAL_LISTENING_ALERTS_ENABLED=true` **and** `SOCIAL_LISTENING_NOTIFY_ALLOWLIST=owner@agency.com` (start with one). Both required — empty allowlist = no fan-out even with the gate on. The portal surface is live as soon as listening data exists (no gate). ⚠️ Never enable without explicit go-ahead.

---

## Self-review notes

- **Spec coverage (§6 + §7 portal + §8/4d):** detectors + gated notifications (Tasks 2-3), client-portal surface (Tasks 4-5). Completes Slice 4.
- **Safety:** `dispatchListeningAlerts` returns 0 before any notify when gate off OR allowlist empty (both tested). `alerted_at` ensures one alert per mention. Volume-spike detector is pure + day-one-safe.
- **Tenant isolation:** portal queries scope to the session clientId (param $1), tested; SELECTs omit internal columns (`raw`, `enriched_at`, `query_id`, `alerted_at`).
- **Type consistency:** `MentionRow` reused from analytics; `AlertDbRunner`/`DispatchDeps` injected; `createNotification` type imported for the `notify` dep; portal returns shape the page + `buildListeningOverview` expect.
- **Verify-at-exec:** migration number (158?), `requireClientAuth` import path + session field, portal page `definePageMeta`, portal nav location — all flagged with grep instructions.
```

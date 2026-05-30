# GA4 Agency Funnel View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `/api/agency/analytics/funnel` endpoint into an enterprise-grade, staff-facing GA4 website-funnel view on the agency analytics page — visual funnel with stage conversion, period-over-period deltas, and a channel-comparison table.

**Architecture:** Two pure, unit-tested logic modules (`server/utils/ga4Funnel.ts` window math; `app/utils/funnelView.ts` presentation math) carry all the risky logic, following the repo's util-test convention (`environment: 'node'`, no component-mount tests). The endpoint gains a prior-window block via a `funnelForWindow()` helper. The UI is two thin `.client.vue` components: a gate (`AnalyticsFunnelChart`) that shows a pick-a-client state, and a data component (`AnalyticsFunnelChartData`) that fetches and renders.

**Tech Stack:** Nuxt 4 (Vue 3 `<script setup>`), Nuxt UI v4 (`UCard`, `UTable`, `UButton`, `UIcon`, `UTooltip`, `USkeleton`), Nitro (`queryRows`, `requireAuth`), Vitest (node env), `useAnalytics()` formatters.

---

## Spec

`docs/superpowers/specs/2026-05-31-ga4-agency-funnel-view-design.md`

## File structure

| File | Responsibility | Action |
|---|---|---|
| `server/utils/ga4Funnel.ts` | `buildFunnel` (exists) + new pure `previousWindow()` date helper | Modify |
| `server/api/agency/analytics/funnel.get.ts` | Endpoint: run funnel for current + previous window | Modify |
| `app/utils/funnelView.ts` | Pure presentation math: deltas, conversion %, share, best/worst | Create |
| `app/components/analytics/FunnelChartData.client.vue` | `AnalyticsFunnelChartData` — fetch + render funnel/table (mounts only when a client is set) | Create |
| `app/components/analytics/FunnelChart.client.vue` | `AnalyticsFunnelChart` — pick-a-client gate around the data component | Create |
| `app/pages/agency/analytics/index.vue` | Place `<AnalyticsFunnelChart>` at page bottom | Modify |
| `test/utils/ga4Funnel.test.ts` | Add `previousWindow` tests | Modify |
| `test/app/utils/funnelView.test.ts` | Unit tests for presentation math | Create |

**Testing note:** The repo has no endpoint-handler or component-mount test harness (vitest is `environment: 'node'`; existing tests cover `server/utils/**` and `app/utils/**` pure modules — e.g. `test/app/utils/ga4PropertyMatch.test.ts`). So all new *logic* is TDD'd in pure modules (Tasks 1, 3). The endpoint wiring (Task 2) and components (Tasks 4–5) are verified by `pnpm typecheck` + a documented manual curl/page check — do **not** scaffold a new endpoint/component test framework.

---

### Task 1: Pure previous-window date helper

**Files:**
- Modify: `server/utils/ga4Funnel.ts`
- Test: `test/utils/ga4Funnel.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/utils/ga4Funnel.test.ts` (it currently imports only `buildFunnel`):

```ts
import { buildFunnel, previousWindow } from '~~/server/utils/ga4Funnel'

describe('previousWindow', () => {
  it('returns the equal-length window ending the day before startDate', () => {
    // current window 2026-05-25..2026-05-31 is 7 days inclusive
    expect(previousWindow('2026-05-25', '2026-05-31')).toEqual({
      prevStart: '2026-05-18',
      prevEnd: '2026-05-24'
    })
  })

  it('handles a single-day window', () => {
    expect(previousWindow('2026-05-31', '2026-05-31')).toEqual({
      prevStart: '2026-05-30',
      prevEnd: '2026-05-30'
    })
  })

  it('handles a 30-day window', () => {
    expect(previousWindow('2026-05-02', '2026-05-31')).toEqual({
      prevStart: '2026-04-02',
      prevEnd: '2026-05-01'
    })
  })
})
```

> Note: update the existing top `import { buildFunnel } from '~~/server/utils/ga4Funnel'` line to the combined import above (don't add a duplicate import).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/utils/ga4Funnel.test.ts`
Expected: FAIL — `previousWindow is not a function` (or import error).

- [ ] **Step 3: Add the implementation**

Append to `server/utils/ga4Funnel.ts` (after `buildFunnel`):

```ts
const DAY_MS = 86_400_000

/**
 * Previous equal-length window, ending the day before startDate.
 * Dates are treated as UTC calendar days; returns YYYY-MM-DD strings.
 * Mirrors the prior-period logic in server/api/agency/analytics/overview.get.ts.
 */
export function previousWindow(startDate: string, endDate: string): { prevStart: string; prevEnd: string } {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const durationMs = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - DAY_MS)
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/utils/ga4Funnel.test.ts`
Expected: PASS (all `buildFunnel` + `previousWindow` cases).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ga4Funnel.ts test/utils/ga4Funnel.test.ts
git commit -m "feat(ga4): add previousWindow date helper for funnel deltas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Extend the funnel endpoint with a previous-period block

**Files:**
- Modify: `server/api/agency/analytics/funnel.get.ts`

No automated test (no endpoint-handler harness in this repo — see Testing note). Verified by typecheck + manual curl.

- [ ] **Step 1: Replace the endpoint with the refactored, two-window version**

Overwrite `server/api/agency/analytics/funnel.get.ts` with:

```ts
/**
 * Agency Funnel — staff-facing internal twin of the portal funnel.
 * GET /api/agency/analytics/funnel?clientId=&startDate=&endDate=
 * Returns the current-window funnel plus the previous equal-length window's
 * totals (for period-over-period deltas in the UI).
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { buildFunnel, previousWindow, type FunnelChannelRow } from '~~/server/utils/ga4Funnel'

const SPEND_CHANNEL_CASE = `CASE
  WHEN ms.platform IN ('google_ads','google') THEN 'Paid Search'
  WHEN ms.platform IN ('meta','meta_ads') THEN 'Paid Social'
  ELSE 'Other' END`

const LEAD_CHANNEL_CASE = `CASE
  WHEN l.source = 'google' THEN 'Paid Search'
  WHEN l.source = 'meta' THEN 'Paid Social'
  ELSE 'Other' END`

async function funnelForWindow(
  clientId: string,
  startDate: string,
  endDate: string
): Promise<{ channels: FunnelChannelRow[]; totals: FunnelChannelRow; hasGa4: boolean }> {
  const spendRows = await queryRows<{ channel: string; spend: string }>(
    `SELECT ${SPEND_CHANNEL_CASE} AS channel, COALESCE(SUM(ds.spend),0) AS spend
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )
  const ga4Rows = await queryRows<{ channel: string; sessions: string; engaged: string; key_events: string }>(
    `SELECT channel_group AS channel,
            COALESCE(SUM(sessions),0) AS sessions,
            COALESCE(SUM(engaged_sessions),0) AS engaged,
            COALESCE(SUM(key_events),0) AS key_events
     FROM ga4_daily_channel
     WHERE client_id = $1 AND metric_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )
  const leadRows = await queryRows<{ channel: string; leads: string }>(
    `SELECT ${LEAD_CHANNEL_CASE} AS channel, COUNT(*) AS leads
     FROM leads l
     WHERE l.client_id = $1 AND l.deleted_at IS NULL
       AND l.source IN ('google', 'meta')
       AND l.submitted_at::date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  const spendByChannel: Record<string, number> = {}
  for (const r of spendRows) spendByChannel[r.channel] = Number(r.spend)
  const ga4ByChannel: Record<string, { sessions: number; engagedSessions: number; keyEvents: number }> = {}
  for (const r of ga4Rows) ga4ByChannel[r.channel] = { sessions: Number(r.sessions), engagedSessions: Number(r.engaged), keyEvents: Number(r.key_events) }
  const leadsByChannel: Record<string, number> = {}
  for (const r of leadRows) leadsByChannel[r.channel] = Number(r.leads)

  const funnel = buildFunnel({ spendByChannel, ga4ByChannel, leadsByChannel })
  return { ...funnel, hasGa4: ga4Rows.length > 0 }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!clientId || !startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'clientId, startDate and endDate are required' })
  }

  const current = await funnelForWindow(clientId, startDate, endDate)
  const { prevStart, prevEnd } = previousWindow(startDate, endDate)
  const previous = await funnelForWindow(clientId, prevStart, prevEnd)

  return {
    channels: current.channels,
    totals: current.totals,
    hasGa4: current.hasGa4,
    previous: { totals: previous.totals }
  }
})
```

> The only behavioural change vs the existing file: the three queries are now inside `funnelForWindow()`, called twice, and the response gains `previous.totals`. `FunnelChannelRow` is already exported from `ga4Funnel.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no NEW errors referencing `funnel.get.ts` or `ga4Funnel.ts` (the repo has ~60 pre-existing errors from `index.d.ts` — those are unrelated; confirm none mention these two files).

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/analytics/funnel.get.ts
git commit -m "feat(ga4): agency funnel endpoint returns previous-period totals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pure funnel presentation math

**Files:**
- Create: `app/utils/funnelView.ts`
- Test: `test/app/utils/funnelView.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/app/utils/funnelView.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pctDelta, conversionRate, shareOfTotal, bestWorstCostPerLead } from '~~/app/utils/funnelView'

describe('pctDelta', () => {
  it('computes percentage change', () => {
    expect(pctDelta(120, 100)).toBeCloseTo(20)
    expect(pctDelta(80, 100)).toBeCloseTo(-20)
  })
  it('returns null when prev is 0, null or undefined', () => {
    expect(pctDelta(50, 0)).toBeNull()
    expect(pctDelta(50, null)).toBeNull()
    expect(pctDelta(null, 100)).toBeNull()
    expect(pctDelta(50, undefined)).toBeNull()
  })
})

describe('conversionRate', () => {
  it('returns a percentage', () => {
    expect(conversionRate(40, 2000)).toBeCloseTo(2)
    expect(conversionRate(80, 2000)).toBeCloseTo(4)
  })
  it('returns null when denominator is 0', () => {
    expect(conversionRate(40, 0)).toBeNull()
  })
})

describe('shareOfTotal', () => {
  it('returns a 0..1 fraction', () => {
    expect(shareOfTotal(25, 100)).toBeCloseTo(0.25)
  })
  it('clamps to [0,1] and guards divide-by-zero', () => {
    expect(shareOfTotal(50, 0)).toBe(0)
    expect(shareOfTotal(150, 100)).toBe(1)
    expect(shareOfTotal(-5, 100)).toBe(0)
  })
})

describe('bestWorstCostPerLead', () => {
  it('picks lowest as best and highest as worst, ignoring null cost/lead', () => {
    const rows = [
      { channel: 'Paid Search', costPerLead: 25 },
      { channel: 'Paid Social', costPerLead: 12 },
      { channel: 'Organic Search', costPerLead: null },
      { channel: 'Other', costPerLead: 40 }
    ]
    expect(bestWorstCostPerLead(rows)).toEqual({ best: 'Paid Social', worst: 'Other' })
  })
  it('returns nulls when fewer than two channels have a cost/lead', () => {
    expect(bestWorstCostPerLead([{ channel: 'A', costPerLead: 10 }])).toEqual({ best: null, worst: null })
    expect(bestWorstCostPerLead([{ channel: 'A', costPerLead: null }])).toEqual({ best: null, worst: null })
  })
})
```

> Import path note: vitest aliases `~~` to the repo root, so the module at `app/utils/funnelView.ts` is imported as `~~/app/utils/funnelView` (matching `test/app/utils/ga4PropertyMatch.test.ts`, which imports `~~/app/utils/ga4PropertyMatch`). In-app, Nuxt auto-imports it; the test reaches it via the alias.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/app/utils/funnelView.test.ts`
Expected: FAIL — cannot find module `~/app/utils/funnelView`.

- [ ] **Step 3: Write the implementation**

Create `app/utils/funnelView.ts`:

```ts
/**
 * Pure presentation math for the GA4 funnel view (AnalyticsFunnelChart).
 * Kept framework-free so it is unit-testable without mounting components.
 */

/** Percentage change vs a previous value. Null when prev is missing or zero. */
export function pctDelta(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

/** Stage-to-stage conversion as a percentage. Null when the denominator is zero. */
export function conversionRate(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return (numerator / denominator) * 100
}

/** Fraction of a total, clamped to [0,1]. Guards divide-by-zero and negatives. */
export function shareOfTotal(value: number, total: number): number {
  if (!total || total <= 0) return 0
  const s = value / total
  if (s < 0) return 0
  if (s > 1) return 1
  return s
}

/**
 * Best (lowest) and worst (highest) cost-per-lead channels. Channels with a
 * null cost/lead (e.g. organic, no spend) are excluded. Returns nulls unless at
 * least two channels qualify, so a single channel is never highlighted as both.
 */
export function bestWorstCostPerLead(
  rows: Array<{ channel: string; costPerLead: number | null }>
): { best: string | null; worst: string | null } {
  const valid = rows.filter((r): r is { channel: string; costPerLead: number } => r.costPerLead != null)
  if (valid.length < 2) return { best: null, worst: null }
  let best = valid[0]
  let worst = valid[0]
  for (const r of valid) {
    if (r.costPerLead < best.costPerLead) best = r
    if (r.costPerLead > worst.costPerLead) worst = r
  }
  return { best: best.channel, worst: worst.channel }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/app/utils/funnelView.test.ts`
Expected: PASS (all four describe blocks).

- [ ] **Step 5: Commit**

```bash
git add app/utils/funnelView.ts test/app/utils/funnelView.test.ts
git commit -m "feat(analytics): pure funnel presentation math (deltas, conversion, share, best/worst)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Funnel data component (fetch + render)

**Files:**
- Create: `app/components/analytics/FunnelChartData.client.vue`

No automated test (presentational component; logic is tested in Task 3). Verified by typecheck + page check in Task 5.

- [ ] **Step 1: Create the component**

Create `app/components/analytics/FunnelChartData.client.vue`:

```vue
<!-- app/components/analytics/FunnelChartData.client.vue -->
<!-- Mounts only when a client is selected (parent gates with v-if), so the
     fetch never fires for the "all clients" view. -->
<script setup lang="ts">
import { pctDelta, conversionRate, shareOfTotal, bestWorstCostPerLead } from '~/utils/funnelView'

const props = defineProps<{ clientId: string; startDate: string; endDate: string }>()
const { fmtCurrency, fmtCompact, fmtPercent } = useAnalytics()

interface FunnelRow {
  channel: string
  spend: number
  sessions: number
  engagedSessions: number
  keyEvents: number
  leads: number
  costPerSession: number | null
  costPerKeyEvent: number | null
  costPerLead: number | null
  sessionToLeadRate: number | null
}
interface FunnelResponse {
  channels: FunnelRow[]
  totals: FunnelRow
  hasGa4: boolean
  previous: { totals: FunnelRow }
}

const { data, pending, error } = await useFetch<FunnelResponse>('/api/agency/analytics/funnel', {
  query: {
    clientId: () => props.clientId,
    startDate: () => props.startDate,
    endDate: () => props.endDate
  },
  watch: [() => props.clientId, () => props.startDate, () => props.endDate]
})

function rateLabel(rate: number | null, suffix: string): string | null {
  return rate == null ? null : `${rate.toFixed(1)}% ${suffix}`
}

// Visual funnel stages, computed from current + previous totals.
const stages = computed(() => {
  const t = data.value?.totals
  const p = data.value?.previous?.totals
  if (!t) return []
  return [
    {
      key: 'spend',
      label: 'Ad spend',
      icon: 'i-lucide-wallet',
      display: fmtCurrency(t.spend),
      delta: pctDelta(t.spend, p?.spend),
      judge: 'neutral' as const,
      conversion: null as string | null,
      barShare: 1
    },
    {
      key: 'sessions',
      label: 'Sessions',
      icon: 'i-lucide-mouse-pointer-click',
      display: fmtCompact(t.sessions),
      delta: pctDelta(t.sessions, p?.sessions),
      judge: 'good' as const,
      conversion: t.costPerSession == null ? null : `${fmtCurrency(t.costPerSession, 2)} / session`,
      barShare: 1
    },
    {
      key: 'keyEvents',
      label: 'GA4 key events',
      icon: 'i-lucide-target',
      display: fmtCompact(t.keyEvents),
      delta: pctDelta(t.keyEvents, p?.keyEvents),
      judge: 'good' as const,
      conversion: rateLabel(conversionRate(t.keyEvents, t.sessions), 'of sessions'),
      barShare: shareOfTotal(t.keyEvents, t.sessions)
    },
    {
      key: 'leads',
      label: 'Leads',
      icon: 'i-lucide-inbox',
      display: fmtCompact(t.leads),
      delta: pctDelta(t.leads, p?.leads),
      judge: 'good' as const,
      conversion: rateLabel(conversionRate(t.leads, t.keyEvents), 'of key events'),
      barShare: shareOfTotal(t.leads, t.sessions)
    }
  ]
})

const bestWorst = computed(() => bestWorstCostPerLead(data.value?.channels || []))

const columns = [
  { accessorKey: 'channel', header: 'Channel' },
  { accessorKey: 'spend', header: 'Spend' },
  { accessorKey: 'sessions', header: 'Sessions' },
  { accessorKey: 'engagedSessions', header: 'Engaged' },
  { accessorKey: 'keyEvents', header: 'Key events' },
  { accessorKey: 'leads', header: 'Leads' },
  { accessorKey: 'costPerSession', header: 'Cost / session' },
  { accessorKey: 'costPerKeyEvent', header: 'Cost / key event' },
  { accessorKey: 'costPerLead', header: 'Cost / lead' },
  { accessorKey: 'sessionToLeadRate', header: 'Session → lead' }
]

function fmtRatioCurrency(v: number | null): string {
  return v == null ? '—' : fmtCurrency(v, 2)
}
function fmtRatePct(v: number | null): string {
  return v == null ? '—' : fmtPercent(v * 100, 1)
}

// Delta color: green good / red bad for count stages; muted/neutral for spend.
function deltaClass(delta: number | null, judge: 'good' | 'neutral'): string {
  if (delta == null) return 'text-muted'
  if (judge === 'neutral') return 'text-muted'
  return delta >= 0 ? 'text-green-500' : 'text-red-500'
}
function deltaIcon(delta: number | null): string {
  return (delta ?? 0) >= 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-filter" class="text-primary" />
        <span class="font-semibold">Website &amp; Funnel</span>
        <UTooltip text="GA4 key events are the on-site conversion signal; Leads are captured ground truth — they won't match exactly.">
          <UIcon name="i-lucide-info" class="text-muted" />
        </UTooltip>
      </div>
    </template>

    <!-- Loading -->
    <div v-if="pending" class="space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <USkeleton v-for="i in 4" :key="i" class="h-24 rounded-lg" />
      </div>
      <USkeleton class="h-48 w-full rounded-lg" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-sm text-red-500 py-6 text-center">
      Couldn't load the funnel. Try refreshing.
    </div>

    <!-- No GA4 property mapped for this client -->
    <div v-else-if="!data?.hasGa4" class="flex flex-col items-center gap-3 py-10 text-center">
      <UIcon name="i-lucide-line-chart" class="w-8 h-8 text-muted" />
      <p class="text-sm text-muted">No GA4 property is mapped for this client yet.</p>
      <UButton
        to="/agency/social/ga4"
        icon="i-lucide-link"
        label="Map a property"
        size="sm"
        variant="outline"
        color="neutral"
      />
    </div>

    <!-- Populated -->
    <div v-else class="space-y-6">
      <!-- Visual funnel -->
      <div class="space-y-2">
        <div
          v-for="stage in stages"
          :key="stage.key"
          class="rounded-lg border border-default bg-elevated/30 p-3"
        >
          <div class="flex items-center gap-3">
            <UIcon :name="stage.icon" class="w-4 h-4 text-muted shrink-0" />
            <span class="text-xs text-muted font-medium w-28 shrink-0">{{ stage.label }}</span>
            <!-- proportional bar -->
            <div class="flex-1 h-2 rounded-full bg-default overflow-hidden">
              <div
                class="h-full rounded-full bg-primary"
                :style="{ width: `${Math.max(4, Math.round(stage.barShare * 100))}%` }"
              />
            </div>
            <span class="text-lg font-bold tabular-nums text-default w-24 text-right shrink-0">{{ stage.display }}</span>
            <span
              v-if="stage.delta !== null"
              class="flex items-center gap-0.5 w-20 justify-end shrink-0"
              :class="deltaClass(stage.delta, stage.judge)"
            >
              <UIcon :name="deltaIcon(stage.delta)" class="w-3.5 h-3.5" />
              <span class="text-xs font-medium tabular-nums">{{ Math.abs(stage.delta).toFixed(1) }}%</span>
            </span>
            <span v-else class="w-20 shrink-0" />
          </div>
          <p v-if="stage.conversion" class="text-xs text-muted mt-1 ml-[8.75rem]">
            {{ stage.conversion }}
          </p>
        </div>
      </div>

      <!-- Channel table -->
      <UTable :data="data!.channels" :columns="columns">
        <template #spend-cell="{ row }">{{ fmtCurrency(row.original.spend) }}</template>
        <template #sessions-cell="{ row }">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 rounded bg-primary/10" :style="{ width: `${Math.round(shareOfTotal(row.original.sessions, data!.totals.sessions) * 100)}%` }" />
            <span class="relative tabular-nums">{{ fmtCompact(row.original.sessions) }}</span>
          </div>
        </template>
        <template #engagedSessions-cell="{ row }">{{ fmtCompact(row.original.engagedSessions) }}</template>
        <template #keyEvents-cell="{ row }">{{ fmtCompact(row.original.keyEvents) }}</template>
        <template #leads-cell="{ row }">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 rounded bg-success/10" :style="{ width: `${Math.round(shareOfTotal(row.original.leads, data!.totals.leads) * 100)}%` }" />
            <span class="relative tabular-nums">{{ fmtCompact(row.original.leads) }}</span>
          </div>
        </template>
        <template #costPerSession-cell="{ row }">{{ fmtRatioCurrency(row.original.costPerSession) }}</template>
        <template #costPerKeyEvent-cell="{ row }">{{ fmtRatioCurrency(row.original.costPerKeyEvent) }}</template>
        <template #costPerLead-cell="{ row }">
          <span
            class="tabular-nums px-1.5 py-0.5 rounded"
            :class="{
              'bg-success/15 text-success font-medium': row.original.channel === bestWorst.best,
              'bg-warning/15 text-warning font-medium': row.original.channel === bestWorst.worst
            }"
          >{{ fmtRatioCurrency(row.original.costPerLead) }}</span>
        </template>
        <template #sessionToLeadRate-cell="{ row }">{{ fmtRatePct(row.original.sessionToLeadRate) }}</template>
      </UTable>
    </div>
  </UCard>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no NEW errors referencing `FunnelChartData.client.vue` or `funnelView.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/components/analytics/FunnelChartData.client.vue
git commit -m "feat(analytics): GA4 funnel data component — visual funnel + channel table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Gate component + page placement + verification

**Files:**
- Create: `app/components/analytics/FunnelChart.client.vue`
- Modify: `app/pages/agency/analytics/index.vue`

- [ ] **Step 1: Create the gate component**

Create `app/components/analytics/FunnelChart.client.vue`:

```vue
<!-- app/components/analytics/FunnelChart.client.vue -->
<!-- Gate: shows a pick-a-client prompt for the "all clients" view, and only
     mounts the data component (which fetches) once a client is selected. -->
<script setup lang="ts">
const props = defineProps<{ clientId: string | null; startDate: string; endDate: string }>()
</script>

<template>
  <UCard v-if="!props.clientId">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-filter" class="text-primary" />
        <span class="font-semibold">Website &amp; Funnel</span>
      </div>
    </template>
    <div class="flex flex-col items-center gap-2 py-10 text-center">
      <UIcon name="i-lucide-users" class="w-8 h-8 text-muted" />
      <p class="text-sm text-muted">Select a client to view its GA4 website funnel.</p>
    </div>
  </UCard>

  <AnalyticsFunnelChartData
    v-else
    :client-id="props.clientId"
    :start-date="props.startDate"
    :end-date="props.endDate"
  />
</template>
```

- [ ] **Step 2: Place the component on the agency analytics page**

In `app/pages/agency/analytics/index.vue`, find the closing `</div>` of the Client Breakdown block (currently the last block before the page's outer `</div>`):

```vue
      <AnalyticsClientBreakdown
        :clients="byClient"
        :loading="loading"
        :start-date="filters.startDate"
        :end-date="filters.endDate"
      />
    </div>
```

Insert the funnel component immediately after that `</div>` (so it becomes the last child of the page's outer scroll container, before its final `</div>`):

```vue
      <AnalyticsClientBreakdown
        :clients="byClient"
        :loading="loading"
        :start-date="filters.startDate"
        :end-date="filters.endDate"
      />
    </div>

    <!-- GA4 Website & Funnel (per-client) -->
    <AnalyticsFunnelChart
      :client-id="filters.clientId"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
    />
```

> The page's outer wrapper is `<div class="h-full overflow-y-auto p-6 space-y-6">`, so the `space-y-6` gives vertical rhythm — no extra margin class needed.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no NEW errors referencing `FunnelChart.client.vue` or `index.vue`.

- [ ] **Step 4: Lint the touched files**

Run: `pnpm lint`
Expected: no errors in the new/modified files (warnings tolerable if pre-existing pattern).

- [ ] **Step 5: Manual verification (dev server)**

Run: `pnpm dev`

Then verify:
1. Open `/agency/analytics` with no client selected → funnel card shows "Select a client to view its GA4 website funnel." and **no** `/api/agency/analytics/funnel` request fires (check Network tab).
2. Select a GA4-mapped client (e.g. one auto-mapped earlier) → funnel populates: four stages with bars + deltas, channel table with share bars and a highlighted best/worst cost-per-lead.
3. Select a client with no GA4 property → "No GA4 property is mapped" with the "Map a property" button linking to `/agency/social/ga4`.
4. Endpoint smoke (auth cookie required in browser; or expect 401 unauthenticated):
   `curl -s "http://localhost:3000/api/agency/analytics/funnel?clientId=<id>&startDate=2026-05-01&endDate=2026-05-31"` → JSON includes `previous.totals`.

Document the observed result of each check in the task notes.

- [ ] **Step 6: Run the full unit suite**

Run: `pnpm vitest run test/utils/ga4Funnel.test.ts test/app/utils/funnelView.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/analytics/FunnelChart.client.vue app/pages/agency/analytics/index.vue
git commit -m "feat(analytics): wire GA4 funnel into agency analytics page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review checklist (completed by plan author)

- **Spec coverage:**
  - Prompt-to-pick-a-client state → Task 5 gate component ✓
  - No-GA4 empty state + deep link → Task 4 ✓
  - Visual funnel + stage conversion → Task 4 `stages` + template ✓
  - Period-over-period deltas → Task 1 (window) + Task 2 (endpoint) + Task 4 (`pctDelta`) ✓
  - Channel table + extra metrics → Task 4 columns ✓
  - Channel share bars + best/worst → Task 3 (`shareOfTotal`, `bestWorstCostPerLead`) + Task 4 cells ✓
  - Placement at page bottom → Task 5 ✓
  - Endpoint prior-window calc tested; presentation math tested → Tasks 1, 3 ✓
  - AI callout / KPI-trend integration / cron → explicitly out of scope (spec) ✓
- **Placeholder scan:** none — every code step shows full content.
- **Type consistency:** `FunnelRow`/`FunnelChannelRow` fields, `previous.totals` shape, and `funnelView` function signatures match across endpoint (Task 2), component (Task 4), and tests (Tasks 1, 3). `bestWorstCostPerLead` returns `{ best, worst }` used identically in Task 4.
```

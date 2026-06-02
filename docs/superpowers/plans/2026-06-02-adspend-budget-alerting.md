# Ad-Spend Budget Alerting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect sustained ad-spend underspend and related delivery failures in the daily anomaly cron, and post a daily 9am Slack budget review plus real-time critical alerts — closing the gap that let a SEM campaign underspend for months unnoticed.

**Architecture:** A new `adspendHealth` analyser composes six pure detectors over the existing `media_spend`/`daily_spend` data and emits `type:'adspend'` anomalies (no migration — reuses the existing table + `agency_settings` config store). The existing reconcile→notify hook gains real-time Slack dispatch + optional accountability-task creation; a new self-gating cron posts the 9am digest via the existing `pages-cron` worker. The AI chat gains a budget keyword route.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`pg`), Vitest, Cloudflare Pages + Workers, Nuxt UI v4.

---

## File Structure

**Phase 1 — analyser**
- Create `server/utils/anomalyDetection/adPacingMath.ts` — pure pace/period math (single source of truth, mirrors the Ad Pacing Generator's formulas).
- Create `server/utils/anomalyDetection/analysers/adspendHealth.ts` — six detectors + group builder + analyser.
- Modify `server/utils/anomalyDetection/index.ts` — register the analyser.
- Modify `server/utils/anomalyDetection/sharedData.ts` — extend the `mediaSpend` query.
- Create `test/server/utils/anomalyDetection/adPacingMath.test.ts`, `test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`.

**Phase 2 — Slack layer**
- Create `server/utils/budgetSlackConfig.ts` — read/write `agency_settings.budget_slack`.
- Create `server/utils/anomalyDetection/slackBudget.ts` — pure block builders + `postSlack` + `validateWebhook`.
- Create `server/utils/anomalyDetection/budgetSlackDispatch.ts` — real-time critical dispatch.
- Modify `server/utils/anomalyDetection/reconcile.ts` — call dispatch in Pass 3.
- Create `server/api/cron/budget-slack-digest.post.ts` — 9am digest cron.
- Modify `workers/pages-cron/src/index.ts` — add digest route.
- Create `server/api/agency/settings/budget-slack.get.ts`, `.put.ts`, `budget-slack/test.post.ts`.
- Create `app/components/settings/BudgetAlertsSettings.vue`; modify `app/pages/agency/settings/index.vue`.
- Create `test/server/utils/anomalyDetection/slackBudget.test.ts`.

**Phase 3 — chat**
- Create `server/utils/budgetChatContext.ts` — pure context builder.
- Modify `server/api/ai/chat.post.ts` — add budget route.
- Create `test/server/utils/budgetChatContext.test.ts`.

**Phase 4 — accountability tasks**
- Create `server/utils/anomalyDetection/accountabilityTask.ts` — `buildTaskPayload` (pure) + `maybeCreateAccountabilityTasks`.
- Modify `server/utils/anomalyDetection/reconcile.ts` — call in Pass 3.
- Create `test/server/utils/anomalyDetection/accountabilityTask.test.ts`.

**Phase 5 — marketing sync**
- Modify `app/pages/features/index.vue` and `app/pages/features/[slug].vue`.

**Test command (all tasks):** `pnpm test -- <path>` (vitest). Tests import server code via the `~~/` alias (already configured in `vitest.config.ts`).

---

## Phase 1 — `adspendHealth` analyser

### Task 1.1: Pace/period math module

**Files:**
- Create: `server/utils/anomalyDetection/adPacingMath.ts`
- Test: `test/server/utils/anomalyDetection/adPacingMath.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/anomalyDetection/adPacingMath.test.ts
import { describe, it, expect } from 'vitest'
import {
  periodOf, dayOfMonth, daysInMonth, expectedToDate, projectedMonthEnd,
} from '~~/server/utils/anomalyDetection/adPacingMath'

describe('adPacingMath', () => {
  const apr15 = new Date('2026-04-15T00:00:00Z')

  it('formats the YYYY-MM period from a date', () => {
    expect(periodOf(apr15)).toBe('2026-04')
    expect(periodOf(new Date('2026-12-03T00:00:00Z'))).toBe('2026-12')
  })

  it('computes day-of-month and days-in-month', () => {
    expect(dayOfMonth(apr15)).toBe(15)
    expect(daysInMonth(apr15)).toBe(30)
    expect(daysInMonth(new Date('2026-02-10T00:00:00Z'))).toBe(28)
  })

  it('computes expected-to-date as budget × day/daysInMonth', () => {
    // 15/30 = 0.5 of a $3000 budget
    expect(expectedToDate(3000, apr15)).toBeCloseTo(1500, 5)
  })

  it('projects month-end from MTD spend', () => {
    // $750 over 15 of 30 days → $1500 projected
    expect(projectedMonthEnd(750, apr15)).toBeCloseTo(1500, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/server/utils/anomalyDetection/adPacingMath.test.ts`
Expected: FAIL — cannot find module `adPacingMath`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/anomalyDetection/adPacingMath.ts
//
// Pure pace/period math for ad-spend pacing. Mirrors the formulas used by the
// Ad Pacing Generator (server/utils/advisorGenerators.ts) so the figures shown
// in the recommendations UI and the anomaly/Slack surfaces match. Uses UTC date
// math against the supplied `now` — pacing is not sensitive to sub-day TZ skew,
// and this keeps the functions pure and testable.

export function periodOf(now: Date): string {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

export function dayOfMonth(now: Date): number {
  return now.getUTCDate()
}

export function daysInMonth(now: Date): number {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
}

export function periodProgress(now: Date): number {
  return dayOfMonth(now) / daysInMonth(now)
}

export function expectedToDate(budget: number, now: Date): number {
  return budget * periodProgress(now)
}

export function projectedMonthEnd(mtdSpend: number, now: Date): number {
  const d = dayOfMonth(now)
  return d > 0 ? mtdSpend * (daysInMonth(now) / d) : 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/server/utils/anomalyDetection/adPacingMath.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/anomalyDetection/adPacingMath.ts test/server/utils/anomalyDetection/adPacingMath.test.ts
git commit -m "feat(adspend): pure pace/period math for budget pacing"
```

---

### Task 1.2: Analyser scaffold + group builder + register + sharedData

**Files:**
- Create: `server/utils/anomalyDetection/analysers/adspendHealth.ts`
- Modify: `server/utils/anomalyDetection/index.ts:8` (import) and `:25` (ALL array)
- Modify: `server/utils/anomalyDetection/sharedData.ts:37-50` (mediaSpend query)
- Test: `test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts
import { describe, it, expect } from 'vitest'
import { adspendHealthAnalyser, buildGroups } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

const ctx = (mediaSpend: any[] | null, now = new Date('2026-04-20T00:00:00Z')) => ({
  tenantId: 'tenant-A',
  data: {
    pnl: null, expenses: null, bankMonitoring: null, cashForecast: null,
    aging: null, budgetVariance: null,
    mediaSpend, clientRevenue: null, invoiceLines: null, ga4Channel: null,
  },
  now,
})

// Helper: a campaign-month with `days` daily rows of `daily` spend each.
function campaignRows(opts: {
  msId: string; client?: string; platform?: string; budget: number; period?: string
  status?: string | null; syncedAt?: string | null; daily: number; days: number; conversions?: number
}) {
  const rows: any[] = []
  const period = opts.period ?? '2026-04'
  for (let d = 0; d < opts.days; d++) {
    rows.push({
      client_id: opts.msId, client_name: opts.client ?? 'Acme',
      platform: opts.platform ?? 'google_ads',
      spend_date: `${period}-${String(d + 1).padStart(2, '0')}`,
      spend: opts.daily,
      media_spend_id: opts.msId,
      budget_allocated: opts.budget, period,
      campaign_status: opts.status ?? 'ACTIVE',
      synced_at: opts.syncedAt ?? '2026-04-20T00:00:00Z',
      conversions: opts.conversions ?? 5,
    })
  }
  return rows
}

describe('adspendHealthAnalyser — scaffold', () => {
  it('returns empty for null/empty input', async () => {
    expect(await adspendHealthAnalyser(ctx(null))).toHaveLength(0)
    expect(await adspendHealthAnalyser(ctx([]))).toHaveLength(0)
  })

  it('buildGroups groups daily rows by media_spend_id and sums spend', () => {
    const rows = campaignRows({ msId: 'm1', budget: 3000, daily: 100, days: 10 })
    const groups = buildGroups(rows)
    expect(groups.size).toBe(1)
    const g = groups.get('m1')!
    expect(g.budget).toBe(3000)
    expect(g.days).toHaveLength(10)
    expect(g.days.reduce((s, d) => s + d.spend, 0)).toBe(1000)
  })
})

export { campaignRows, ctx }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`
Expected: FAIL — cannot find module `adspendHealth`.

- [ ] **Step 3: Write the scaffold implementation**

```ts
// server/utils/anomalyDetection/analysers/adspendHealth.ts
//
// Pacing & delivery-health detectors over media_spend + daily_spend. Separate
// from adspend.ts (which detects spend SPIKES). Each detector is a pure
// function exported for unit testing; the analyser composes them. All emit
// type 'adspend' with month-level fingerprints so re-detection updates one row
// per campaign per month.
import { buildFingerprint } from '../fingerprints'
import type { Analyser, DetectedAnomaly } from '../types'

export interface DailyPoint { date: string; spend: number; conversions: number }
export interface Group {
  mediaSpendId: string
  clientId: string
  clientName: string
  platform: string
  period: string
  budget: number
  campaignStatus: string | null
  syncedAt: string | null
  days: DailyPoint[]
}

interface HealthRow {
  client_id: string
  client_name: string | null
  platform: string
  spend_date: string
  spend: number | string
  media_spend_id: string
  budget_allocated: number | string
  period: string
  campaign_status: string | null
  synced_at: string | null
  conversions: number | string | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const round = (n: number) => Math.round(n).toLocaleString('en-US')

export function buildGroups(rows: HealthRow[]): Map<string, Group> {
  const groups = new Map<string, Group>()
  for (const r of rows) {
    if (!r.media_spend_id) continue
    let g = groups.get(r.media_spend_id)
    if (!g) {
      g = {
        mediaSpendId: r.media_spend_id,
        clientId: r.client_id,
        clientName: r.client_name ?? '(unknown client)',
        platform: r.platform,
        period: r.period,
        budget: num(r.budget_allocated),
        campaignStatus: r.campaign_status,
        syncedAt: r.synced_at,
        days: [],
      }
      groups.set(r.media_spend_id, g)
    }
    g.days.push({ date: r.spend_date, spend: num(r.spend), conversions: num(r.conversions) })
  }
  return groups
}

export const adspendHealthAnalyser: Analyser = async (ctx) => {
  const rows = ctx.data.mediaSpend as HealthRow[] | null
  if (!rows || rows.length === 0) return []
  const groups = buildGroups(rows)
  const out: DetectedAnomaly[] = []
  // detectors added in subsequent tasks
  return out
}

// Shared helpers for detectors (exported for reuse within this module).
export const _internal = { num, round }
```

- [ ] **Step 4: Register the analyser**

In `server/utils/anomalyDetection/index.ts`, add the import after line 11 and add to the `ALL` array:

```ts
import { adspendHealthAnalyser } from './analysers/adspendHealth'
```

```ts
const ALL = [
  profitabilityAnalyser,
  revenueAnalyser,
  expensesAnalyser,
  cashflowAnalyser,
  receivablesAnalyser,
  budgetAnalyser,
  adspendAnalyser,
  adspendHealthAnalyser,
  clientsAnalyser,
  transactionsAnalyser,
  ga4Analyser,
]
```

- [ ] **Step 5: Extend the sharedData query**

In `server/utils/anomalyDetection/sharedData.ts`, replace the `mediaSpend` SELECT (lines 37-50) with:

```ts
    mediaSpend = await queryRows(`
      SELECT
        ms.client_id::text AS client_id,
        ac.name AS client_name,
        ms.platform,
        ds.spend_date::text AS spend_date,
        ds.spend::numeric AS spend,
        ms.id::text AS media_spend_id,
        ms.budget_allocated::numeric AS budget_allocated,
        ms.period,
        ms.campaign_status,
        ms.synced_at,
        ds.conversions::numeric AS conversions
      FROM daily_spend ds
      JOIN media_spend ms ON ds.media_spend_id = ms.id
      LEFT JOIN agency_clients ac ON ms.client_id = ac.id
      WHERE ds.spend_date >= CURRENT_DATE - INTERVAL '31 days'
        AND ms.client_id IS NOT NULL
      ORDER BY ds.spend_date DESC
    `)
```

(The existing `adspend.ts` spike analyser reads only `client_id`/`client_name`/`platform`/`spend_date`/`spend`, so the added columns are backward-compatible.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/utils/anomalyDetection/analysers/adspendHealth.ts server/utils/anomalyDetection/index.ts server/utils/anomalyDetection/sharedData.ts test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts
git commit -m "feat(adspend): adspendHealth analyser scaffold + register + sharedData fields"
```

---

### Task 1.3: `detectUnderspend` (budget-pace)

**Files:**
- Modify: `server/utils/anomalyDetection/analysers/adspendHealth.ts`
- Test: `test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`

- [ ] **Step 1: Write the failing test (append to the describe block)**

```ts
import { detectUnderspend } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

describe('detectUnderspend', () => {
  const now = new Date('2026-04-20T00:00:00Z') // day 20 of 30 → expected = budget × 0.667

  const group = (budget: number, dailySpend: number) => {
    const days = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: dailySpend, conversions: 1,
    }))
    return {
      mediaSpendId: 'm1', clientId: 'c1', clientName: 'Mornington Nissan',
      platform: 'google_ads', period: '2026-04', budget,
      campaignStatus: 'ACTIVE', syncedAt: '2026-04-20T00:00:00Z', days,
    }
  }

  it('flags warning when MTD < 50% of expected pace', () => {
    // budget 3000 → expected@day20 = 2000. Spend 40/day × 20 = 800 → ratio 0.4
    const a = detectUnderspend(group(3000, 40), now)
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:underspend-m1-2026-04')
  })

  it('escalates to critical when MTD < 25% of expected pace', () => {
    // expected 2000; spend 20/day × 20 = 400 → ratio 0.2
    const a = detectUnderspend(group(3000, 20), now)
    expect(a!.severity).toBe('critical')
  })

  it('does not fire when on pace', () => {
    // spend 100/day × 20 = 2000 = expected → ratio 1.0
    expect(detectUnderspend(group(3000, 100), now)).toBeNull()
  })

  it('does not fire before day 7 or with no budget', () => {
    expect(detectUnderspend(group(3000, 0), new Date('2026-04-05T00:00:00Z'))).toBeNull()
    expect(detectUnderspend(group(0, 0), now)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`
Expected: FAIL — `detectUnderspend` is not exported.

- [ ] **Step 3: Add the detector (after `buildGroups`, before the analyser)**

```ts
import { periodOf, dayOfMonth, expectedToDate, projectedMonthEnd } from '../adPacingMath'

const mtd = (g: Group): number => g.days.reduce((s, d) => s + d.spend, 0)

export function detectUnderspend(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  if (dayOfMonth(now) < 7) return null

  const spent = mtd(g)
  const expected = expectedToDate(g.budget, now)
  if (expected <= 0) return null

  const ratio = spent / expected
  if (ratio >= 0.5) return null

  const severity = ratio < 0.25 ? 'critical' : 'warning'
  const shortfall = expected - spent
  const projected = projectedMonthEnd(spent, now)

  return {
    fingerprint: buildFingerprint('adspend', `underspend-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) underspending`,
    description: `Spent $${round(spent)} of an expected $${round(expected)} by day ${dayOfMonth(now)} — $${round(shortfall)} behind pace (tracking to $${round(projected)} of a $${round(g.budget)} budget).`,
    metric: { label: 'Month-to-date spend', value: spent, format: 'currency' },
    comparison: { label: 'Expected to date', value: expected, format: 'currency', trend: 'down' },
    context: { client: g.clientName, vendor: g.platform, period: g.period },
    recommendation: 'Check delivery/targeting or reallocate budget — at this pace the client is under-served and budget will go unspent.',
    tags: ['ad spend', 'underspend', 'pacing', g.platform],
    dataSources: ['Daily Spend'],
  }
}
```

- [ ] **Step 4: Wire into the analyser loop**

In `adspendHealthAnalyser`, replace the `// detectors added` comment with:

```ts
  for (const g of groups.values()) {
    const u = detectUnderspend(g, ctx.now); if (u) out.push(u)
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/anomalyDetection/analysers/adspendHealth.ts test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts
git commit -m "feat(adspend): detectUnderspend budget-pace detector"
```

---

### Task 1.4: `detectStopped` (drop-off, budget=0 fallback)

**Files:**
- Modify: `server/utils/anomalyDetection/analysers/adspendHealth.ts`
- Test: same test file

- [ ] **Step 1: Write the failing test**

```ts
import { detectStopped } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

describe('detectStopped', () => {
  const now = new Date('2026-04-20T00:00:00Z')
  const mk = (baselineDaily: number, last3Daily: number) => {
    const days: any[] = []
    for (let i = 1; i <= 14; i++) days.push({ date: `2026-04-${String(i).padStart(2, '0')}`, spend: baselineDaily, conversions: 1 })
    for (let i = 15; i <= 17; i++) { days[i - 1] = undefined as any }
    const built = days.filter(Boolean)
    for (let i = 18; i <= 20; i++) built.push({ date: `2026-04-${i}`, spend: last3Daily, conversions: 0 })
    return {
      mediaSpendId: 'm0', clientId: 'c1', clientName: 'Acme', platform: 'meta',
      period: '2026-04', budget: 0, campaignStatus: null, syncedAt: '2026-04-20T00:00:00Z', days: built,
    }
  }

  it('fires critical when a steady campaign goes dark (budget unset)', () => {
    const a = detectStopped(mk(50, 0), now)
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('critical')
    expect(a!.fingerprint).toBe('adspend:stopped-m0-2026-04')
  })

  it('does not fire when still spending near baseline', () => {
    expect(detectStopped(mk(50, 45), now)).toBeNull()
  })

  it('does not fire when a budget is set (underspend handles that)', () => {
    const g = mk(50, 0); g.budget = 3000
    expect(detectStopped(g, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`
Expected: FAIL — `detectStopped` not exported.

- [ ] **Step 3: Add the detector**

```ts
export function detectStopped(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget > 0) return null // underspend covers budgeted campaigns

  const sorted = [...g.days].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 6) return null

  const last3 = sorted.slice(-3)
  const baseline = sorted.slice(0, -3)
  const baselineDaily = baseline.reduce((s, d) => s + d.spend, 0) / baseline.length
  if (baselineDaily <= 5) return null

  const recent = last3.reduce((s, d) => s + d.spend, 0)
  if (recent >= baselineDaily * 3 * 0.1) return null

  return {
    fingerprint: buildFingerprint('adspend', `stopped-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'critical',
    title: `${g.clientName} (${g.platform}) stopped spending`,
    description: `Was averaging $${round(baselineDaily)}/day, then spent only $${round(recent)} over the last 3 days — effectively dark.`,
    metric: { label: 'Last 3 days spend', value: recent, format: 'currency' },
    comparison: { label: 'Baseline daily', value: baselineDaily, format: 'currency', trend: 'down' },
    context: { client: g.clientName, vendor: g.platform, period: g.period },
    recommendation: 'Confirm the campaign is still live and delivering — spend has collapsed versus its recent baseline.',
    tags: ['ad spend', 'stopped', g.platform],
    dataSources: ['Daily Spend'],
  }
}
```

- [ ] **Step 4: Wire into the loop**

Add inside the `for (const g of groups.values())` loop:

```ts
    const s = detectStopped(g, ctx.now); if (s) out.push(s)
```

- [ ] **Step 5: Run tests; Step 6: Commit**

Run: `pnpm test -- test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts` → PASS

```bash
git add server/utils/anomalyDetection/analysers/adspendHealth.ts test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts
git commit -m "feat(adspend): detectStopped drop-off detector"
```

---

### Task 1.5: `detectPausedWithBudget`

**Files:** modify `adspendHealth.ts`; same test file.

- [ ] **Step 1: Write the failing test**

```ts
import { detectPausedWithBudget } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

describe('detectPausedWithBudget', () => {
  const now = new Date('2026-04-20T00:00:00Z')
  const base = (status: string | null, daily: number) => ({
    mediaSpendId: 'mp', clientId: 'c1', clientName: 'McRae LDV', platform: 'google_ads',
    period: '2026-04', budget: 1500, campaignStatus: status, syncedAt: '2026-04-20T00:00:00Z',
    days: Array.from({ length: 20 }, (_, i) => ({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: daily, conversions: 1 })),
  })

  it('fires when paused/removed with budget allocated', () => {
    const a = detectPausedWithBudget(base('PAUSED', 50), now)
    expect(a).not.toBeNull()
    expect(a!.fingerprint).toBe('adspend:paused-mp-2026-04')
  })

  it('escalates to critical when also underspending', () => {
    const a = detectPausedWithBudget(base('REMOVED', 5), now) // way under pace
    expect(a!.severity).toBe('critical')
  })

  it('does not fire for active campaigns or zero budget', () => {
    expect(detectPausedWithBudget(base('ACTIVE', 50), now)).toBeNull()
    const z = base('PAUSED', 50); z.budget = 0
    expect(detectPausedWithBudget(z, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Add detector:**

```ts
const PAUSED_STATUSES = ['paused', 'removed', 'disabled', 'archived']

export function detectPausedWithBudget(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  const status = (g.campaignStatus ?? '').toLowerCase()
  if (!PAUSED_STATUSES.includes(status)) return null

  const spent = mtd(g)
  const expected = expectedToDate(g.budget, now)
  const ratio = expected > 0 ? spent / expected : 1
  const severity = dayOfMonth(now) >= 7 && ratio < 0.5 ? 'critical' : 'warning'

  return {
    fingerprint: buildFingerprint('adspend', `paused-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) paused with budget allocated`,
    description: `Campaign status is "${g.campaignStatus}" but $${round(g.budget)} is allocated this month — it isn't running.`,
    metric: { label: 'Allocated budget', value: g.budget, format: 'currency' },
    context: { client: g.clientName, vendor: g.platform, period: g.period },
    recommendation: 'Re-enable the campaign or reallocate the budget — an allocated-but-paused campaign delivers nothing for the client.',
    tags: ['ad spend', 'paused', g.platform],
    dataSources: ['Daily Spend'],
  }
}
```

- [ ] **Step 4: Wire into loop:** `const p = detectPausedWithBudget(g, ctx.now); if (p) out.push(p)`
- [ ] **Step 5: Run → PASS. Step 6: Commit**

```bash
git commit -am "feat(adspend): detectPausedWithBudget detector"
```

---

### Task 1.6: `detectOverspend`

**Files:** modify `adspendHealth.ts`; same test file.

- [ ] **Step 1: Write the failing test**

```ts
import { detectOverspend } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

describe('detectOverspend', () => {
  const now = new Date('2026-04-20T00:00:00Z') // day 20/30
  const g = (budget: number, daily: number) => ({
    mediaSpendId: 'mo', clientId: 'c1', clientName: 'McRae Nissan', platform: 'google_ads',
    period: '2026-04', budget, campaignStatus: 'ACTIVE', syncedAt: '2026-04-20T00:00:00Z',
    days: Array.from({ length: 20 }, (_, i) => ({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: daily, conversions: 1 })),
  })

  it('warns when projected > 115% of budget', () => {
    // daily 60 × 20 = 1200 MTD; projected = 1200×30/20 = 1800; budget 1500 → 1.2×
    const a = detectOverspend(g(1500, 60), now)
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:overspend-mo-2026-04')
  })

  it('escalates to critical when projected > 130% of budget', () => {
    // daily 80 × 20 = 1600; projected 2400; budget 1500 → 1.6×
    expect(detectOverspend(g(1500, 80), now)!.severity).toBe('critical')
  })

  it('does not fire when on/under pace', () => {
    expect(detectOverspend(g(1500, 50), now)).toBeNull() // projected 1500 = budget
  })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Add detector:**

```ts
export function detectOverspend(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  if (dayOfMonth(now) < 7) return null

  const spent = mtd(g)
  const projected = projectedMonthEnd(spent, now)
  const ratio = projected / g.budget
  if (ratio <= 1.15) return null

  const severity = ratio > 1.3 ? 'critical' : 'warning'
  return {
    fingerprint: buildFingerprint('adspend', `overspend-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) overspending`,
    description: `Tracking to $${round(projected)} against a $${round(g.budget)} budget (${Math.round((ratio - 1) * 100)}% over) at the current pace.`,
    metric: { label: 'Projected month-end', value: projected, format: 'currency' },
    comparison: { label: 'Budget', value: g.budget, format: 'currency', trend: 'up' },
    context: { client: g.clientName, vendor: g.platform, period: g.period },
    recommendation: 'Throttle or cap the campaign to land on budget, or confirm the overspend is approved.',
    tags: ['ad spend', 'overspend', 'pacing', g.platform],
    dataSources: ['Daily Spend'],
  }
}
```

- [ ] **Step 4: Wire into loop:** `const o = detectOverspend(g, ctx.now); if (o) out.push(o)`
- [ ] **Step 5: Run → PASS. Step 6: Commit** `git commit -am "feat(adspend): detectOverspend detector"`

---

### Task 1.7: `detectStaleSync`

**Files:** modify `adspendHealth.ts`; same test file.

- [ ] **Step 1: Write the failing test**

```ts
import { detectStaleSync } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

describe('detectStaleSync', () => {
  const now = new Date('2026-04-20T12:00:00Z')
  const g = (syncedAt: string | null) => ({
    mediaSpendId: 'ms', clientId: 'c1', clientName: 'Acme', platform: 'meta',
    period: '2026-04', budget: 1000, campaignStatus: 'ACTIVE', syncedAt,
    days: [{ date: '2026-04-18', spend: 30, conversions: 1 }],
  })

  it('warns at >48h stale', () => {
    const a = detectStaleSync(g('2026-04-18T00:00:00Z'), now) // ~60h
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:stale-ms-2026-04')
  })

  it('critical at >72h or never-synced', () => {
    expect(detectStaleSync(g('2026-04-16T00:00:00Z'), now)!.severity).toBe('critical') // ~108h
    expect(detectStaleSync(g(null), now)!.severity).toBe('critical')
  })

  it('does not fire when fresh', () => {
    expect(detectStaleSync(g('2026-04-20T00:00:00Z'), now)).toBeNull() // 12h
  })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Add detector:**

```ts
export function detectStaleSync(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null

  const synced = g.syncedAt ? new Date(g.syncedAt) : null
  const ageH = synced ? (now.getTime() - synced.getTime()) / 3_600_000 : Infinity
  if (ageH < 48) return null

  const severity = ageH >= 72 ? 'critical' : 'warning'
  const ageLabel = synced ? `${Math.round(ageH)}h ago` : 'never'
  return {
    fingerprint: buildFingerprint('adspend', `stale-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity,
    title: `${g.clientName} (${g.platform}) spend data is stale`,
    description: `Last synced ${ageLabel} — pacing for this campaign can't be trusted until sync resumes. A broken sync can hide a stopped or underspending campaign.`,
    context: { client: g.clientName, vendor: g.platform, period: g.period },
    recommendation: 'Re-run the spend sync for this account and check the platform connection/credentials.',
    tags: ['ad spend', 'stale-sync', g.platform],
    dataSources: ['Daily Spend'],
  }
}
```

- [ ] **Step 4: Wire into loop:** `const st = detectStaleSync(g, ctx.now); if (st) out.push(st)`
- [ ] **Step 5: Run → PASS. Step 6: Commit** `git commit -am "feat(adspend): detectStaleSync detector"`

---

### Task 1.8: `detectZeroConversion`

**Files:** modify `adspendHealth.ts`; same test file.

- [ ] **Step 1: Write the failing test**

```ts
import { detectZeroConversion } from '~~/server/utils/anomalyDetection/analysers/adspendHealth'

describe('detectZeroConversion', () => {
  const now = new Date('2026-04-20T00:00:00Z') // day 20 (≥10)
  const g = (daily: number, conv: number) => ({
    mediaSpendId: 'mz', clientId: 'c1', clientName: 'Acme', platform: 'meta',
    period: '2026-04', budget: 2000, campaignStatus: 'ACTIVE', syncedAt: '2026-04-20T00:00:00Z',
    days: Array.from({ length: 20 }, (_, i) => ({ date: `2026-04-${String(i + 1).padStart(2, '0')}`, spend: daily, conversions: conv })),
  })

  it('warns when spending > $500 with zero conversions', () => {
    const a = detectZeroConversion(g(40, 0), now) // 800 spend, 0 conv
    expect(a!.severity).toBe('warning')
    expect(a!.fingerprint).toBe('adspend:zeroconv-mz-2026-04')
  })

  it('does not fire with conversions or low spend', () => {
    expect(detectZeroConversion(g(40, 2), now)).toBeNull()
    expect(detectZeroConversion(g(10, 0), now)).toBeNull() // 200 spend < 500
  })

  it('does not fire before day 10', () => {
    expect(detectZeroConversion(g(40, 0), new Date('2026-04-08T00:00:00Z'))).toBeNull()
  })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Add detector:**

```ts
export function detectZeroConversion(g: Group, now: Date): DetectedAnomaly | null {
  if (g.period !== periodOf(now)) return null
  if (g.budget <= 0) return null
  if (dayOfMonth(now) < 10) return null

  const spent = g.days.reduce((s, d) => s + d.spend, 0)
  const conv = g.days.reduce((s, d) => s + d.conversions, 0)
  if (spent <= 500) return null
  if (conv > 0) return null

  return {
    fingerprint: buildFingerprint('adspend', `zeroconv-${g.mediaSpendId}-${g.period}`),
    type: 'adspend',
    severity: 'warning',
    title: `${g.clientName} (${g.platform}) spending with zero conversions`,
    description: `$${round(spent)} spent this month with 0 recorded conversions — check conversion tracking or campaign setup.`,
    metric: { label: 'Month-to-date spend', value: spent, format: 'currency' },
    context: { client: g.clientName, vendor: g.platform, period: g.period },
    recommendation: 'Verify conversion tracking is firing and the campaign objective is correct before more budget is wasted.',
    tags: ['ad spend', 'zero-conversion', g.platform],
    dataSources: ['Daily Spend'],
  }
}
```

- [ ] **Step 4: Wire into loop:** `const z = detectZeroConversion(g, ctx.now); if (z) out.push(z)`
- [ ] **Step 5: Run full file → PASS. Step 6: Commit** `git commit -am "feat(adspend): detectZeroConversion detector"`

---

### Task 1.9: Analyser integration test (mutual exclusivity + multi-signal)

**Files:** same test file.

- [ ] **Step 1: Write the test**

```ts
describe('adspendHealthAnalyser — integration', () => {
  it('does not emit both underspend and stopped for the same campaign', async () => {
    const rows = campaignRows({ msId: 'm1', budget: 3000, daily: 5, days: 20 }) // budgeted + underspending
    const out = await adspendHealthAnalyser(ctx(rows))
    const fps = out.map(a => a.fingerprint)
    expect(fps).toContain('adspend:underspend-m1-2026-04')
    expect(fps).not.toContain('adspend:stopped-m1-2026-04')
  })

  it('emits paused + underspend together for a paused, underspending campaign', async () => {
    const rows = campaignRows({ msId: 'm2', budget: 3000, daily: 5, days: 20, status: 'PAUSED' })
    const out = await adspendHealthAnalyser(ctx(rows))
    const fps = out.map(a => a.fingerprint)
    expect(fps).toContain('adspend:paused-m2-2026-04')
    expect(fps).toContain('adspend:underspend-m2-2026-04')
  })
})
```

- [ ] **Step 2: Run → PASS** (no code change needed; verifies composition).
- [ ] **Step 3: Run the whole anomaly suite to confirm no regression**

Run: `pnpm test -- test/server/utils/anomalyDetection/`
Expected: PASS (existing adspend/budget/etc. tests still green).

- [ ] **Step 4: Commit** `git commit -am "test(adspend): adspendHealth integration coverage"`

---

## Phase 2 — Slack layer

### Task 2.1: Budget-Slack config store

**Files:**
- Create: `server/utils/budgetSlackConfig.ts`

- [ ] **Step 1: Write the implementation** (thin DB wrapper — covered by endpoint tests later; no separate unit test)

```ts
// server/utils/budgetSlackConfig.ts
import { queryOne, execute } from '~~/server/utils/db'

export interface BudgetSlackConfig {
  webhook_url: string | null
  channel: string | null
  digest_enabled: boolean
  realtime_enabled: boolean
  digest_hour: number
  create_tasks: boolean
  task_assignee_id: string | null
}

export const DEFAULT_BUDGET_SLACK_CONFIG: BudgetSlackConfig = {
  webhook_url: null,
  channel: null,
  digest_enabled: true,
  realtime_enabled: true,
  digest_hour: 9,
  create_tasks: false,
  task_assignee_id: null,
}

export async function getBudgetSlackConfig(tenantId: string): Promise<BudgetSlackConfig> {
  const row = await queryOne<{ value: Partial<BudgetSlackConfig> }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'budget_slack'`,
    [tenantId],
  )
  return { ...DEFAULT_BUDGET_SLACK_CONFIG, ...(row?.value ?? {}) }
}

export async function saveBudgetSlackConfig(
  tenantId: string,
  cfg: BudgetSlackConfig,
  updatedBy: string | null,
): Promise<void> {
  await execute(
    `INSERT INTO agency_settings (tenant_id, key, value, updated_by)
     VALUES ($1, 'budget_slack', $2, $3)
     ON CONFLICT (tenant_id, key)
     DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
    [tenantId, JSON.stringify(cfg), updatedBy],
  )
}
```

- [ ] **Step 2: Commit** `git add server/utils/budgetSlackConfig.ts && git commit -m "feat(budget-slack): agency_settings-backed config store"`

---

### Task 2.2: Slack block builders + `postSlack` + `validateWebhook`

**Files:**
- Create: `server/utils/anomalyDetection/slackBudget.ts`
- Test: `test/server/utils/anomalyDetection/slackBudget.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/anomalyDetection/slackBudget.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  validateWebhook, buildDigestBlocks, buildCriticalBlocks, postSlack,
} from '~~/server/utils/anomalyDetection/slackBudget'

const item = (over: Partial<any> = {}) => ({
  type: 'adspend', severity: 'critical', title: 'Mornington Nissan (google_ads) underspending',
  description: '$312 of an expected $2,750 — $2,438 behind pace.', client: 'Mornington Nissan', ...over,
})

describe('validateWebhook', () => {
  it('accepts only Slack incoming webhooks', () => {
    expect(validateWebhook('https://hooks.slack.com/services/T/B/x')).toBe(true)
    expect(validateWebhook('https://evil.example.com/x')).toBe(false)
    expect(validateWebhook('http://hooks.slack.com/services/x')).toBe(false)
  })
})

describe('buildDigestBlocks', () => {
  it('renders an all-clear block when there are no anomalies', () => {
    const blocks = buildDigestBlocks([], { date: '2 Jun 2026', dashboardUrl: 'https://x/agency/anomalies' })
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text!.text).toContain('No pacing issues')
  })

  it('renders summary counts + items + footer when anomalies exist', () => {
    const blocks = buildDigestBlocks([item(), item({ severity: 'warning', client: 'McRae LDV' })], {
      date: '2 Jun 2026', dashboardUrl: 'https://x/agency/anomalies',
    })
    const joined = blocks.map(b => b.text!.text).join('\n')
    expect(joined).toContain('1 critical')
    expect(joined).toContain('1 warning')
    expect(joined).toContain('2 client')
    expect(joined).toContain('View all')
  })
})

describe('buildCriticalBlocks', () => {
  it('renders one block per item when 3 or fewer', () => {
    expect(buildCriticalBlocks([item(), item()])).toHaveLength(2)
  })
  it('collapses to a single rollup when more than 3', () => {
    const blocks = buildCriticalBlocks([item(), item(), item(), item()])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text!.text).toContain('4 new critical')
  })
  it('returns empty for no items', () => {
    expect(buildCriticalBlocks([])).toHaveLength(0)
  })
})

describe('postSlack', () => {
  it('POSTs blocks and returns ok on 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const res = await postSlack('https://hooks.slack.com/services/x', [{ type: 'section', text: { type: 'mrkdwn', text: 'hi' } }], '#budget', fetchImpl as any)
    expect(res.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as any).body)
    expect(body.channel).toBe('#budget')
    expect(body.blocks).toHaveLength(1)
  })
  it('returns an error on non-200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    const res = await postSlack('https://hooks.slack.com/services/x', [], undefined, fetchImpl as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('500')
  })
  it('returns an error on network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'))
    const res = await postSlack('https://hooks.slack.com/services/x', [], undefined, fetchImpl as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('boom')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/anomalyDetection/slackBudget.ts
//
// Pure Slack-block builders + a small webhook poster for the budget review.
// Mirrors the leads Slack adapter (server/utils/leads/destinations/slack.ts):
// blocks payload, https://hooks.slack.com/services/ only, 30s timeout. fetch is
// injectable for testing.

export interface SlackBlock {
  type: string
  text?: { type: string; text: string }
}

export interface BudgetSlackItem {
  type: string
  severity: string
  title: string
  description: string
  client?: string | null
}

export function validateWebhook(url: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\//.test(url)
}

const icon = (sev: string) => (sev === 'critical' ? '🔴' : sev === 'warning' ? '🟠' : 'ℹ️')

export function buildDigestBlocks(
  items: BudgetSlackItem[],
  opts: { date: string; dashboardUrl: string },
): SlackBlock[] {
  if (items.length === 0) {
    return [{
      type: 'section',
      text: { type: 'mrkdwn', text: `*🗓️ Daily Budget Review — ${opts.date}*\n✅ No pacing issues detected across active campaigns.` },
    }]
  }
  const nCrit = items.filter(i => i.severity === 'critical').length
  const nWarn = items.filter(i => i.severity === 'warning').length
  const clients = new Set(items.map(i => i.client).filter(Boolean)).size
  const header: SlackBlock = {
    type: 'section',
    text: { type: 'mrkdwn', text: `*🗓️ Daily Budget Review — ${opts.date}*\n${nCrit} critical · ${nWarn} warning across ${clients} client(s)` },
  }
  const lines = items.slice(0, 10).map(i => `• ${icon(i.severity)} ${i.title} — ${i.description}`).join('\n')
  const body: SlackBlock = { type: 'section', text: { type: 'mrkdwn', text: lines } }
  const footer: SlackBlock = { type: 'section', text: { type: 'mrkdwn', text: `<${opts.dashboardUrl}|View all budget issues →>` } }
  return [header, body, footer]
}

export function buildCriticalBlocks(items: BudgetSlackItem[]): SlackBlock[] {
  if (items.length === 0) return []
  if (items.length > 3) {
    return [{
      type: 'section',
      text: { type: 'mrkdwn', text: `*⚠️ ${items.length} new critical budget issues detected* — see today's digest or the dashboard.` },
    }]
  }
  return items.map(i => ({
    type: 'section',
    text: { type: 'mrkdwn', text: `*${icon(i.severity)} ${i.title}*\n${i.description}` },
  }))
}

export async function postSlack(
  webhookUrl: string,
  blocks: SlackBlock[],
  channel?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const resp = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, channel }),
      signal: ctrl.signal,
    })
    if (!resp.ok) return { ok: false, error: `http_${resp.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: `network_error: ${e?.message ?? String(e)}` }
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit**

```bash
git add server/utils/anomalyDetection/slackBudget.ts test/server/utils/anomalyDetection/slackBudget.test.ts
git commit -m "feat(budget-slack): pure block builders + postSlack + webhook validation"
```

---

### Task 2.3: Real-time critical dispatch + reconcile hook

**Files:**
- Create: `server/utils/anomalyDetection/budgetSlackDispatch.ts`
- Modify: `server/utils/anomalyDetection/reconcile.ts:2` (import), `:144-152` (Pass 3)

- [ ] **Step 1: Write the dispatch util**

```ts
// server/utils/anomalyDetection/budgetSlackDispatch.ts
import { queryRows } from '~~/server/utils/db'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'
import { buildCriticalBlocks, postSlack, validateWebhook, type BudgetSlackItem } from './slackBudget'

interface Row { type: string; severity: string; title: string; description: string; context: { client?: string } | null }

/**
 * Post newly-inserted CRITICAL budget anomalies to Slack in real time.
 * Flood-guarded (rollup when > 3) so the first detection run after deploy
 * doesn't spray dozens of pings. No-ops unless realtime is enabled and a valid
 * webhook is configured.
 */
export async function dispatchCriticalBudgetSlack(tenantId: string, anomalyIds: string[]): Promise<void> {
  if (anomalyIds.length === 0) return
  const cfg = await getBudgetSlackConfig(tenantId)
  if (!cfg.realtime_enabled || !cfg.webhook_url || !validateWebhook(cfg.webhook_url)) return

  const rows = await queryRows<Row>(
    `SELECT type, severity, title, description, context
     FROM anomalies
     WHERE id = ANY($1) AND type IN ('adspend','budget')`,
    [anomalyIds],
  )
  if (rows.length === 0) return

  const items: BudgetSlackItem[] = rows.map(r => ({
    type: r.type, severity: r.severity, title: r.title, description: r.description, client: r.context?.client ?? null,
  }))
  await postSlack(cfg.webhook_url, buildCriticalBlocks(items), cfg.channel ?? undefined)
}
```

- [ ] **Step 2: Hook into reconcile Pass 3**

In `server/utils/anomalyDetection/reconcile.ts`, add the import near line 2:

```ts
import { dispatchCriticalBudgetSlack } from './budgetSlackDispatch'
```

Then replace the Pass 3 block (lines 143-152) with:

```ts
  // Pass 3 (post-transaction): queue notifications for newly-inserted critical rows.
  for (const id of newlyInsertedCriticalIds) {
    try {
      await queueAnomalyNotification(id)
      result.notifications_queued++
    } catch (err) {
      console.error('[anomalies] notification queue failed for', id, err)
      // Best-effort: row already persisted with notification_sent_at.
    }
  }

  // Pass 3b: real-time Slack for newly-inserted critical budget anomalies.
  try {
    await dispatchCriticalBudgetSlack(tenantId, newlyInsertedCriticalIds)
  } catch (err) {
    console.error('[anomalies] budget Slack dispatch failed', err)
  }
```

- [ ] **Step 3: Verify the existing reconcile test still passes**

Run: `pnpm test -- test/server/utils/anomalyDetection/reconcile.test.ts`
Expected: PASS (dispatch no-ops without config — and DB calls are mocked in that suite; if the suite hits real `getBudgetSlackConfig`, it returns defaults with `webhook_url: null` → early return).

- [ ] **Step 4: Commit**

```bash
git add server/utils/anomalyDetection/budgetSlackDispatch.ts server/utils/anomalyDetection/reconcile.ts
git commit -m "feat(budget-slack): real-time critical dispatch via reconcile hook"
```

---

### Task 2.4: 9am digest cron endpoint

**Files:**
- Create: `server/api/cron/budget-slack-digest.post.ts`

- [ ] **Step 1: Write the implementation** (mirrors `anomaly-detection.post.ts` auth + tz gate)

```ts
// server/api/cron/budget-slack-digest.post.ts
//
// Hourly cron entrypoint; self-gates to the tenant-local digest hour (default 9).
// Posts a Slack budget review of active ad-spend/budget anomalies, or an
// all-clear message when there are none. Auth: x-cron-secret vs CRON_SECRET.
import { defineEventHandler, getHeader, getQuery, createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'
import { buildDigestBlocks, postSlack, validateWebhook, type BudgetSlackItem } from '~~/server/utils/anomalyDetection/slackBudget'

const APP_BASE = process.env.APP_BASE_URL || 'https://agency-dashboard-6cm.pages.dev'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const force = (() => { const q = getQuery(event); return q.force === 'true' || q.force === '1' })()

  const conn = await queryOne<{ tenant_id: string; timezone: string }>(
    `SELECT tenant_id, timezone FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`,
  )
  if (!conn) return { ok: true, skipped: 'no Xero connection' }

  const cfg = await getBudgetSlackConfig(conn.tenant_id)
  if (!cfg.digest_enabled || !cfg.webhook_url || !validateWebhook(cfg.webhook_url)) {
    return { ok: true, skipped: 'digest disabled or webhook not configured' }
  }

  const tz = conn.timezone || 'Australia/Sydney'
  let localHour: number
  try {
    localHour = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
  } catch {
    localHour = new Date().getUTCHours()
  }
  if (!force && localHour !== cfg.digest_hour) {
    return { ok: true, skipped: `local hour=${localHour}, digest_hour=${cfg.digest_hour}` }
  }

  const rows = await queryRows<{ type: string; severity: string; title: string; description: string; context: { client?: string } | null }>(
    `SELECT type, severity, title, description, context
     FROM anomalies
     WHERE tenant_id = $1
       AND type IN ('adspend','budget')
       AND status NOT IN ('resolved','dismissed')
       AND (snoozed_until IS NULL OR snoozed_until < NOW())
     ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_detected_at DESC`,
    [conn.tenant_id],
  )
  const items: BudgetSlackItem[] = rows.map(r => ({
    type: r.type, severity: r.severity, title: r.title, description: r.description, client: r.context?.client ?? null,
  }))
  const date = new Date().toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
  const res = await postSlack(cfg.webhook_url, buildDigestBlocks(items, { date, dashboardUrl: `${APP_BASE}/agency/anomalies` }), cfg.channel ?? undefined)

  return { ok: res.ok, posted: items.length, error: res.error }
})
```

- [ ] **Step 2: Manual smoke (after deploy or locally with dev server)**

Run: `curl -s -X POST 'http://localhost:3000/api/cron/budget-slack-digest?force=true' | head`
Expected (no webhook configured): `{"ok":true,"skipped":"digest disabled or webhook not configured"}`

- [ ] **Step 3: Commit**

```bash
git add server/api/cron/budget-slack-digest.post.ts
git commit -m "feat(budget-slack): 9am digest cron endpoint"
```

---

### Task 2.5: Wire digest into the pages-cron worker

**Files:**
- Modify: `workers/pages-cron/src/index.ts:24`

- [ ] **Step 1: Add the endpoint to the hourly route**

Change line 24 to include the digest endpoint (the endpoint self-gates to the digest hour):

```ts
  '0 * * * *': ['/api/cron/anomaly-detection', '/api/cron/ga4-sync', '/api/cron/budget-slack-digest'],
```

- [ ] **Step 2: Commit**

```bash
git add workers/pages-cron/src/index.ts
git commit -m "feat(budget-slack): drive digest cron from pages-cron worker"
```

(Deploy of the worker is an ops step, not part of this plan: `cd workers/pages-cron && npx wrangler deploy`.)

---

### Task 2.6: Settings API (get/put/test)

**Files:**
- Create: `server/api/agency/settings/budget-slack.get.ts`
- Create: `server/api/agency/settings/budget-slack.put.ts`
- Create: `server/api/agency/settings/budget-slack/test.post.ts`

- [ ] **Step 1: GET endpoint**

```ts
// server/api/agency/settings/budget-slack.get.ts
import { defineEventHandler, createError } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  return await getBudgetSlackConfig(tenantId)
})
```

- [ ] **Step 2: PUT endpoint**

```ts
// server/api/agency/settings/budget-slack.put.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { saveBudgetSlackConfig, DEFAULT_BUDGET_SLACK_CONFIG } from '~~/server/utils/budgetSlackConfig'
import { validateWebhook } from '~~/server/utils/anomalyDetection/slackBudget'

const Body = z.object({
  webhook_url: z.string().url().nullable().optional(),
  channel: z.string().nullable().optional(),
  digest_enabled: z.boolean().optional(),
  realtime_enabled: z.boolean().optional(),
  digest_hour: z.number().int().min(0).max(23).optional(),
  create_tasks: z.boolean().optional(),
  task_assignee_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid settings' })
  const body = parsed.data

  if (body.webhook_url && !validateWebhook(body.webhook_url)) {
    throw createError({ statusCode: 400, statusMessage: 'webhook_url must be a Slack incoming webhook (https://hooks.slack.com/services/...)' })
  }

  const cfg = { ...DEFAULT_BUDGET_SLACK_CONFIG, ...body } as any
  await saveBudgetSlackConfig(tenantId, cfg, user.id)
  return { ok: true }
})
```

- [ ] **Step 3: Test endpoint**

```ts
// server/api/agency/settings/budget-slack/test.post.ts
import { defineEventHandler, createError } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'
import { postSlack, validateWebhook } from '~~/server/utils/anomalyDetection/slackBudget'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const cfg = await getBudgetSlackConfig(tenantId)
  if (!cfg.webhook_url || !validateWebhook(cfg.webhook_url)) {
    throw createError({ statusCode: 400, statusMessage: 'Save a valid Slack webhook first' })
  }
  const res = await postSlack(cfg.webhook_url, [{
    type: 'section',
    text: { type: 'mrkdwn', text: '*✅ XeroFlow budget review — test message*\nYour Slack budget alerts are configured correctly.' },
  }], cfg.channel ?? undefined)
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Slack post failed: ${res.error}` })
  return { ok: true }
})
```

- [ ] **Step 4: Smoke (dev, authenticated)**

Run: `curl -s -X PUT http://localhost:3000/api/agency/settings/budget-slack -H 'Content-Type: application/json' -d '{"webhook_url":"https://evil.com/x"}'`
Expected: 400 with the webhook validation message.

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/settings/budget-slack.get.ts server/api/agency/settings/budget-slack.put.ts server/api/agency/settings/budget-slack/test.post.ts
git commit -m "feat(budget-slack): settings get/put/test endpoints"
```

---

### Task 2.7: Settings UI tab

> **REQUIRED SUB-SKILL:** Before editing the form, invoke the `frontend-design` skill (per the project's mandatory form rule in CLAUDE.md) and apply its principles.

**Files:**
- Create: `app/components/settings/BudgetAlertsSettings.vue`
- Modify: `app/pages/agency/settings/index.vue` (add a `budget-alerts` tab)

- [ ] **Step 1: Build the settings component**

```vue
<!-- app/components/settings/BudgetAlertsSettings.vue -->
<script setup lang="ts">
const toast = useToast()

interface BudgetSlackConfig {
  webhook_url: string | null
  channel: string | null
  digest_enabled: boolean
  realtime_enabled: boolean
  digest_hour: number
  create_tasks: boolean
  task_assignee_id: string | null
}

const { data: cfg, refresh } = await useFetch<BudgetSlackConfig>('/api/agency/settings/budget-slack')
const { data: members } = await useFetch<Array<{ id: string; name: string }>>('/api/agency/team-members')

const saving = ref(false)
const testing = ref(false)

const hourOptions = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, value: h }))

async function save() {
  saving.value = true
  try {
    await $fetch('/api/agency/settings/budget-slack', { method: 'PUT', body: cfg.value })
    toast.add({ title: 'Saved', description: 'Budget alert settings updated.', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e?.data?.statusMessage ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value = true
  try {
    await $fetch('/api/agency/settings/budget-slack/test', { method: 'POST' })
    toast.add({ title: 'Test sent', description: 'Check your Slack channel.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Test failed', description: e?.data?.statusMessage ?? 'Could not post', color: 'error' })
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div v-if="cfg" class="space-y-6 max-w-2xl">
    <div>
      <h2 class="text-lg font-semibold">Budget Alerts &amp; Slack</h2>
      <p class="text-sm text-muted">Detect ad-spend pacing problems and post the daily budget review to Slack.</p>
    </div>

    <UFormField label="Slack webhook URL" help="Create an Incoming Webhook in Slack and paste the https://hooks.slack.com/services/… URL.">
      <UInput v-model="cfg.webhook_url" placeholder="https://hooks.slack.com/services/..." class="w-full" />
    </UFormField>

    <UFormField label="Channel override" help="Optional. Leave blank to use the webhook's default channel.">
      <UInput v-model="cfg.channel" placeholder="#budget-tracker" class="w-full" />
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Daily 9am digest">
        <USwitch v-model="cfg.digest_enabled" />
      </UFormField>
      <UFormField label="Real-time critical alerts">
        <USwitch v-model="cfg.realtime_enabled" />
      </UFormField>
    </div>

    <UFormField label="Digest hour (tenant-local)">
      <USelect v-model="cfg.digest_hour" :items="hourOptions" class="w-48" />
    </UFormField>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Create accountability tasks" help="Auto-create an assigned, due-in-24h task for each critical budget issue.">
        <USwitch v-model="cfg.create_tasks" />
      </UFormField>
      <UFormField label="Assign tasks to" help="Required when accountability tasks are on.">
        <USelectMenu
          v-model="cfg.task_assignee_id"
          :items="(members ?? []).map(m => ({ label: m.name, value: m.id }))"
          value-key="value"
          placeholder="Select a team member"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="flex gap-3">
      <UButton :loading="saving" @click="save">Save settings</UButton>
      <UButton variant="ghost" :loading="testing" :disabled="!cfg.webhook_url" @click="sendTest">Send test message</UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add the tab to the settings page**

In `app/pages/agency/settings/index.vue`, extend the `activeTab` union to include `'budget-alerts'`, add a tab trigger labelled "Budget Alerts" alongside the existing tabs, and render the component in its panel:

```vue
<BudgetAlertsSettings v-if="activeTab === 'budget-alerts'" />
```

(Match the file's existing tab markup — it uses a local `activeTab` ref and conditional panels. Add the trigger button in the same style as `departments`/`statuses`/`labels`, and the panel below them.)

- [ ] **Step 3: Verify the team-members endpoint path**

Run: `ls server/api/agency/team-members* server/api/team-members* 2>/dev/null`
If the path differs (e.g. `/api/team/members`), update the `useFetch` URL in the component to match. The bare array convention applies (see project memory: `/api/agency/clients` returns a bare array) — do not wrap.

- [ ] **Step 4: Manual check**

Run the dev server, open `/agency/settings`, click the **Budget Alerts** tab, confirm the form renders and "Save settings" toasts success.

- [ ] **Step 5: Commit**

```bash
git add app/components/settings/BudgetAlertsSettings.vue app/pages/agency/settings/index.vue
git commit -m "feat(budget-slack): Budget Alerts settings tab"
```

---

## Phase 3 — AI chat awareness

### Task 3.1: Budget chat-context builder

**Files:**
- Create: `server/utils/budgetChatContext.ts`
- Test: `test/server/utils/budgetChatContext.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/budgetChatContext.test.ts
import { describe, it, expect } from 'vitest'
import { buildBudgetChatContext } from '~~/server/utils/budgetChatContext'

describe('buildBudgetChatContext', () => {
  it('summarises active ad-spend anomalies', () => {
    const ctx = buildBudgetChatContext([
      { severity: 'critical', title: 'Mornington Nissan (google_ads) underspending', tags: ['underspend'] },
      { severity: 'warning', title: 'McRae LDV (google_ads) overspending', tags: ['overspend'] },
    ])
    expect(ctx).toContain('1 critical')
    expect(ctx).toContain('Mornington Nissan')
  })

  it('returns an all-clear string when empty', () => {
    expect(buildBudgetChatContext([])).toContain('No ad-spend pacing issues')
  })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
// server/utils/budgetChatContext.ts
export interface BudgetChatRow { severity: string; title: string; tags: string[] | null }

export function buildBudgetChatContext(rows: BudgetChatRow[]): string {
  if (rows.length === 0) return 'Budget pacing: No ad-spend pacing issues are currently flagged across active campaigns.'
  const nCrit = rows.filter(r => r.severity === 'critical').length
  const nWarn = rows.filter(r => r.severity === 'warning').length
  const top = rows.slice(0, 8).map(r => r.title).join('; ')
  return `Budget pacing: ${nCrit} critical, ${nWarn} warning ad-spend issues active. ${top}.`
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit**

```bash
git add server/utils/budgetChatContext.ts test/server/utils/budgetChatContext.test.ts
git commit -m "feat(chat): budget pacing context builder"
```

---

### Task 3.2: Add the budget route to the chat handler

**Files:**
- Modify: `server/api/ai/chat.post.ts`

- [ ] **Step 1: Add the route**

Add the import at the top:

```ts
import { queryRows } from '~~/server/utils/db'
import { buildBudgetChatContext } from '~~/server/utils/budgetChatContext'
```

Add a `budget` key to the `want` object:

```ts
    budget: /underspend|overspend|pacing|budget tracker|on track|campaign spend|ad ?spend/.test(prompt),
```

Add the handler block (after the `want.expenses` block, before the `if (!results.length)` guard):

```ts
  if (want.budget) {
    const rows = await queryRows<{ severity: string; title: string; tags: string[] | null }>(
      `SELECT severity, title, tags
       FROM anomalies
       WHERE type = 'adspend' AND status NOT IN ('resolved','dismissed')
       ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
       LIMIT 20`,
    ).catch(() => [])
    results.push(buildBudgetChatContext(rows))
  }
```

- [ ] **Step 2: Smoke (dev)**

Run: `curl -s -X POST http://localhost:3000/api/ai/chat -H 'Content-Type: application/json' -d '{"prompt":"which campaigns are underspending?"}'`
Expected: a `reply` string containing the budget-pacing summary (or "No ad-spend pacing issues" when none).

- [ ] **Step 3: Commit**

```bash
git add server/api/ai/chat.post.ts
git commit -m "feat(chat): answer budget/pacing questions from anomalies"
```

---

## Phase 4 — Accountability tasks

### Task 4.1: `buildTaskPayload` (pure)

**Files:**
- Create: `server/utils/anomalyDetection/accountabilityTask.ts`
- Test: `test/server/utils/anomalyDetection/accountabilityTask.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/anomalyDetection/accountabilityTask.test.ts
import { describe, it, expect } from 'vitest'
import { buildTaskPayload } from '~~/server/utils/anomalyDetection/accountabilityTask'

describe('buildTaskPayload', () => {
  const anomaly = {
    id: 'a1', title: 'Mornington Nissan (google_ads) underspending',
    description: '$312 of an expected $2,750 — $2,438 behind pace.', fingerprint: 'adspend:underspend-m1-2026-06',
  }

  it('produces a high-priority task due ~24h out', () => {
    const now = new Date('2026-06-02T00:00:00Z')
    const p = buildTaskPayload(anomaly, now)
    expect(p.priority).toBe('high')
    expect(p.title).toContain('Mornington Nissan')
    expect(p.dueDate).toBe('2026-06-03')
    expect(p.description).toContain('adspend:underspend-m1-2026-06')
    expect(p.description).toContain('$2,438 behind pace')
  })

  it('truncates the title to 255 chars', () => {
    const long = { ...anomaly, title: 'x'.repeat(400) }
    expect(buildTaskPayload(long, new Date()).title.length).toBeLessThanOrEqual(255)
  })
})
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement the pure builder**

```ts
// server/utils/anomalyDetection/accountabilityTask.ts
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'

export interface AnomalyForTask {
  id: string
  title: string
  description: string
  fingerprint: string
}

export interface TaskPayload {
  title: string
  description: string
  priority: 'high'
  dueDate: string // YYYY-MM-DD
}

export function buildTaskPayload(anomaly: AnomalyForTask, now: Date): TaskPayload {
  const due = new Date(now.getTime() + 24 * 3_600_000)
  return {
    title: `Budget issue: ${anomaly.title}`.slice(0, 255),
    description: [
      anomaly.description,
      '',
      `Source: automated budget anomaly`,
      `Fingerprint: ${anomaly.fingerprint}`,
      `Anomaly ID: ${anomaly.id}`,
    ].join('\n'),
    priority: 'high',
    dueDate: due.toISOString().slice(0, 10),
  }
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit**

```bash
git add server/utils/anomalyDetection/accountabilityTask.ts test/server/utils/anomalyDetection/accountabilityTask.test.ts
git commit -m "feat(budget-tasks): pure task-payload builder"
```

---

### Task 4.2: `maybeCreateAccountabilityTasks` + reconcile hook

**Files:**
- Modify: `server/utils/anomalyDetection/accountabilityTask.ts`
- Modify: `server/utils/anomalyDetection/reconcile.ts` (Pass 3b)

- [ ] **Step 1: Add the DB creator (append to accountabilityTask.ts)**

```ts
interface AnomalyRowForTask extends AnomalyForTask { context: Record<string, any> | null }

/**
 * Create one accountability task per newly-inserted critical adspend/budget
 * anomaly, when create_tasks is enabled and an assignee is configured.
 * Idempotent: skips anomalies that already have context.task_id.
 */
export async function maybeCreateAccountabilityTasks(tenantId: string, anomalyIds: string[]): Promise<void> {
  if (anomalyIds.length === 0) return
  const cfg = await getBudgetSlackConfig(tenantId)
  if (!cfg.create_tasks) return
  if (!cfg.task_assignee_id) {
    console.warn('[budget-tasks] create_tasks on but no task_assignee_id — skipping')
    return
  }

  // First department + its first status (ordered) act as the task's home.
  const dept = await queryOne<{ id: string }>(`SELECT id FROM departments ORDER BY created_at ASC LIMIT 1`)
  if (!dept) { console.warn('[budget-tasks] no department to attach tasks to — skipping'); return }
  const status = await queryOne<{ id: string }>(
    `SELECT id FROM statuses WHERE department_id = $1 ORDER BY position ASC NULLS LAST, created_at ASC LIMIT 1`,
    [dept.id],
  )
  if (!status) { console.warn('[budget-tasks] no status in department — skipping'); return }

  const rows = await queryRows<AnomalyRowForTask>(
    `SELECT id, title, description, fingerprint, context
     FROM anomalies
     WHERE tenant_id = $1 AND id = ANY($2) AND type IN ('adspend','budget')`,
    [tenantId, anomalyIds],
  )
  const now = new Date()
  for (const row of rows) {
    if (row.context && (row.context as any).task_id) continue
    const payload = buildTaskPayload(row, now)
    await transaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO tasks (department_id, status_id, title, description, priority, task_type, assignee_id, reporter_id, due_date)
         VALUES ($1, $2, $3, $4, $5, 'task', $6, $6, $7)
         RETURNING id`,
        [dept.id, status.id, payload.title, payload.description, payload.priority, cfg.task_assignee_id, payload.dueDate],
      )
      const taskId = (ins as any).rows[0].id
      await client.query(
        `INSERT INTO task_activities (task_id, user_id, activity_type, content)
         VALUES ($1, $2, 'created', $3)`,
        [taskId, cfg.task_assignee_id, `Auto-created from budget anomaly ${row.fingerprint}`],
      )
      await client.query(
        `UPDATE anomalies SET context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('task_id', $1::text) WHERE id = $2`,
        [taskId, row.id],
      )
    })
  }
}
```

- [ ] **Step 2: Hook into reconcile Pass 3b**

In `server/utils/anomalyDetection/reconcile.ts`, add the import:

```ts
import { maybeCreateAccountabilityTasks } from './accountabilityTask'
```

After the `dispatchCriticalBudgetSlack` try/catch added in Task 2.3, add:

```ts
  // Pass 3c: optional accountability tasks for newly-inserted critical budget anomalies.
  try {
    await maybeCreateAccountabilityTasks(tenantId, newlyInsertedCriticalIds)
  } catch (err) {
    console.error('[anomalies] accountability task creation failed', err)
  }
```

- [ ] **Step 3: Verify the columns exist**

Run: `grep -n "reporter_id\|assignee_id\|status_id\|department_id\|task_type" server/database/schema.sql | head` and confirm the `tasks` table has these columns (the meeting-bridge endpoint inserts the same set). If `reporter_id` is `NOT NULL`, the `$6`-for-both-assignee-and-reporter approach satisfies it (guarded by the `task_assignee_id` requirement above). If a column name differs, adjust the INSERT.

- [ ] **Step 4: Run the anomaly suite (dispatch + tasks no-op without config)**

Run: `pnpm test -- test/server/utils/anomalyDetection/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/anomalyDetection/accountabilityTask.ts server/utils/anomalyDetection/reconcile.ts
git commit -m "feat(budget-tasks): optional accountability task creation on critical anomalies"
```

---

## Phase 5 — Marketing-page sync

### Task 5.1: Add the feature to the public marketing pages

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`

- [ ] **Step 1: Locate the ad-spend / anomaly feature entry**

Run: `grep -n "anomal\|ad spend\|Ad Spend\|pacing\|budget" app/pages/features/index.vue app/pages/features/[slug].vue | head`
Identify the existing Ad Spend / Anomaly Detection feature object and its category.

- [ ] **Step 2: Update `features/index.vue`**

In the matching feature entry (or the Ad Spend category), add/extend the description to mention pacing detection + Slack budget review, e.g. append to the relevant feature's `description`:

```
"Automated pacing detection (underspend, overspend, stopped, paused, stale-sync) with a daily Slack budget review and real-time critical alerts."
```

If there is a discrete feature list, add a `Budget pacing & Slack alerts` item in the Ad Spend category, following the exact object shape used by neighbouring entries (copy a sibling's keys: `title`, `description`, `icon`, `slug`/category as applicable).

- [ ] **Step 3: Update `features/[slug].vue`**

Add a detailed entry (3–4 content sections) for the ad-spend feature slug covering: what pacing detection catches, the six signals, the daily Slack review, and accountability tasks — matching the section shape of an existing slug entry (copy a sibling entry's structure: heading + body sections).

- [ ] **Step 4: Manual check**

Run the dev server, open `/features` and the relevant `/features/<slug>`, confirm the new content renders in both light and dark mode (per the project's dark-mode rule for marketing pages — ensure any hardcoded hex colors copied from siblings already carry their `dark:` variants).

- [ ] **Step 5: Commit**

```bash
git add app/pages/features/index.vue 'app/pages/features/[slug].vue'
git commit -m "docs(marketing): add ad-spend pacing detection + Slack budget review to features"
```

---

## Final verification

- [ ] **Run the full relevant test suite**

Run: `pnpm test -- test/server/utils/anomalyDetection/ test/server/utils/budgetChatContext.test.ts`
Expected: all green.

- [ ] **Type-check (large heap required — see CLAUDE.md Known Issues)**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck`
Expected: no NEW errors beyond the documented ~60 pre-existing `index.d.ts` ones.

- [ ] **Pre-commit deep-dive review** (per CLAUDE.md): re-read every new/modified file end-to-end; confirm `~~/` server aliases (not `~/`); confirm no `@apply` of semantic Tailwind utilities in the new Vue component; confirm `USelectMenu` has no empty-string values (assignee uses real UUIDs / sentinel).

---

## Ops checklist (post-merge, not code — for the operator)

1. Deploy the app (`pnpm deploy:production`) — analyser runs on the next 7am-local cron; anomalies appear in the AI daily digest, push, in-app, and the anomalies UI immediately.
2. Deploy the pages-cron worker: `cd workers/pages-cron && npx wrangler deploy` (picks up the new digest route).
3. In `/agency/settings → Budget Alerts`: paste the Slack incoming-webhook URL, set the channel, confirm digest hour, hit **Send test message**.
4. (Optional) Enable "Create accountability tasks" and pick an assignee once comfortable.
5. Watch the first 9am digest land; broaden from there.

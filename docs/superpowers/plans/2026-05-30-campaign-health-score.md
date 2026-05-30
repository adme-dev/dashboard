# Campaign Health Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A client-target-aware 0–100 health score + Scale/Hold/Cut verdict per campaign, surfaced as a sortable color-coded column in the agency analytics table, driven by per-client KPI targets staff configure.

**Architecture:** A new `client_kpi_targets` table holds per-client, per-result-type targets. A pure `scoreCampaignHealth()` function combines the metrics we already store (cost-per-result, CTR, frequency, Meta quality rankings, Google impression share) against the matching target into `{score, verdict, confidence, reasons}`. The agency campaigns API runs it per row and returns `health`; the table renders a color-coded badge with hover reasons; a settings section on the client page manages targets.

**Tech Stack:** Nitro + Neon Postgres, Nuxt 4 / Vue 3 / Nuxt UI v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-campaign-health-score-design.md`

**Branch:** `feat/campaign-health-score` (already created).

**Data-availability note:** `result_type`, `cost_per_result`, `frequency`, and the Meta rankings are populated by the lazy on-demand sync (`onDemandSync.ts`) when a campaign is expanded, and on subsequent syncs — same model as the Reach/Cost-per-result columns already shipped. So the score shows for enriched campaigns; un-enriched ones show "no target / –" until their result data syncs. This is consistent with existing behavior; not a blocker.

---

## Task 1: Migration — `client_kpi_targets`

**Files:** Create `server/database/migrations/120-client-kpi-targets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 120-client-kpi-targets.sql
-- Per-client, per-result-type KPI targets that drive the campaign health score.
CREATE TABLE IF NOT EXISTS client_kpi_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  result_type VARCHAR(40) NOT NULL,
  target_cost_per_result NUMERIC(10,2) NOT NULL,
  target_ctr NUMERIC(5,2),
  max_frequency NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, result_type)
);
CREATE INDEX IF NOT EXISTS idx_client_kpi_targets_client ON client_kpi_targets(client_id);
```

- [ ] **Step 2: Run it** (per CLAUDE.md):

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/120-client-kpi-targets.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` (no error; re-runnable).

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='client_kpi_targets' ORDER BY ordinal_position;"
```
Expected: rows for id, client_id, result_type, target_cost_per_result, target_ctr, max_frequency, created_at, updated_at.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/120-client-kpi-targets.sql
git commit -m "feat(analytics): add client_kpi_targets table"
```
(trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task 2: Scoring engine (TDD)

**Files:** Create `server/utils/campaignHealth.ts`; Test `test/server/utils/campaignHealth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { scoreCampaignHealth, type HealthInput } from '~~/server/utils/campaignHealth'

const base: HealthInput = {
  platform: 'meta', costPerResult: 20, resultCount: 50, spend: 1000,
  ctr: null, frequency: null, qualityRanking: null, engagementRateRanking: null,
  conversionRateRanking: null, impressionShare: null,
  target: { targetCostPerResult: 25, targetCtr: null, maxFrequency: null },
}

describe('scoreCampaignHealth', () => {
  it('returns no-target when the client has no matching target', () => {
    const r = scoreCampaignHealth({ ...base, target: null })
    expect(r.verdict).toBe('no-target')
    expect(r.score).toBeNull()
  })
  it('cuts a campaign burning spend with zero results', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: null, resultCount: 0, spend: 200 })
    expect(r.verdict).toBe('cut')
    expect(r.reasons[0]).toMatch(/zero results/i)
  })
  it('flags insufficient data under 8 results', () => {
    const r = scoreCampaignHealth({ ...base, resultCount: 4, costPerResult: 20, spend: 80 })
    expect(r.verdict).toBe('insufficient')
    expect(r.score).toBeNull()
  })
  it('scales an efficient, healthy, high-volume campaign', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 15, resultCount: 60, frequency: 1.8 })
    expect(r.verdict).toBe('scale')
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.reasons[0]).toMatch(/cost\/result/i)
  })
  it('cuts an over-target, fatigued campaign', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 60, resultCount: 40, frequency: 5, engagementRateRanking: 'BELOW_AVERAGE_35' })
    expect(r.verdict).toBe('cut')
    expect(r.score).toBeLessThanOrEqual(35)
  })
  it('holds a near-target campaign', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 27, resultCount: 40 })
    expect(r.verdict).toBe('hold')
  })
  it('never upgrades to scale on medium confidence', () => {
    const r = scoreCampaignHealth({ ...base, costPerResult: 12, resultCount: 10, frequency: 1.5 })
    expect(r.verdict).toBe('hold') // would be scale at high confidence
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm exec vitest run test/server/utils/campaignHealth.test.ts`
Expected: cannot find module / not a function.

- [ ] **Step 3: Implement**

Create `server/utils/campaignHealth.ts`:

```ts
/**
 * Campaign health scoring — pure, deterministic, explainable.
 * Combines the metrics we already store against a client's KPI target.
 * v1 weights/thresholds are tunable constants below; logic stays fixed.
 */

// ── Tunable v1 constants ──────────────────────────────────────────
const BASELINE = 50
const EFFICIENCY_BANDS = { great: 0.7, good: 1.0, near: 1.3, poor: 2.0 } // costPerResult / target
const EFFICIENCY_POINTS = { great: 40, good: 20, near: 0, poor: -25, awful: -40 }
const CONFIDENCE_RESULTS = { high: 30, med: 8 }
const ZERO_RESULT_SPEND_MULT = 3
const FATIGUE = { high: 4.5, med: 3.0, healthy: 2.0 }
const VERDICT_BANDS = { scale: 70, cut: 35 }
const RELEVANCE_CAP = 15

export interface HealthInput {
  platform: string
  costPerResult: number | null
  resultCount: number
  spend: number
  ctr: number | null
  frequency: number | null
  qualityRanking?: string | null
  engagementRateRanking?: string | null
  conversionRateRanking?: string | null
  impressionShare?: number | null
  target: { targetCostPerResult: number; targetCtr?: number | null; maxFrequency?: number | null } | null
}

export interface HealthResult {
  score: number | null
  verdict: 'scale' | 'hold' | 'cut' | 'insufficient' | 'no-target'
  confidence: 'low' | 'med' | 'high'
  reasons: string[]
}

const money = (n: number) => `$${n.toFixed(2)}`

export function scoreCampaignHealth(input: HealthInput): HealthResult {
  const target = input.target
  if (!target || !(target.targetCostPerResult > 0)) {
    return { score: null, verdict: 'no-target', confidence: 'low', reasons: ['No KPI target set for this result type'] }
  }

  const results = input.resultCount || 0
  const confidence: HealthResult['confidence'] =
    results >= CONFIDENCE_RESULTS.high ? 'high' : results >= CONFIDENCE_RESULTS.med ? 'med' : 'low'

  // Hard case: spending with nothing to show
  if (results === 0 && input.spend >= ZERO_RESULT_SPEND_MULT * target.targetCostPerResult) {
    return { score: 10, verdict: 'cut', confidence: 'high', reasons: [`Spent ${money(input.spend)} with zero results`] }
  }
  if (confidence === 'low') {
    return { score: null, verdict: 'insufficient', confidence, reasons: [`Not enough results yet (under ${CONFIDENCE_RESULTS.med})`] }
  }

  let score = BASELINE
  const reasons: Array<{ text: string; weight: number }> = []

  // Efficiency (primary signal)
  const cpr = input.costPerResult
  if (cpr != null && cpr > 0) {
    const ratio = cpr / target.targetCostPerResult
    let pts: number
    if (ratio <= EFFICIENCY_BANDS.great) pts = EFFICIENCY_POINTS.great
    else if (ratio <= EFFICIENCY_BANDS.good) pts = EFFICIENCY_POINTS.good
    else if (ratio <= EFFICIENCY_BANDS.near) pts = EFFICIENCY_POINTS.near
    else if (ratio <= EFFICIENCY_BANDS.poor) pts = EFFICIENCY_POINTS.poor
    else pts = EFFICIENCY_POINTS.awful
    score += pts
    const pct = Math.round((ratio - 1) * 100)
    reasons.push({ text: `Cost/result ${money(cpr)} vs ${money(target.targetCostPerResult)} target (${pct >= 0 ? '+' : ''}${pct}%)`, weight: Math.abs(pts) + 1 })
  }

  // Engagement (only when a CTR target is set)
  if (target.targetCtr != null && input.ctr != null) {
    if (input.ctr < target.targetCtr) {
      score -= 15
      reasons.push({ text: `CTR ${input.ctr.toFixed(2)}% below ${target.targetCtr.toFixed(2)}% target`, weight: 15 })
    } else {
      score += 5
    }
  }

  // Fatigue (Meta)
  if (input.frequency != null) {
    if (input.frequency > FATIGUE.high) { score -= 15; reasons.push({ text: `Frequency ${input.frequency.toFixed(1)} — heavy creative fatigue`, weight: 14 }) }
    else if (input.frequency > FATIGUE.med) { score -= 10; reasons.push({ text: `Frequency ${input.frequency.toFixed(1)} — creative fatigue`, weight: 9 }) }
    else if (input.frequency <= FATIGUE.healthy) { score += 5 }
  }

  // Relevance: Meta rankings
  let relevance = 0
  const rankings: Array<[string, string | null | undefined]> = [
    ['Quality', input.qualityRanking],
    ['Engagement', input.engagementRateRanking],
    ['Conversion', input.conversionRateRanking],
  ]
  for (const [label, r] of rankings) {
    if (!r) continue
    const u = r.toUpperCase()
    if (u.includes('ABOVE_AVERAGE')) relevance += 5
    else if (u.includes('BELOW_AVERAGE')) { relevance -= 5; reasons.push({ text: `${label} ranking below average`, weight: 6 }) }
  }
  relevance = Math.max(-RELEVANCE_CAP, Math.min(RELEVANCE_CAP, relevance))
  score += relevance

  // Google: impression share as a relevance proxy
  if (input.impressionShare != null) {
    if (input.impressionShare >= 70) score += 8
    else if (input.impressionShare < 30) { score -= 8; reasons.push({ text: `Low impression share ${input.impressionShare.toFixed(0)}%`, weight: 8 }) }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  // Verdict
  const efficiencyNonNeg = cpr == null || cpr <= target.targetCostPerResult * EFFICIENCY_BANDS.near
  let verdict: HealthResult['verdict']
  if (score >= VERDICT_BANDS.scale && efficiencyNonNeg) verdict = 'scale'
  else if (score <= VERDICT_BANDS.cut) verdict = 'cut'
  else verdict = 'hold'
  if (verdict === 'scale' && confidence === 'med') verdict = 'hold' // never upgrade on medium confidence

  reasons.sort((a, b) => b.weight - a.weight)
  return { score, verdict, confidence, reasons: reasons.slice(0, 3).map(r => r.text) }
}
```

- [ ] **Step 4: Run, expect PASS** — `pnpm exec vitest run test/server/utils/campaignHealth.test.ts` (7 passed). If a band boundary makes a case off-by-one, adjust the test's input values (not the logic) to clearly fall in the intended band, or tune the constant and note it.

- [ ] **Step 5: Commit**

```bash
git add server/utils/campaignHealth.ts test/server/utils/campaignHealth.test.ts
git commit -m "feat(analytics): campaign health scoring engine"
```

---

## Task 3: Color/label helpers (TDD)

**Files:** Create `app/utils/campaignHealthFormat.ts`; Test `test/utils/campaignHealthFormat.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { healthColor, healthLabel } from '~/app/utils/campaignHealthFormat'

describe('campaignHealthFormat', () => {
  it('maps verdicts to Nuxt UI colors', () => {
    expect(healthColor('scale')).toBe('success')
    expect(healthColor('hold')).toBe('warning')
    expect(healthColor('cut')).toBe('error')
    expect(healthColor('insufficient')).toBe('neutral')
    expect(healthColor('no-target')).toBe('neutral')
  })
  it('maps verdicts to short labels', () => {
    expect(healthLabel('scale')).toBe('Scale')
    expect(healthLabel('cut')).toBe('Cut')
    expect(healthLabel('insufficient')).toBe('Low data')
    expect(healthLabel('no-target')).toBe('Set target')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm exec vitest run test/utils/campaignHealthFormat.test.ts`.

- [ ] **Step 3: Implement** `app/utils/campaignHealthFormat.ts`:

```ts
/** Pure display helpers for the campaign health verdict. No Nuxt/DOM deps. */
export type HealthVerdict = 'scale' | 'hold' | 'cut' | 'insufficient' | 'no-target'

export function healthColor(verdict: HealthVerdict): 'success' | 'warning' | 'error' | 'neutral' {
  if (verdict === 'scale') return 'success'
  if (verdict === 'hold') return 'warning'
  if (verdict === 'cut') return 'error'
  return 'neutral'
}

export function healthLabel(verdict: HealthVerdict): string {
  switch (verdict) {
    case 'scale': return 'Scale'
    case 'hold': return 'Hold'
    case 'cut': return 'Cut'
    case 'insufficient': return 'Low data'
    case 'no-target': return 'Set target'
  }
}
```

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add app/utils/campaignHealthFormat.ts test/utils/campaignHealthFormat.test.ts
git commit -m "feat(analytics): campaign health color/label helpers"
```

---

## Task 4: KPI targets CRUD endpoints

**Files:** Create `server/api/agency/clients/[id]/kpi-targets.get.ts` and `kpi-targets.put.ts`

- [ ] **Step 1: GET endpoint** — `server/api/agency/clients/[id]/kpi-targets.get.ts`:

```ts
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })

  const rows = await queryRows<{
    result_type: string; target_cost_per_result: string; target_ctr: string | null; max_frequency: string | null
  }>(
    `SELECT result_type, target_cost_per_result, target_ctr, max_frequency
       FROM client_kpi_targets WHERE client_id = $1 ORDER BY result_type`,
    [clientId]
  )
  return {
    targets: rows.map(r => ({
      resultType: r.result_type,
      targetCostPerResult: Number(r.target_cost_per_result),
      targetCtr: r.target_ctr == null ? null : Number(r.target_ctr),
      maxFrequency: r.max_frequency == null ? null : Number(r.max_frequency),
    })),
  }
})
```

- [ ] **Step 2: PUT endpoint (upsert full set)** — `server/api/agency/clients/[id]/kpi-targets.put.ts`:

```ts
import { execute, transaction } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

interface TargetInput {
  resultType: string
  targetCostPerResult: number
  targetCtr?: number | null
  maxFrequency?: number | null
}

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MANAGEMENT)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })

  const body = await readBody(event)
  const targets: TargetInput[] = Array.isArray(body?.targets) ? body.targets : []

  for (const t of targets) {
    if (!t.resultType || typeof t.resultType !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Each target needs a resultType' })
    }
    if (!(Number(t.targetCostPerResult) > 0)) {
      throw createError({ statusCode: 400, statusMessage: `targetCostPerResult must be > 0 for ${t.resultType}` })
    }
  }

  await transaction(async (client) => {
    await client.query(`DELETE FROM client_kpi_targets WHERE client_id = $1`, [clientId])
    for (const t of targets) {
      await client.query(
        `INSERT INTO client_kpi_targets (client_id, result_type, target_cost_per_result, target_ctr, max_frequency)
         VALUES ($1, $2, $3, $4, $5)`,
        [clientId, t.resultType, t.targetCostPerResult,
         t.targetCtr == null ? null : t.targetCtr, t.maxFrequency == null ? null : t.maxFrequency]
      )
    }
  })

  return { ok: true, count: targets.length }
})
```

Note: use `client.query()` directly inside `transaction()` (per the project's db helper — never `queryOne`/`execute` inside a transaction). Confirm `transaction` is exported from `~~/server/utils/db` (it is). `execute` import is unused — remove it if so.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>/dev/null | grep "kpi-targets" || echo "clean"`

- [ ] **Step 4: Smoke test (dev server running)**

```bash
curl -s -X PUT "http://localhost:3000/api/agency/clients/<aClientId>/kpi-targets" -H 'Content-Type: application/json' -d '{"targets":[{"resultType":"Leads (Form)","targetCostPerResult":25}]}'
curl -s "http://localhost:3000/api/agency/clients/<aClientId>/kpi-targets"
```
Expected: PUT `{ok:true,count:1}`; GET returns the target. (Skip if no dev server; note it.)

- [ ] **Step 5: Commit**

```bash
git add "server/api/agency/clients/[id]/kpi-targets.get.ts" "server/api/agency/clients/[id]/kpi-targets.put.ts"
git commit -m "feat(analytics): client KPI targets CRUD endpoints"
```

---

## Task 5: Wire health into the campaigns API

**Files:** Modify `server/api/agency/analytics/campaigns.get.ts`

Read the file first. It has a `campaigns` CTE (groups per campaign, already selects `reach`, `cost_per_result`, `result_type` via `array_agg(... ORDER BY synced_at DESC)[1]`), a `.map((r) => {...})` that builds `metrics = computeMetrics(...)`, and an `ALLOWED_SORT` array.

- [ ] **Step 1: Select the extra health-input columns in the CTE.** After the existing `(array_agg(ms.result_type ...))[1] as result_type,` line, add:

```sql
          (array_agg(ms.frequency ORDER BY ms.synced_at DESC NULLS LAST))[1] as frequency,
          (array_agg(ms.quality_ranking ORDER BY ms.synced_at DESC NULLS LAST))[1] as quality_ranking,
          (array_agg(ms.engagement_rate_ranking ORDER BY ms.synced_at DESC NULLS LAST))[1] as engagement_rate_ranking,
          (array_agg(ms.conversion_rate_ranking ORDER BY ms.synced_at DESC NULLS LAST))[1] as conversion_rate_ranking,
          (array_agg(ms.impression_share ORDER BY ms.synced_at DESC NULLS LAST))[1] as impression_share,
```

- [ ] **Step 2: Fetch targets for the page's clients.** After `const rows = await queryRows(...)` returns (before the `.map`), add:

```ts
    const clientIds = [...new Set(rows.map(r => r.client_id).filter(Boolean))]
    const targetRows = clientIds.length
      ? await queryRows<{ client_id: string; result_type: string; target_cost_per_result: string; target_ctr: string | null; max_frequency: string | null }>(
          `SELECT client_id, result_type, target_cost_per_result, target_ctr, max_frequency
             FROM client_kpi_targets WHERE client_id = ANY($1)`, [clientIds])
      : []
    const targetByKey = new Map(targetRows.map(t => [`${t.client_id}|${t.result_type}`, t]))
```

- [ ] **Step 3: Import and run the engine in the map.** Add the import at the top:

```ts
import { scoreCampaignHealth } from '~~/server/utils/campaignHealth'
```

Inside the `.map((r) => { ... })`, after `const metrics = computeMetrics(...)`, add:

```ts
      const tgt = r.result_type ? targetByKey.get(`${r.client_id}|${r.result_type}`) : null
      const health = scoreCampaignHealth({
        platform: r.platform,
        costPerResult: r.cost_per_result == null ? null : toNum(r.cost_per_result),
        resultCount: conversions,
        spend,
        ctr: metrics.ctr,
        frequency: r.frequency == null ? null : Number(r.frequency),
        qualityRanking: r.quality_ranking,
        engagementRateRanking: r.engagement_rate_ranking,
        conversionRateRanking: r.conversion_rate_ranking,
        impressionShare: r.impression_share == null ? null : Number(r.impression_share),
        target: tgt ? {
          targetCostPerResult: Number(tgt.target_cost_per_result),
          targetCtr: tgt.target_ctr == null ? null : Number(tgt.target_ctr),
          maxFrequency: tgt.max_frequency == null ? null : Number(tgt.max_frequency),
        } : null,
      })
```

And add `health,` to the returned campaign object (e.g. after `budgetType: ...,`).

- [ ] **Step 4: Sortable by score.** Add `'health_score'` to `ALLOWED_SORT`. Since `health` is computed in JS (not SQL), handle it as a post-query sort: after building `campaigns`, if `sortBy === 'health_score'`, sort the array by `health.score` (nulls last) honoring `sortDir`. (The SQL ORDER BY can't reference it; do the JS sort only for this key and leave SQL ordering for the rest. Note: this sorts within the current page — acceptable for v1; document it.)

```ts
    if (sortBy === 'health_score') {
      const dir = sortDir === 'ASC' ? 1 : -1
      campaigns.sort((a, b) => {
        const av = a.health?.score, bv = b.health?.score
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return (av - bv) * dir
      })
    }
```
(Place after the `campaigns` array is built and before `return`. `sortBy`/`sortDir` are already in scope.)

- [ ] **Step 5: Typecheck** — `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>/dev/null | grep "campaigns.get" || echo "clean"`.
- [ ] **Step 6: Commit**

```bash
git add server/api/agency/analytics/campaigns.get.ts
git commit -m "feat(analytics): compute campaign health in campaigns API"
```

---

## Task 6: Health column in the campaign table

**Files:** Modify `app/components/analytics/CampaignTable.vue`

`health{Color,Label}` are auto-imported from `app/utils/campaignHealthFormat.ts` (do not import). `allColumns` is an ordered array with `{key,label,sortable}`; cells are gated by `isVisible('<key>')`; `sortKeyForColumn` maps display keys to API sort keys.

- [ ] **Step 1: Add the column definition.** In `allColumns`, insert after `{ key: 'delivery', ... }`:

```ts
  { key: 'health', label: 'Health', sortable: true },
```
Add `'health'` to the `META_PRESET` array (after `'delivery'`).

- [ ] **Step 2: Map the sort key.** In `sortKeyForColumn`, add:

```ts
  if (key === 'health') return 'health_score'
```

- [ ] **Step 3: Add the body cell** (in `allColumns` order — right after the `delivery` `<td>`):

```vue
              <td v-if="isVisible('health')" class="px-3 py-2.5 text-right">
                <UTooltip v-if="row.health && row.health.verdict !== 'no-target'" :text="(row.health.reasons || []).join(' · ') || healthLabel(row.health.verdict)">
                  <UBadge variant="subtle" :color="healthColor(row.health.verdict)" size="xs">
                    <span v-if="row.health.score != null" class="tabular-nums mr-1">{{ row.health.score }}</span>{{ healthLabel(row.health.verdict) }}
                  </UBadge>
                </UTooltip>
                <span v-else class="text-muted text-xs">{{ row.health ? healthLabel(row.health.verdict) : '-' }}</span>
              </td>
```

- [ ] **Step 4: Show reasons in the expanded detail.** In the detail panel (near the KPI row / footer), add:

```vue
                <div v-if="row.health && row.health.reasons && row.health.reasons.length" class="mb-4 flex flex-wrap items-center gap-2">
                  <UBadge variant="subtle" :color="healthColor(row.health.verdict)" size="sm">
                    Health {{ row.health.score != null ? row.health.score : '' }} · {{ healthLabel(row.health.verdict) }}
                  </UBadge>
                  <span v-for="(reason, i) in row.health.reasons" :key="i" class="text-xs text-muted">{{ reason }}{{ i < row.health.reasons.length - 1 ? ' ·' : '' }}</span>
                </div>
```
(Place it inside the expanded `<td>`, e.g. just before the `AnalyticsExtraMetricsRow`/breakdowns block.)

- [ ] **Step 5: Verify** — `CampaignRow` already has an index signature (`[key: string]: unknown`), so `row.health` typechecks. Run `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.json 2>/dev/null | grep CampaignTable || echo "clean"`.
- [ ] **Step 6: Commit**

```bash
git add app/components/analytics/CampaignTable.vue
git commit -m "feat(analytics): health score column + detail reasons"
```

---

## Task 7: KPI Targets settings on the client page

**Files:** Modify `app/pages/agency/clients/[id].vue`

Read the file (≈670 lines, uses `UTabs` with an active-tab ref ~line 27, `UCard` sections). Add a "KPI Targets" card/section (within the existing settings/overview tab, or a new tab if the tab pattern is clear).

- [ ] **Step 1: Load targets + available result types.** In `<script setup>`, add fetches:

```ts
const { data: kpiData, refresh: refreshKpi } = useFetch<{ targets: Array<{ resultType: string; targetCostPerResult: number; targetCtr: number | null; maxFrequency: number | null }> }>(
  () => `/api/agency/clients/${route.params.id}/kpi-targets`, { default: () => ({ targets: [] }) }
)
const kpiTargets = ref<Array<{ resultType: string; targetCostPerResult: number | null; targetCtr: number | null; maxFrequency: number | null }>>([])
watch(kpiData, (v) => { kpiTargets.value = (v?.targets || []).map(t => ({ ...t })) }, { immediate: true })

function addKpiRow() { kpiTargets.value.push({ resultType: '', targetCostPerResult: null, targetCtr: null, maxFrequency: null }) }
function removeKpiRow(i: number) { kpiTargets.value.splice(i, 1) }

const kpiSaving = ref(false)
const toast = useToast()
async function saveKpiTargets() {
  const clean = kpiTargets.value.filter(t => t.resultType && Number(t.targetCostPerResult) > 0)
  kpiSaving.value = true
  try {
    await $fetch(`/api/agency/clients/${route.params.id}/kpi-targets`, { method: 'PUT', body: { targets: clean } })
    toast.add({ title: 'KPI targets saved', color: 'success' })
    await refreshKpi()
  } catch {
    toast.add({ title: 'Failed to save targets', color: 'error' })
  } finally {
    kpiSaving.value = false
  }
}
```

- [ ] **Step 2: Add the UI section** (a `UCard` in the appropriate tab):

```vue
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-default">KPI Targets</h3>
                <p class="text-xs text-muted">Per-result-type targets that drive the campaign health score.</p>
              </div>
              <UButton size="xs" variant="outline" icon="i-lucide-plus" label="Add" @click="addKpiRow" />
            </div>
          </template>
          <div class="space-y-3">
            <div v-for="(t, i) in kpiTargets" :key="i" class="grid grid-cols-12 gap-2 items-end">
              <UFormField class="col-span-4" label="Result type">
                <UInput v-model="t.resultType" placeholder="e.g. Leads (Form)" size="sm" />
              </UFormField>
              <UFormField class="col-span-3" label="Target cost / result">
                <UInput v-model.number="t.targetCostPerResult" type="number" min="0" step="0.01" size="sm" />
              </UFormField>
              <UFormField class="col-span-2" label="Target CTR %">
                <UInput v-model.number="t.targetCtr" type="number" min="0" step="0.01" size="sm" />
              </UFormField>
              <UFormField class="col-span-2" label="Max freq.">
                <UInput v-model.number="t.maxFrequency" type="number" min="0" step="0.1" size="sm" />
              </UFormField>
              <UButton class="col-span-1" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="removeKpiRow(i)" />
            </div>
            <p v-if="!kpiTargets.length" class="text-xs text-muted">No targets yet. Add one to enable health scoring for this client.</p>
            <div class="flex justify-end">
              <UButton size="sm" label="Save targets" :loading="kpiSaving" @click="saveKpiTargets" />
            </div>
          </div>
        </UCard>
```
(Follow the `frontend-design` skill per CLAUDE.md when building this form: wrap fields in `UFormField`, consistent grid/gaps — the markup above already does. Invoke `frontend-design` before finalizing the form per the project rule.)

- [ ] **Step 3: Typecheck** — `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.json 2>/dev/null | grep "clients/\[id\]" || echo "clean"`.
- [ ] **Step 4: Commit**

```bash
git add "app/pages/agency/clients/[id].vue"
git commit -m "feat(analytics): KPI targets settings on client page"
```

---

## Task 8: Marketing page sync (per CLAUDE.md)

**Files:** Modify `app/pages/features/index.vue` and/or `app/pages/features/[slug].vue`

- [ ] **Step 1:** `grep -rn "Cross-Platform\|Campaign Drill-Down\|analytics" app/pages/features/index.vue "app/pages/features/[slug].vue"` and add a short line to the Cross-Platform Analytics entry, e.g.: "Each campaign gets a client-target-aware health score (Scale / Hold / Cut) so the team knows what to scale or cut at a glance." Match surrounding tone. If no analytics entry exists, skip and note it.
- [ ] **Step 2: Commit** (only if changed)

```bash
git add app/pages/features
git commit -m "docs(marketing): mention campaign health score"
```

---

## Task 9: Final verification

- [ ] **Step 1: Unit suite** — `pnpm exec vitest run test/server/utils/campaignHealth.test.ts test/utils/campaignHealthFormat.test.ts` → all pass.
- [ ] **Step 2: Build sanity** — `pnpm build` (the build script self-sets the 16 GB heap now) → completes.
- [ ] **Step 3: Pre-commit deep-dive (per CLAUDE.md):** `~~/` server aliases; `transaction()` uses `client.query()` only; no empty-string `USelectMenu` values; health cell sits in `allColumns` order; `requireRole` on the PUT endpoint; no frontend imports in Nitro files.
- [ ] **Step 4: Summary** — note that health populates for campaigns whose result data has synced (lazy-enrichment caveat), that the score is internal-only, and that recommendations + anomaly-wiring were deferred.

---

## Known limitations (documented)
- Health needs `result_type` + `cost_per_result` (+ optionally frequency/rankings), which populate via on-demand sync / subsequent syncs — un-enriched campaigns show "Set target"/"–" until then. Consistent with the existing Reach/Cost-per-result columns.
- `health_score` sort is applied within the current page (score is computed in JS, not SQL).
- v1 weights/thresholds are first estimates; tune the constants at the top of `campaignHealth.ts`.
- Internal-only; no client-portal presentation.

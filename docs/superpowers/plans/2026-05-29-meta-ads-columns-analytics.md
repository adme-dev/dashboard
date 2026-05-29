# Meta Ads–style Columns for Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Meta Ads Manager–style columns (Delivery, Results, Cost per result, Reach, Ends, Bid strategy) in the analytics campaign table and detail panel, with a column picker and a one-click "Meta Ads view" preset.

**Architecture:** Two new synced fields (`end_date`, `bid_strategy`) plus a `budget_type` label are captured during the Meta bulk sync via a single per-account `getCampaigns` call and persisted on `media_spend`. Reach/cost-per-result/result-type already live on `media_spend` (migrations 041/042) — the campaigns API just starts selecting them. The frontend `CampaignTable` gains the new columns, a localStorage-backed visibility picker, and a Meta preset. Pure formatting/derivation helpers are extracted so they're unit-testable without Nuxt or DB context.

**Tech Stack:** Nuxt 4 / Vue 3 (`<script setup>`), Nuxt UI v4, Nitro + Neon Postgres, Meta Graph API (`metaClient.ts`), Vitest + happy-dom.

---

## Spec

`docs/superpowers/specs/2026-05-29-meta-ads-columns-analytics-design.md`

## File Structure

- **Create:** `server/database/migrations/119-campaign-meta-fields.sql` — additive columns on `media_spend`.
- **Create:** `app/utils/metaCampaignFormat.ts` — pure display helpers (bid-strategy label, budget-type label, end-date info). Auto-imported by Nuxt; importable directly in tests.
- **Create:** `test/utils/metaCampaignFormat.test.ts` — unit tests for the display helpers.
- **Create:** `test/server/utils/mapMetaCampaignMeta.test.ts` — unit tests for the sync mapper.
- **Modify:** `server/utils/metaClient.ts` — extend `MetaCampaign` type + `getCampaigns` fields; add exported pure `mapMetaCampaignMeta`.
- **Modify:** `server/utils/spendSync.ts` — fetch campaign metadata once per account; persist `campaign_status`, `end_date`, `bid_strategy`, `budget_type` in the Meta upsert.
- **Modify:** `server/api/agency/analytics/campaigns.get.ts` — select + map the new fields; widen `ALLOWED_SORT`.
- **Modify:** `app/components/analytics/CampaignTable.vue` — new columns, visibility picker, Meta preset, detail-panel footer additions.
- **Modify (if needed):** `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, `app/components/MarketingNav.vue` — marketing sync.

## Branch setup

- [ ] **Step 0: Create a feature branch** (we're currently on `main`)

```bash
git checkout -b feat/meta-ads-columns-analytics
```

---

## Task 1: Database migration

**Files:**
- Create: `server/database/migrations/119-campaign-meta-fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 119-campaign-meta-fields.sql
-- Meta Ads campaign-level metadata for analytics columns:
-- campaign end date, bid strategy, and budget pacing type (daily/lifetime).
-- Additive and idempotent.

ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS bid_strategy VARCHAR(40),
  ADD COLUMN IF NOT EXISTS budget_type VARCHAR(10); -- 'daily' | 'lifetime'
```

- [ ] **Step 2: Run the migration** (per CLAUDE.md — run migrations automatically)

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/119-campaign-meta-fields.sql
```

Expected: `ALTER TABLE` (no error). Re-running is safe (IF NOT EXISTS).

- [ ] **Step 3: Verify columns exist**

```bash
psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='media_spend' AND column_name IN ('end_date','bid_strategy','budget_type') ORDER BY column_name;"
```

Expected: three rows — `bid_strategy` (character varying), `budget_type` (character varying), `end_date` (date).

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/119-campaign-meta-fields.sql
git commit -m "feat(analytics): add end_date/bid_strategy/budget_type to media_spend"
```

---

## Task 2: Meta sync — capture the new fields

The Meta bulk sync (`syncMetaSpend`) currently calls only `getCampaignInsights` (spend/actions) and never sets `campaign_status` for Meta. We add a single per-account `getCampaigns` call to enrich each campaign with status, end date, bid strategy, and budget type via a pure mapper.

**Files:**
- Modify: `server/utils/metaClient.ts` (interface ~43-50, `getCampaigns` ~592-610)
- Modify: `server/utils/spendSync.ts` (imports; Meta loop ~48-114)
- Test: `test/server/utils/mapMetaCampaignMeta.test.ts`

- [ ] **Step 1: Write the failing test for the pure mapper**

Create `test/server/utils/mapMetaCampaignMeta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapMetaCampaignMeta } from '~~/server/utils/metaClient'

describe('mapMetaCampaignMeta', () => {
  it('derives lifetime budget type and end date from stop_time', () => {
    const r = mapMetaCampaignMeta({
      id: '1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS',
      effective_status: 'ACTIVE', lifetime_budget: '75000',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP', stop_time: '2026-05-31T00:00:00+1000',
    })
    expect(r).toEqual({ status: 'ACTIVE', endDate: '2026-05-31', bidStrategy: 'LOWEST_COST_WITHOUT_CAP', budgetType: 'lifetime' })
  })

  it('derives daily budget type when only daily_budget is set', () => {
    const r = mapMetaCampaignMeta({ id: '2', name: 'D', status: 'PAUSED', objective: 'X', daily_budget: '5000' })
    expect(r.budgetType).toBe('daily')
    expect(r.endDate).toBeNull()
  })

  it('prefers effective_status for delivery status and tolerates missing fields', () => {
    const r = mapMetaCampaignMeta({ id: '3', name: 'E', status: 'ACTIVE', objective: 'X', effective_status: 'CAMPAIGN_PAUSED' })
    expect(r).toEqual({ status: 'CAMPAIGN_PAUSED', endDate: null, bidStrategy: null, budgetType: null })
  })

  it('returns nulls when budgets are zero or absent', () => {
    const r = mapMetaCampaignMeta({ id: '4', name: 'F', status: 'ACTIVE', objective: 'X', daily_budget: '0', lifetime_budget: '0' })
    expect(r.budgetType).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/server/utils/mapMetaCampaignMeta.test.ts`
Expected: FAIL — `mapMetaCampaignMeta is not a function` / not exported.

- [ ] **Step 3: Extend the `MetaCampaign` interface and add the mapper**

In `server/utils/metaClient.ts`, replace the `MetaCampaign` interface (lines ~43-50) with:

```ts
export interface MetaCampaign {
  id: string
  name: string
  status: string
  objective: string
  effective_status?: string
  daily_budget?: string
  lifetime_budget?: string
  bid_strategy?: string
  stop_time?: string
  start_time?: string
}

export interface MetaCampaignMeta {
  status: string | null
  endDate: string | null
  bidStrategy: string | null
  budgetType: 'daily' | 'lifetime' | null
}

/** Pure: derive persisted campaign metadata from a Meta campaign object. */
export function mapMetaCampaignMeta(c: MetaCampaign): MetaCampaignMeta {
  const lifetime = Number(c.lifetime_budget || 0)
  const daily = Number(c.daily_budget || 0)
  const budgetType: 'daily' | 'lifetime' | null =
    lifetime > 0 ? 'lifetime' : daily > 0 ? 'daily' : null
  return {
    status: c.effective_status || c.status || null,
    endDate: c.stop_time ? c.stop_time.slice(0, 10) : null,
    bidStrategy: c.bid_strategy || null,
    budgetType,
  }
}
```

- [ ] **Step 4: Add the new fields to the `getCampaigns` request**

In `server/utils/metaClient.ts`, in `getCampaigns` (line ~598) change the `fields` value:

```ts
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,stop_time,start_time',
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run test/server/utils/mapMetaCampaignMeta.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 6: Import the helpers in `spendSync.ts`**

Find the existing import from `metaClient` in `server/utils/spendSync.ts` (the line bringing in `getCampaignInsights`, `getCampaignDailyInsights`, etc.) and add `getCampaigns` and `mapMetaCampaignMeta` to it. If they are imported via a dynamic `await import('~~/server/utils/metaClient')`, add them to that destructure instead. Match the file's existing import style.

- [ ] **Step 7: Fetch campaign metadata once per account**

In `server/utils/spendSync.ts`, inside the Meta connection loop, immediately after the `getCampaignInsights` try/catch (after line ~54, before `for (const campaign of campaigns)`), add:

```ts
    // Enrich with campaign-level metadata (status, end date, bid strategy, budget type).
    // One call per account; non-fatal on failure.
    const campaignMetaById = new Map<string, ReturnType<typeof mapMetaCampaignMeta>>()
    try {
      const campObjs = await getCampaigns(actId, conn.access_token)
      for (const c of campObjs) campaignMetaById.set(c.id, mapMetaCampaignMeta(c))
    } catch (err: any) {
      console.warn(`[MetaSync] Campaign metadata fetch failed for ${conn.account_name}:`, err.message)
    }
```

- [ ] **Step 8: Persist the fields in the Meta upsert (UPDATE path)**

In `server/utils/spendSync.ts`, inside `for (const campaign of campaigns)`, just before the `existing` lookup (after line ~77), add:

```ts
      const cmeta = campaignMetaById.get(campaign.campaign_id) || null
```

Replace the UPDATE block (lines ~86-95) with:

```ts
      if (existing) {
        await queryOne(
          `UPDATE media_spend SET
             actual_spend = $1, campaign_name = $2, impressions = $3, clicks = $4,
             conversions = $5, client_id = COALESCE($6, media_spend.client_id),
             commission_rate = CASE WHEN $8 > 0 THEN $8 ELSE media_spend.commission_rate END,
             revenue = $9,
             campaign_status = COALESCE($10, media_spend.campaign_status),
             end_date = COALESCE($11, media_spend.end_date),
             bid_strategy = COALESCE($12, media_spend.bid_strategy),
             budget_type = COALESCE($13, media_spend.budget_type),
             synced_at = NOW(), updated_at = NOW()
           WHERE id = $7`,
          [spend, campaign.campaign_name || null, impressions, clicks, conversions, clientId, existing.id, commissionRate, revenue,
           cmeta?.status || null, cmeta?.endDate || null, cmeta?.bidStrategy || null, cmeta?.budgetType || null]
        )
      } else {
```

- [ ] **Step 9: Persist the fields in the Meta upsert (INSERT path)**

Replace the INSERT block (lines ~102-110) with:

```ts
        await queryOne(
          `INSERT INTO media_spend (
             client_id, platform, period, budget_allocated, actual_spend,
             commission_rate, connection_id, campaign_id, campaign_name,
             impressions, clicks, conversions, budget_rolling, revenue,
             campaign_status, end_date, bid_strategy, budget_type, synced_at
           ) VALUES ($1, 'meta', $2, $11, $3, $4, $5, $6, $7, $8, $9, $10, $12, $13, $14, $15, $16, $17, NOW())
           RETURNING id`,
          [clientId, period, spend, commissionRate, conn.id, campaign.campaign_id || null, campaign.campaign_name || null, impressions, clicks, conversions, budgetVal, rollingVal, revenue,
           cmeta?.status || null, cmeta?.endDate || null, cmeta?.bidStrategy || null, cmeta?.budgetType || null]
        )
```

- [ ] **Step 10: Typecheck the touched server files**

Run: `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>/dev/null | grep -E "spendSync|metaClient" || echo "no new errors in touched files"`
Expected: `no new errors in touched files` (pre-existing unrelated errors elsewhere are acceptable per CLAUDE.md).

- [ ] **Step 11: Commit**

```bash
git add server/utils/metaClient.ts server/utils/spendSync.ts test/server/utils/mapMetaCampaignMeta.test.ts
git commit -m "feat(analytics): capture Meta end date, bid strategy, budget type on sync"
```

---

## Task 3: API — return the new fields

**Files:**
- Modify: `server/api/agency/analytics/campaigns.get.ts` (ALLOWED_SORT ~17; CTE SELECT ~93-112; row map ~167-195)

- [ ] **Step 1: Widen the sort whitelist**

Replace line 17:

```ts
const ALLOWED_SORT = ['spend', 'budget', 'impressions', 'clicks', 'conversions', 'revenue', 'campaign_name', 'platform', 'lead_count', 'cost_per_lead', 'reach', 'cost_per_result', 'end_date'] as const
```

- [ ] **Step 2: Select the new fields in the `campaigns` CTE**

In the `campaigns` CTE SELECT, after the `COALESCE(SUM(ms.revenue), 0) as revenue,` line (line ~107), add:

```ts
          SUM(ms.reach) as reach,
          (array_agg(ms.cost_per_result ORDER BY ms.synced_at DESC NULLS LAST))[1] as cost_per_result,
          (array_agg(ms.result_type ORDER BY ms.synced_at DESC NULLS LAST))[1] as result_type,
          (array_agg(ms.end_date ORDER BY ms.synced_at DESC NULLS LAST))[1] as end_date,
          (array_agg(ms.bid_strategy ORDER BY ms.synced_at DESC NULLS LAST))[1] as bid_strategy,
          (array_agg(ms.budget_type ORDER BY ms.synced_at DESC NULLS LAST))[1] as budget_type,
```

(These are aggregate expressions, so they're valid alongside the existing `SUM`/`BOOL_OR`/`array_agg` aggregates under the same `GROUP BY`.)

- [ ] **Step 3: Map the new fields into the response object**

In the `.map((r) => { ... return { ... } })` block, after the `revenue,` property (line ~183) add:

```ts
        reach: toNum(r.reach),
        costPerResult: r.cost_per_result == null ? null : toNum(r.cost_per_result),
        resultType: r.result_type || null,
        endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
        bidStrategy: r.bid_strategy || null,
        budgetType: r.budget_type || null,
```

- [ ] **Step 4: Manual API smoke check**

Run (dev server must be running — `pnpm dev` in another terminal):

```bash
curl -s "http://localhost:3000/api/agency/analytics/campaigns?startDate=2026-05-01&endDate=2026-05-31&platform=meta&limit=1" | python3 -m json.tool | grep -E "reach|costPerResult|resultType|endDate|bidStrategy|budgetType"
```

Expected: the six keys appear in the first campaign object (values may be `null` for campaigns not yet re-synced — that's expected; they populate on the next Meta sync).

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/analytics/campaigns.get.ts
git commit -m "feat(analytics): expose reach/cost-per-result/end-date/bid-strategy in campaigns API"
```

---

## Task 4: Pure frontend display helpers (TDD)

These are pure functions with no Nuxt/DOM dependency, so they're directly unit-testable and keep the component thin.

**Files:**
- Create: `app/utils/metaCampaignFormat.ts`
- Test: `test/utils/metaCampaignFormat.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/utils/metaCampaignFormat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { metaBidStrategyLabel, budgetTypeLabel, endDateInfo } from '~/utils/metaCampaignFormat'

describe('metaBidStrategyLabel', () => {
  it('maps known Meta enums to friendly labels', () => {
    expect(metaBidStrategyLabel('LOWEST_COST_WITHOUT_CAP')).toBe('Highest volume')
    expect(metaBidStrategyLabel('COST_CAP')).toBe('Cost cap')
    expect(metaBidStrategyLabel('LOWEST_COST_WITH_BID_CAP')).toBe('Bid cap')
    expect(metaBidStrategyLabel('LOWEST_COST_WITH_MIN_ROAS')).toBe('Min ROAS')
  })
  it('title-cases unknown enums and handles null', () => {
    expect(metaBidStrategyLabel('SOME_NEW_THING')).toBe('Some New Thing')
    expect(metaBidStrategyLabel(null)).toBe('-')
  })
})

describe('budgetTypeLabel', () => {
  it('labels daily/lifetime and falls back to dash', () => {
    expect(budgetTypeLabel('daily')).toBe('Daily')
    expect(budgetTypeLabel('lifetime')).toBe('Lifetime')
    expect(budgetTypeLabel(null)).toBe('-')
  })
})

describe('endDateInfo', () => {
  const today = new Date('2026-05-29T00:00:00Z')
  it('returns null state for missing date', () => {
    expect(endDateInfo(null, today)).toEqual({ label: '-', hint: null, tone: 'muted' })
  })
  it('flags imminent end with a warning hint', () => {
    const r = endDateInfo('2026-05-31', today)
    expect(r.hint).toBe('2d left')
    expect(r.tone).toBe('warning')
  })
  it('marks past dates as ended', () => {
    const r = endDateInfo('2026-05-20', today)
    expect(r.hint).toBe('Ended')
    expect(r.tone).toBe('error')
  })
  it('no hint for far-future end dates', () => {
    const r = endDateInfo('2026-12-31', today)
    expect(r.hint).toBeNull()
    expect(r.tone).toBe('muted')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/utils/metaCampaignFormat.test.ts`
Expected: FAIL — cannot resolve `~/utils/metaCampaignFormat`.

- [ ] **Step 3: Implement the helpers**

Create `app/utils/metaCampaignFormat.ts`:

```ts
/** Pure display helpers for Meta Ads–style campaign columns. No Nuxt/DOM deps. */

const BID_STRATEGY_LABELS: Record<string, string> = {
  LOWEST_COST_WITHOUT_CAP: 'Highest volume',
  LOWEST_COST_WITH_BID_CAP: 'Bid cap',
  COST_CAP: 'Cost cap',
  LOWEST_COST_WITH_MIN_ROAS: 'Min ROAS',
}

export function metaBidStrategyLabel(raw: string | null | undefined): string {
  if (!raw) return '-'
  if (BID_STRATEGY_LABELS[raw]) return BID_STRATEGY_LABELS[raw]
  return raw
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function budgetTypeLabel(type: string | null | undefined): string {
  if (type === 'daily') return 'Daily'
  if (type === 'lifetime') return 'Lifetime'
  return '-'
}

export interface EndDateInfo {
  label: string
  hint: string | null
  tone: 'muted' | 'warning' | 'error'
}

/** Format an end date and compute a "Xd left" / "Ended" hint. `today` is injectable for tests. */
export function endDateInfo(value: string | Date | null | undefined, today: Date = new Date()): EndDateInfo {
  if (!value) return { label: '-', hint: null, tone: 'muted' }
  const end = new Date(value)
  if (isNaN(end.getTime())) return { label: '-', hint: null, tone: 'muted' }

  const label = end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const days = Math.round((startOfDay(end) - startOfDay(today)) / 86_400_000)

  if (days < 0) return { label, hint: 'Ended', tone: 'error' }
  if (days <= 3) return { label, hint: days === 0 ? 'Ends today' : `${days}d left`, tone: 'warning' }
  return { label, hint: null, tone: 'muted' }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/utils/metaCampaignFormat.test.ts`
Expected: PASS (all groups green).

- [ ] **Step 5: Commit**

```bash
git add app/utils/metaCampaignFormat.ts test/utils/metaCampaignFormat.test.ts
git commit -m "feat(analytics): add pure Meta campaign display helpers"
```

---

## Task 5: CampaignTable — columns, picker, preset, detail panel

This is a Vue component change. The header iterates a computed `columns` list; the body has fixed `<td>`s gated by a visibility predicate. **The body `<td>` DOM order must match `allColumns` order** so headers and cells stay aligned. Verified manually (Step 9) since component DOM testing infra isn't set up here; the formatting logic it relies on is already unit-tested in Task 4.

**Files:**
- Modify: `app/components/analytics/CampaignTable.vue`

- [ ] **Step 1: Add a props for the localStorage key**

In the `withDefaults(defineProps<{...}>(), {...})` block, add `columnsStorageKey?: string` to the type and `columnsStorageKey: 'analytics:campaign-cols'` to the defaults.

- [ ] **Step 2: Replace `allColumns` with the full ordered list (incl. sortable flags)**

Replace the `allColumns` array (lines ~120-132) with:

```ts
const allColumns = [
  { key: 'campaignName', label: 'Campaign', sortable: true },
  { key: 'delivery', label: 'Delivery', sortable: false },
  { key: 'spend', label: 'Spend', sortable: true },
  { key: 'budget', label: 'Budget', sortable: true },
  { key: 'variance', label: 'Variance', sortable: false },
  { key: 'results', label: 'Results', sortable: false },
  { key: 'costPerResult', label: 'Cost / result', sortable: true },
  { key: 'impressions', label: 'Impr.', sortable: true },
  { key: 'reach', label: 'Reach', sortable: true },
  { key: 'clicks', label: 'Clicks', sortable: true },
  { key: 'ctr', label: 'CTR', sortable: true },
  { key: 'cpc', label: 'CPC', sortable: true },
  { key: 'conversions', label: 'Conv.', sortable: true },
  { key: 'leadCount', label: 'Leads', sortable: true },
  { key: 'costPerLead', label: 'Cost / Lead', sortable: true },
  { key: 'bidStrategy', label: 'Bid strategy', sortable: false },
  { key: 'endDate', label: 'Ends', sortable: true }
]

// Columns shown today by default (new Meta columns are opt-in / via preset)
const DEFAULT_VISIBLE = ['campaignName', 'spend', 'budget', 'variance', 'impressions', 'clicks', 'ctr', 'cpc', 'conversions', 'leadCount', 'costPerLead']
// "Meta Ads view" preset mirrors Ads Manager
const META_PRESET = ['campaignName', 'delivery', 'results', 'costPerResult', 'budget', 'spend', 'impressions', 'reach', 'endDate', 'bidStrategy']

const visibleKeys = ref<string[]>([...DEFAULT_VISIBLE])

onMounted(() => {
  try {
    const saved = localStorage.getItem(props.columnsStorageKey)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) visibleKeys.value = parsed
    }
  } catch { /* ignore corrupt storage */ }
})

watch(visibleKeys, (v) => {
  if (import.meta.client) {
    try { localStorage.setItem(props.columnsStorageKey, JSON.stringify(v)) } catch { /* ignore */ }
  }
}, { deep: true })

function isLeadCol(key: string): boolean {
  return key === 'leadCount' || key === 'costPerLead'
}

function isVisible(key: string): boolean {
  if (key === 'campaignName') return true
  if (props.hideColumns.includes(key)) return false
  if (isLeadCol(key) && !props.showLeadColumns) return false
  return visibleKeys.value.includes(key)
}

function toggleColumn(key: string) {
  if (visibleKeys.value.includes(key)) {
    visibleKeys.value = visibleKeys.value.filter(k => k !== key)
  } else {
    visibleKeys.value = [...visibleKeys.value, key]
  }
}

function applyMetaPreset() {
  visibleKeys.value = META_PRESET.filter(k => !props.hideColumns.includes(k))
}

// Columns to render (header) — preserves allColumns order
const visibleColumns = computed(() => allColumns.filter(c => isVisible(c.key)))
```

- [ ] **Step 3: Update `columns` references and `sortKeyForColumn`**

The template currently iterates a `columns` computed. Rename usages to `visibleColumns` (header `v-for`, `:colspan` on the detail/empty rows → `visibleColumns.length`). Then replace the old `columns` computed (lines ~134-139) — delete it (superseded by `visibleColumns`). Keep `showColumn` for backward references but it's no longer needed; replace its body with `return isVisible(key)` so any remaining call sites stay correct.

Extend `sortKeyForColumn` (lines ~113-118) to map the new sortable keys:

```ts
function sortKeyForColumn(key: string): string {
  if (key === 'campaignName') return 'campaign_name'
  if (key === 'leadCount') return 'lead_count'
  if (key === 'costPerLead') return 'cost_per_lead'
  if (key === 'costPerResult') return 'cost_per_result'
  if (key === 'endDate') return 'end_date'
  return key
}
```

- [ ] **Step 4: Make the header respect the `sortable` flag**

In the `<thead>` `<th v-for="col in visibleColumns">`, gate the click + sort icon on `col.sortable`. Replace the `@click` and cursor class so non-sortable columns don't appear clickable:

```vue
            <th
              v-for="col in visibleColumns"
              :key="col.key"
              class="px-3 py-2.5 text-left text-xs font-medium text-muted transition-colors"
              :class="[col.key !== 'campaignName' ? 'text-right' : '', col.sortable ? 'cursor-pointer hover:text-default' : '']"
              @click="col.sortable && toggleSort(sortKeyForColumn(col.key))"
            >
              <div class="flex items-center gap-1" :class="col.key !== 'campaignName' ? 'justify-end' : ''">
                {{ col.label }}
                <UIcon
                  v-if="col.sortable && sortBy === sortKeyForColumn(col.key)"
                  :name="sortDir === 'desc' ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
                  class="w-3 h-3"
                />
              </div>
            </th>
```

- [ ] **Step 5: Add the column picker + Meta preset to the header bar**

In the header row (the `<div class="flex items-center gap-3 mb-3">` block, after the search `UInput`), add a preset button and a column-visibility dropdown:

```vue
      <UButton
        size="sm"
        variant="outline"
        icon="i-lucide-facebook"
        label="Meta Ads view"
        @click="applyMetaPreset"
      />
      <UDropdownMenu
        :items="[allColumns.filter(c => c.key !== 'campaignName' && !(isLeadCol(c.key) && !showLeadColumns) && !hideColumns.includes(c.key)).map(c => ({
          label: c.label,
          type: 'checkbox',
          checked: visibleKeys.includes(c.key),
          onUpdateChecked: () => toggleColumn(c.key),
          onSelect: (e: Event) => e.preventDefault()
        }))]"
        :content="{ align: 'end' }"
      >
        <UButton size="sm" variant="ghost" icon="i-lucide-sliders-horizontal" label="Columns" />
      </UDropdownMenu>
```

Note: wrap the existing search input's container so these sit to its right; keep the `ml-auto` on the search container or move it to the preset button so the group is right-aligned.

- [ ] **Step 6: Add the new body `<td>`s in `allColumns` order**

In `<tbody>`, the cells must appear in the same order as `allColumns`. Insert/gate cells so the final order is: campaignName, **delivery**, spend, budget, variance, **results**, **costPerResult**, impressions, **reach**, clicks, ctr, cpc, conversions, leadCount, costPerLead, **bidStrategy**, **endDate**. Gate every cell with `v-if="isVisible('<key>')"` (the campaignName cell stays ungated).

Add these new cells in the correct positions:

```vue
              <!-- after campaignName cell -->
              <td v-if="isVisible('delivery')" class="px-3 py-2.5 text-right">
                <UBadge
                  v-if="row.campaignStatus && row.campaignStatus !== 'UNKNOWN'"
                  variant="subtle"
                  :color="statusColor(row.campaignStatus)"
                  size="xs"
                >
                  {{ row.campaignStatus }}
                </UBadge>
                <span v-else class="text-muted">-</span>
              </td>
```

```vue
              <!-- after variance cell -->
              <td v-if="isVisible('results')" class="px-3 py-2.5 text-right tabular-nums">
                <div class="flex flex-col items-end leading-tight">
                  <span class="font-medium">{{ fmtCompact(row.conversions) }}</span>
                  <span v-if="row.resultType" class="text-[10px] text-muted">{{ row.resultType }}</span>
                </div>
              </td>
              <td v-if="isVisible('costPerResult')" class="px-3 py-2.5 text-right tabular-nums">
                {{ row.costPerResult != null ? fmtCurrency(row.costPerResult, 2) : '-' }}
              </td>
```

```vue
              <!-- after impressions cell -->
              <td v-if="isVisible('reach')" class="px-3 py-2.5 text-right tabular-nums">
                {{ row.reach ? fmtCompact(row.reach) : '-' }}
              </td>
```

```vue
              <!-- after costPerLead cell, at the end of the row -->
              <td v-if="isVisible('bidStrategy')" class="px-3 py-2.5 text-right text-muted">
                {{ metaBidStrategyLabel(row.bidStrategy) }}
              </td>
              <td v-if="isVisible('endDate')" class="px-3 py-2.5 text-right tabular-nums">
                <template v-if="row.endDate">
                  <div class="flex flex-col items-end leading-tight">
                    <span>{{ endDateInfo(row.endDate).label }}</span>
                    <span
                      v-if="endDateInfo(row.endDate).hint"
                      class="text-[10px] font-medium"
                      :class="endDateInfo(row.endDate).tone === 'error' ? 'text-error' : 'text-warning'"
                    >{{ endDateInfo(row.endDate).hint }}</span>
                  </div>
                </template>
                <span v-else class="text-muted">-</span>
              </td>
```

Also gate the existing cells (`spend`, `impressions`, `clicks`, `ctr`, `cpc`, `conversions`) with `v-if="isVisible('<key>')"` — currently `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `conversions` are always rendered. Add the guard to each so the picker can hide them. (`budget`, `variance`, `leadCount`, `costPerLead` are already conditionally rendered — switch their guards to `isVisible('<key>')` for consistency.)

- [ ] **Step 7: Add bid strategy / ends / budget type to the detail-panel footer**

In the expanded detail row's "Campaign meta" footer (the `<div class="flex items-center gap-4 mt-4 ...">`, lines ~417-425), add after the existing spans:

```vue
                  <span v-if="row.bidStrategy">Bid: {{ metaBidStrategyLabel(row.bidStrategy) }}</span>
                  <span v-if="row.budgetType">Budget type: {{ budgetTypeLabel(row.budgetType) }}</span>
                  <span v-if="row.endDate" class="flex items-center gap-1">
                    Ends: {{ endDateInfo(row.endDate).label }}
                    <span
                      v-if="endDateInfo(row.endDate).hint"
                      class="font-medium"
                      :class="endDateInfo(row.endDate).tone === 'error' ? 'text-error' : 'text-warning'"
                    >({{ endDateInfo(row.endDate).hint }})</span>
                  </span>
```

- [ ] **Step 8: Surface Reach + Cost per result in the detail KPI row**

In the expanded detail KPI metric array (lines ~342-352), add two entries after `Revenue` (before the `...(showLeadColumns ? [...] )` spread):

```ts
                      { label: 'Reach', value: row.reach ? fmtCompact(row.reach) : '-', icon: 'i-lucide-users' },
                      { label: 'Cost / result', value: row.costPerResult != null ? fmtCurrency(row.costPerResult, 2) : '-', icon: 'i-lucide-target' },
```

- [ ] **Step 9: Manual verification in the running app**

With `pnpm dev` running, open `http://localhost:3000/agency/analytics`:
1. Table renders unchanged on first load (default columns only). ✅
2. Click **Columns** → toggle on "Reach", "Cost / result", "Ends", "Bid strategy", "Delivery", "Results" → cells appear in correct positions, headers aligned. ✅
3. Click **Meta Ads view** → layout switches to the Meta set; reload the page → selection persists (localStorage). ✅
4. Expand the lead-gen campaign from the reference screenshot → KPI row shows Reach + Cost / result; footer shows Bid / Budget type / Ends (values populate after the next Meta sync; null shows "-"). ✅
5. Non-sortable headers (Delivery, Results, Bid strategy) are not clickable; sortable ones still sort. ✅

- [ ] **Step 10: Commit**

```bash
git add app/components/analytics/CampaignTable.vue
git commit -m "feat(analytics): Meta Ads-style columns, picker, and preset in campaign table"
```

---

## Task 6: Marketing page sync (per CLAUDE.md)

**Files:**
- Modify (if a gap exists): `app/pages/features/[slug].vue`, `app/pages/features/index.vue`

- [ ] **Step 1: Locate the Cross-Platform Analytics feature entry**

Run:

```bash
grep -rn "Cross-Platform Analytics\|cross-platform-analytics\|campaign table\|Ads Manager" app/pages/features app/components/MarketingNav.vue
```

- [ ] **Step 2: Add a sentence about Ads-Manager-style columns**

In the existing Cross-Platform Analytics feature entry (slug page content sections and/or the index feature card description), add a short line such as: "Review campaigns in an Ads-Manager-style grid — Delivery, Results, Cost per result, Reach, Bid strategy and end dates, with a saveable column layout." Match the surrounding copy's tone and structure. If no Cross-Platform Analytics entry exists, skip (do not invent a new category) and note it in the final summary.

- [ ] **Step 3: Commit (only if changes were made)**

```bash
git add app/pages/features
git commit -m "docs(marketing): mention Ads-Manager-style analytics columns"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full unit test suite for new tests**

Run: `pnpm exec vitest run test/utils/metaCampaignFormat.test.ts test/server/utils/mapMetaCampaignMeta.test.ts`
Expected: all PASS.

- [ ] **Step 2: Production build sanity (OOM-safe per CLAUDE.md)**

Run: `NODE_OPTIONS='--max-old-space-size=8192' pnpm build`
Expected: build completes (pre-existing ~60 TS errors from `index.d.ts` are acceptable; no new errors referencing the files touched here).

- [ ] **Step 3: Pre-commit deep-dive review (per CLAUDE.md)**

Re-read every modified/new file end-to-end and confirm:
- Server imports use `~~/` (not `~/`) — check `spendSync.ts`, `campaigns.get.ts`, test importing `~~/server/utils/metaClient`.
- No `USelectMenu` with empty-string values introduced (n/a here; `UDropdownMenu` checkbox items).
- `visibleColumns` order matches the body `<td>` DOM order exactly.
- SQL `$N` placeholders in both Meta upserts are unique per purpose and sequential.
- Hex/alpha color construction n/a.
- No frontend-only imports leaked into Nitro files.

- [ ] **Step 4: Summary**

Report what shipped, which fields populate immediately (Reach/Cost-per-result/Result-type for already-expanded campaigns) vs on the next Meta sync (Delivery/Ends/Bid strategy/Budget type), and that attribution + messaging columns were intentionally deferred.

---

## Known limitations (documented, not bugs)

- **`getCampaigns` returns up to 100 campaigns per account without pagination** (existing `metaClient` behavior). Accounts with >100 campaigns won't enrich the overflow; their new columns stay null until that's addressed. Acceptable for current account sizes; a follow-up can add paging.
- **New synced fields populate on the next Meta sync**, not retroactively. Existing rows show "-" until re-synced. Reach/cost-per-result/result-type populate when a campaign is expanded (existing on-demand path) and on subsequent syncs.
- **Reach is summed across periods** in the aggregate (overstates de-duplicated reach when a campaign spans multiple months). Consistent with how other metrics aggregate; acceptable for a display column.
- **`budget_type` is a label only** (Daily/Lifetime); the table "Budget" column remains the agency-allocated budget, not Meta's platform budget. Shown in the detail panel as context.

# Meta-columns follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (A) Populate Ends/Bid strategy/Cost-per-result for Google rows in the analytics campaign table; (B) add Status/Cost-per-result/Ends (+ result-type on Conv.) to the `/agency/social/meta` budget grid.

**Architecture:** No migration — `media_spend` already has all needed columns. Google gets `end_date`/`bid_strategy` from its GAQL query + a daily `budget_type`, persisted in the existing Google upsert; the analytics API adds a Google cost-per-result fallback. The shared bid-strategy label helper is renamed and gains Google enums. The social/meta endpoint (already reading `media_spend`) returns the extra columns and the hand-built grid renders a Meta-gated subset.

**Tech Stack:** Nitro + Neon, Google Ads REST (GAQL) via `googleAdsClient.ts`, Nuxt 4 / Vue 3, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-29-meta-columns-followups-design.md`

---

## Task A1: Google client — end date + bid strategy (TDD for the sentinel helper)

**Files:** Modify `server/utils/googleAdsClient.ts`; Test `test/server/utils/normalizeGoogleEndDate.test.ts`

- [ ] **Step 1 — failing test** `test/server/utils/normalizeGoogleEndDate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeGoogleEndDate } from '~~/server/utils/googleAdsClient'

describe('normalizeGoogleEndDate', () => {
  it('passes through a real end date', () => {
    expect(normalizeGoogleEndDate('2026-06-15')).toBe('2026-06-15')
  })
  it('treats the no-end sentinel (2037-12-30) as null', () => {
    expect(normalizeGoogleEndDate('2037-12-30')).toBeNull()
  })
  it('treats any 2037+ date as null', () => {
    expect(normalizeGoogleEndDate('2037-01-01')).toBeNull()
    expect(normalizeGoogleEndDate('2040-05-01')).toBeNull()
  })
  it('returns null for empty/missing', () => {
    expect(normalizeGoogleEndDate('')).toBeNull()
    expect(normalizeGoogleEndDate(undefined)).toBeNull()
    expect(normalizeGoogleEndDate(null)).toBeNull()
  })
})
```
- [ ] **Step 2 — run, expect fail:** `pnpm exec vitest run test/server/utils/normalizeGoogleEndDate.test.ts` → not exported.
- [ ] **Step 3 — implement.** In `server/utils/googleAdsClient.ts`, add the exported helper (near the other exports, e.g. just above `getMonthlySpend`):
```ts
/** Google uses 2037-12-30 as the "no end date" sentinel. Treat that (and any 2037+) as no end. */
export function normalizeGoogleEndDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  if (Number(d.slice(0, 4)) >= 2037) return null
  return d
}
```
Extend `GoogleAdsCampaignSpend` (after `channelType: string`):
```ts
  endDate?: string | null
  bidStrategy?: string | null
```
In `getMonthlySpend`, add to the GAQL `SELECT` (after `campaign.advertising_channel_type,`):
```
      campaign.end_date,
      campaign.bidding_strategy_type,
```
In the `.map((r) => …)` return object (after `channelType: …`):
```ts
      endDate: normalizeGoogleEndDate(r.campaign.endDate),
      bidStrategy: r.campaign.biddingStrategyType || null,
```
- [ ] **Step 4 — run, expect pass:** same vitest command → 4 pass.
- [ ] **Step 5 — typecheck:** `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>/dev/null | grep googleAdsClient || echo "clean"`.
- [ ] **Step 6 — commit:**
```bash
git add server/utils/googleAdsClient.ts test/server/utils/normalizeGoogleEndDate.test.ts
git commit -m "feat(analytics): fetch Google campaign end date + bid strategy"
```
(trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)

---

## Task A2: Persist Google fields in the sync upsert

**Files:** Modify `server/utils/spendSync.ts` (`syncGoogleSpend`, the Google UPDATE ~250-260 and INSERT ~267-275).

Current Google UPDATE params map `$1..$11` = [spend, name, impressions, clicks, conversions, clientId, channelType, status, existing.id, commissionRate, conversionsValue]; WHERE id = `$9`. Current INSERT maps `$1..$15` with budget_allocated=`$13`, budget_rolling=`$14`, revenue=`$15`.

- [ ] **Step 1 — UPDATE path.** Add three SET clauses and append three params. After the `revenue = $11,` line add:
```sql
             end_date = COALESCE($12, media_spend.end_date),
             bid_strategy = COALESCE($13, media_spend.bid_strategy),
             budget_type = COALESCE($14, media_spend.budget_type),
```
Append to the UPDATE param array (after `campaign.conversionsValue || 0`): `campaign.endDate || null, campaign.bidStrategy || null, 'daily'`.
- [ ] **Step 2 — INSERT path.** Add columns `end_date, bid_strategy, budget_type` to the column list and `$16, $17, $18` to VALUES (before `synced_at`/`NOW()` placement — keep `NOW()` last). Append params `campaign.endDate || null, campaign.bidStrategy || null, 'daily'` to the INSERT array. Walk every `$N` to confirm sequencing after insertion.
- [ ] **Step 3 — typecheck:** `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>/dev/null | grep spendSync || echo "clean"`.
- [ ] **Step 4 — commit:**
```bash
git add server/utils/spendSync.ts
git commit -m "feat(analytics): persist Google end date/bid strategy/budget type on sync"
```

---

## Task A3: Google cost-per-result fallback in the API

**Files:** Modify `server/api/agency/analytics/campaigns.get.ts` (the `.map((r) => …)` block).

Currently maps `costPerResult: r.cost_per_result == null ? null : toNum(r.cost_per_result)` and `resultType: r.result_type || null`. `metrics` (from `computeMetrics`) already includes `costPerConversion`.

- [ ] **Step 1 — replace those two lines** with a Google fallback:
```ts
        costPerResult: r.cost_per_result != null
          ? toNum(r.cost_per_result)
          : (r.platform === 'google_ads' && conversions > 0 ? metrics.costPerConversion ?? null : null),
        resultType: r.result_type || (r.platform === 'google_ads' && conversions > 0 ? 'Conversions' : null),
```
(`conversions` and `metrics` are already in scope in this map callback. If `metrics.costPerConversion` is named differently, use the actual computed cost-per-conversion field — verify against `computeMetrics` in `~~/server/utils/analyticsMetrics`.)
- [ ] **Step 2 — typecheck:** grep `campaigns.get` → clean.
- [ ] **Step 3 — commit:**
```bash
git add server/api/agency/analytics/campaigns.get.ts
git commit -m "feat(analytics): Google cost-per-result falls back to cost-per-conversion"
```

---

## Task A4: Rename bid-strategy helper + add Google enums (TDD)

**Files:** Modify `app/utils/metaCampaignFormat.ts`, `app/components/analytics/CampaignTable.vue`, `test/utils/metaCampaignFormat.test.ts`.

- [ ] **Step 1 — update the test first** (`test/utils/metaCampaignFormat.test.ts`): rename the import and all calls `metaBidStrategyLabel` → `bidStrategyLabel`, rename the `describe('metaBidStrategyLabel'…)` → `describe('bidStrategyLabel'…)`, and add Google cases inside it:
```ts
  it('maps Google bid-strategy enums', () => {
    expect(bidStrategyLabel('MAXIMIZE_CONVERSIONS')).toBe('Maximize conversions')
    expect(bidStrategyLabel('TARGET_CPA')).toBe('Target CPA')
    expect(bidStrategyLabel('TARGET_ROAS')).toBe('Target ROAS')
    expect(bidStrategyLabel('MANUAL_CPC')).toBe('Manual CPC')
  })
```
- [ ] **Step 2 — run, expect fail:** `pnpm exec vitest run test/utils/metaCampaignFormat.test.ts` (bidStrategyLabel not exported / Google cases fail).
- [ ] **Step 3 — implement.** In `app/utils/metaCampaignFormat.ts`: rename `export function metaBidStrategyLabel` → `export function bidStrategyLabel`, and extend `BID_STRATEGY_LABELS` with:
```ts
  MAXIMIZE_CONVERSIONS: 'Maximize conversions',
  MAXIMIZE_CONVERSION_VALUE: 'Maximize conv. value',
  TARGET_CPA: 'Target CPA',
  TARGET_ROAS: 'Target ROAS',
  TARGET_SPEND: 'Maximize clicks',
  MAXIMIZE_CLICKS: 'Maximize clicks',
  MANUAL_CPC: 'Manual CPC',
  MANUAL_CPM: 'Manual CPM',
```
- [ ] **Step 4 — update component usages.** In `app/components/analytics/CampaignTable.vue`, replace both `metaBidStrategyLabel(row.bidStrategy)` (≈ lines 437 and 591) with `bidStrategyLabel(row.bidStrategy)`.
- [ ] **Step 5 — confirm no stale refs:** `grep -rn "metaBidStrategyLabel" app/ test/ server/` → no results.
- [ ] **Step 6 — run, expect pass:** vitest on the format test → all pass.
- [ ] **Step 7 — typecheck:** `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.json 2>/dev/null | grep -E "CampaignTable|metaCampaignFormat" || echo "clean"`.
- [ ] **Step 8 — commit:**
```bash
git add app/utils/metaCampaignFormat.ts app/components/analytics/CampaignTable.vue test/utils/metaCampaignFormat.test.ts
git commit -m "refactor(analytics): rename bidStrategyLabel + add Google bid-strategy enums"
```

---

## Task B1: social/meta endpoint returns the extra columns

**Files:** Modify `server/api/agency/social/meta/account-campaigns.get.ts`.

- [ ] **Step 1 — extend the typed row + SELECT + return.** Add to the typed row interface: `reach: number | null; cost_per_result: number | null; result_type: string | null; end_date: string | null; bid_strategy: string | null; budget_type: string | null`. Add the same columns to the `SELECT` list. Add to the returned object:
```ts
    reach: r.reach,
    costPerResult: r.cost_per_result,
    resultType: r.result_type,
    endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
    bidStrategy: r.bid_strategy,
    budgetType: r.budget_type,
```
- [ ] **Step 2 — typecheck:** grep `account-campaigns` → clean.
- [ ] **Step 3 — commit:**
```bash
git add server/api/agency/social/meta/account-campaigns.get.ts
git commit -m "feat(social): return Meta performance columns from account-campaigns endpoint"
```

---

## Task B2: social grid — Meta Status/Cost-per-result/Ends columns + result type on Conv.

**Files:** Modify `app/pages/agency/social/[platform].vue`.

The per-account campaign sub-table header is ~lines 660-673; body rows ~676-708+; `campaignStatusBadge` is ~line 394. The Type/Status `<th>`/`<td>` are gated `v-if="platform === 'google' || platform === 'tiktok'"`.

- [ ] **Step 1 — extend `campaignStatusBadge`** map (~line 394) with Meta effective_status variants (keep existing entries + neutral fallback):
```ts
    CAMPAIGN_PAUSED: { label: 'Paused', color: 'warning' },
    ADSET_PAUSED: { label: 'Paused', color: 'warning' },
    IN_PROCESS: { label: 'In process', color: 'info' },
    WITH_ISSUES: { label: 'With issues', color: 'warning' },
    DISAPPROVED: { label: 'Disapproved', color: 'error' },
```
- [ ] **Step 2 — show the Status column for Meta too.** Change the **Status** `<th>` and its `<td>` gate from `v-if="platform === 'google' || platform === 'tiktok'"` to `v-if="platform === 'google' || platform === 'tiktok' || platform === 'meta'"`. (Leave the **Type** column gate unchanged — google/tiktok only.)
- [ ] **Step 3 — add two Meta-only header cells.** In `<thead>`, after the `Conv.` `<th>`, add:
```vue
                            <th v-if="platform === 'meta'" class="text-right px-4 py-2 font-medium text-muted text-xs">Cost / result</th>
                            <th v-if="platform === 'meta'" class="text-right px-4 py-2 font-medium text-muted text-xs">Ends</th>
```
- [ ] **Step 4 — annotate the Conv. cell with result type (Meta).** In the existing Conv. `<td>` body cell, wrap the value so it shows the type beneath when present:
```vue
                            <td class="px-4 py-2 text-right tabular-nums">
                              <div class="flex flex-col items-end leading-tight">
                                <span>{{ camp.conversions }}</span>
                                <span v-if="platform === 'meta' && camp.resultType" class="text-[10px] text-muted">{{ camp.resultType }}</span>
                              </div>
                            </td>
```
(Match the existing Conv. cell's current markup — if it renders `camp.conversions` differently, preserve that and just add the sublabel.)
- [ ] **Step 5 — add the two Meta-only body cells** after the Conv. `<td>`, in the same order as the headers:
```vue
                            <td v-if="platform === 'meta'" class="px-4 py-2 text-right tabular-nums">
                              {{ camp.costPerResult != null ? formatCurrency(camp.costPerResult) : '-' }}
                            </td>
                            <td v-if="platform === 'meta'" class="px-4 py-2 text-right tabular-nums">
                              <template v-if="camp.endDate">
                                <div class="flex flex-col items-end leading-tight">
                                  <span>{{ endDateInfo(camp.endDate).label }}</span>
                                  <span v-if="endDateInfo(camp.endDate).hint" class="text-[10px] font-medium" :class="endDateInfo(camp.endDate).tone === 'error' ? 'text-error' : 'text-warning'">{{ endDateInfo(camp.endDate).hint }}</span>
                                </div>
                              </template>
                              <span v-else class="text-muted">-</span>
                            </td>
```
(`endDateInfo` is auto-imported. `formatCurrency` is the page's existing currency formatter — confirm its name by reading the file.)
- [ ] **Step 6 — verify header/body cell-count parity** for the Meta case (walk the columns) and for google/tiktok (unchanged). Confirm `formatCurrency` exists and signature matches.
- [ ] **Step 7 — typecheck:** `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.json 2>/dev/null | grep "social" || echo "clean"`.
- [ ] **Step 8 — commit:**
```bash
git add "app/pages/agency/social/[platform].vue"
git commit -m "feat(social): Meta delivery/cost-per-result/ends columns on social spend grid"
```

---

## Task C: final verification

- [ ] Run all related unit tests: `pnpm exec vitest run test/server/utils/normalizeGoogleEndDate.test.ts test/server/utils/mapMetaCampaignMeta.test.ts test/utils/metaCampaignFormat.test.ts` → all pass.
- [ ] No stale `metaBidStrategyLabel` references anywhere.
- [ ] Pre-commit deep-dive: `~~/` aliases on server files; SQL `$N` sequencing in the Google upserts; header/body cell parity in the social grid; no frontend imports in Nitro files.
- [ ] Summary: which fields populate immediately vs on next Google/Meta sync; reach intentionally absent for Google + social grid.

## Known limitations (documented)
- Google `end_date`/`bid_strategy`/`budget_type` populate on the **next Google sync**, not retroactively.
- Google `budget_type` is hardcoded `'daily'` (Google campaign budgets are daily; campaign-budget type not separately fetched).
- Reach: no Google equivalent; not added to the social grid (chosen subset).

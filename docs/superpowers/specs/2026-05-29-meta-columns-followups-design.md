# Meta-columns follow-ups: Google coverage + social/meta grid

**Date:** 2026-05-29
**Status:** Approved — ready for implementation plan
**Builds on:** `2026-05-29-meta-ads-columns-analytics-design.md` (shipped on `feat/meta-ads-columns-analytics`, PR #12)

Two independent follow-up sub-projects requested after the Meta column work shipped. Neither needs a DB migration — the `media_spend` columns already exist (`reach`, `cost_per_result`, `result_type` from migs 041/042; `end_date`, `bid_strategy`, `budget_type` from mig 119).

---

## Sub-project A — Google coverage in the Analytics table

Today, Google rows in `AnalyticsCampaignTable` populate only Delivery (status) and Results (conversions); Cost per result / Ends / Bid strategy show "–" because only the Meta sync was wired. This extends the Google pipeline so those columns populate. Reach has no Google equivalent and stays "–".

### A1. `server/utils/googleAdsClient.ts`
- Add `campaign.end_date` and `campaign.bidding_strategy_type` to the `getMonthlySpend` GAQL `SELECT`.
- Extend `GoogleAdsCampaignSpend` with `endDate?: string | null` and `bidStrategy?: string | null`.
- Map in the `.map((r) => …)`: `bidStrategy = r.campaign.biddingStrategyType || null`; `endDate = normalizeGoogleEndDate(r.campaign.endDate)`.
- Add an exported pure helper `normalizeGoogleEndDate(value)`: returns `null` for empty/missing and for Google's "no end" sentinel `'2037-12-30'` (and any date in year ≥ 2037); otherwise returns the `'YYYY-MM-DD'` string. This prevents fake far-future end dates from rendering.

### A2. `server/utils/spendSync.ts` (`syncGoogleSpend` only)
- Persist `end_date`, `bid_strategy`, and `budget_type = 'daily'` (Google campaign budgets are daily) in BOTH the Google UPDATE and INSERT paths, mirroring the Meta change. `campaign_status` is already set. Append the new params; verify `$N` sequencing.

### A3. `server/api/agency/analytics/campaigns.get.ts`
- Google **Cost-per-result fallback**: in the response map, when `cost_per_result` is null and the row is `google_ads` with `conversions > 0`, set `costPerResult = metrics.costPerConversion` and `resultType = 'Conversions'`. (Meta rows keep their synced values.) This makes the Cost-per-result column populate for Google without new sync/migration.

### A4. `app/utils/metaCampaignFormat.ts`
- **Rename** `metaBidStrategyLabel` → `bidStrategyLabel` (it now serves both platforms); update its two usages in `CampaignTable.vue` and the test import/name.
- Add Google bid-strategy enums to the label map: `MAXIMIZE_CONVERSIONS` → "Maximize conversions", `MAXIMIZE_CONVERSION_VALUE` → "Maximize conv. value", `TARGET_CPA` → "Target CPA", `TARGET_ROAS` → "Target ROAS", `TARGET_SPEND` / `MAXIMIZE_CLICKS` → "Maximize clicks", `MANUAL_CPC` → "Manual CPC", `MANUAL_CPM` → "Manual CPM". Unknowns still title-case.

### A tests
- `normalizeGoogleEndDate`: real date passthrough, `'2037-12-30'` → null, empty/undefined → null, a 2037+ date → null.
- `bidStrategyLabel`: existing Meta cases still pass under the new name + new Google enum cases + title-case fallback.

---

## Sub-project B — performance columns on `/agency/social/meta`

That page (`app/pages/agency/social/[platform].vue`) renders a separate, hand-built budget-management grid per ad account (inline budget editing), fed by `meta/account-campaigns.get.ts` which already queries `media_spend`. Existing columns: Campaign, [Type/Status — google/tiktok only], Spend, Budget (editable), Variance, Commission, Impressions, Clicks, Conv.

Approved subset to add **for Meta only** (`v-if="platform === 'meta'"`): **Status/Delivery, Cost per result, Ends**, plus the **result type** annotated onto the existing Conv. cell (avoids a duplicate "Results" column, since Conv. already shows the count).

### B1. `server/api/agency/social/meta/account-campaigns.get.ts`
- Add to the `SELECT` and typed row + response map: `reach`, `cost_per_result`, `result_type`, `end_date`, `bid_strategy`, `budget_type` → response keys `costPerResult`, `resultType`, `endDate`, `bidStrategy`, `budgetType` (endDate sliced to `'YYYY-MM-DD'`). (`reach`/`bidStrategy`/`budgetType` are returned for parity/future use even though the chosen subset doesn't render all of them.)

### B2. `app/pages/agency/social/[platform].vue`
- Currently the Type/Status columns are gated `v-if="platform === 'google' || platform === 'tiktok'"`. Extend the **Status** column gate to include `'meta'` so Meta shows a Delivery badge (Type stays google/tiktok). Reuse `campaignStatusBadge`.
- Extend `campaignStatusBadge` map with Meta effective_status variants: `CAMPAIGN_PAUSED` / `ADSET_PAUSED` → "Paused"/warning, `IN_PROCESS` → "In process"/info, `WITH_ISSUES` → "With issues"/warning, `DISAPPROVED` → "Disapproved"/error (keeps the raw-label neutral fallback for anything unmapped).
- Add two Meta-only `<th>/<td>` columns (`v-if="platform === 'meta'"`): **Cost / result** (`camp.costPerResult` via `fmtCurrency`-equivalent `formatCurrency`, else "–") and **Ends** (using the auto-imported `endDateInfo` — date + "Xd left"/"Ended" hint).
- In the existing **Conv.** cell, when `platform === 'meta' && camp.resultType`, render the result type as a muted sub-label beneath the count.
- Header and body cell order must stay aligned (this is a hand-built `<table>`; insert the new `<th>` and `<td>` at matching positions).

### B notes
- `endDateInfo`, `bidStrategyLabel` are Nuxt auto-imported (used without import).
- No column picker on this grid (keeps the budget view simple) — columns are fixed.

---

## Non-goals
- No DB migration (columns exist).
- No Reach column for Google (no equivalent metric) or on the social grid (not in the chosen subset).
- No changes to other social platform pages' behavior (google/tiktok/etc. columns unchanged; new columns are Meta-gated).
- No retroactive backfill — Google end_date/bid_strategy populate on the next Google sync.

## Testing
- Unit: `normalizeGoogleEndDate`, `bidStrategyLabel` (renamed, Meta + Google cases). Existing `mapMetaCampaignMeta` + `endDateInfo` tests must still pass (update the renamed import).
- Typecheck: googleAdsClient, spendSync, campaigns.get.ts, meta/account-campaigns.get.ts, CampaignTable.vue, social/[platform].vue — no new errors.
- Manual: after a Google sync, Google rows in `/agency/analytics` show Ends/Bid strategy/Cost-per-result (Reach "–"). On `/agency/social/meta`, Meta campaigns show a Delivery badge, Cost/result, Ends, and result-type sublabel on Conv.

## Edge cases
- Google `end_date` absent or `2037-12-30` → null → "–" (no fake far-future date).
- Google campaign with 0 conversions → Cost-per-result stays "–" (no divide-by-zero).
- Meta rows on the social grid with null new fields (not yet re-synced) → "–".
- Renaming `metaBidStrategyLabel`: ensure no stale references remain anywhere (grep before commit).

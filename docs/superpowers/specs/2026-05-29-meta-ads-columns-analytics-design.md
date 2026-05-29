# Meta Ads–style columns for Analytics

**Date:** 2026-05-29
**Status:** Approved — ready for implementation plan
**Surface:** `/agency/analytics` (internal) and `/agency/analytics/client/[id]` (client-facing) — both render the same `AnalyticsCampaignTable`.

## Problem

A marketer reviewing campaign performance wants the analytics campaign table to read like Meta Ads Manager's grid, and to be able to *display* a chosen subset of those columns. The reference (Meta Ads Manager) shows: Delivery, Results, Cost per result, Budget, Amount spent, Impressions, Reach, Ends, Attribution setting, Bid strategy, Messaging conversations started, Cost per messaging conversation started.

Today's `AnalyticsCampaignTable` row shows: Campaign, Spend, Budget, Variance, Impr., Clicks, CTR, CPC, Conv., Leads, Cost / Lead. The expanded detail panel shows CPM, Cost/Conv, Conv Rate, ROAS, Revenue, and (lazily, via the breakdowns endpoint) Reach, Cost per result, frequency, rankings, etc.

## Gap analysis (Meta column → our data)

| Meta column | Status | Source |
|---|---|---|
| Delivery | Have | `campaignStatus` (badge today) |
| Results | Partial | `conversions` count + `result_type` label |
| Cost per result | Have (not in row) | `media_spend.cost_per_result` (mig 042) |
| Budget | Have | `budget` |
| Amount spent | Have | `spend` |
| Impressions | Have | `impressions` |
| Reach | Have (not in row) | `media_spend.reach` (mig 041) |
| Ends | **Missing** | needs sync + migration |
| Bid strategy | **Missing** | needs sync + migration |
| Attribution setting | Deferred | ad-set level (`attribution_spec`), awkward at campaign level |
| Messaging conversations (+ cost) | Deferred | only relevant for click-to-Messenger/WhatsApp |

`reach`, `cost_per_result`, `result_type` are already columns on `media_spend`; the campaigns query simply does not `SELECT` them. Surfacing them is display-only work.

## Scope decision

- **Add now (new synced data):** `end_date`, `bid_strategy`, `budget_type` (daily/lifetime).
- **Surface (existing data):** Reach, Cost per result, Results (+ type), Delivery into the table row and detail panel.
- **Defer:** Attribution setting, Messaging conversations + cost-per. Same migration/sync pattern can add them later.

## Design

### 1. Data layer

**Migration `119-campaign-meta-fields.sql`** (additive, `ADD COLUMN IF NOT EXISTS`, auto-run per CLAUDE.md):

```sql
ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS bid_strategy VARCHAR(40),
  ADD COLUMN IF NOT EXISTS budget_type VARCHAR(10); -- 'daily' | 'lifetime'
```

**Meta sync** (`server/utils/metaClient.ts`):
- Extend the `getCampaigns` campaign `fields` from `id,name,status,objective,daily_budget,lifetime_budget` to add `bid_strategy,stop_time,start_time`.
- Extend the `MetaCampaign` interface with `bid_strategy?`, `stop_time?`, `start_time?`.
- Derive `budget_type`: `'lifetime'` if `lifetime_budget` present, else `'daily'` if `daily_budget` present, else null.

**Persist** (`server/utils/spendSync.ts`, Meta upsert block): write `end_date` (from `stop_time`, date portion), `bid_strategy`, `budget_type` on both the INSERT and UPDATE paths for Meta rows. Google end date is best-effort/optional; null is acceptable.

### 2. API — `server/api/agency/analytics/campaigns.get.ts`

- In the `campaigns` CTE aggregate, add:
  - `SUM(ms.reach) AS reach`
  - latest-row pickups via `(array_agg(ms.<col> ORDER BY ms.synced_at DESC NULLS LAST))[1]` for `cost_per_result`, `result_type`, `end_date`, `bid_strategy`, `budget_type`.
- Map into the returned campaign object: `reach`, `costPerResult`, `resultType`, `endDate`, `bidStrategy`, `budgetType`.
- Add `reach` to `ALLOWED_SORT`.
- **Results** column is derived client-side as `conversions` + `resultType` label.

### 3. Table — `app/components/analytics/CampaignTable.vue`

- Extend `allColumns` with: `delivery` (Delivery — render the status badge in its own column), `results` (count + type), `costPerResult` (Cost / result), `reach` (Reach), `endDate` (Ends), `bidStrategy` (Bid strategy).
- **Column-visibility dropdown** (`UDropdownMenu` with `UCheckbox` items) lets the user show/hide columns. Selection persists to `localStorage` (keyed per surface, e.g. `analytics:campaign-cols`). New columns default to hidden so today's layout is unchanged on first load.
- **"Meta Ads view" preset** button sets visibility to: Delivery, Results, Cost / result, Budget, Amount spent (Spend), Impressions, Reach, Ends, Bid strategy.
- The existing `hideColumns` prop continues to force-hide columns regardless of user toggles (e.g. client-facing surface can still suppress columns).
- **Ends** cell: formatted date; when within ~3 days, show an amber "Xd left" hint (mirrors Meta's "1 day left"); past dates show "Ended".
- `sortKeyForColumn` updated for new sortable keys (`reach`, `cost_per_result`, `end_date`); non-sortable display columns (Delivery, Results, Bid strategy) are not wired to sort.

### 4. Detail panel (expanded row in `CampaignTable.vue`)

- Add **Bid strategy**, **Ends (+ days left)**, **Budget type (Daily/Lifetime)** to the campaign-meta footer line.
- Ensure the KPI row / `ExtraMetricsRow` reads Reach and Cost per result from the row data now that the API returns them (no behavior regression for the lazy breakdowns path).

### 5. Marketing page sync (per CLAUDE.md)

- Check `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, and `MarketingNav.vue` for the Cross-Platform Analytics entry; add a mention of Ads-Manager-style campaign columns if not already implied. No new feature category expected.

## Non-goals

- Attribution setting and Messaging conversations columns (deferred; documented pattern above).
- Changing the breakdowns / on-demand sync architecture.
- Any change to Google-specific metrics display.

## Testing

- **Migration:** runs cleanly; columns present and nullable.
- **Sync (unit):** `MetaCampaign` mapping derives `budget_type` correctly for daily-only, lifetime-only, and neither; `end_date` parses from `stop_time`; missing fields → null.
- **API (unit/integration):** campaigns response includes `reach`, `costPerResult`, `resultType`, `endDate`, `bidStrategy`, `budgetType`; `reach` sort works; rows with null new fields don't break.
- **Component:** column picker toggles columns; preset applies the Meta set; `localStorage` round-trips; `hideColumns` still wins; "Xd left" / "Ended" rendering for boundary dates.
- **Manual:** load `/agency/analytics`, apply Meta Ads view, expand the lead-gen campaign from the reference screenshot, confirm Reach/Cost-per-result/Ends/Bid strategy render.

## Edge cases

- Null `end_date`/`bid_strategy`/`budget_type` (older synced rows, Google rows) → render "-".
- `result_type` present but `conversions` 0 (the reference shows Cost per Lead with 0 matched leads) → show count 0 with type; do not divide-by-zero for any derived rate.
- Aggregation across multiple `media_spend` rows per campaign: scalar metadata (end_date, bid_strategy, budget_type, cost_per_result, result_type) uses the latest-synced row; reach sums (acknowledged as an approximation across periods, consistent with existing aggregate treatment).

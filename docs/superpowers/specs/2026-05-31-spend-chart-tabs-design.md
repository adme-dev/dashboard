# Spend chart tabs — design

**Date:** 2026-05-31
**Scope:** `/agency/social/[platform]` spend chart — add tabbed views for an agency team.
**Status:** Approved (design), pending implementation.

## Goal

Turn the single daily-spend chart into a tabbed view with three charts that map to how
a marketing agency team works day-to-day: **Spend**, **Pacing**, **Performance**.

## Approach

A `UTabs` above the chart with three tabs. Each tab lazy-renders its own
`.client.vue` chart component (only the active tab computes). All three consume the
same `{ campaigns, totals }` already fetched by the page (`filteredChartData`,
which respects the week filter and account scope). New charts are hand-rolled SVG
matching the existing `SpendChart.client.vue` (same dimensions, scale helpers,
formatters, dark-mode semantic colors) — no new chart dependency.

## Tabs

### Tab 1 — Spend (existing, unchanged)
`SpendChart.client.vue`. Daily stacked bars by campaign, top 10 + "Other".
Header total = monthly figure (per the earlier fix).

### Tab 2 — Pacing (`SpendPacingChart.client.vue`, new)
Cumulative spend across the month (running sum of `totals[].spend`), solid line/area
up to the last synced day. Adaptive overlay:
- **Budget set** (Σ`budget_allocated` > 0): straight "ideal pace" line to the budget
  total; label on-pace / over / under vs pace-to-date; PLUS a dashed run-rate
  projection to the month-end landing point.
- **No budget**: dashed run-rate projection from the last actual point to month-end,
  labelled "projected ~$X" (run rate = avg daily spend so far).

### Tab 3 — Performance (`SpendPerformanceChart.client.vue`, new)
Line chart with a metric switcher: **ROAS, CPA, CTR, CPC**, computed per day from
totals:
- ROAS = revenue ÷ spend
- CPA = spend ÷ conversions
- CTR = clicks ÷ impressions
- CPC = spend ÷ clicks

Divide-by-zero days are skipped (null), not zeroed. Default metric **ROAS**, falling
back to **CTR** when the period has no revenue/conversion data. If ROAS/CPA is
selected and the period has no conversion/revenue data, show
"No conversion data for this period" instead of a flat-zero line.

## Backend change

`server/api/agency/social/campaign-daily-spend.get.ts` — the daily `totals`
aggregation currently selects only spend/impressions/clicks. Add
`SUM(ds.conversions)` and `SUM(ds.revenue)` and include `conversions`/`revenue` on
each `totals` entry. Both columns already exist on `daily_spend` (migrations 011,
037). Additive, low-risk; does not affect the Spend tab.

`app/types/index.ts` — extend `DailyTotal` with `conversions: number; revenue: number`.

## Edge cases
- Estimated-daily caveat still applies (ratios fine for trends; "Estimated" badge stays).
- Account-scoped and global both work — `totals` already respects `connectionId`.
- Empty period → existing empty state.
- Week filter applies to all tabs (cumulative/performance computed within the range).

## Out of scope
- Platform-mix comparison (belongs on the cross-platform dashboard, not this single-platform page).
- By-client and by-campaign-type tabs (possible second wave).
- Persisting/caching performance aggregates (computed client-side from existing data).

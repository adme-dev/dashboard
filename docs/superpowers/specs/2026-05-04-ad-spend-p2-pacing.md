# P2 — Pacing Intelligence

**Status:** Firm
**Roadmap:** [Ad Spend Roadmap](2026-05-04-ad-spend-roadmap.md)
**Target:** 1–2 weeks after P1
**Date:** 2026-05-04

## Problem

The spend page tells you what's happened (`spend = $X`, `budget = $Y`, `variance = X-Y`) but not what's about to happen. Operators currently export to spreadsheet and project end-of-month spend manually. Best-in-class agency platforms (Improvado, AgencyAnalytics, NinjaCat, Funnel.io) all show projected EOM spend natively as the primary signal.

## Goal

Operator can answer "which clients will overspend this period?" in one glance, without leaving the page.

## User stories

- As a media buyer, I scan the spend table and see at a glance who's overpacing
- As a media buyer, I click any client row to see their cumulative-spend-vs-target trajectory
- As an account manager, I see at a glance the daily spend shape per client (rising / flat / falling)

## Acceptance criteria

1. Spend-by-client table gains 3 new columns:
   - **Projected EOM** — currency, computed `actual / days_elapsed × days_in_period`. For Google, divide intermediate by 2 (per Improvado's documented "2× campaign overdelivery" rule)
   - **Pacing** — status pill, computed from projection vs. budget
   - **Days Left at Current Rate** — when projection > budget, integer count to exhaustion
2. Status pill states (let `r = projected ÷ budget`; ranges are non-overlapping):
   - `Underpacing` — `r < 0.9`
   - `On track` — `0.9 ≤ r < 1.1`
   - `Overpacing` — `1.1 ≤ r < 1.3`
   - `Will exhaust early` — `r ≥ 1.3` AND `projected > budget`
   - `No budget` — `budget = 0` (no pill rendered, dash in cell)
3. Daily spend sparkline column — last 30 days, no axes, ~80px wide. Pure shape indicator. SVG, no library.
4. Click row → drawer (`USlideover`) opens with Unovis line chart:
   - X-axis: day of month
   - Series 1 (actual): cumulative spend through today
   - Series 2 (ideal): straight line from $0 (day 1) to budget (last day of month)
   - Vertical "Today" marker
   - Header: client name + status pill + projected EOM + delta vs budget
5. All computed on-demand in `server/api/agency/social/spend/summary.get.ts` — no new tables, no cron, no new infrastructure
6. Performance: response time <1.5s for 50 clients

## Data model

None for storage.

Sparkline data uses existing `daily_spend` table joined to `media_spend`. New helper in `server/utils/spendSync.ts` (or co-located in summary endpoint) does:

```sql
SELECT ms.client_id, ms.platform, ds.spend_date, SUM(ds.spend) AS spend
FROM media_spend ms
JOIN daily_spend ds ON ds.media_spend_id = ms.id
WHERE ms.period = $1
  AND ds.spend_date >= NOW() - INTERVAL '30 days'
GROUP BY ms.client_id, ms.platform, ds.spend_date
ORDER BY ds.spend_date
```

Then groups in JS by `client_id` to build the 30-day array (zero-padded for missing days).

## API surface

**Extend `GET /api/agency/social/spend/summary`** — add to each item in `items[]`:
- `projectedEom: number`
- `pacingStatus: 'on_track' | 'underpacing' | 'overpacing' | 'exhaust_early' | 'no_budget'`
- `daysToExhaustion: number | null` (null when not exhausting)
- `dailySpend: number[]` — 30-element array, oldest first; days with no spend are 0

KV cache key already includes period — sparkline data invalidates with the existing cache scheme.

## UI components

**New:**
- `app/components/social/PacingStatusPill.vue` — `UBadge` variants: success/info/warning/error
- `app/components/social/SpendSparkline.vue` — pure SVG, takes `values: number[]`, accepts `width`, `height`, `color`. No tooltip (kept tight)
- `app/components/social/PacingTrajectoryDrawer.vue` — `USlideover` + Unovis line chart with 2 series

**Edited:**
- `app/components/social/SocialSpendVarianceTable.vue` — add 3 columns + sparkline cell + row-click handler emitting to parent
- `app/pages/agency/social/spend.vue` — mount `PacingTrajectoryDrawer`, listen for row-click

## Out of scope

- Historical projection accuracy ("you predicted $X on day 5, ended at $Y")
- Cross-period forecasting ("based on last 3 months, forecast for next month")
- Per-platform pacing pills (only per-client; platform breakdown is via the existing platform filter)
- Pacing alerts (P3 — alerts that fire on `pacingStatus = 'exhaust_early'`)

## Test plan

- Manual: click into 5 client rows, eyeball pacing trajectory chart vs. expected line
- Manual: confirm Google client sparklines show actual numbers (not 2×) — the safety factor only affects projection, not sparkline
- Manual: confirm "Will exhaust early" only fires when projected > budget (not just on overpacing)
- Code: `pnpm exec vue-tsc --noEmit` clean

## Risks

- Sparkline data adds 30+ rows × N clients to summary endpoint. Mitigation: single query with GROUP BY in DB; in-memory cost is small. Verify response time on a real org with 50+ clients.
- Status thresholds (90/110/130%) chosen by analogy to AgencyAnalytics; may need tuning based on agency feedback after first week of use.

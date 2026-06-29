# Budget Cross-Route QA

**Date:** 2026-06-29
**Period checked:** 2026-06
**Scope:** Spend, Meta account campaigns, Google account campaigns, Budget Health, and Analytics.

## Endpoints Checked

- `/api/agency/social/spend/summary?month=6&year=2026&platform=all&refresh=1`
- `/api/agency/social/meta/account-spend?month=6&year=2026`
- `/api/agency/social/meta/account-campaigns?connectionId=...&month=6&year=2026`
- `/api/agency/social/google/account-spend?month=6&year=2026`
- `/api/agency/social/google/account-campaigns?connectionId=...&month=6&year=2026`
- `/api/agency/budget-alerts/health?month=6&year=2026`
- `/api/agency/analytics/overview?startDate=2026-06-01&endDate=2026-06-30`

## Result

- Spend summary returned 95 grouped rows.
- Budget Health returned 164 Meta/Google campaign rows.
- Meta account campaign routes returned 103 campaign rows across 116 accounts.
- Google account campaign routes returned 61 campaign rows across 105 accounts.
- No Meta/Google account campaign fetches failed.
- No duplicate `budgetKey` values were found in Budget Health or account campaign routes.
- Campaign-level `budgetKey`, budget value, and month-level spend now match between Budget Health and Meta/Google account campaign routes.

## Totals

| Source | Budget | Spend |
| --- | ---: | ---: |
| Spend summary | 87,965.97 | 131,935.37 |
| Budget Health | 87,965.97 | 131,935.37 |
| Analytics | 87,965.97 | 131,935.38 |

Platform budget totals match exactly across Budget Health, Meta/Google account campaigns, and Analytics:

- Meta: 49,377.25 budget, 103 campaigns.
- Google Ads: 38,588.72 budget, 61 campaigns.

Analytics spend remains date-window based from `daily_spend`, so it can differ from month-level `media_spend.actual_spend` by small rounding amounts. In this run the difference was 0.13 for Meta and 0.12 for Google Ads. This is not a budget mismatch.

## Fixes Made

- Budget Health campaign rows now use `media_spend.actual_spend` for month-level `mtdSpend`, matching Spend summary and account campaign routes.
- Analytics overview now counts canonical campaign rows by `media_spend.id` instead of platform `campaign_id`, which is not globally unique across accounts.

## Remaining Operator Items

The latest sync jobs reported platform-side access issues, not app-side duplicate or budget identity issues:

- Google Ads: 16 accounts failed with access denied.
- Meta: 10 accounts failed with empty-insights or permission errors.

These should be handled as ad-platform access cleanup, not budget-entry bugs.

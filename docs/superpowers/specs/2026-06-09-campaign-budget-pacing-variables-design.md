# Campaign Budget Pacing Variables Design

## Goal

Expose the campaign-level budget variables currently visible in the external budget tracker inside XeroFlow's existing Budget Health and ad-spend alert system.

## Scope

This is not a PDF-style visual rebuild. The current Budget Health page keeps its summary cards and client/platform view. A new campaign-level pacing section adds the missing operational variables:

- Monthly Budget
- MTD Spend
- MTD Difference
- Current Daily Budget
- New Daily Budget
- MTD Budget Pacing
- Campaign Status

## Architecture

Add one shared pure pacing utility so the Budget Health API, Budget Health UI, and ad-spend anomaly analyser use the same status model. The utility accepts budget, MTD spend, selected period, current date, campaign status, and end date. It returns derived numbers plus a canonical pacing status.

The existing `/api/agency/budget-alerts/health` endpoint remains the Budget Health data source. It gains a `campaigns` array built from `media_spend` and `daily_spend`; no database migration is required.

## Pacing Statuses

The shared utility returns:

- `campaign_ended`
- `no_budget`
- `no_spend`
- `critical_over_pacing`
- `warning_over_pacing`
- `on_track`
- `warning_under_pacing`

Thresholds:

- `campaign_ended`: campaign end date is before the current date.
- `no_budget`: monthly budget is zero or negative.
- `no_spend`: active budgeted campaign has zero MTD spend after day 2.
- `critical_over_pacing`: pacing ratio is at least `1.25`.
- `warning_over_pacing`: pacing ratio is at least `1.10`.
- `warning_under_pacing`: pacing ratio is at most `0.80` after day 7.
- `on_track`: all other budgeted active states.

## Data Flow

`media_spend` supplies campaign metadata, monthly budget, status, platform, client, end date, and sync metadata.

`daily_spend` supplies MTD spend and daily delivery metrics. For the selected Budget Health month, the endpoint sums all available daily rows in that period. For the current month, this is naturally month-to-date.

The endpoint returns campaign rows sorted by severity, then highest spend. The UI provides local filters for platform, client, pacing status, and campaign search.

## Alerts

The existing ad-spend anomaly analyser remains the alert writer. Its overspend and underspend detectors are aligned with the shared pacing utility so active alerts and Budget Health statuses agree.

No separate notification channel is introduced.

## Testing

Unit tests cover the pure pacing utility, including no budget, no spend, over-pacing, under-pacing, ended campaigns, future periods, and past periods.

Existing ad-spend health analyser tests continue to protect anomaly output. New or adjusted tests verify the analyser derives overspend and underspend from the shared utility.

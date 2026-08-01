# Google Spend Partial-Data Status Design

**Date:** 2026-08-01  
**Status:** Approved for implementation

## Context

The Google Ads platform page can present a successful-looking total even when the latest period sync contains account-level failures. The August 2026 run completed with 22 access failures, but those failures were only available to the temporary post-sync polling flow and disappeared after a reload.

The performance chart also labels the aggregate series as `Estimated` whenever the global `Other` campaign bucket exists. That bucket is assembled from real `daily_spend` rows, so its presence alone is not evidence that fallback values were generated.

## Goals

- Persistently identify partial Google Ads data for the selected reporting period.
- State how many accounts completed and how many failed.
- Let operators expand the warning to see affected account names grouped by failure reason.
- Mark performance data as estimated only when the API actually generates fallback daily values.
- Keep existing account-spend and chart response contracts stable.

## Non-goals

- Repair Google Ads permissions or manager-account links.
- Change spend, conversion, revenue, CPA, or ROAS calculations.
- Redesign the social spend page or synchronization workflow.
- Add a database migration; the required job fields and lookup index already exist.

## Architecture

### Latest sync lookup

Add `GET /api/agency/social/spend/latest-sync?platform=google&period=2026-08`, a small authenticated read endpoint for the latest spend-sync job by `platform` and `period`. It reads one row from `spend_sync_jobs`, ordered by `started_at DESC`, using the existing period/platform index.

The endpoint validates the platform and `YYYY-MM` period and returns either a normalized job object or `null` when the period has no job. The response includes:

- status and timestamps;
- synced campaign count and total spend;
- total and processed account counts;
- safe account-level failures (`account`, `reason`);
- the terminal error, when present.

This is separate from the existing job-ID polling endpoint. Polling remains responsible for a sync initiated in the current browser session; the latest-period endpoint restores durable status after navigation or reload.

### Estimation provenance

The campaign-daily endpoint will track a local `usedEstimatedFallback` flag at the exact point where it creates flat daily values because a campaign has monthly spend but no daily rows. The response-level `estimated` field will use that flag.

The real `Other` daily aggregation will not set the flag. This removes the current false positive without changing chart data or response shape.

### Page data flow

For the selected platform, month, and year, the platform page loads:

1. account spend and campaign daily data;
2. bank charges;
3. the latest sync job for the same platform and period.

The latest job reloads when the reporting period changes and after a sync finishes. A failed advisory lookup does not block spend rendering; the page omits the warning and retains the primary data.

## User Interface

Add a focused `SocialSpendPartialDataAlert` component directly below the period controls and above charts.

When the latest terminal job has account failures, render a Nuxt UI warning alert with:

- title: `Partial Google Ads data` (or the active platform name);
- summary: `{completed} of {total} accounts synced. Figures may be incomplete or stale for {failed} accounts.`;
- the completed timestamp;
- a `View affected accounts` control.

Expanding the control reveals failures grouped by reason. Each group shows the reason, account count, and an alphabetized account list. The same reason is displayed once rather than repeated for every account.

The alert remains visible after reload. It is not dismissible because it describes the trust boundary of the figures currently on screen. A period with no failures shows no alert.

The component uses Nuxt UI v4 components, semantic warning colors, visible text plus an icon, keyboard-accessible expansion, and mobile-first wrapping. It introduces no form fields.

## State Rules

- Use only the newest sync job matching the selected platform and period.
- Show partial status for a completed job with one or more failures.
- Show terminal failure status when the newest job failed, even if no account-level array is available.
- Do not let an older failed job override a newer clean job.
- While a new job is running, the existing sync progress remains authoritative; after completion, reload both spend data and latest status.
- Failure counts are based on unique account names so repeated diagnostics cannot inflate the warning.
- `completedAccounts` is `max(0, processedAccounts - failureCount)` when processed-account data exists, otherwise `max(0, totalAccounts - failureCount)`.

## Error Handling and Security

- Require the existing authenticated agency session.
- Validate query inputs before the database query.
- Return no credentials, tokens, provider bodies, or stack traces.
- Treat failure reasons as plain text in Vue templates.
- Make latest-status loading advisory so a telemetry failure cannot blank financial data.

## Testing

Use test-first development for each behavior:

- campaign-daily endpoint reports `estimated: false` for a real `Other` bucket;
- campaign-daily endpoint reports `estimated: true` only when a fallback series is created;
- latest-sync endpoint validates inputs, selects the newest matching job, normalizes fields, and returns `null` when absent;
- platform page requests status for the selected platform and period and reloads it after sync completion;
- partial-data alert renders counts and timestamp, groups failures, expands accessibly, and stays absent for a clean job;
- an older failure cannot replace a newer clean result;
- existing social spend endpoint, page, and component tests remain green.

Manual browser verification will cover the live Google Ads page at desktop and narrow widths, the collapsed and expanded warning, keyboard activation, a clean historical period, and the corrected Estimated badge.

## Public-Facing Documentation

No marketing-page change is required. This work corrects the accuracy and observability of an existing internal reporting feature; it does not introduce a new customer-facing capability.

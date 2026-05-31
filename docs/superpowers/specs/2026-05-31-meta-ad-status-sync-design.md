# Truthful Ad-Publish Status + Meta Status Sync

**Date:** 2026-05-31
**Area:** `/agency/ad-publish` (Banner Studio → ad platforms)
**Scope:** Two fixes from the ad-publish R&D — (1) stop the `status` column claiming `published` when it isn't, and (2) keep Meta ad statuses in sync with the platform.

## Problem

`banner_ad_publishes` has two status columns:

- `ad_status` — the Meta-side PAUSED/ACTIVE intent the operator chose (set correctly).
- `status` — our internal lifecycle. **Hardcoded to the literal `'published'`** on insert in both `meta.post.ts` and `google.post.ts`.

This is wrong in two ways:

1. **Google** (`google.post.ts`) records `status='published'` while creating **no ad** — the handler is an intent-only stub. The row lies. (It is also currently unreachable from the UI and the Google tab is disabled, but it must not corrupt data if ever wired up.)
2. **Meta** records `status='published'` at creation time, but Meta holds every new ad *In Review* and may later approve, reject, pause, or disable it. We never update the row, so the dashboard shows "published" for ads that are pending or rejected.

## Goals

- The `status` column reflects reality at all times.
- Meta ad statuses are refreshed from the platform — automatically (cron) and on demand (UI button).
- First test coverage for this money-spending feature (currently zero).

## Non-goals

- Completing the Google Ads integration (separate work).
- Webhooks (polling is sufficient; revisit when volume warrants).
- Schema migration (we reuse existing columns).

## Status taxonomy

The `status` column moves from the single literal `published` to a small lifecycle:

| status | meaning | badge |
|---|---|---|
| `pending_review` | Meta ad created, awaiting Meta review (truthful initial state) | warning |
| `active` | live and delivering | success |
| `paused` | paused by us / ad set / campaign | warning |
| `rejected` | disapproved or has blocking issues | error |
| `error` | our publish call failed | error |
| `removed` | deleted/archived on Meta | neutral |
| `pending` | recorded intent, not yet on platform (Google stub) | neutral |

`error` and `removed` are **terminal** (sync skips them). `pending` is the Google stub's resting state.

### Meta `effective_status` → internal mapping (`mapMetaEffectiveStatus`)

| Meta `effective_status` | internal |
|---|---|
| `ACTIVE` | `active` |
| `PAUSED`, `ADSET_PAUSED`, `CAMPAIGN_PAUSED` | `paused` |
| `PENDING_REVIEW`, `IN_PROCESS`, `PREAPPROVED`, `PENDING_BILLING_INFO` | `pending_review` |
| `DISAPPROVED`, `WITH_ISSUES` | `rejected` |
| `DELETED`, `ARCHIVED` | `removed` |
| (unknown / missing) | `pending_review` (safe default — keeps re-checking) |

This is a **pure function**, unit-tested in `test/server/utils/metaAdStatus.test.ts`.

## Architecture

### 1. Insert-site fixes
- `meta.post.ts`: insert literal `'published'` → `'pending_review'`.
- `google.post.ts`: insert literal `'published'` → `'pending'`.

### 2. `server/utils/metaAdStatus.ts` (pure)
- `mapMetaEffectiveStatus(effectiveStatus: string | null | undefined): InternalStatus`
- `NON_TERMINAL_STATUSES` constant — the set the sync runner re-checks.

### 3. `metaClient.ts` — `getAdStatus(adId, token)`
- `GET /{ad_id}?fields=effective_status,issues_info` via the existing `metaFetch` helper (Graph v22.0, retry built in).
- Returns `{ effectiveStatus: string | null, issues: any[] | null }`.

### 4. `server/utils/metaAdStatusSync.ts` — runner
`syncMetaAdStatuses({ projectId?, limit = 100 }): Promise<{ checked, updated, skipped, errors }>`

1. Select `banner_ad_publishes` rows where `platform='meta_ads'`, `ad_id IS NOT NULL`, `status IN (NON_TERMINAL_STATUSES)`, `created_at > NOW() - INTERVAL '30 days'`, optional `project_id = $projectId`, `LIMIT $limit`.
2. For each row, resolve a token: join `account_id` → `social_connections` (`platform='meta'`, active, token not expired). Skip (don't fail the run) if no usable token.
3. `getAdStatus(ad_id, token)` → `mapMetaEffectiveStatus`.
4. If changed, `UPDATE status`, set `updated_at = NOW()`, and merge `{ effectiveStatus, lastSyncedAt }` into `metadata` via `metadata = COALESCE(metadata,'{}'::jsonb) || $jsonb`.
5. Per-row try/catch — one bad ad never aborts the batch.

Token grouping by account to reuse a single token per ad account.

### 5. `server/api/cron/meta-ad-status-sync.post.ts`
- Mirrors `anomaly-detection.post.ts`: `x-cron-secret` matched against `CRON_SECRET`, check skipped when `import.meta.dev`.
- No tenant/7am gate — runs on every hit. Calls `syncMetaAdStatuses({ limit: 100 })`.
- Cloudflare hourly Cron Trigger wired in the dashboard (operator step, documented).

### 6. `server/api/agency/banner-studio/ad-publish/meta/sync-status.post.ts`
- `requireAuth`, body `{ projectId }`. Calls `syncMetaAdStatuses({ projectId, limit: 50 })`. Powers the UI refresh button.

### 7. UI
- `AdPublishModal.vue`: extend `statusColor()` for the new values; add a small "Refresh" ghost button on the publish-history section that calls the sync endpoint then `fetchAdPublishes(projectId)`.
- `useMetaAdUpload.ts`: add `syncStatuses(projectId)` → POST sync endpoint → `fetchAdPublishes`.

## Error handling
- Sync runner: per-row try/catch; expired/missing token → skip with a counted `skipped`; network/API error → counted `errors`, row left unchanged for next run.
- Cron: returns `{ ok, checked, updated, skipped, errors }`; 401 on bad secret.
- Manual endpoint: surfaces the same summary; toast on the client.

## Testing
- `mapMetaEffectiveStatus` — full enum coverage incl. unknown/empty default (Vitest, `test/server/utils/`).
- Runner and endpoints are thin glue over the tested mapper + existing `metaFetch`; covered by manual verification (dev `?` trigger / refresh button) per project norms.

## Rollout
1. Deploy (no migration; additive).
2. Existing `published` rows self-correct as the 30-day window picks them up on the next sync.
3. Enable the hourly Cloudflare Cron Trigger on `/api/cron/meta-ad-status-sync` with `x-cron-secret: $CRON_SECRET`.

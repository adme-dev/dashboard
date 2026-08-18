# XeroFlow Google Call Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship client-scoped Google Ads `call_view` ingestion, health, reporting, and Brighton Nissan lead reconciliation through XeroFlow production.

**Architecture:** A bounded idempotent sync reads `call_view` through each existing Google Ads connection, maps campaigns to clients, stores advertiser-local timestamps with timezone, and exposes tenant-safe summaries to agency and portal views. The existing generic lead webhook and authoritative browser confirmation contract remain the only website lead acceptance boundary.

**Tech Stack:** Nuxt 4, Nitro, TypeScript, Neon Postgres, Google Ads REST API v23, Nuxt UI v4, Vitest, Cloudflare Pages

**Spec:** `docs/superpowers/specs/2026-08-18-brighton-nissan-measurement-completion-design.md`

## Global Constraints

- Work only in `feature/brighton-nissan-measurement-completion` based on current `origin/main`.
- Do not copy the stale dirty `public/track.js`; retain the authoritative `captureLeadContext()` implementation.
- Store duration only when Google supplies it; never infer answered/missed/duration from browser clicks.
- Every API must enforce agency RBAC or portal client scoping server-side.
- Migration `335_google_ads_call_reporting.sql` must be additive/idempotent and applied automatically.
- UI uses Nuxt UI v4 components and semantic dark-mode colors.
- Deploy only with `pnpm deploy:check` followed by `pnpm deploy:production` to immutable project `agency-dashboard`.

---

### Task 1: Port and harden the call-view domain service

**Files:**
- Create: `server/utils/googleAdsCallReporting.ts`
- Create: `test/server/utils/googleAdsCallReporting.test.ts`

**Interfaces:**
- Consumes: existing `resolveGoogleCredential`, `refreshGoogleToken`, `persistGoogleCredentialRefresh`, `gaqlQuery`, and Google Ads runtime config.
- Produces: `googleCallSyncWindow()`, `buildGoogleCallViewQuery()`, `mapGoogleCallRow()`, `matchGoogleCallClient()`, `buildGoogleCallUpsert()`, and `syncGoogleAdsCalls()`.

- [ ] **Step 1: Port the isolated tests and run red**

Port the existing dirty-checkout unit suite covering date bounds, 37-month maximum, query field compatibility, untrusted row validation, status/duration normalization, exact campaign mapping before regex mapping, chunked upsert, token refresh, partial connection errors, and redacted sync state.

Run: `pnpm exec vitest run test/server/utils/googleAdsCallReporting.test.ts`
Expected: FAIL because the service is absent in the clean worktree.

- [ ] **Step 2: Port the service against current main**

Use `call_view.resource_name` as provider identity, allow only `MISSED`, `RECEIVED`, `UNKNOWN`, and `UNSPECIFIED`, validate local date-time strings, persist no full phone number, and cap upsert chunks at 250 records.

- [ ] **Step 3: Add observable per-connection sync state**

On every connection set `last_attempt_at`; on success set `last_success_at`, `last_row_count`, and clear `last_error`; on failure retain the previous success and store a bounded redacted error code/message without OAuth tokens or response bodies.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm exec vitest run test/server/utils/googleAdsCallReporting.test.ts`.

```bash
git add server/utils/googleAdsCallReporting.ts test/server/utils/googleAdsCallReporting.test.ts
git commit -m "feat: ingest Google Ads call reporting"
```

### Task 2: Add and apply the reporting migration

**Files:**
- Create: `server/database/migrations/335_google_ads_call_reporting.sql`
- Create: `test/config/googleAdsCallReportingMigration.test.ts`

**Interfaces:**
- Consumes: `social_connections(id)` and `agency_clients(id)`.
- Produces: `google_ads_calls` and `google_ads_call_sync_state`, with unique `(connection_id, provider_call_id)` and client/date indexes.

- [ ] **Step 1: Write the migration contract test**

Assert both tables use `CREATE TABLE IF NOT EXISTS`, duration is nullable/non-negative, status has the four-value check, advertiser-local timestamps use `TIMESTAMP WITHOUT TIME ZONE`, timezone is retained, the provider identity is unique per connection, and all indexes are idempotent.

- [ ] **Step 2: Verify the test fails and add the SQL**

Run: `pnpm exec vitest run test/config/googleAdsCallReportingMigration.test.ts`.
Expected: FAIL before the migration exists, then PASS after porting/reviewing the SQL.

- [ ] **Step 3: Apply the migration automatically**

Load `DATABASE_URL` from `.env` without printing it and run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/335_google_ads_call_reporting.sql
```

Verify both tables and four indexes through `information_schema`/`pg_indexes`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/335_google_ads_call_reporting.sql test/config/googleAdsCallReportingMigration.test.ts
git commit -m "feat: add Google Ads call reporting schema"
```

### Task 3: Add secure sync and reporting APIs

**Files:**
- Create: `server/api/cron/google-ads-call-reporting.post.ts`
- Create: `server/api/agency/analytics/google-calls.get.ts`
- Create: `server/api/portal/analytics/google-calls.get.ts`
- Create: `server/utils/googleAdsCallAnalytics.ts`
- Create: `test/server/api/googleAdsCallReporting.test.ts`

**Interfaces:**
- Consumes: `syncGoogleAdsCalls()` and the two reporting tables.
- Produces: cron POST with `x-cron-secret`, agency query with optional validated `clientId`, and portal query bound only to `clientUser.clientId`.

- [ ] **Step 1: Port/write failing endpoint tests**

Cover production cron rejection without the secret, 1–90 day lookback validation, invalid dates/UUIDs, agency role enforcement, portal analytics-permission enforcement, forced portal client scope, answered=`RECEIVED`, missed=`MISSED`, nullable durations, campaign summaries, and health fields.

- [ ] **Step 2: Implement shared summary serialization**

Create `server/utils/googleAdsCallAnalytics.ts` so both routes execute the same parameterized, client-scoped SQL. Return:

```ts
{
  summary: { totalCalls, answeredCalls, missedCalls, unknownCalls,
    durationAvailableCalls, totalDurationSeconds, averageDurationSeconds,
    longestDurationSeconds, lastSyncedAt },
  health: { lastAttemptAt, lastSuccessAt, lastRowCount, status, lastError },
  byCampaign: [],
  basis: 'google_ads_call_view'
}
```

- [ ] **Step 3: Implement endpoints and run tests**

Run: `pnpm exec vitest run test/server/api/googleAdsCallReporting.test.ts`.
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/api/cron/google-ads-call-reporting.post.ts server/api/agency/analytics/google-calls.get.ts server/api/portal/analytics/google-calls.get.ts server/utils/googleAdsCallAnalytics.ts test/server/api/googleAdsCallReporting.test.ts
git commit -m "feat: expose Google call reporting APIs"
```

### Task 4: Add Nuxt UI agency and portal call summaries

**Files:**
- Create: `app/components/analytics/GoogleCallsSummary.vue`
- Modify: `app/pages/agency/analytics/client/[id].vue`
- Modify: `app/pages/portal/analytics/index.vue`
- Modify: `app/types/index.ts`
- Create: `test/app/googleCallsSummary.test.ts`

**Interfaces:**
- Consumes: agency/portal Google calls endpoints and existing page date ranges.
- Produces: reusable call summary card showing total, answered, missed, average/total duration, campaign breakdown, freshness, empty state, unavailable-duration text, and sync warning.

- [ ] **Step 1: Invoke `frontend-design` and write the failing UI contract test**

The test asserts `UCard`, `UBadge`, `UIcon`, `UTable`, skeleton/loading, error and zero-call states; no raw HTML `<select>`, `<input>`, or `<button>`; and exact copy that duration is unavailable when Google omits it.

- [ ] **Step 2: Implement typed shared component**

Use props `{ endpoint: string, query: Record<string,string> }`, `$fetch`, semantic colors, and a compact responsive metric grid. Format seconds as `m:ss`/`h:mm:ss`; render `—` for null, never `0:00`.

- [ ] **Step 3: Integrate both scoped pages**

Agency passes `/api/agency/analytics/google-calls` plus route client ID and current date range. Portal passes `/api/portal/analytics/google-calls`; the server ignores any client ID supplied by the browser.

- [ ] **Step 4: Test and commit**

Run: `pnpm exec vitest run test/app/googleCallsSummary.test.ts`.

```bash
git add app/components/analytics/GoogleCallsSummary.vue app/pages/agency/analytics/client/'[id].vue' app/pages/portal/analytics/index.vue app/types/index.ts test/app/googleCallsSummary.test.ts
git commit -m "feat: show Google call outcomes in analytics"
```

### Task 5: Wire scheduling, mapping, and bounded backfill

**Files:**
- Modify: `workers/pages-cron/src/index.ts`
- Modify: `workers/pages-cron/wrangler.toml`
- Create: `scripts/google-call-map.ts`
- Create: `scripts/google-call-backfill.ts`
- Create: `test/config/googleCallCronContract.test.ts`

**Interfaces:**
- Consumes: production Google connection/customer and Brighton client identity resolved by read-only SQL.
- Produces: daily rolling sync plus an explicit bounded backfill command.

- [ ] **Step 1: Write the failing cron/mapping contract tests**

Assert the scheduled handler POSTs `/api/cron/google-ads-call-reporting` with `x-cron-secret`, the mapping resolves one active Google connection for customer `5977044329`, and the backfill refuses future/start-after-end/out-of-retention windows.

- [ ] **Step 2: Resolve and add the production mapping safely**

Implement `scripts/google-call-map.ts` to query `social_connections`, `agency_clients`, and `ad_account_client_map` by normalized customer ID plus exact client name. Abort on zero or multiple candidates. Upsert the resolved connection/client relationship through `ad_account_client_map`, using a `^Brighton Nissan(?:\\b|$)` campaign-name pattern only when the account is shared; use a connection-wide mapping when the verified account is client-exclusive.

- [ ] **Step 3: Implement the bounded backfill runner**

The script accepts `--start YYYY-MM-DD --end YYYY-MM-DD`, calls the internal cron route in 14-day windows, prints counts and connection IDs only, and exits non-zero on any connection error.

- [ ] **Step 4: Test, run a short real sync, and commit**

Run focused tests, then a 14-day production-safe sync. Verify `last_attempt_at`/`last_success_at` and real row counts; zero calls is a valid result only when the provider query succeeded.

```bash
git add workers/pages-cron/src/index.ts workers/pages-cron/wrangler.toml scripts/google-call-map.ts scripts/google-call-backfill.ts test/config/googleCallCronContract.test.ts
git commit -m "feat: schedule and map Google call sync"
```

### Task 6: Update public product documentation

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue`
- Modify: `app/pages/resources/integrations.vue`
- Create: `test/app/googleCallReportingMarketingContract.test.ts`

**Interfaces:**
- Consumes: shipped call reporting and provider-confirmed lead reconciliation behavior.
- Produces: public copy describing accurate Google call outcomes and provider-confirmed website leads without client identifiers.

- [ ] **Step 1: Write the failing marketing contract test**

Assert the feature index/detail and integration resource mention `call_view`, provider-confirmed website leads, answered/missed calls, Google-supplied duration, and the fact that browser clicks do not infer call outcomes. Assert no Brighton client/account IDs appear.

- [ ] **Step 2: Update copy and navigation**

Extend existing `google-ads-tracking` and `lead-capture-routing` entries rather than inventing duplicate top-level features. Keep marketing copy accurate to deployed behavior.

- [ ] **Step 3: Test and commit**

Run: `pnpm exec vitest run test/app/googleCallReportingMarketingContract.test.ts`.

```bash
git add app/pages/features app/components/MarketingNav.vue app/pages/resources/integrations.vue test/app/googleCallReportingMarketingContract.test.ts
git commit -m "docs: publish Google call measurement capability"
```

### Task 7: Battle-test and deploy XeroFlow production

**Files:**
- Review every file changed by Tasks 1–6.

**Interfaces:**
- Consumes: all focused passing tasks and applied migration.
- Produces: immutable Cloudflare Pages production deployment and post-deploy evidence.

- [ ] **Step 1: Run the mandated deep review**

Re-read every diff; check Nitro `~~/` imports, tenant filters, UUID/date validation, null durations, response error redaction, Nuxt UI v4 controls, dark mode, duplicate UI, and no secrets/client identifiers in public copy.

- [ ] **Step 2: Run focused and regression verification**

Run all new tests, `test/public/track-tag.test.ts`, `test/server/utils/leads/leadCaptureContract.test.ts`, generic-webhook measurement/CORS tests, `pnpm run typecheck`, and the production build. Classify only genuinely pre-existing type failures with before/after evidence.

- [ ] **Step 3: Run deployment guard and deploy**

Run: `pnpm deploy:check && pnpm deploy:production`.
Expected: immutable target `agency-dashboard`, successful build, and ready production deployment.

- [ ] **Step 4: Verify live production**

Check production health, live `track.js` still exposes `captureLeadContext()`, authenticated agency and portal APIs enforce scope, cron sync health advances, and Brighton call rows/summaries match the Google account where eligible activity exists.

- [ ] **Step 5: Record launch evidence**

Update Monday item `12828703626` with dashboard deploy ID, Netlify deploy ID, migration result, form/call test outcomes, any controlled-test dependency, and the 24-hour monitoring checkpoint. Do not mark complete until both production targets and real sync health are verified.

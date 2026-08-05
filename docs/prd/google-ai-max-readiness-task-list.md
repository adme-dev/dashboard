# Implementation Plan and Task List: Google Ads AI Max Readiness

**Date:** 2026-08-06  
**Status:** Proposed - execute only after PRD approval  
**PRD:** `docs/prd/google-ai-max-readiness-prd.md`  
**Target:** Release 1 before 2026-09-01; Releases 2-3 separately gated

## Outcome

Deliver an agency-wide, tenant-isolated and provider-read-only control that classifies
Google Search campaigns affected by the AI Max migration, explains effective settings,
tracks material changes, exports an action list and alerts the media team without
notification spam. Follow with AI Max match-source and generated-asset performance
reporting after the readiness release is stable.

## Delivery Strategy

Work in vertical, testable slices:

```text
Live API contract validation
  -> pure classifier
  -> persisted scan state
  -> manual scan
  -> readiness APIs
  -> portfolio UI
  -> scheduled scans/notifications
  -> marketing/runbook/release
  -> performance measurement (Release 2)
  -> governed writes (new PRD only)
```

Do not begin Release 3 provider writes from this task list. The final task for governed
writes is to author and approve a separate mutation PRD based on observed read-only
usage.

## Architecture Decisions

1. **Dedicated current-state model:** AI Max configuration belongs in
   `google_ai_max_campaign_state`, not duplicated across monthly `media_spend` rows.
2. **Raw evidence plus pure derivation:** Persist Google values; normalize and classify
   in pure functions shared by scanner and tests.
3. **Account-level scans:** Use two GAQL queries per account (campaigns and ad groups),
   not per-campaign requests.
4. **Read-only releases:** Existing budget write flags do not arm AI Max changes.
5. **Explicit tenancy:** Every interactive scan and query requires selected tenant;
   every persisted row includes tenant ID.
6. **Partial success:** One failed account does not discard successful account scans.
7. **Change events, not noisy snapshots:** Keep current state plus material events.
   Release 2 daily metrics use a separate idempotent fact table.
8. **Dedicated portfolio route:** `/agency/social/google/ai-max` is canonical. The spend
   control room contains a summary/deep link only.

## Release 1 Task List

### Task 1: Validate live Google v23 field behavior

**Description:** Before schema or UI work, execute read-only GAQL against one direct
Google Ads account and one MCC child. Confirm JSON field names, omitted/null behavior,
enum values, account permissions and deep-link construction. Sanitize representative
fixtures for deterministic tests.

**Acceptance criteria:**

- [ ] Campaign query returns `keyword_match_type`, `ai_max_setting` and
      `asset_automation_settings` for representative Search campaigns.
- [ ] Ad-group query returns `disable_search_term_matching` or documents the precise
      provider behavior when AI Max is off.
- [ ] Sanitized fixtures contain ACA, broad match, both, neither, enabled and unknown
      cases without real customer names, IDs or credentials.

**Verification:**

- [ ] Compare at least three campaign states with the Google Ads UI.
- [ ] Record query text, API version, observations and limitations in
      `docs/research/2026-08-google-ai-max-api-validation.md`.
- [ ] Search fixtures for customer identifiers and token-like strings before commit.

**Dependencies:** None  
**Files likely touched:**

- `docs/research/2026-08-google-ai-max-api-validation.md`
- `test/fixtures/google-ai-max-campaigns.json`
- `scripts/audit-google-ai-max.ts` (temporary/read-only operational script if needed)

**Estimated scope:** Medium (3 files)

---

### Task 2: Implement the pure observation normalizer and classifier

**Description:** Add provider row normalization, migration-reason derivation, readiness
precedence, effective-subfeature calculation, risk rules and material-change diffing.
Write failing tests first from the sanitized fixtures.

**Acceptance criteria:**

- [ ] ACA, broad match, both, neither and AI-Max-enabled fixtures classify exactly as
      defined in the PRD.
- [ ] Missing/unrecognized evidence produces `unknown`, never implicit false.
- [ ] Final URL expansion is derived independently from AI Max/text customisation.
- [ ] Material-change comparison ignores timestamps but catches setting,
      classification and risk changes.

**Verification:**

- [ ] `pnpm exec vitest run test/server/utils/googleAiMax.test.ts`
- [ ] Mutation-style review: remove each required field from a fixture and confirm the
      result fails closed.

**Dependencies:** Task 1  
**Files likely touched:**

- `server/utils/googleAiMax.ts`
- `test/server/utils/googleAiMax.test.ts`
- `test/fixtures/google-ai-max-campaigns.json`

**Estimated scope:** Medium (3 files)

---

### Task 3: Add Release 1 persistence schema

**Description:** Create additive tables for scan runs, current campaign state and
material state events with tenant-aware indexes and constraints. Include comments and
safe rollback notes.

**Acceptance criteria:**

- [ ] Unique current state is enforced by tenant, connection and campaign.
- [ ] Scan/run statuses and event types have explicit constraints.
- [ ] Tenant/status/freshness and campaign lookup indexes support planned queries.
- [ ] Deleting a connection cascades current state/events without affecting unrelated
      tenants.

**Verification:**

- [ ] Review migration end-to-end before execution.
- [ ] Load `DATABASE_URL` from `.env` and apply migration automatically with `psql` as
      required by `AGENTS.md`.
- [ ] Query `information_schema`/Postgres catalog to confirm tables, constraints and
      indexes.
- [ ] Run migration a second time if written idempotently and confirm no failure.

**Dependencies:** Task 2 (contract must be stable)  
**Files likely touched:**

- `server/database/migrations/288_google_ai_max_readiness.sql`
- `test/server/database/googleAiMaxMigration.test.ts` (if migration contract tests use
  source inspection rather than a test DB)

**Estimated scope:** Small (2 files)

---

### Task 4: Add account-level Google AI Max reads

**Description:** Extend the Google Ads client with typed, read-only campaign/ad-group
query helpers. Reuse `gaqlQuery`; do not add raw `ofetch` calls or duplicate OAuth/MCC
resolution.

**Acceptance criteria:**

- [ ] One campaign query and one ad-group query retrieve all required fields for an
      account.
- [ ] Only Search campaigns in active/paused scope are returned.
- [ ] REST camelCase response shape is normalized without losing raw enum values.
- [ ] 429/500/503 retries and MCC login-customer ID behavior remain inherited from
      `gaqlQuery`.

**Verification:**

- [ ] `pnpm exec vitest run test/server/utils/googleAdsAiMaxFetch.test.ts`
- [ ] Assert GAQL query includes every required field and excludes provider mutations.

**Dependencies:** Tasks 1-2  
**Files likely touched:**

- `server/utils/googleAdsClient.ts`
- `server/utils/googleAiMax.ts`
- `test/server/utils/googleAdsAiMaxFetch.test.ts`

**Estimated scope:** Medium (3 files)

---

### Task 5: Persist scans and material state changes

**Description:** Implement scan-run creation, per-account upsert, event emission,
failure recording, freshness behavior and overlapping-run claims. Keep successful
account writes when another account fails.

**Acceptance criteria:**

- [ ] First observation creates current state and one `first_seen` event.
- [ ] Identical rescans update freshness without creating an event.
- [ ] Material changes create one event containing safe previous/current values.
- [ ] Partial account failure produces a `partial` run and retains successful results.
- [ ] Concurrent scan claim deduplicates the same tenant/account.

**Verification:**

- [ ] `pnpm exec vitest run test/server/utils/googleAiMaxPersistence.test.ts`
- [ ] Test transaction failure and duplicate-run races with mocked DB dependencies.

**Dependencies:** Tasks 3-4  
**Files likely touched:**

- `server/utils/googleAiMaxScanner.ts`
- `server/utils/googleAiMaxRepository.ts`
- `test/server/utils/googleAiMaxPersistence.test.ts`
- `test/server/utils/googleAiMaxScanner.test.ts`

**Estimated scope:** Medium (4 files)

### Checkpoint A: Scanner foundation

- [ ] Tasks 1-5 reviewed against PRD classification examples.
- [ ] Migration is applied to the configured database.
- [ ] Unit tests pass.
- [ ] No provider mutation endpoint or mutate request exists.
- [ ] Direct and MCC fixtures behave consistently.
- [ ] Human review confirms field interpretation before API/UI work continues.

---

### Task 6: Implement manual scan endpoint and run-status polling

**Description:** Add the tenant-scoped manual trigger and a run-status endpoint. Use
existing background execution/polling patterns and fail closed when tenant or
connection scope is invalid.

**Acceptance criteria:**

- [ ] `MEDIA_BUYING` permission and selected tenant are mandatory.
- [ ] Optional connection ID must resolve to an active Google connection in scope.
- [ ] Duplicate requests return the active run with `deduplicated: true`.
- [ ] Run-status response exposes progress/failures without secrets.

**Verification:**

- [ ] `pnpm exec vitest run test/server/api/googleAiMaxScanEndpoint.test.ts`
- [ ] Test 401, 403, missing tenant, invalid connection, duplicate and partial cases.

**Dependencies:** Task 5  
**Files likely touched:**

- `server/api/agency/social/google/ai-max/scan.post.ts`
- `server/api/agency/social/google/ai-max/scans/[id].get.ts`
- `test/server/api/googleAiMaxScanEndpoint.test.ts`

**Estimated scope:** Medium (3 files)

---

### Task 7: Implement readiness list and detail endpoints

**Description:** Add tenant-scoped, server-paginated portfolio and detail APIs with a
summary computed from the same filtered dataset as the table.

**Acceptance criteria:**

- [ ] Filters, search, pagination and sort inputs are Zod-validated and bounded.
- [ ] Summary counts reconcile to active filters and total items.
- [ ] Detail includes raw evidence, derivation, risks, events, ad-group aggregates,
      freshness and deep link.
- [ ] Cross-tenant state IDs return 404 rather than revealing existence.

**Verification:**

- [ ] `pnpm exec vitest run test/server/api/googleAiMaxReadinessEndpoint.test.ts`
- [ ] Test every filter, pagination boundary, summary reconciliation and tenant leak.

**Dependencies:** Tasks 3 and 5  
**Files likely touched:**

- `server/api/agency/social/google/ai-max/readiness.get.ts`
- `server/api/agency/social/google/ai-max/readiness/[id].get.ts`
- `server/utils/googleAiMaxRepository.ts`
- `test/server/api/googleAiMaxReadinessEndpoint.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 8: Add filtered CSV export safely

**Description:** Export the same tenant-scoped/filter-scoped readiness dataset for
operational review. Neutralize spreadsheet formulas and bound result size.

**Acceptance criteria:**

- [ ] Export uses the exact list filter parser and classification labels.
- [ ] Values beginning with `=`, `+`, `-` or `@` cannot execute as formulas.
- [ ] UTF-8 filename/content headers are correct and export size is capped.

**Verification:**

- [ ] `pnpm exec vitest run test/server/api/googleAiMaxExportEndpoint.test.ts`
- [ ] Open a fixture export in a spreadsheet and confirm cells remain literal.

**Dependencies:** Task 7  
**Files likely touched:**

- `server/api/agency/social/google/ai-max/export.csv.get.ts`
- `server/utils/csv.ts` (only if a safe shared helper does not already exist)
- `test/server/api/googleAiMaxExportEndpoint.test.ts`

**Estimated scope:** Medium (2-3 files)

---

### Task 9: Add frontend contracts, labels and API composable

**Description:** Define shared UI-facing types, exhaustive labels/status tones and
fetch/poll helpers. Keep classification on the server; frontend utilities only present
contract values.

**Acceptance criteria:**

- [ ] Every readiness/migration/subfeature state has an explicit label, color and icon.
- [ ] Unknown states never inherit a success tone.
- [ ] Polling stops on terminal state, timeout and component disposal.
- [ ] Filter sentinels are non-empty (`all`, `__stale__`, etc.).

**Verification:**

- [ ] `pnpm exec vitest run test/utils/googleAiMax.test.ts`
- [ ] `pnpm exec vitest run test/composables/useGoogleAiMax.test.ts`

**Dependencies:** Tasks 6-7  
**Files likely touched:**

- `app/utils/googleAiMax.ts`
- `app/composables/useGoogleAiMax.ts`
- `test/utils/googleAiMax.test.ts`
- `test/composables/useGoogleAiMax.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 10: Build portfolio summary and readiness table

**Description:** Build the dedicated `/agency/social/google/ai-max` page with summary,
freshness, scan controls, server-side filters/pagination and robust degraded states.

**Acceptance criteria:**

- [ ] Uses Nuxt UI v4 (`UTable`, `UButton`, `USelectMenu`, `UInput`, `UBadge`,
      `UAlert`, `UPagination`) and semantic dark-mode colors.
- [ ] Loading, not-scanned, empty-success, partial, stale, failed and unknown states
      are visually distinct.
- [ ] Table works on narrow screens without hiding status/evidence.
- [ ] Manual refresh shows progress and cannot start duplicate scans.

**Verification:**

- [ ] `pnpm exec vitest run test/app/googleAiMaxReadinessPage.test.ts`
- [ ] Browser test at mobile, tablet and desktop widths in light and dark modes.
- [ ] Keyboard-test filters, pagination, scan and row navigation.

**Dependencies:** Task 9  
**Files likely touched:**

- `app/pages/agency/social/google/ai-max.vue`
- `app/components/social/SpendAiMaxSummary.vue`
- `app/components/social/SpendAiMaxReadinessTable.vue`
- `test/app/googleAiMaxReadinessPage.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 11: Build campaign evidence slideover

**Description:** Show plain-language classification, raw evidence, effective settings,
risks, ad-group exceptions and material state history without editable controls.

**Acceptance criteria:**

- [ ] Each conclusion names its evidence and observation time.
- [ ] Raw values/new enums remain visible in unknown states.
- [ ] Deep link is restricted to Google Ads HTTPS origin.
- [ ] Timeline orders events deterministically and handles no-history state.

**Verification:**

- [ ] `pnpm exec vitest run test/app/googleAiMaxCampaignSlideover.test.ts`
- [ ] Manual comparison against one campaign in Google Ads UI.

**Dependencies:** Tasks 7 and 10  
**Files likely touched:**

- `app/components/social/SpendAiMaxCampaignSlideover.vue`
- `app/pages/agency/social/google/ai-max.vue`
- `test/app/googleAiMaxCampaignSlideover.test.ts`

**Estimated scope:** Medium (3 files)

---

### Task 12: Integrate AI Max summary into the spend control room

**Description:** Add a compact readiness card and link from the existing spend page
without duplicating the portfolio table or upsetting the current four-card layout.

**Acceptance criteria:**

- [ ] Summary appears only for All/Google views when Google data exists or scan is
      required.
- [ ] Unknown/needs-review takes precedence over affected count in status tone.
- [ ] Existing account, pacing, reconciliation and write-safety cards remain present
      exactly once.
- [ ] The card links to the filtered dedicated route.

**Verification:**

- [ ] `pnpm exec vitest run test/app/socialSpendAiMaxSummary.test.ts`
- [ ] Re-read the full modified page/component to check duplicate sections and
      responsive grid behavior.

**Dependencies:** Task 10  
**Files likely touched:**

- `app/components/social/SocialSpendControlRoom.vue`
- `app/pages/agency/social/spend.vue`
- `app/components/social/SpendAiMaxSummary.vue`
- `test/app/socialSpendAiMaxSummary.test.ts`

**Estimated scope:** Medium (4 files)

### Checkpoint B: Usable read-only release

- [ ] Manual scan -> persisted state -> list -> detail -> export works end-to-end.
- [ ] Summary counts reconcile across API, page and spend card.
- [ ] Cross-tenant and no-permission tests pass.
- [ ] Responsive/light/dark browser verification passes.
- [ ] Direct and MCC campaigns match Google Ads UI samples.
- [ ] No raw form elements or provider writes were introduced.
- [ ] Human review approves UI language before notifications are enabled.

---

### Task 13: Add scheduled scan endpoint and operations guard

**Description:** Invoke the same scanner daily from an authenticated cron endpoint with
explicit tenant enumeration, overlap protection and observable terminal status.

**Acceptance criteria:**

- [ ] Invalid/missing cron secret is rejected.
- [ ] Tenant enumeration does not depend on cookies or a random user's last tenant.
- [ ] Scheduled/manual scans share classifier, persistence and deduplication code.
- [ ] One tenant failure does not stop remaining tenants.

**Verification:**

- [ ] `pnpm exec vitest run test/server/api/googleAiMaxCronEndpoint.test.ts`
- [ ] Dry-run against local server with a test tenant and inspect run records.

**Dependencies:** Tasks 5-6  
**Files likely touched:**

- `server/api/cron/google-ai-max-readiness.post.ts`
- `server/utils/googleAiMaxScheduler.ts`
- `test/server/api/googleAiMaxCronEndpoint.test.ts`

**Estimated scope:** Medium (3 files)

---

### Task 14: Add deduplicated in-app notifications and digest

**Description:** Notify media users on first affected detection and critical/unknown
transitions, plus one daily unresolved digest. Honor quiet hours/DND and suppress
repeated scan noise.

**Acceptance criteria:**

- [ ] Same campaign/event/day generates at most one notification per intended user.
- [ ] A no-change scan sends nothing.
- [ ] Notifications distinguish Google evidence, XeroFlow derivation and suggested
      human action.
- [ ] No client-portal/email/Slack fan-out occurs in Release 1.

**Verification:**

- [ ] `pnpm exec vitest run test/server/utils/googleAiMaxNotifications.test.ts`
- [ ] Test quiet hours, DND, dedupe, recovery and cross-tenant recipients.

**Dependencies:** Tasks 5 and 13  
**Files likely touched:**

- `server/utils/googleAiMaxNotifications.ts`
- `server/utils/notifications.ts` (only for a reusable event type/helper)
- `server/utils/googleAiMaxScheduler.ts`
- `test/server/utils/googleAiMaxNotifications.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 15: Add caching, invalidation and operational diagnostics

**Description:** Add short-lived tenant/filter-aware readiness caching, invalidate on
scan completion, and expose scan freshness/coverage in existing diagnostics patterns.

**Acceptance criteria:**

- [ ] Cache key includes tenant and normalized filters.
- [ ] Scan completion invalidates summary/list caches.
- [ ] A failed scan cannot cache a healthy zero state.
- [ ] Logs/metrics contain bounded identifiers and no customer names/tokens.

**Verification:**

- [ ] `pnpm exec vitest run test/server/utils/googleAiMaxCache.test.ts`
- [ ] Verify second identical list request hits cache and post-scan request misses.

**Dependencies:** Tasks 7 and 13  
**Files likely touched:**

- `server/utils/socialSpendCache.ts`
- `server/api/agency/social/google/ai-max/readiness.get.ts`
- `server/utils/googleAiMaxScanner.ts`
- `test/server/utils/googleAiMaxCache.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 16: Update public feature pages

**Description:** Add accurate marketing content describing read-only Google AI Max
readiness governance. Do not advertise provider writes or causal performance claims.

**Acceptance criteria:**

- [ ] Feature index includes AI Max readiness under finance/ad-spend or AI operations.
- [ ] Feature detail has 3-4 sections covering portfolio audit, evidence, migration
      control and post-change measurement roadmap.
- [ ] Mega menu is updated only if the existing Google Ads category requires it.
- [ ] All hardcoded public-page colors include correct dark variants.

**Verification:**

- [ ] Relevant feature contract tests pass.
- [ ] Browser-check public pages in light/dark and mobile/desktop.
- [ ] Marketing copy matches actually shipped Release 1 behavior.

**Dependencies:** Checkpoint B; can proceed in parallel with Tasks 13-15 after API/UI
contract is stable.  
**Files likely touched:**

- `app/pages/features/index.vue`
- `app/pages/features/[slug].vue`
- `app/components/MarketingNav.vue` (conditional)
- `test/config/googleAiMaxMarketingContract.test.ts`

**Estimated scope:** Medium (3-4 files)

---

### Task 17: Write runbook and production readiness checks

**Description:** Document migration application, first scan, field verification, cron
activation, alert behavior, dashboards, rollback and incident response.

**Acceptance criteria:**

- [ ] Runbook contains exact commands and Cloudflare cron configuration.
- [ ] First production scan is manual with notifications suppressed/log-only.
- [ ] Coverage and campaign samples are compared against Google Ads before scheduling.
- [ ] Rollback disables cron/UI notifications without deleting historical data.

**Verification:**

- [ ] A second engineer follows the runbook in preview without undocumented steps.
- [ ] `pnpm deploy:check` passes before any deployment command.

**Dependencies:** Tasks 13-15  
**Files likely touched:**

- `docs/runbooks/google-ai-max-readiness.md`
- `docs/ENVIRONMENT_VARIABLES.md` (only if a new flag/secret is added)
- `scripts/google-ai-max-readiness-check.mjs`
- `test/config/googleAiMaxReadinessScript.test.ts`

**Estimated scope:** Medium (3-4 files)

---

### Task 18: Battle test, deploy and verify Release 1

**Description:** Perform the project-mandated deep-dive review, targeted/full quality
gates, preview verification, safe production deployment and read-only production
comparison.

**Acceptance criteria:**

- [ ] Every modified/new file is re-read end-to-end.
- [ ] Server aliases, USelect values, reactivity, duplicate UI, semantic colors,
      tenant isolation and secret handling pass review.
- [ ] Migration has been applied and verified.
- [ ] Production direct/MCC samples match Google Ads.
- [ ] Scheduled scans/notifications remain off until manual verification is signed off.

**Verification:**

- [ ] Targeted AI Max tests pass.
- [ ] `pnpm lint`
- [ ] `pnpm typecheck` with pre-existing failures separated from regressions.
- [ ] `pnpm test:run`
- [ ] `pnpm build`
- [ ] `pnpm deploy:check`
- [ ] Deploy only through `pnpm deploy:preview` / `pnpm deploy:production` when
      authorized; never call `wrangler pages deploy` directly.

**Dependencies:** Tasks 1-17  
**Files likely touched:** No planned source changes; fixes discovered during review must
return to their owning task and tests.  
**Estimated scope:** Medium

### Checkpoint C: Release 1 complete

- [ ] All PRD acceptance criteria are met.
- [ ] Read-only behavior is proven by code review and live testing.
- [ ] Production coverage, affected, unknown and freshness counts are recorded.
- [ ] Cron and notifications are enabled only after manual sign-off.
- [ ] Marketing pages are live and accurate.
- [ ] Operational owner is assigned for unresolved campaigns through 2026-09-01.

## Release 2 Task List: Measurement and Asset Oversight

Release 2 starts only after Release 1 data has been stable for at least one successful
daily scan cycle and the field interpretation has no unresolved production mismatch.

### Task 19: Add performance and baseline schema

**Description:** Add idempotent daily match-source metrics and immutable baseline
metadata with explicit reset audit.

**Acceptance criteria:**

- [ ] Daily uniqueness is tenant/connection/campaign/date/raw-match-source.
- [ ] Baseline stores window, totals, fingerprint, confidence notes and capture time.
- [ ] A baseline cannot be silently overwritten after AI Max traffic is observed.

**Verification:**

- [ ] Apply migration automatically and inspect constraints/indexes.
- [ ] Migration contract tests pass.

**Dependencies:** Release 1 complete  
**Files likely touched:**

- `server/database/migrations/289_google_ai_max_performance.sql`
- `test/server/database/googleAiMaxPerformanceMigration.test.ts`

**Estimated scope:** Small (2 files)

---

### Task 20: Ingest AI Max match-source performance

**Description:** Query `segments.search_term_match_source` and related metrics per
campaign/day, normalize raw sources and idempotently persist results.

**Acceptance criteria:**

- [ ] Advertiser keyword, AI Max broad-match and AI Max keywordless sources remain
      separate.
- [ ] New enum values persist as raw Other/unknown without data loss.
- [ ] Cost micros and derived major values reconcile with Google samples.

**Verification:**

- [ ] `pnpm exec vitest run test/server/utils/googleAiMaxPerformance.test.ts`
- [ ] Compare one campaign/day with Google Ads reporting.

**Dependencies:** Task 19  
**Files likely touched:**

- `server/utils/googleAiMaxPerformance.ts`
- `server/utils/googleAdsClient.ts`
- `test/server/utils/googleAiMaxPerformance.test.ts`

**Estimated scope:** Medium (3 files)

---

### Task 21: Capture deterministic baselines and comparisons

**Description:** Freeze the default 28-day pre-window and compute 7/14/30-day equal
window comparisons with confounder/reliability flags.

**Acceptance criteria:**

- [ ] CPA/ROAS calculations use null for zero denominators.
- [ ] Budget, bid-strategy, status and configuration changes are surfaced as
      confounders.
- [ ] Low-volume comparisons are labeled low-confidence without causal language.

**Verification:**

- [ ] `pnpm exec vitest run test/server/utils/googleAiMaxBaseline.test.ts`
- [ ] Property/fixture tests cover missing days, zero conversions and configuration
      changes.

**Dependencies:** Tasks 19-20  
**Files likely touched:**

- `server/utils/googleAiMaxBaseline.ts`
- `server/utils/googleAiMaxRepository.ts`
- `test/server/utils/googleAiMaxBaseline.test.ts`

**Estimated scope:** Medium (3 files)

---

### Task 22: Add performance API and UI

**Description:** Add campaign-detail performance reporting with source mix, trend and
baseline comparison. Use a client-only Unovis chart only where it adds clarity.

**Acceptance criteria:**

- [ ] 7/14/30-day windows reconcile to stored daily data.
- [ ] UI separates observed metrics, comparison and interpretation cautions.
- [ ] Unknown sources and low-confidence states are visible.

**Verification:**

- [ ] API and component tests pass.
- [ ] Browser-check chart/tooltips in light/dark and narrow widths.

**Dependencies:** Task 21  
**Files likely touched:**

- `server/api/agency/social/google/ai-max/readiness/[id]/performance.get.ts`
- `app/components/social/SpendAiMaxPerformance.client.vue`
- `app/components/social/SpendAiMaxCampaignSlideover.vue`
- `test/app/googleAiMaxPerformance.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 23: Add generated-asset and landing-page oversight

**Description:** Retrieve automatically created assets/associations and supported
performance fields, then display a read-only review section with Google deep links.

**Acceptance criteria:**

- [ ] Only provider-reported automatically created assets are labeled automatic.
- [ ] Status, association, type and metrics are retained with raw provider IDs.
- [ ] Unsupported asset types degrade safely; no pause/remove action is exposed.

**Verification:**

- [ ] Utility/API/component tests pass.
- [ ] Compare one generated asset and landing page with Google Ads UI.

**Dependencies:** Release 1 and Task 20; may run in parallel with Tasks 21-22 after the
API contract is fixed.  
**Files likely touched:**

- `server/utils/googleAiMaxAssets.ts`
- `server/api/agency/social/google/ai-max/readiness/[id]/assets.get.ts`
- `app/components/social/SpendAiMaxAssets.vue`
- `test/server/utils/googleAiMaxAssets.test.ts`

**Estimated scope:** Medium (4 files)

### Checkpoint D: Release 2 complete

- [ ] Daily source metrics reconcile with Google samples.
- [ ] Baselines are immutable and confounders visible.
- [ ] Generated assets are provider-derived and read-only.
- [ ] No UI copy claims causal lift.
- [ ] Targeted tests, typecheck, full tests and build complete.

## Release 3 Gate: Governed AI Max Writes

### Task 24: Author a separate mutation PRD

**Description:** Use Release 1-2 usage, error and outcome data to specify exactly which
AI Max settings may be proposed and written, with immutable approvals, feature flags,
idempotency, provider read-back and rollback semantics.

**Acceptance criteria:**

- [ ] Setting-level allowlist and prohibited actions are explicit.
- [ ] Before/after configuration fingerprint and approval roles are defined.
- [ ] Google API mutate/update-mask behavior is validated against current API docs.
- [ ] No implementation begins until the new PRD receives human approval.

**Verification:**

- [ ] Security, media operations and platform owner review the mutation PRD.
- [ ] The current read-only code remains unchanged by this task.

**Dependencies:** Release 2 operational review  
**Files likely touched:**

- `docs/prd/google-ai-max-governed-actions-prd.md`

**Estimated scope:** Small (1 file)

## Dependency and Parallelization Map

```text
Task 1 -> Task 2 -> Task 3
                 -> Task 4 -> Task 5 -> Task 6
                                      -> Task 7 -> Task 8
                                                -> Task 9 -> Task 10 -> Task 11
                                                                  -> Task 12
                                      -> Task 13 -> Task 14
                                                -> Task 15
Checkpoint B -------------------------------> Task 16
Tasks 13-15 --------------------------------> Task 17
Tasks 1-17 ---------------------------------> Task 18

Release 1 -> Task 19 -> Task 20 -> Task 21 -> Task 22
                              \-------------> Task 23
Release 2 review ----------------------------> Task 24
```

Safe parallel work after contracts stabilize:

- Task 8 can run alongside Task 9 after Task 7's filter contract is fixed.
- Tasks 11 and 12 can run in parallel with clear component ownership.
- Task 16 can run alongside Tasks 13-15 after Checkpoint B.
- Task 23 can run alongside Tasks 21-22 after Task 20.

Must remain sequential:

- Live field validation before classifier finalization.
- Classifier contract before persistence schema.
- Migration before persistence/API execution.
- Manual scan verification before scheduled scan/notifications.
- Release 1 production validation before Release 2 baselines.
- Separate approved PRD before any provider mutation.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Google fields are omitted depending on campaign state | High | Nullable evidence, live validation, unknown fail-closed state |
| MCC/direct credential differences | High | Reuse credential profiles and `resolveGoogleWriteAuth`; test both paths |
| Tenant association for Google connections is ambiguous | High | Persist selected tenant explicitly; do not infer from account/client names; block until scope is resolvable |
| API quotas across many accounts | Medium | Two account-level queries, bounded concurrency, daily cadence, retries and partial runs |
| False all-clear during outage | High | Separate freshness/error from last known values; stale/unknown precedence |
| Notification flood before deadline | High | Material-change events, daily digest, dedupe and log-only rollout |
| Google introduces new enums | Medium | Preserve raw values and classify unknown until supported |
| Final URL expansion is incorrectly inferred | High | Independent asset-automation field; explicit unit test |
| Performance comparison implies causation | High | Baseline fingerprint, confounders, low-confidence labels and restrained copy |
| CSV formula injection | Medium | Shared neutralization helper and hostile fixture tests |
| Feature accidentally enables writes | Critical | No mutate method/endpoint in Releases 1-2; code-review grep and feature-scope test |
| Existing TypeScript errors mask regressions | Medium | Targeted tests first; capture baseline typecheck errors and compare only new failures |

## Review Checklist Before Implementation

- [ ] Product owner approves assumptions and Release 1 scope.
- [ ] Media lead approves classification wording and risk rules.
- [ ] Platform owner confirms tenant-scope strategy for Google connections.
- [ ] Notification owner decides in-app-only versus separate Slack preference.
- [ ] Release 1 deadline and operational owner are confirmed.
- [ ] Open questions in the PRD are resolved or explicitly deferred.
- [ ] PRD and this task list are updated before code begins.


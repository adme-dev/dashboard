# XeroFlow Platform Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only Google Ads and Meta delivery diagnostics, search-term evidence, and reliable creative text to XeroFlow's existing MCP analytics surface.

**Architecture:** Extend the existing typed campaign/ad snapshots and provider clients, keeping each diagnostic family independently timestamped and failure-isolated. Add one campaign-scoped `get_search_terms` registry tool; existing read tools gain only additive fields. Provider text is sanitized and marked untrusted, and live transport verification re-reads persisted rows.

**Tech Stack:** Nuxt 4.5.1/Nitro, TypeScript, Zod 4.4.3, Neon Postgres, Google Ads REST API v23, Meta Graph API v25.0, Vitest, Cloudflare Pages/MCP Worker.

**Spec:** `docs/superpowers/specs/2026-08-24-xeroflow-platform-diagnostics-design.md`

## Global Constraints

- Read-only: no Google/Meta mutations and no new propose/confirm path.
- No new cron; reuse the ad-spend and creative sync/read-through flows.
- Keep Google and Meta failures and halts platform-scoped.
- Each family exposes its own `asOf`, `dataStatus`, and honest unavailable/unsupported reason.
- Preserve exact provider codes alongside normalized consumer codes.
- Provider list collection must paginate; every application cap is declared in responses.
- All new response fields are additive and camelCase; enum values are upper snake case.
- External/provider text is capped, sanitized, and treated as untrusted.
- Per Paul's execution preference, implementation and test authoring happen first; all test commands run in Task 8.
- Apply migration 398 automatically to the configured Neon database after local verification.
- Deploy only through `pnpm deploy:*`, after `pnpm deploy:check`; deployment is not implied without explicit production authorization.

---

### Task 1: Diagnostic contracts and additive schema

**Files:**
- Create: `server/utils/adDiagnostics.ts`
- Create: `server/database/migrations/398_ad_delivery_diagnostics.sql`
- Test later: `test/server/utils/adDiagnostics.test.ts`
- Test later: `test/config/adDeliveryDiagnosticsMigration.test.ts`

**Interfaces:**
- Produces `DiagnosticDataStatus`, `PolicyIssue`, `normalizeGoogleServingReasons`, `normalizeGoogleApprovalStatus`, `normalizeMetaApprovalStatus`, `normalizeMetaLearningStage`, `diagnosticDataStatus`, and `sanitizeDiagnosticText`.
- Produces typed columns consumed by Tasks 2–6 and two search-term tables with transactional parent/child snapshots.

- [ ] **Step 1: Define pure diagnostic types and normalizers.**

```ts
export type DiagnosticDataStatus = 'fresh' | 'stale' | 'unavailable' | 'unsupported'
export type PolicyIssue = {
  code: string | null
  topic: string | null
  summary: string
  message: string | null
  type: string | null
  level: string | null
}

export function normalizeGoogleServingReasons(values: unknown): {
  normalized: string[]
  provider: string[]
}

export function diagnosticDataStatus(input: {
  platform: 'google' | 'meta'
  supported: boolean
  asOf: string | null
  unavailableReason: string | null
  now?: Date
}): DiagnosticDataStatus
```

The Google mapping is the spec's stable-code table. Unknown raw codes remain in `provider` and add
`OTHER_PROVIDER_REASON`. Meta active/paused delivery variants normalize approval to `APPROVED` while exact
`effective_status` remains in `providerApprovalStatus`; disapproved and pending-review states remain explicit.

- [ ] **Step 2: Add ad and campaign diagnostic columns.**

```sql
ALTER TABLE ad_performance_snapshots
  ADD COLUMN IF NOT EXISTS ad_set_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_set_name TEXT,
  ADD COLUMN IF NOT EXISTS cpm NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approval_review_status TEXT,
  ADD COLUMN IF NOT EXISTS policy_issues JSONB,
  ADD COLUMN IF NOT EXISTS approval_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_unavailable_reason TEXT,
  ADD COLUMN IF NOT EXISTS learning_stage TEXT,
  ADD COLUMN IF NOT EXISTS provider_learning_stage TEXT,
  ADD COLUMN IF NOT EXISTS learning_stage_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS learning_stage_unavailable_reason TEXT;

ALTER TABLE media_spend
  ADD COLUMN IF NOT EXISTS serving_status TEXT,
  ADD COLUMN IF NOT EXISTS serving_status_reasons TEXT[],
  ADD COLUMN IF NOT EXISTS provider_serving_status_reasons TEXT[],
  ADD COLUMN IF NOT EXISTS serving_status_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS serving_status_unavailable_reason TEXT,
  ADD COLUMN IF NOT EXISTS impression_share_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS impression_share_unavailable_reason TEXT;
```

- [ ] **Step 3: Add explicit search-term sync state and rows.**

Create `campaign_search_term_syncs` keyed by `(media_spend_id, range_start, range_end)` with `coverage`,
`synced_at`, `last_attempted_at`, `last_error`, `source_total`, and `truncated_at_source`. Create
`campaign_search_term_snapshots` keyed by `(sync_id, search_term, match_type)` with targeting status and metrics.
Use `ON DELETE CASCADE` and campaign/window plus cost/click indexes. The parent row represents successful empty,
unsupported, and failed results without inventing a term row.

- [ ] **Step 4: Update the design spec's storage section to name both search-term tables.**

- [ ] **Step 5: Review Task 1 changes with `git diff --check` and re-read both files; do not run tests yet.**

### Task 2: Google provider reads and daily campaign persistence

**Files:**
- Modify: `server/utils/googleAdsClient.ts`
- Modify: `server/utils/spendSync.ts`
- Test later: `test/server/utils/googleAdsDiagnostics.test.ts`
- Test later: `test/server/utils/spendSync.test.ts`

**Interfaces:**
- Produces `GoogleCampaignDiagnostic`, `GoogleSearchTerm`, `getGoogleCampaignDiagnostics`, and `getGoogleCampaignSearchTerms`.
- Extends `GoogleAdPerformance` with approval fields used by Task 4.

- [ ] **Step 1: Add an independently queried Google campaign diagnostic reader.**

```ts
export interface GoogleCampaignDiagnostic {
  campaignId: string
  channelType: string
  servingStatus: string | null
  servingStatusReasons: string[]
  providerServingStatusReasons: string[]
  impressionShare: number | null
  lostImpressionShareBudget: number | null
  lostImpressionShareRank: number | null
}

export async function getGoogleCampaignDiagnostics(
  customerId: string,
  token: string,
  developerToken: string,
  since: string,
  until: string,
  campaignId?: string,
  loginCustomerId?: string,
): Promise<GoogleCampaignDiagnostic[]>
```

Use a campaign primary-status query and a separate impression-share query, merging by campaign ID. A failed
impression-share query must not discard serving metadata. Return ratios from Google unchanged on `[0,1]`; convert to
the existing percentage storage convention only at persistence.

- [ ] **Step 2: Add Google ad-policy metadata to `getGoogleCampaignAdPerformance`.**

Run the existing dated metric query and a separate `ad_group_ad.policy_summary` query with `Promise.allSettled`.
Merge the union of metric and metadata ad IDs so zero-delivery disapproved ads are visible. Set approval family
timestamps only when the metadata query succeeds; preserve a sanitized family error otherwise.

- [ ] **Step 3: Add paginated Google campaign search terms.**

```ts
export interface GoogleSearchTerm {
  searchTerm: string
  matchType: string | null
  targetingStatus: string | null
  impressions: number
  clicks: number
  cost: number
}

export async function getGoogleCampaignSearchTerms(
  customerId: string,
  token: string,
  developerToken: string,
  campaignId: string,
  since: string,
  until: string,
  loginCustomerId?: string,
): Promise<GoogleSearchTerm[]>
```

Query `campaign_search_term_view`; sanitize term text to 500 characters; aggregate duplicate rows by term/match type;
sort by cost descending. `gaqlQuery` already consumes all `searchStream` batches, so no GAQL `LIMIT` is added.

- [ ] **Step 4: Fetch Google campaign diagnostics once per daily connection sync and persist them.**

Extend `processGoogleConnection` dependencies, load diagnostics without coupling failure to spend, and update/insert
the new `media_spend` fields. On diagnostic failure retain old successful values/clocks and set a sanitized
unavailable reason; on success clear the error and advance the relevant clock.

- [ ] **Step 5: Review the Google GAQL field/resource compatibility and persistence parameter order; do not run tests yet.**

### Task 3: Meta ad/ad-set diagnostics

**Files:**
- Modify: `server/utils/metaClient.ts`
- Modify: `server/utils/spendSync.ts`
- Test later: `test/server/utils/metaAdPerformance.test.ts`
- Test later: `test/server/utils/metaDiagnostics.test.ts`

**Interfaces:**
- Extends `MetaAdPerformance` with ad-set identity, CPM, approval, policy issues, learning stage, clocks, and family errors.
- Produces `getMetaCampaignDiagnostic(campaignId, token)` for bounded campaign read-through.

- [ ] **Step 1: Split Meta collection into failure-isolated requests.**

Keep range/daily ad insights as the core metric requirement. Fetch campaign ads (`id,name,adset_id,effective_status,
issues_info,creative{id}`), campaign ad sets (`id,name,effective_status,learning_stage_info`), and ad-set insights
(`adset_id,spend,impressions,frequency,cpm`) separately and paginate every edge.

- [ ] **Step 2: Merge ad-set evidence onto each ad row.**

Every matching Meta ad receives `adSetId`, `adSetName`, ad-set frequency/CPM, normalized/exact approval state,
normalized policy issues, and normalized/exact learning stage. Metadata failures annotate only their family and do not
erase core ad metrics.

- [ ] **Step 3: Persist Meta campaign serving status during the existing spend sync.**

The account-level `getCampaigns` response already includes `effective_status`; write that to `serving_status`, use
empty reason arrays on successful metadata collection, advance `serving_status_synced_at`, and preserve previous
diagnostics when the metadata request fails.

- [ ] **Step 4: Add a one-campaign Meta status read for explicit refreshes.**

Use `GET /{campaign-id}?fields=effective_status` and return a typed, sanitized structure without exposing raw Graph
payloads.

- [ ] **Step 5: Re-read the Meta merge paths for incorrect ad/ad-set ID joins and partial failures; do not run tests yet.**

### Task 4: Persist and project ad-level diagnostics

**Files:**
- Modify: `server/utils/onDemandSync.ts`
- Modify: `server/utils/ai/tools/adBreakdown.ts`
- Test later: `test/server/utils/onDemandAdPerformanceSync.test.ts`
- Test later: `test/ai/tools/adBreakdown.test.ts`

**Interfaces:**
- `syncCampaignAdPerformance` persists every extended Google/Meta field.
- `get_ad_breakdown` adds optional diagnostic fields without changing existing metrics, pagination, or halt fields.

- [ ] **Step 1: Extend the ad-performance upsert.**

Write ad-set identity, CPM, approval/review/policy fields, learning fields, timestamps, and unavailable reasons in the
same conflict upsert. Serialize only normalized `PolicyIssue[]`. A failed family must not advance its prior clock or
replace good values with healthy defaults.

- [ ] **Step 2: Extend `RawAdRecord` and its SQL mapping.**

Select the new columns explicitly, parse JSON/text arrays defensively, and compute family status with
`diagnosticDataStatus`. Google learning is `unsupported`; Meta rows missing an expected provider response are
`unavailable`.

- [ ] **Step 3: Add the response fields and update the tool description.**

Return `approvalStatus`, `providerApprovalStatus`, `approvalReviewStatus`, `policyIssues`, `approvalAsOf`,
`approvalDataStatus`, `approvalUnavailableReason`, `adSetId`, `adSetName`, `learningStage`,
`providerLearningStage`, `learningStageAsOf`, `learningStageDataStatus`, `learningStageUnavailableReason`, `frequency`,
`cpm`, and `metricsAsOf`. Keep the current response cap/cursor contract.

- [ ] **Step 4: Re-read the full tool and sync files for conversions suppression, platform halts, and additive output; do not run tests yet.**

### Task 5: Campaign diagnostics and impression share projection

**Files:**
- Modify: `server/utils/onDemandSync.ts`
- Modify: `server/api/agency/analytics/campaigns.get.ts`
- Modify: `server/utils/ai/tools/campaignBreakdown.ts`
- Test later: `test/server/api/agencyAnalyticsCampaignsEndpoint.test.ts`
- Test later: `test/ai/tools/campaignBreakdown.test.ts`

**Interfaces:**
- Produces `syncCampaignDeliveryDiagnostics(mediaSpendId)` for bounded read-through.
- Adds optional campaign diagnostics to the analytics endpoint and `BreakdownCampaign`.

- [ ] **Step 1: Implement bounded one-campaign delivery refresh.**

Resolve connection credentials like `syncCampaignAdPerformance`. Google calls `getGoogleCampaignDiagnostics` for one
campaign; Meta calls `getMetaCampaignDiagnostic`. Persist success/error clocks without mutating platform state.

- [ ] **Step 2: Add diagnostic aggregate fields to the analytics endpoint.**

Select the latest `serving_status`, normalized/provider reason arrays and clocks, plus all three impression-share
percentages and their clock/error. Return them as additive camelCase fields; convert percentages to ratios for the
MCP-facing model.

- [ ] **Step 3: Extend campaign breakdown mapping and read-through.**

Add `refresh: boolean` to the Zod input. Refresh up to the existing 20-campaign target cap when explicitly requested
or when diagnostics have never been collected, then reload once. Return the spec's serving fields and an absent
`impressionShare` block for unsupported campaign types, with separate family status/reason.

- [ ] **Step 4: Preserve platform-scoped halts.**

Diagnostic refresh results cannot change the existing spend freshness timestamps or cross-platform coverage halt;
only the requested platform's rows are refreshed.

- [ ] **Step 5: Re-read endpoint aggregation for grouped-period correctness and tool mapping for ratio/percent mistakes; do not run tests yet.**

### Task 6: Search-term storage service and MCP tool

**Files:**
- Create: `server/utils/adSearchTerms.ts`
- Create: `server/utils/ai/tools/searchTerms.ts`
- Modify: `server/utils/ai/tools/index.ts`
- Test later: `test/server/utils/adSearchTerms.test.ts`
- Test later: `test/ai/tools/searchTerms.test.ts`
- Test later: `test/ai/mcpProjection.test.ts` or nearest existing projection contract suite

**Interfaces:**
- Produces `syncCampaignSearchTerms`, `loadCampaignSearchTerms`, and `get_search_terms`.
- Consumes Google provider reader and migration tables from Tasks 1–2.

- [ ] **Step 1: Implement transactional search-term refresh.**

Resolve the media-spend row and connection with tenant/client scope. Meta and unsupported Google types write/return
`unsupported` without a provider call. Google Search/Shopping use `full`; Performance Max uses `limited`. On provider
success, transactionally upsert sync state, replace child rows, cap stored provider rows at 5,000, and declare
`truncatedAtSource`. On failure update only attempt/error state and retain prior rows/asOf.

- [ ] **Step 2: Implement cached reads and data status.**

Load by campaign/window, sort by cost or clicks, derive CPC, and paginate with the shared opaque cursor. A successful
empty result is distinct from unavailable. A failed refresh may return stale cached rows with the failed attempt
reason.

- [ ] **Step 3: Add the read-only tool boundary.**

Validate campaign ID/name plus optional client, date window, sort, cursor, limit ≤50, and refresh. Return source,
resolved campaign, coverage/reason, family status/asOf, refresh summary, rows, total, next cursor, `more`, and declared
source cap. Set `requiredPermission: 'MEDIA_BUYING'`, `returnsUntrusted: true`, and omit `mutates`.

- [ ] **Step 4: Register `searchTermsTool` and re-read the registry ordering/RBAC projection; do not run tests yet.**

### Task 7: Documentation, public feature copy, and test authoring

**Files:**
- Modify: `docs/mcp-server-guide.md`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Create/modify all test files named in Tasks 1–6

**Interfaces:**
- Documents the additive MCP contracts and provider coverage limitations.
- Adds focused unit/contract tests without running them yet.

- [ ] **Step 1: Update MCP documentation.**

Document `get_search_terms`, the new fields on both breakdown tools, 24-hour family freshness, platform-scoped
failures, Meta/PMax limitations, caps, and read-only status.

- [ ] **Step 2: Update the existing ad-spend/analytics marketing feature entries.**

Describe evidence-backed approval, serving limitation, impression share, search terms, learning state, frequency,
CPM, and creative-copy analysis. Do not create a new top-level mega-menu category or inflate feature counts unless a
new index card is added.

- [ ] **Step 3: Author provider/normalizer/storage tests.**

Cover exact + unknown Google reason mapping, Meta policy/learning normalization, separate clocks, provider paging,
zero-delivery policy ads, ad/ad-set join, partial failure, search-term aggregation/cap, and transactional stale-cache
retention.

- [ ] **Step 4: Author tool/transport-contract tests.**

Cover approved/disapproved rows, learning-limited rows, frequency/CPM, impression-share ratio and unsupported
absence, PMax limited coverage, pagination, untrusted marking, `MEDIA_BUYING` RBAC, read-only MCP projection, D-6
creative read-through, and platform-scoped halts.

- [ ] **Step 5: Perform the repository pre-commit deep review.**

Re-read every changed/new file end-to-end; verify `~~/server` imports, no empty select values, no duplicate UI copy,
no server-side unsafe URL fetches, provider caps, parameter order, fresh/stale clocks, and no tokens/raw payloads in
errors. Run `git diff --check`, inspect `git diff --stat`, and scan changed files for secrets/placeholders.

### Task 8: End-of-build verification, migration, live MCP acceptance, and commits

**Files:**
- Modify only when a verification failure identifies a changed-scope defect.

- [ ] **Step 1: Run focused diagnostic tests.**

```bash
pnpm vitest run \
  test/server/utils/adDiagnostics.test.ts \
  test/config/adDeliveryDiagnosticsMigration.test.ts \
  test/server/utils/googleAdsDiagnostics.test.ts \
  test/server/utils/metaAdPerformance.test.ts \
  test/server/utils/metaDiagnostics.test.ts \
  test/server/utils/onDemandAdPerformanceSync.test.ts \
  test/server/utils/adSearchTerms.test.ts \
  test/ai/tools/adBreakdown.test.ts \
  test/ai/tools/campaignBreakdown.test.ts \
  test/ai/tools/searchTerms.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run typecheck, lint on changed files where supported, and build.**

```bash
pnpm typecheck
pnpm exec eslint <all-changed-ts-vue-files>
pnpm build
pnpm deploy:check
```

Record pre-existing typecheck failures separately; no new changed-file error is acceptable. Build and deployment
target guard must pass.

- [ ] **Step 3: Run the repository-wide Vitest suite once.**

```bash
pnpm test:run
```

Compare failures to the recorded baseline (1843 files passed, 6 failed, 6 skipped; 11936 tests passed, 9 failed,
30 skipped, two environment-related unhandled errors). Any new changed-scope failure is fixed and the relevant focused
suite rerun.

- [ ] **Step 4: Verify and apply migration 398.**

Inspect the exact `.env` key name without printing its value, load `DATABASE_URL`, run the migration through `psql`
with `ON_ERROR_STOP=1`, then query `information_schema` for the new columns/tables. Re-running the migration must be
safe.

- [ ] **Step 5: Exercise the authenticated MCP transport and re-read state.**

Use the available authenticated MCP/browser surface. Call tool discovery, `get_campaign_breakdown`,
`get_ad_breakdown`, `get_search_terms`, and `get_ad_creative_text` against real connected Google/Meta campaigns.
Then query the diagnostic/search-term tables for those exact IDs and clocks. If no live adverse state exists, report
that limitation and rely on provider-shaped fixture coverage for adverse-state mapping.

- [ ] **Step 6: Commit reviewed slices atomically.**

```bash
git add <schema-and-contract-files>
git commit -m "feat(adspend): persist platform delivery diagnostics"
git add <provider-and-sync-files>
git commit -m "feat(adspend): collect Google and Meta diagnostics"
git add <tool-and-doc-test-files>
git commit -m "feat(mcp): expose ad diagnostics and search terms"
```

Each staged diff is re-read before its commit. Leave the feature branch clean. Do not deploy production without an
explicit deployment instruction.

## Plan self-review

- Spec coverage: D-1 Tasks 2–4; D-2 Tasks 2–5; D-3 Tasks 2/5; D-4 Tasks 1/2/6; D-5 Tasks 3/4; D-6 Task 7/8.
- Failure/freshness/halts: Tasks 1–6 and transport proof in Task 8.
- Public/docs sync: Task 7. Migration application: Task 8. Live MCP plus state re-read: Task 8.
- Type consistency: `DiagnosticDataStatus` and `PolicyIssue` originate only in `adDiagnostics.ts`; provider readers
  return typed objects; storage services consume those types; tools project camelCase additive fields.
- Placeholder scan: no deferred implementation markers; test commands and acceptance outputs are explicit.

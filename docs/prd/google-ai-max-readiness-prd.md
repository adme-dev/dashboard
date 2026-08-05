# PRD: Google Ads AI Max Readiness and Performance Governance

**Date:** 2026-08-06  
**Status:** Proposed - human review required before implementation  
**Product:** XeroFlow Agency Dashboard  
**Owner:** Media operations / platform engineering  
**Deadline driver:** Google automatic upgrades begin 2026-09-01  
**Companion plan:** `docs/prd/google-ai-max-readiness-task-list.md`

## Executive Summary

Google Ads will automatically upgrade Search campaigns that use automatically
created assets (ACA) and/or the campaign-level broad-match setting to AI Max starting
1 September 2026. The effective settings after the migration depend on the legacy
configuration:

- ACA campaigns receive AI Max with search-term matching and text customisation.
- Campaign-level broad-match campaigns receive AI Max with search-term matching.
- Campaigns using both inherit the applicable combination.

XeroFlow already connects multiple Google Ads accounts, syncs campaign spend and
performance, surfaces Google optimization recommendations, and governs budget writes.
It does not currently ingest AI Max state, legacy migration signals, asset-automation
settings, or AI Max-specific search-term performance. Agencies must therefore inspect
accounts manually in Google Ads and cannot see migration exposure or post-change
impact across their portfolio.

This feature adds an agency-wide, read-only readiness control first, followed by
AI Max performance and generated-asset oversight. Any later campaign-setting writes
must use XeroFlow's existing propose -> approve -> execute -> verify audit pattern and
remain disabled by default.

## Source Material

- Mandatory Google Ads service announcement received 2026-08-06: “Automatically
  created assets and campaign-level broad-match setting will be upgraded to AI Max.”
- Google Ads API v23 Campaign resource:
  <https://developers.google.com/google-ads/api/reference/rpc/v23/Campaign>
- AI Max campaign setting:
  <https://developers.google.com/google-ads/api/reference/rpc/v23/Campaign.AiMaxSetting>
- Google Ads campaign fields, including `keyword_match_type`:
  <https://developers.google.com/google-ads/api/fields/v23/campaign>
- AI Max ad-group search-term matching setting:
  <https://developers.google.com/google-ads/api/fields/v23/ad_group>
- Search-term match source and match type:
  <https://developers.google.com/google-ads/api/fields/v23/search_term_view>
- Asset automation settings:
  <https://developers.google.com/google-ads/api/docs/assets/asset-automation-settings>
- Automatically created asset reporting and association management:
  <https://developers.google.com/google-ads/api/docs/assets/automated-assets>
- AI Max product behavior and controls:
  <https://support.google.com/google-ads/answer/15910187>

Google documentation is the source of truth where the email and API behavior differ.
The implementation must pin its interpretation to an API version and retain raw enum
values so new Google values fail visibly rather than being silently misclassified.

## Assumptions and Product Decisions

1. Release 1 is read-only. It scans, classifies, explains, filters and exports; it
   does not mutate a Google campaign.
2. Release 1 includes active and paused Search campaigns across every active Google
   connection and credential profile accessible to the selected Xero tenant.
3. Removed campaigns are excluded. Unknown or inaccessible campaigns are reported,
   never treated as safe.
4. Google Ads is the source of truth for campaign settings and serving behavior.
   XeroFlow stores observations, classifications and audit history.
5. Migration exposure and current AI Max enablement are different concepts.
6. Search-term matching, text customisation and final URL expansion are displayed as
   separate effective settings. “AI Max enabled” alone is insufficient.
7. The migration scanner may use `campaign.keyword_match_type = BROAD` as the direct
   legacy campaign-level broad-match signal and `TEXT_ASSET_AUTOMATION = OPTED_IN` as
   the ACA/text-customisation signal. `bundling_required` is supporting evidence, not
   a substitute for either direct signal.
8. The selected Xero tenant is mandatory for every persisted scan, query and alert.
   A missing tenant fails closed.
9. Media-buying users can read results and request a refresh. Owner/admin users can
   configure alert policy. Future provider writes require owner/admin initially.
10. Daily scheduled scans are the default. A manual scan can be requested, but only
    one scan may run per tenant/account at a time.
11. Phase 2 compares AI Max-attributed traffic with a frozen pre-change baseline. It
    does not claim causation where campaign budgets, bids or creative also changed.
12. Front-facing feature pages are updated in the same implementation program.

## Problem Statement

### User problem

Agency media buyers manage Google Ads across many customers and manager accounts.
Google's upgrade occurs at campaign level, but the notification is account-oriented
and Google Ads has no XeroFlow portfolio view. A buyer needs to answer:

- Which campaigns will be upgraded?
- Why is each campaign affected?
- What is enabled now, and what is expected after migration?
- Which campaigns require a decision before the deadline?
- Are brand, landing-page, tracking or pinned-asset controls at risk?
- What changed after the upgrade?
- Did AI Max broad-match or keywordless traffic improve useful business outcomes?

### Current platform gap

`server/utils/googleAdsClient.ts` currently syncs campaign identity, status, channel,
bid strategy and performance metrics. It does not request:

- `campaign.keyword_match_type`
- `campaign.ai_max_setting.enable_ai_max`
- `campaign.ai_max_setting.bundling_required`
- `campaign.asset_automation_settings`
- `campaign.text_guidelines`
- `ad_group.ai_max_ad_group_setting.disable_search_term_matching`
- AI Max search-term source/match segments

`server/utils/googleRecommendations.ts` fetches Google's Recommendation resource and
optimization score. The mandatory migration does not necessarily arrive as a Google
Recommendation, so the existing panel cannot be relied upon to expose affected
campaigns.

## Objective

Give XeroFlow media teams one authoritative control surface to discover, explain and
manage Google AI Max migration risk across connected customers, and then measure the
operational and performance effects after adoption.

## Goals

### Release 1 - readiness and governance

1. Classify every accessible active or paused Search campaign.
2. Show exact evidence and effective subfeature settings per campaign.
3. Surface unresolved, unknown, stale and inaccessible states prominently.
4. Provide portfolio, account, client and campaign filtering.
5. Preserve scan history and material state changes for audit.
6. Provide a deadline-aware summary and exportable action list.
7. Notify relevant users of newly affected, materially changed or persistently unknown
   campaigns without repeated noise.
8. Remain read-only regardless of existing Google budget-write feature flags.

### Release 2 - performance and creative oversight

1. Capture an immutable pre-AI-Max baseline for affected campaigns.
2. Attribute post-change traffic to advertiser keywords, AI Max broad match and AI Max
   keywordless sources using Google-provided segments.
3. Compare spend, conversions, value, CPA and ROAS at 7, 14 and 30 days.
4. Show automatically created asset and landing-page performance.
5. Surface brand/control risks such as unexpected URLs, missing exclusions and pinned
   RSA interactions.

### Release 3 - governed actions (separate approval required)

1. Propose AI Max setting changes from XeroFlow.
2. Bind approval to an immutable before/after configuration.
3. Execute with idempotency, feature flags, read-back verification and audit history.
4. Never auto-enable, auto-disable or auto-remediate AI Max without an explicitly
   approved policy added in a later PRD.

## Non-Goals

- Replacing Google Ads as the detailed campaign editor.
- Automatically opting campaigns into or out of AI Max in Release 1 or Release 2.
- Assuming final URL expansion is enabled merely because AI Max is enabled.
- Treating Google optimization score as the agency's business objective.
- Generating ad copy, claims, offers or legal language.
- Automatically adding negative keywords, URL exclusions or text restrictions.
- Claiming an observed performance change was caused solely by AI Max.
- Supporting Meta, Microsoft Ads or Performance Max in the readiness classifier.
- Backfilling campaign state before the first successful observation.
- Sending client-facing notifications in the first release.

## Personas and Jobs to Be Done

### Media buyer

When Google changes campaign behavior, I want to see all affected campaigns with the
reason and effective settings so I can review the highest-risk accounts before the
deadline.

### Account manager

When a client's campaign is affected, I want a clear, non-technical explanation and
an accountable owner so I can coordinate a decision without opening Google Ads.

### Media lead / owner

When an agency-wide platform migration occurs, I want coverage, unresolved counts,
freshness and decision history so I can confirm no account was missed.

### Platform administrator

When Google API access fails or returns a new enum, I want the campaign classified as
unknown with diagnostics so the system never communicates a false all-clear.

## User Experience

### Placement

The primary entry point is the existing `/agency/social/spend` page:

- Add an **AI Max readiness** card to `SocialSpendControlRoom` when Google or All is
  selected.
- The card shows affected, needs-review, unknown and last-scanned counts.
- Selecting the card opens a dedicated `SpendAiMaxReadiness` review surface below the
  control room or navigates to `/agency/social/google/ai-max` if the campaign list is
  too dense for the spend page.
- Campaign history slideovers may show the current AI Max summary, but the portfolio
  surface is the canonical review queue.

The implementation should prefer a dedicated route once the table includes more than
the minimal Release 1 columns. The spend page remains the summary and launch point.

### Portfolio summary

Show:

- Total Search campaigns scanned
- Scheduled for automatic upgrade
- AI Max already enabled
- Needs human review
- Unknown/inaccessible
- Material changes since prior scan
- Scan coverage and freshness
- Countdown to 2026-09-01 before the deadline; after the deadline, replace it with
  “migration active” and preserve the original cutoff in campaign history

### Campaign table

Use `UTable` with server-side pagination for:

- Client
- Google account
- Campaign
- Campaign status
- Readiness state
- Migration reason: ACA, campaign broad match, both, none, unknown
- AI Max enabled
- Search-term matching: enabled, partially disabled, disabled, unknown
- Text customisation: enabled, disabled, unknown
- Final URL expansion: enabled, disabled, unknown
- Control-risk flags
- Last scanned
- Owner

Filters use `USelectMenu`/`USelect`; search uses `UInput`. No value may use an empty
string sentinel. The initial table must support status, connection, client, campaign
status, migration reason and stale/unknown filters.

### Campaign detail slideover

Use `USlideover` with:

1. Plain-language classification and deadline impact.
2. Current settings, each with raw Google evidence.
3. Ad-group search-term matching exceptions.
4. Risk flags and recommended manual review steps.
5. Material state-change timeline.
6. Deep link to the Google Ads campaign/settings page.
7. Phase 2 performance and generated-asset sections when available.

No editable fields are required in Release 1. A future write flow must invoke the
project's form-design requirements before implementation.

### Empty and degraded states

- No Google connections: explain how to connect an account.
- No Search campaigns: report successful scan with zero eligible campaigns.
- No successful scan: do not render zeros as healthy; show “Not scanned.”
- Partial account failures: show successful coverage and failed accounts together.
- Stale data: older than 26 hours is warning; older than 72 hours is critical.
- New/unrecognized enum: display the raw value and classify as unknown.

## Classification Contract

### Raw observation

```ts
export interface GoogleAiMaxObservation {
  apiVersion: 'v23'
  tenantId: string
  connectionId: string
  customerId: string
  campaignId: string
  campaignName: string
  campaignStatus: string
  advertisingChannelType: string
  keywordMatchType: string | null
  aiMaxEnabled: boolean | null
  bundlingRequired: string | null
  textAssetAutomationStatus: string | null
  finalUrlExpansionStatus: string | null
  adGroupCount: number
  searchTermMatchingDisabledAdGroupCount: number
  observedAt: string
}
```

Store raw enum values unchanged. Normalized booleans are nullable because omitted,
unsupported and inaccessible are not equivalent to `false`.

### Derived migration reason

```ts
export type AiMaxMigrationReason =
  | 'aca'
  | 'campaign_broad_match'
  | 'aca_and_campaign_broad_match'
  | 'none'
  | 'unknown'
```

Derivation:

- `hasAca = TEXT_ASSET_AUTOMATION status is OPTED_IN`
- `hasCampaignBroadMatch = campaign.keyword_match_type is BROAD`
- Both true -> `aca_and_campaign_broad_match`
- One true -> the matching reason
- Both conclusively false -> `none`
- Missing/unrecognized required evidence -> `unknown`

`bundling_required = REQUIRED` adds a `bundling_required` evidence flag and raises
review severity. It does not overwrite direct legacy-signal classification.

### Readiness status

```ts
export type AiMaxReadinessStatus =
  | 'ready'
  | 'scheduled_upgrade'
  | 'needs_review'
  | 'not_affected'
  | 'unknown'
```

- `unknown`: required evidence missing, API failure, unsupported values or stale >72h.
- `needs_review`: conflicting settings, bundling required, control-risk flag, partial
  ad-group disablement, or an affected campaign lacking a recorded decision.
- `scheduled_upgrade`: affected, AI Max not enabled, evidence complete, no higher-risk
  condition.
- `ready`: AI Max enabled and effective subfeatures are known, or an unaffected
  campaign has a recorded reviewed state.
- `not_affected`: complete evidence shows no legacy migration trigger and AI Max is
  not enabled.

Precedence is `unknown` > `needs_review` > `scheduled_upgrade` > `ready` /
`not_affected`.

### Effective subfeature status

Search-term matching is:

- `enabled` when AI Max is enabled and no eligible ad group disables it.
- `partially_disabled` when only some ad groups disable it.
- `disabled` when all eligible ad groups disable it or AI Max is conclusively off.
- `unknown` when campaign/ad-group evidence is incomplete.

Text customisation maps from `TEXT_ASSET_AUTOMATION`.

Final URL expansion maps independently from
`FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION`. The classifier must not infer it from
text customisation or AI Max enablement.

## Risk Rules

Release 1 deterministic flags:

| Flag | Severity | Trigger | Suggested action |
|---|---:|---|---|
| `AUTO_UPGRADE_PENDING` | warning | Affected and AI Max off before deadline | Review effective migration settings |
| `BUNDLING_REQUIRED` | warning | Google returns `REQUIRED` | Review bundled controls in Google Ads |
| `PARTIAL_SEARCH_MATCHING` | warning | Some ad groups disable matching | Confirm intentional exceptions |
| `UNKNOWN_CONFIGURATION` | critical | Required evidence missing/unrecognized | Retry scan or inspect account access |
| `STALE_SCAN` | warning/critical | >26h / >72h since success | Refresh connection and scan |
| `SMART_BIDDING_MISMATCH` | warning | AI Max feature with non-conversion bidding | Review bidding suitability |
| `FINAL_URL_EXPANSION_ENABLED` | info | Final URL expansion opted in | Review URLs and exclusions |
| `TEXT_CUSTOMISATION_ENABLED` | info | Text automation opted in | Review generated messaging controls |
| `ALL_AD_GROUPS_MATCHING_DISABLED` | warning | AI Max on but all groups disable matching | Confirm AI Max is intentionally asset-only |

Phase 2 adds pinned-RSA, unexpected landing-page, generated-asset and performance
regression flags. A risk rule is deterministic and explainable; LLM output may
summarize but may not create or suppress a risk state.

## Persistence Model

### Migration 288: current state and scan runs

Create `google_ai_max_scan_runs`:

- `id UUID PRIMARY KEY`
- `tenant_id TEXT NOT NULL`
- `status TEXT`: queued, running, completed, partial, failed
- `trigger TEXT`: manual, scheduled, post_sync
- `requested_by UUID NULL`
- `started_at`, `finished_at`
- `total_connections`, `processed_connections`
- `total_campaigns`, `affected_campaigns`, `unknown_campaigns`
- `failures JSONB`
- `api_version TEXT NOT NULL DEFAULT 'v23'`
- timestamps

Create `google_ai_max_campaign_state`:

- `id UUID PRIMARY KEY`
- `tenant_id TEXT NOT NULL`
- `connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE`
- `customer_id TEXT NOT NULL`
- `campaign_id TEXT NOT NULL`
- campaign identity/status fields
- raw AI Max, keyword-match and asset-automation fields
- ad-group aggregate counts
- derived migration reason, readiness status and risk flags
- `deep_link TEXT NULL`
- `first_observed_at`, `last_observed_at`, `last_changed_at`
- `last_scan_run_id UUID`
- `raw_evidence JSONB NOT NULL`
- timestamps
- unique `(tenant_id, connection_id, campaign_id)`

Create `google_ai_max_state_events` only for material changes:

- campaign-state foreign key
- scan-run foreign key
- event type: first_seen, classification_changed, setting_changed,
  became_unknown, recovered
- previous and current value JSONB
- observed timestamp

Tenant ID is explicit even though a connection currently lacks a canonical tenant
column. The scan obtains tenant context from `getSelectedTenant(event)` and every query
must include it. Do not infer tenancy from account name, Xero client mapping or the
latest user session.

### Migration 289: performance observations (Release 2)

Create `google_ai_max_performance_daily` keyed by tenant, connection, campaign, date
and match source. Store cost micros/major value, impressions, clicks, conversions and
conversion value. Preserve Google's raw match source.

Create baseline metadata on the campaign state or in a dedicated
`google_ai_max_baselines` table with:

- baseline window
- immutable metric totals
- configuration fingerprint
- captured timestamp
- exclusion/reliability notes

Daily performance rows are idempotently upserted. Baselines are immutable once the
campaign begins serving AI Max-attributed traffic, except through an explicit
owner/admin reset recorded as an event.

## Backend Architecture

### Scanner

Add `server/utils/googleAiMax.ts` containing:

- types and pure normalization
- classification and risk evaluation
- material-change diffing
- GAQL builders
- account scanning orchestration

Reuse:

- `gaqlQuery`
- `resolveGoogleWriteAuth`
- `resolveGoogleCredential`
- `persistGoogleCredentialRefresh`
- `resolveGoogleAdsRuntimeConfig`

Campaign GAQL selects campaign identity, channel, status, bidding strategy,
`keyword_match_type`, `ai_max_setting`, `asset_automation_settings` and optimization
score for Search campaigns. A second ad-group query returns
`ai_max_ad_group_setting.disable_search_term_matching` grouped in application code.

Do not add these fields directly to every monthly spend row in Release 1. AI Max state
is current configuration, while `media_spend` is period-based financial/performance
data. A dedicated current-state table prevents duplicated or contradictory settings
across periods.

### Scan execution

- Manual endpoint creates a run and uses `event.waitUntil`/existing background-job
  pattern where safe.
- Scheduled endpoint invokes the same scanner once daily.
- A database claim prevents overlapping tenant/connection scans.
- Account failures do not roll back successful accounts; the run becomes `partial`.
- Per-account calls honor current retry behavior for 429/500/503.
- Unknown is persisted for a previously known campaign only after the account attempt
  fails; existing evidence is retained in history.
- Removed/inaccessible campaigns are not deleted during a partial scan.

### API endpoints

#### `POST /api/agency/social/google/ai-max/scan`

Permission: `MEDIA_BUYING`  
Body: optional `{ connectionId?: string }`  
Response: `{ runId, status: 'queued' | 'running', deduplicated: boolean }`

Requires selected tenant. Validates an optional connection is active Google, belongs
to the scan scope and is accessible through its credential profile.

#### `GET /api/agency/social/google/ai-max/readiness`

Permission: `MEDIA_BUYING`  
Query: page, pageSize, status, connectionId, clientId, campaignStatus,
migrationReason, stale, changedSince, search  
Response:

```ts
interface AiMaxReadinessResponse {
  summary: {
    eligible: number
    affected: number
    enabled: number
    needsReview: number
    unknown: number
    changed: number
    lastCompletedScanAt: string | null
    coveragePercent: number | null
  }
  items: AiMaxCampaignListItem[]
  pagination: { page: number; pageSize: number; total: number }
  latestRun: AiMaxScanRunSummary | null
}
```

#### `GET /api/agency/social/google/ai-max/readiness/:id`

Permission: `MEDIA_BUYING`  
Returns the full evidence, ad-group exceptions, timeline, risks and deep link. The ID
is the XeroFlow campaign-state UUID, avoiding ambiguity between customers that may
have similarly shaped external IDs.

#### `GET /api/agency/social/google/ai-max/export.csv`

Permission: `MEDIA_BUYING`  
Uses the same filters and tenant scope as the list endpoint. Spreadsheet-safe escaping
must prevent CSV formula injection.

#### `POST /api/cron/google-ai-max-readiness`

Authenticated by the existing cron-secret pattern. Scans configured tenants without
depending on a browser session. Tenant enumeration must be explicit and auditable;
the job must not use a selected-tenant cookie.

### Caching

- Cache readiness list/summary for at most 60 seconds.
- Include tenant and all normalized filters in the key.
- Invalidate after a scan run finalizes.
- Never cache manual scan authorization decisions.
- The UI may poll the latest run every 4 seconds while running and stop on terminal
  state or after a 16-minute timeout, matching existing spend-sync behavior.

## Notifications

Release 1 notification policy:

- In-app notification for first detection of an affected campaign.
- In-app notification for a transition to unknown/critical.
- One daily digest while unresolved affected/unknown campaigns remain, not one message
  per scan.
- Optional Slack digest only if existing budget-alert Slack settings can be reused
  without coupling unrelated preferences; otherwise defer to a dedicated setting.
- No client portal or client email delivery.

Deduplication key includes tenant, campaign, event type and effective date. Quiet hours
and DND use existing notification utilities. Notification text must say whether it is
Google-observed fact, XeroFlow-derived classification or a suggested action.

## Release 2 Measurement

### Baseline

- Default pre-window: most recent 28 complete days before first AI Max-enabled
  observation.
- Compare to 7-, 14- and 30-day post windows.
- Use equal-day comparison when a full window is unavailable.
- Record changes to budget, bidding strategy, campaign status and material assets as
  confounders.
- Mark comparisons low-confidence when conversion volume is below a configurable
  deterministic threshold; do not use an LLM to set statistical confidence.

### Match-source reporting

Report Google raw sources separately, including:

- `ADVERTISER_PROVIDED_KEYWORD`
- `AI_MAX_BROAD_MATCH`
- `AI_MAX_KEYWORDLESS`
- other/new values as “Other (raw value)” until classified

Metrics include spend, impressions, clicks, conversions, conversion value, CTR, CPC,
CPA and ROAS. Division-by-zero produces null, not infinity or zero.

### Generated assets and landing pages

Retrieve automatically created assets using Google asset source and supported asset
views. Show provider IDs, type, status, association, performance and landing URL where
available. Release 2 remains read-only; “Review in Google Ads” is the only action.

## Security, Privacy and Reliability

- Enforce `requirePermission(event, 'MEDIA_BUYING')` server-side.
- Require selected tenant on interactive endpoints.
- Filter every state, event, run and export query by tenant.
- Never return OAuth tokens, credential profile secrets or raw provider error bodies
  containing request headers.
- Do not log tokens or authorization headers.
- Validate IDs and filters with Zod.
- Cap page size and CSV export size; stream or queue large exports.
- Escape CSV cells beginning with `=`, `+`, `-` or `@`.
- Treat Google deep links as constructed/allowlisted `https://ads.google.com` URLs.
- Fail closed on unsupported fields and enum values.
- Record API version and observation time.
- Avoid N+1 GAQL calls per campaign; scan per account with bounded concurrency.
- Preserve prior known evidence during provider outage while marking freshness/error
  separately.

## Observability

Structured events:

- `google_ai_max.scan.started`
- `google_ai_max.scan.completed`
- `google_ai_max.scan.partial`
- `google_ai_max.scan.failed`
- `google_ai_max.campaign.first_seen`
- `google_ai_max.campaign.material_change`
- `google_ai_max.notification.sent`
- `google_ai_max.notification.suppressed`

Metrics:

- scan duration and success rate
- accounts/campaigns processed
- API requests, retries, quota/rate-limit failures
- classification counts
- unknown/stale count
- notification deduplication count
- list endpoint latency and cache hit rate

No metric label may contain campaign names, customer names, tokens or unbounded raw
error text.

## Success Metrics

### Launch readiness

- 100% of accessible active/paused Search campaigns receive a non-stale classification
  or an explicit unknown reason.
- Zero campaigns are reported “ready” when required evidence is missing.
- At least 95% of active Google connections complete a scan within 24 hours.
- Every material setting change creates exactly one state event.
- Duplicate manual/scheduled scans do not overlap for the same tenant/account.
- Portfolio list p95 is under 1 second from persisted state.

### Operational outcome

- Before 2026-09-01, all affected campaigns have either AI Max enabled with known
  effective settings or an acknowledged manual-review decision.
- After launch, media buyers can identify AI Max-attributed spend and conversions
  without opening each Google account.
- No Release 1 or Release 2 workflow mutates provider state.

## Acceptance Criteria

1. A connected account containing ACA, broad-match, both, neither and AI-Max-enabled
   Search campaign fixtures produces the expected classifications.
2. Unknown/unsupported fields never resolve to false or not affected.
3. The portfolio summary reconciles exactly to the filtered campaign table.
4. Campaign detail displays raw evidence, derivation, timestamp and API version.
5. Partial scans preserve successful results and expose failed account coverage.
6. Tenant A cannot query, scan, export or receive notifications for Tenant B data.
7. Users without `MEDIA_BUYING` receive 403 from all interactive endpoints.
8. CSV output matches active filters and neutralizes spreadsheet formulas.
9. Scheduled and manual scans share the same classifier and persistence path.
10. UI supports loading, empty, partial, stale, failed and unknown states in light and
    dark modes using Nuxt UI v4 components.
11. Targeted unit/integration/component tests pass, then `pnpm typecheck` and
    `pnpm build` are run with pre-existing failures distinguished from regressions.
12. Marketing feature index/detail content is updated before the feature is considered
    complete.

## Testing Strategy

### Unit

- GAQL row normalization
- ACA/broad-match/both/none/unknown classification
- readiness precedence
- subfeature derivation
- risk rules
- material-change diffing
- CSV escaping
- metric calculations and zero denominators

### API/integration

- auth and `MEDIA_BUYING` permission
- selected-tenant requirement and cross-tenant isolation
- scan deduplication and partial completion
- credential refresh/MCC header resolution
- list filters/pagination/summary reconciliation
- campaign detail/event ordering
- export filter parity and injection safety
- cron authentication and explicit tenant enumeration

### Component

- summary counts and status tones
- filters use non-empty sentinels
- unknown/stale states
- polling lifecycle cleanup
- slideover evidence and deep link
- dark-mode semantic styles

### Live/manual

- One direct Google account and one MCC child account
- Known Search campaign with campaign-level broad match
- Known Search campaign with text asset automation
- AI Max-enabled campaign with mixed ad-group matching settings
- Account with no Search campaigns
- Expired/revoked credential
- Compare a sample of results against Google Ads UI

## Commands

```bash
# Development
pnpm dev

# Targeted tests (filenames finalized during implementation)
pnpm exec vitest run test/server/utils/googleAiMax.test.ts
pnpm exec vitest run test/server/api/googleAiMaxReadinessEndpoint.test.ts
pnpm exec vitest run test/app/googleAiMaxReadiness.test.ts

# Quality gates
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build

# Deployment safety
pnpm deploy:check
pnpm deploy:production
```

Any new migration must be applied automatically according to `AGENTS.md` after its SQL
has been reviewed and migration-specific tests pass.

## Project Structure

Likely new files:

```text
server/utils/googleAiMax.ts
server/api/agency/social/google/ai-max/scan.post.ts
server/api/agency/social/google/ai-max/readiness.get.ts
server/api/agency/social/google/ai-max/readiness/[id].get.ts
server/api/agency/social/google/ai-max/export.csv.get.ts
server/api/cron/google-ai-max-readiness.post.ts
server/database/migrations/288_google_ai_max_readiness.sql
server/database/migrations/289_google_ai_max_performance.sql
app/pages/agency/social/google/ai-max.vue
app/components/social/SpendAiMaxSummary.vue
app/components/social/SpendAiMaxReadinessTable.vue
app/components/social/SpendAiMaxCampaignSlideover.vue
app/utils/googleAiMax.ts
test/server/utils/googleAiMax.test.ts
test/server/api/googleAiMaxReadinessEndpoint.test.ts
test/app/googleAiMaxReadiness.test.ts
```

Existing files likely extended:

```text
server/utils/googleAdsClient.ts
server/utils/socialSpendCache.ts
app/components/social/SocialSpendControlRoom.vue
app/pages/agency/social/spend.vue
app/composables/useSocialConnections.ts
app/pages/features/index.vue
app/pages/features/[slug].vue
app/components/MarketingNav.vue (only if navigation taxonomy warrants it)
```

## Code Style

Use pure normalization/classification functions, nullable provider evidence and an
exhaustive display map:

```ts
export function classifyAiMaxReadiness(
  observation: GoogleAiMaxObservation,
): GoogleAiMaxClassification {
  if (!hasCompleteEvidence(observation)) {
    return { status: 'unknown', reason: 'incomplete_evidence', risks: ['UNKNOWN_CONFIGURATION'] }
  }

  const migrationReason = deriveMigrationReason(observation)
  return deriveReadiness(observation, migrationReason)
}
```

Server imports use `~~/server/utils/`. UI uses Nuxt UI v4 components and semantic
colors. Do not duplicate classification logic in Vue components.

## Boundaries

### Always

- Preserve raw Google values and timestamps.
- Fail closed on missing tenant, evidence or unsupported enum.
- Use existing Google credential/MCC resolution.
- Keep Release 1 and Release 2 provider-read-only.
- Test tenant isolation, classification and CSV safety.
- Apply migrations automatically when implementation reaches that task.
- Update marketing feature pages with the shipped capability.
- Run the project pre-commit deep-dive review before committing.

### Ask first

- Enabling any Google AI Max mutation.
- Adding a new Slack preference or external notification destination.
- Resetting a frozen performance baseline.
- Changing scan frequency below daily across all accounts.
- Adding a new dependency.

### Never

- Infer `false` from omitted Google fields.
- Treat optimization score as proof of performance.
- Auto-enable/disable AI Max.
- Expose credentials or unscoped tenant data.
- Delete historical state events to hide a regression.
- Claim causal lift without accounting for confounders.

## Rollout Plan

### Stage 0 - validation

- Confirm GAQL fields against one direct account and one MCC child.
- Capture representative raw payload fixtures with secrets removed.
- Confirm campaign deep-link construction.

### Stage 1 - internal read-only beta

- Deploy schema, scanner, endpoints and owner/admin-only UI.
- Run manual scans and compare with Google Ads UI.
- No notifications; log only.

### Stage 2 - media-team release

- Expand reads to `MEDIA_BUYING`.
- Enable daily scan and in-app digest.
- Add CSV export and operational ownership.

### Stage 3 - measurement

- Freeze baselines for eligible campaigns.
- Enable match-source and generated-asset reporting.
- Review 7/14/30-day interpretation with media leads.

### Rollback

- Disable scheduled scan trigger.
- Hide UI through a tenant-level read feature flag if required.
- Preserve additive tables and historical observations.
- No provider rollback is required because Releases 1-2 make no writes.

## Open Questions for Approval

1. Should Release 1 include paused Search campaigns, or active only? This PRD recommends
   active and paused because paused campaigns may resume after the migration.
2. Should account managers with `MEDIA_BUYING` see all clients or only assigned clients?
   This PRD follows the current spend-page access model; tighter client scoping should
   be specified before implementation if required.
3. Is an “acknowledged/manual decision” state required before 1 September, or is a
   filtered action list sufficient? This PRD recommends a lightweight acknowledgement
   in a follow-up slice, not the initial scanner.
4. Should daily notification digests reuse budget-alert Slack configuration or receive
   a distinct AI Max setting? This PRD defaults to in-app only until explicitly decided.
5. Should Release 2 use a 28-day default baseline for low-volume campaigns, or allow a
   tenant-configurable 56-day window?
6. Should governed AI Max writes be a separate PRD after read-only usage data is
   available? This PRD strongly recommends yes.

## Definition of Done

Release 1 is done only when:

- Every acceptance criterion is verified.
- Schema is applied and production-safe.
- A direct and MCC account have been compared against Google Ads UI.
- Daily scanning can be enabled/disabled without deployment code changes.
- Unknown/partial/stale states are visible and tested.
- No Google campaign mutation path exists in the released code.
- Marketing pages describe the feature accurately as read-only readiness governance.
- The modified-file deep-dive review, targeted tests, typecheck and production build
  have been completed and recorded in the implementation handoff.


# Google Ads MCP Control Plane

**Date:** 2026-08-31
**Status:** Approved design; implementation planning pending
**Product:** XeroFlow Agency Dashboard
**Owner:** Agency media operations

## Purpose

Extend XeroFlow's remote MCP server into a complete, governed Google Ads control
plane. Marketing users and authorized AI agents must be able to inspect, create,
update, optimize, pause, archive, and—after explicit approval—remove Google Ads
resources without receiving provider credentials or unrestricted mutation access.

The feature uses XeroFlow's existing Google OAuth/MCC connections, permissions,
proposal/confirmation flow, and audit boundaries. It does not install or proxy
Google's official MCP server. Google's current official MCP release remains useful
as a read-only reference implementation, but XeroFlow needs its own typed mutation
surface to enforce tenant, client, approval, budget, and automation policy.

## Approved Product Decisions

1. XeroFlow owns the MCP interface and calls the Google Ads API directly.
2. Upgrade the shared Google Ads REST integration from v23 to v25 before adding new
   mutation tools.
3. Do not expose a raw `mutate` or arbitrary HTTP tool.
4. Every capability has a typed Zod input contract and a known provider resource
   mapping.
5. Policy-limited automatic actions are allowed for reversible, pre-authorized
   optimizations such as adding negative keywords and pausing entities.
6. Creation, activation, budget/bid/conversion changes, targeting expansion, new
   creative, and permanent removal require human approval.
7. New campaigns and ad groups are created paused. Enabling is a separate action.
8. Delete defaults to pause or XeroFlow archive. Google's irreversible `REMOVED`
   operation is owner/admin-only and requires destructive confirmation.
9. Every provider write is validated first, idempotent, audited, and verified by a
   provider read-back.
10. The existing PMax launch state machine remains the orchestration authority for
    multi-resource PMax creation. The MCP layer calls it; it does not duplicate it.

## API Version Decision

The repository currently sends Google Ads requests to `/v23`. Google released v25
on 2026-07-22 and v25.1 on 2026-08-19. v23 remains available until February 2027,
but it is already deprecated. Building a new control plane on v23 would create an
immediate migration burden.

The implementation will:

- centralize `GOOGLE_ADS_API_VERSION = 'v25'` and the derived base URL;
- migrate every production Google Ads REST call and contract fixture to v25;
- update version-specific field documentation and compatibility comments;
- audit v25 breaking changes before changing requests or GAQL fields;
- add a repository guard that rejects newly hardcoded older Google Ads endpoints;
- keep minor-version behavior through Google's v25 endpoint, as Google minor
  releases are backward-compatible within the major version.

Authoritative references:

- <https://developers.google.com/google-ads/api/docs/release-notes>
- <https://developers.google.com/google-ads/api/docs/sunset-dates>
- <https://developers.google.com/google-ads/api/docs/upgrade>
- <https://developers.google.com/google-ads/api/rest/common/mutate>

## Architecture

```text
MCP client or XeroFlow UI
        |
        v
Typed XeroFlow Google Ads tool
        |
        v
MCP scope + user RBAC + tenant/client/connection authorization
        |
        v
Google Ads action planner
  - load provider state
  - normalize desired state
  - calculate field-level diff
  - validate policy and limits
  - assign risk and execution mode
        |
        +--------------------+
        |                    |
        v                    v
Automatic policy action   Pending human proposal
        |                    |
        +---------+----------+
                  v
Google Ads v25 validate-only request
                  |
                  v
Atomic claim / idempotency check
                  |
                  v
Typed Google Ads v25 gateway
                  |
                  v
GAQL/provider read-back and field-level verification
                  |
                  v
Append-only action events, result, drift, and recovery state
```

The MCP Worker remains a thin OAuth/protocol proxy. Provider credentials and tool
logic remain in the Pages application. An MCP grant identifies the XeroFlow user
and scopes; it never becomes a downstream Google token.

## Component Boundaries

### `server/utils/googleAds/api.ts`

Owns the v25 base URL, authenticated request construction, request IDs, retries,
quota handling, and sanitized provider errors. It accepts resolved server-side
credentials only.

### `server/utils/googleAds/query.ts`

Executes GAQL reads with bounded result sizes. It rejects unsafe free-form queries
at MCP boundaries; internal typed readers construct their own queries.

### `server/utils/googleAds/mutate.ts`

Executes typed resource-service or `GoogleAdsService.Mutate` requests. Supports:

- `validateOnly`;
- atomic batches by default;
- partial failure only for independent operations;
- temporary resource names for atomic dependency graphs;
- response resource names and provider request IDs;
- no implicit retry after an ambiguous provider timeout.

### `server/utils/googleAds/resources/*`

One focused adapter per provider domain:

- accounts and change history;
- campaigns, budgets, and bidding;
- ad groups and ads;
- keywords and negative sets;
- targeting and audiences;
- assets, asset groups, and listing groups;
- conversions and campaign goals;
- recommendations and optimization diagnostics.

Adapters translate XeroFlow contracts to Google v25 JSON and normalize provider
responses. They do not make authorization or automation decisions.

### `server/utils/googleAds/actionPlanner.ts`

Loads current state, validates the requested change, constructs the exact provider
operations, calculates before/after diffs, assigns risk, and produces an immutable
action plan. It never writes to Google.

### `server/utils/googleAds/policy.ts`

Resolves tenant, client, connection, account, campaign, tool, and argument policy.
It chooses one of:

- `read`;
- `automatic`;
- `confirm`;
- `rich_confirm`;
- `destructive_confirm`;
- `blocked`.

The policy decision is deterministic and recorded. Model reasoning cannot raise its
own authority or downgrade a risk tier.

### `server/utils/googleAds/actionStore.ts`

Persists immutable plans, idempotency claims, approval binding, execution attempts,
provider resource names, verification results, and append-only events. It works with
the existing `ai_pending_actions` proposal/confirmation mechanism rather than
replacing it.

### `server/utils/googleAds/actionExecutor.ts`

Claims an approved or automatic action, performs a fresh policy/staleness check,
runs provider validation, executes once, reads the result back, and records one of:

- `verified`;
- `partially_verified`;
- `provider_rejected`;
- `verification_failed`;
- `recovery_required`;
- `cancelled`.

### MCP tool projection

The existing registry remains the source for in-app and external tools. Google Ads
read tools are projected by role and `mcp:read`. Write tools require `mcp:write`, the
relevant media-buying permission, account policy, and an enabled feature group.

## Tool Catalog

Tool names below are domain action names. MCP confirmation tools use the existing
`propose_...` projection where human approval is required.

### Accounts, inspection, and QA

- `google_ads_list_accounts`
- `google_ads_get_account_snapshot`
- `google_ads_list_campaigns`
- `google_ads_get_campaign`
- `google_ads_get_change_history`
- `google_ads_get_policy_issues`
- `google_ads_get_performance`
- `google_ads_compare_campaign_to_brief`
- `google_ads_validate_action_plan`

Reads are capped, paginated, tenant-scoped, and permission-filtered. No MCP tool
accepts an arbitrary GAQL string.

### Campaigns, budgets, and bidding

- `google_ads_create_campaign`
- `google_ads_update_campaign`
- `google_ads_set_campaign_status`
- `google_ads_archive_campaign`
- `google_ads_remove_campaign`
- `google_ads_create_budget`
- `google_ads_update_budget`
- `google_ads_create_bidding_strategy`
- `google_ads_update_bidding_strategy`

Campaign creation uses campaign-family-specific schemas. Common schemas cover name,
status, dates, budget, bidding, network settings, URL options, tracking templates,
geo settings, and political-advertising declarations where required.

### Ad groups and ads

- `google_ads_list_ad_groups`
- `google_ads_create_ad_group`
- `google_ads_update_ad_group`
- `google_ads_set_ad_group_status`
- `google_ads_archive_ad_group`
- `google_ads_remove_ad_group`
- `google_ads_list_ads`
- `google_ads_create_ad`
- `google_ads_update_ad_status`
- `google_ads_archive_ad`
- `google_ads_remove_ad`

Ad creation uses typed variants for responsive search, responsive display, Demand
Gen, Video, App, Shopping-supported, and other provider-supported formats. Immutable
creative changes create a replacement ad and pause/archive the previous one.

### Keywords and search terms

- `google_ads_list_keywords`
- `google_ads_get_search_terms`
- `google_ads_get_keyword_ideas`
- `google_ads_get_keyword_forecast`
- `google_ads_add_keywords`
- `google_ads_update_keyword`
- `google_ads_set_keyword_status`
- `google_ads_remove_keyword`
- `google_ads_add_negative_keywords`
- `google_ads_remove_negative_keyword`
- `google_ads_manage_shared_negative_set`

Keyword operations validate match type, duplicate semantics, conflicts with negative
sets, limits, final URLs, and bidding compatibility.

### Targeting and audiences

- `google_ads_list_targeting`
- `google_ads_set_locations`
- `google_ads_set_location_match_mode`
- `google_ads_set_languages`
- `google_ads_set_ad_schedule`
- `google_ads_set_devices`
- `google_ads_set_demographics`
- `google_ads_set_placements`
- `google_ads_set_content_exclusions`
- `google_ads_set_audience_associations`
- `google_ads_manage_custom_audience`
- `google_ads_set_pmax_signals`
- `google_ads_set_search_themes`

Location tools preserve the explicit distinction between `PRESENCE` and
`PRESENCE_OR_INTEREST`. Replacing a criterion set computes a diff; it never clears
all targeting before the replacement set has validated.

### Assets and asset groups

- `google_ads_list_assets`
- `google_ads_create_asset`
- `google_ads_attach_asset`
- `google_ads_detach_asset`
- `google_ads_archive_asset_link`
- `google_ads_create_asset_group`
- `google_ads_update_asset_group`
- `google_ads_manage_asset_group_assets`
- `google_ads_manage_listing_groups`

Supported assets include text, images, logos, video references, sitelinks, callouts,
structured snippets, call assets, lead forms, prices, promotions, and campaign-family
specific assets supported by v25. The planner enforces provider minimums and ensures
detach operations do not leave an enabled campaign below required coverage.

### Conversions and goals

- `google_ads_list_conversion_actions`
- `google_ads_create_conversion_action`
- `google_ads_update_conversion_action`
- `google_ads_set_conversion_primary_state`
- `google_ads_set_campaign_conversion_goals`
- `google_ads_set_customer_goal_biddability`

Changing primary/secondary state or biddability is always `rich_confirm`. Offline
conversion uploads are intentionally outside this control-plane release because they
carry customer event data rather than campaign configuration.

### Optimization and recommendations

- `google_ads_list_recommendations`
- `google_ads_preview_recommendation`
- `google_ads_apply_recommendation`
- `google_ads_dismiss_recommendation`
- `google_ads_run_search_term_policy`
- `google_ads_run_pause_policy`
- `google_ads_get_drift`
- `google_ads_reverify_resource`

Optimization tools surface evidence, thresholds, data windows, expected effect, and
policy rationale. Optimization score is advisory and never an authorization signal.

## Campaign-Family Delivery

The shared control plane supports all resources, but campaign creation is delivered
through typed family adapters so platform-specific invariants remain reviewable:

1. Search campaign lifecycle.
2. Performance Max Standard and Inventory lifecycle, reusing the existing launch
   orchestration and budget contract.
3. Shopping campaign lifecycle.
4. Display campaign lifecycle.
5. Demand Gen campaign lifecycle.
6. Video campaign lifecycle.
7. App campaign lifecycle.

Existing campaigns from any family can receive common safe operations—read, pause,
archive, budget, dates, supported targeting, and policy diagnostics—once the shared
layer ships. Family-specific creation is enabled only after its adapter contract tests
pass.

## Risk and Approval Policy

| Tier | Default operations | Required controls |
|---|---|---|
| `read` | Inspection, QA, reporting, previews | `mcp:read`, role, tenant boundary |
| `automatic` | Approved negative keywords, guarded pauses, allowlisted recommendation dismissals, safe asset detachment | Explicit account opt-in, deterministic rules, caps, cooldown, audit |
| `confirm` | Creation, structural edits, positive keywords, targeting changes, asset publication/attachment | `mcp:write`, media permission, human confirmation |
| `rich_confirm` | Budgets, bidding, conversions, activation, bulk edits | Owner/admin or configured elevated role, before/after values, explicit acknowledgement |
| `destructive_confirm` | Provider `REMOVED`, destructive bulk actions | Owner/admin, typed resource confirmation, reason, no automation |
| `blocked` | Raw mutate, credentials, cross-tenant targets, unsupported campaign-family fields | No execution path |

Risk tiers are minimums. Tenant policy may raise a tier or disable a tool; it cannot
lower hard-coded money, activation, conversion, or destructive minimums.

## Policy-Limited Automatic Actions

Automatic execution is disabled by default per account and action class.

### Negative-keyword automation

An account may opt in with:

- allowed campaign IDs or labels;
- protected brand, OEM, model, location, and compliance terms;
- minimum impressions/clicks/spend and maximum conversions;
- allowed negative match types;
- maximum additions per run and per day;
- lookback window and cooldown;
- actor/service identity and notification recipients.

The action planner deduplicates existing negatives, detects positive-keyword conflicts,
rejects protected terms, and records the source search term and metrics. Automation
never removes a positive keyword or invents a negative from model output alone.

### Pause automation

An account may opt in by entity type and guardrail. A pause requires:

- a deterministic threshold evaluated over a configured minimum data window;
- fresh provider data;
- no active manual override or cooldown;
- a daily action cap;
- a recorded reason and snapshot;
- notification after execution.

Automatic policy never enables an entity. Re-enabling requires human confirmation.

### Recommendation and asset automation

Only explicitly allowlisted recommendation types may be dismissed automatically.
Applying a recommendation follows the risk of the underlying mutation. A disapproved
asset link may be detached automatically only when an approved replacement is active
and provider asset minimums remain satisfied.

### No self-modifying automation

Models may recommend policy changes but cannot edit active policy. Threshold, allowlist,
scope, and risk changes require an authorized human and are versioned.

## Mutation Semantics

### Planning and validation

Every write begins with an immutable action plan containing:

- tenant, client, connection, and Google customer identity;
- actor and MCP grant identity;
- resource type and operation;
- current provider state;
- exact desired state and update mask;
- normalized provider operations;
- before/after diff;
- risk tier and policy decision;
- request hash and idempotency key;
- expiry and staleness conditions.

Provider `validateOnly` runs before approval when possible and again immediately before
execution. A plan with new errors or a stale current-state fingerprint cannot execute.

### Atomicity and partial failure

Atomic execution is the default. Partial failure may be enabled only for independent
bulk operations such as adding unrelated negative keywords. Interdependent campaign,
budget, ad-group, ad, asset-group, or listing-group creation uses one atomic mutate
with temporary resource names when Google supports it, otherwise a resumable saga.

### Idempotency and ambiguous timeouts

XeroFlow atomically claims the action before provider execution. Provider resource
names are persisted immediately. After a timeout, the executor resolves provider state
before retrying; it never assumes failure and creates duplicates.

### Read-back verification

A successful mutate response is not completion. Each operation has a typed read-back
contract. Material fields are compared against the approved plan and stored as
field-level diffs. Blocking drift produces `verification_failed` or
`recovery_required`, even when Google returned success.

## Pause, Archive, and Remove

- **Pause:** set supported entity status to `PAUSED`; reversible and potentially
  automatic when policy permits.
- **Archive:** pause where supported and hide the resource from default XeroFlow views;
  preserve provider identity and history.
- **Remove:** issue Google's `remove` mutation, producing `REMOVED`; irreversible at
  the provider and never automatic.

The ordinary "delete" UI/MCP language maps to archive. Permanent removal tools must
say "permanently remove," show affected resources and dependencies, require owner/admin
confirmation, and record a reason.

## Persistence

Add domain-specific records rather than overloading spend rows:

### `google_ads_action_plans`

- immutable action identity and idempotency key;
- tenant/client/connection/customer bindings;
- actor, source, tool, resource, operation, and risk;
- current/desired state fingerprints and safe JSON diffs;
- provider operations without credentials;
- policy version and decision;
- proposal/approval binding;
- lifecycle status and expiry;
- sanitized provider request/result metadata;
- verification summary.

### `google_ads_action_events`

Append-only transitions, attempts, policy decisions, validation outcomes, provider
request IDs, errors, verification diffs, and recovery notes.

### `google_ads_automation_policies`

Versioned, tenant/client/connection/account-scoped policy with action class, enabled
state, thresholds, allowlists, protected terms, caps, cooldowns, notification settings,
approver, and effective dates.

The existing `ai_pending_actions` row references an action plan for human confirmation.
Existing PMax `campaign_launches` records remain the authoritative multi-step launch
state and link to their originating action plan.

## Authorization and Tenant Isolation

- Derive tenant and user from the authenticated XeroFlow/MCP grant.
- Resolve client and Google customer from XeroFlow-owned connection records.
- Never trust a supplied customer ID or resource name without verifying it belongs to
  the selected tenant connection.
- Require `MEDIA_BUYING` for Google campaign control.
- Restrict destructive operations and initial activation/budget/conversion rollout to
  owner/admin.
- Require `mcp:write` for any write-class MCP call.
- Keep provider credentials server-side and encrypted under existing storage patterns.
- Do not return OAuth tokens, developer tokens, raw provider payloads, or unrestricted
  customer lists.

## Feature Flags and Kill Switches

All write groups default false:

- `GOOGLE_ADS_MCP_READ_ENABLED`
- `GOOGLE_ADS_MCP_WRITE_ENABLED`
- `GOOGLE_ADS_MCP_AUTOMATION_ENABLED`
- `GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED`
- campaign-family creation flags;
- per-tenant and per-account policy flags.

The global write kill switch prevents new claims without deleting plans, events, or
recovery evidence. Read and verification tools remain available during a write freeze.

## Error Model

Normalize Google failures into a safe structure:

```ts
interface GoogleAdsActionError {
  code: string
  category: 'auth' | 'permission' | 'validation' | 'policy' | 'quota' | 'conflict' | 'provider' | 'unknown'
  retryable: boolean
  operationIndex?: number
  fieldPath?: string
  requestId?: string
  safeMessage: string
}
```

Do not expose raw Google errors or request bodies to MCP clients. Preserve sanitized
error codes and request IDs for operators. Retry quota and transient failures with
bounded exponential backoff. Never retry validation, permission, policy, or ambiguous
write failures without resolving provider state.

## Observability and Audit

Record metrics and structured events for:

- tool discovery and denied projection;
- action plans by operation and risk;
- automatic, proposed, confirmed, rejected, expired, and blocked decisions;
- validate-only latency and failure codes;
- execution latency, provider request IDs, and retry count;
- verification pass/fail and diff fields;
- automation cap/cooldown/protected-term blocks;
- permanent removal attempts;
- account drift and recovery duration;
- Google API version usage.

Audit logs include actor, tenant, client, connection, customer, resource, operation,
reason, policy version, approval, before/after diff, and final verification. They omit
tokens and unnecessary creative/customer data.

## Testing Strategy

### Pure unit tests

- Zod schemas and resource-name validation;
- policy risk floors and tenant overrides;
- protected-term and automation threshold logic;
- idempotency and staleness fingerprints;
- update masks and before/after diffs;
- pause/archive/remove semantics;
- Google error normalization and retry classification.

### Provider contract tests

Mock HTTP at the Google boundary and assert:

- all endpoints use `/v25`;
- auth, developer-token, and login-customer-id headers;
- v25 JSON field names and update masks;
- `validateOnly` before execution;
- atomic versus partial-failure behavior;
- temporary resource ordering;
- resource names and request IDs captured;
- no live Google mutation occurs in tests.

### Planner/executor tests

- writes-disabled and tenant-denied paths make zero provider calls;
- automatic action only executes under an active matching policy;
- cap, cooldown, protected term, stale data, and manual override block automation;
- confirmation is bound to the exact immutable plan;
- concurrent execution produces one provider writer;
- timeout recovery creates no duplicate;
- provider success plus read-back drift is not reported as success;
- archive pauses and hides; permanent remove requires destructive approval.

### MCP boundary tests

- role and scope projection;
- input validation;
- no arbitrary GAQL or mutate tools;
- automatic results disclose that execution occurred;
- proposal results never claim execution;
- confirmation cannot cross user, tenant, proposal, or expiry boundaries;
- audit records contain keys/metadata without credentials.

### Campaign-family acceptance tests

Each family has fixtures for a minimal valid paused campaign, critical provider
invariants, read-back, retry, archive, and unsupported-field rejection. Search and PMax
fixtures include Australian dealership location, keyword, asset, and conversion cases.

### Baseline handling

At design time the isolated branch baseline had 6,428 passing tests and 41 unrelated
failures across 18 test files. Implementation uses a focused Google Ads/MCP baseline and
must introduce zero new focused failures. The full suite is rerun after integration with
the concurrently active session, with baseline differences reported explicitly.

## Delivery Slices

1. **v25 migration:** central version module, endpoint replacements, GAQL/field audit,
   and version guard tests.
2. **Control-plane foundation:** typed API/query/mutate primitives, errors, action plans,
   policy, persistence, audit, and executor.
3. **Read and QA catalog:** accounts, snapshots, resource reads, change history, policy
   issues, brief comparison, and validation previews.
4. **Search lifecycle:** budgets, campaigns, ad groups, RSA, keywords, negatives,
   targeting, assets, conversions, verification, archive/remove.
5. **PMax lifecycle:** connect MCP tools to the existing approved launch workflow and
   finish Standard/Inventory mutation adapters without duplicating state.
6. **Remaining campaign families:** Shopping, Display, Demand Gen, Video, and App typed
   creation adapters.
7. **Optimization automation:** negative-keyword, pause, recommendation, drift, caps,
   cooldowns, notifications, and kill switches.
8. **Public/operator surfaces:** MCP tool documentation, runbooks, relevant marketing
   feature pages, and staged rollout instructions.
9. **Verification:** focused and full tests, typecheck/build where practical, security
   review, provider test-account smoke test, and release checklist.

Every slice is independently testable and feature-flagged. No incomplete family adapter
is exposed in the production MCP manifest.

## Concurrent-Session Integration Boundary

This work is developed on `feature/google-ads-mcp-control` in an isolated worktree.
The other active session owns the main worktree's uncommitted PMax, marketing, config,
and unrelated changes.

Rules:

- do not copy, revert, stage, or clean the other session's uncommitted files;
- prefer new focused modules and tests;
- before editing a shared file, inspect the main worktree and record overlap;
- integrate through reviewed commits after the other session's changes are committed;
- resolve PMax and marketing overlap deliberately rather than overwriting either side;
- rerun targeted tests after every integration commit.

## Marketing and Documentation Sync

When the implemented capability is genuinely available, update:

- `app/pages/features/index.vue`;
- `app/pages/features/[slug].vue`;
- `app/components/MarketingNav.vue` where applicable;
- MCP operator documentation and connection instructions;
- Google Ads automation policy and emergency-disable runbooks.

Marketing copy must distinguish available, feature-flagged, and planned campaign-family
support. It must not claim arbitrary autonomous control or Google's endorsement.

## Non-Goals

- Exposing provider credentials or raw database access.
- Exposing arbitrary GAQL or raw Google mutate calls to external MCP clients.
- Automatic campaign creation, enabling, budget/bid/conversion changes, targeting
  expansion, creative publication, or permanent removal.
- Automatically changing active automation policy.
- Fabricating ads, claims, offers, budgets, targeting, or conversion goals without an
  approved source.
- Uploading offline conversions or customer lists in this campaign-control release.
- Treating Google recommendations or optimization score as mandatory.
- Automatically deleting provider resources as rollback.

## Success Criteria

1. XeroFlow uses Google Ads API v25 for every production Ads API request.
2. Authorized MCP users can inspect the full account configuration without arbitrary
   provider query access.
3. Typed tools cover campaigns, budgets, ad groups, ads, keywords, negatives, targeting,
   audiences, assets, PMax resources, conversions, and recommendations.
4. Campaign-family creation always begins paused and is verified before activation.
5. Every write is tenant-bound, permissioned, feature-flagged, idempotent, validated,
   audited, and read back.
6. Policy-limited negative-keyword and pause automation cannot exceed its configured
   allowlist, threshold, cap, cooldown, or protected-term boundary.
7. Money, activation, conversion, structural, and destructive risk floors cannot be
   lowered by tenant policy or model reasoning.
8. Ordinary deletion archives or pauses. Permanent removal is owner/admin-only and
   never automatic.
9. Concurrent calls and ambiguous timeouts create no duplicate provider resources.
10. MCP results accurately distinguish preview, proposal, execution, verification,
    partial failure, and recovery-required states.
11. No credentials, raw provider errors, or cross-tenant resources appear in tool
    manifests, results, logs, or audit records.
12. Focused Google Ads/MCP tests are green and the full-suite baseline introduces no
    new failures after integration.

## Rollout

1. Deploy read/QA tools only against test and internal accounts.
2. Enable proposal-only writes for owner/admin on one Google test account.
3. Exercise Search creation paused, verification, enable approval, archive, and recovery.
4. Enable PMax creation only after the existing launch workflow is integrated and its
   budget/read-back tests pass.
5. Opt one internal account into negative-keyword automation with conservative caps.
6. Opt into pause automation separately after notification and recovery behavior is
   verified.
7. Add remaining campaign families one feature-flagged adapter at a time.
8. Keep destructive provider removal disabled until test-account removal and audit
   drills pass.

Rollback is a write kill switch plus account-policy disablement. Existing plans and
audit evidence remain readable. Provider rollback uses pause or compensating safe
operations; it never automatically removes a campaign.

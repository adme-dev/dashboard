# Design — Platform delivery diagnostics over MCP

**Date:** 2026-08-24 · **Status:** design (awaiting review) · **Owner:** agent build

**Source brief:** `xeroflow-diagnostics-brief-23-aug.md` (D-1 through D-6)

**Implementation base:** `fix/adspend-followups` at `ff5c2ec1`

## 1. Outcome

XeroFlow's read-only ad-spend tools will explain *why* campaigns under-deliver instead of asking the daily-check
consumer to infer causes from pacing. Google Ads and Meta diagnostics will be collected alongside the existing
ad-spend/creative reads, persisted with field-family freshness, and projected through the current in-app and MCP
read surfaces.

The delivered capabilities are:

- per-ad approval and policy issues for Google and Meta (D-1);
- campaign serving limitations for Google and ad-set learning state for Meta (D-2);
- Google Search impression share and budget/rank loss (D-3);
- top Google search terms by cost with honest PMax coverage (D-4);
- Meta ad-set frequency and CPM (D-5);
- reliable Google creative-text population, retaining the scheduled and read-through repair already implemented by
  the base branch (D-6 / BF-4).

This is a read-only round. It adds no platform mutation, proposal, approval, or auto-apply path. It does not change
the platform-scoped halt model. A failed Meta diagnostic collection must not suppress Google reads, and vice versa.

## 2. Design choices

### 2.1 Extend the existing sync and projections

Diagnostics belong to the same campaign, ad, and date-range entities already used by `media_spend`,
`ad_performance_snapshots`, `get_campaign_breakdown`, and `get_ad_breakdown`. Typed columns and one normalized
search-term snapshot table keep the fields queryable and auditable. A single provider-response JSON blob is rejected:
it would make null/unsupported semantics and provider drift difficult to test. Live-only reads are also rejected:
they would make MCP latency and provider outages part of every daily-check call and would lose historical evidence.

### 2.2 Separate provider calls by failure domain

Provider metadata and performance calls are merged by stable provider IDs, but they remain separate upstream calls:

- Google ad policy metadata is queried independently from dated ad performance.
- Google campaign serving metadata is queried independently from impression-share metrics.
- Meta ad status/issues, ad-set learning metadata, and insights are separate Graph requests.

This prevents one unsupported or permission-gated diagnostic field from erasing otherwise valid spend metrics. Every
family records its own collection result and timestamp.

### 2.3 Stable codes plus exact provider evidence

Google Ads v23 reports current provider codes such as `BUDGET_CONSTRAINED`; the diagnostic brief uses durable
consumer language such as `LIMITED_BY_BUDGET`. XeroFlow therefore exposes both:

- `servingStatusReasons`: normalized codes used by the daily-check contract;
- `providerServingStatusReasons`: exact provider values for diagnosis and forward compatibility.

Known mappings include `BUDGET_CONSTRAINED → LIMITED_BY_BUDGET`,
`BIDDING_STRATEGY_CONSTRAINED → BIDDING_LIMITED`, `BIDDING_STRATEGY_LEARNING → LEARNING`,
`AD_GROUPS_PAUSED`/`AD_GROUP_ADS_PAUSED → AD_GROUP_PAUSED`, and
`SEARCH_VOLUME_LIMITED → LOW_SEARCH_VOLUME`. Unrecognized codes remain visible in the provider array and project as
`OTHER_PROVIDER_REASON` in the normalized array; they are never silently discarded.

Approval and learning responses follow the same rule: a normalized field supports stable consumers and a provider
field preserves exact platform state where the two differ.

## 3. Storage contract

Migration `398_ad_delivery_diagnostics.sql` is additive and idempotent.

### 3.1 `ad_performance_snapshots`

Add nullable diagnostic fields:

- `ad_set_id`, `ad_set_name` — Meta ad-set identity attached to ad rows;
- `approval_status`, `provider_approval_status`, `approval_review_status`;
- `policy_issues JSONB` — compact normalized issues, never the raw provider payload;
- `approval_synced_at`, `approval_unavailable_reason`;
- `learning_stage`, `provider_learning_stage`;
- `learning_stage_synced_at`, `learning_stage_unavailable_reason`.

`policy_issues` is an array of `{ code, topic, summary, message, type, level }`. Missing provider members are `null`;
free text is capped before storage. Google values come from `ad_group_ad.policy_summary`. Meta values come from ad
`effective_status` and `issues_info`. An empty array means a successful collection returned no issue; a failed or
unsupported collection is distinguished by the family status/reason, never by substituting an empty array.

Existing ad metrics continue to supply row-level frequency. For Meta, ad-set frequency and CPM are collected and
merged onto every ad row in that ad set so the current `get_ad_breakdown` row contract remains useful without a
second tool. CPM may be recomputed only when spend and impressions are present; otherwise the provider metric is
preserved. Its metric timestamp remains distinct from policy/learning timestamps.

### 3.2 `media_spend`

Add nullable campaign diagnostic fields:

- `serving_status`;
- `serving_status_reasons TEXT[]`;
- `provider_serving_status_reasons TEXT[]`;
- `serving_status_synced_at`, `serving_status_unavailable_reason`;
- `impression_share_synced_at`, `impression_share_unavailable_reason`.

The existing `impression_share`, `lost_impression_share_budget`, and `lost_impression_share_rank` values remain the
numeric source of truth. The new clock and reason distinguish collected zero-like values from unsupported, stale, or
failed collection. Meta campaign status may populate serving status, but ad-set learning remains on ad rows because
that is the actionable platform level.

### 3.3 `campaign_search_term_snapshots`

Create a typed table keyed to `media_spend` with:

- campaign/range identity: `media_spend_id`, `range_start`, `range_end`;
- term evidence: `search_term`, `match_type`, `targeting_status`;
- metrics: `impressions`, `clicks`, `cost`;
- collection contract: `coverage`, `synced_at`, `unavailable_reason`.

The unique key covers campaign, date range, term, and match type; useful campaign/range/cost indexes support the
daily-check read pattern. Refresh replaces one campaign/range snapshot transactionally, so a partial provider page
cannot masquerade as a complete result.

The migration is applied automatically to the configured Neon database after local verification, per repository
policy.

## 4. Provider collection

### 4.1 Google Ads

- Ad policy query: `ad_group_ad.ad.id`, ad status, policy approval/review status, and policy topic entries. It is
  paginated by the Google Ads client without a small SQL-style `LIMIT`.
- Campaign delivery query: campaign primary status and primary-status reasons.
- Impression-share query: search impression share, search budget-lost impression share, and search rank-lost
  impression share at campaign level. Provider privacy thresholds/capped estimates are accepted as returned.
- Search-term query: `campaign_search_term_view` for the requested campaign and date window, returning term,
  match type, targeting status, impressions, clicks, and cost micros. Results are sorted by cost descending and
  retrieved through provider pagination; the MCP response applies its own declared cap and cursor.

Search-term coverage is `full` for supported Search campaigns, `limited` for Performance Max responses,
`unsupported` where the resource cannot provide terms, and `unavailable` when collection failed. PMax rows are never
presented as parity with Search. No synthetic terms are generated.

### 4.2 Meta

- Ad metadata supplies `effective_status` and `issues_info`.
- Ad-set metadata supplies effective delivery status and `learning_stage_info.status`.
- Ad-set insights supply spend, impressions, frequency, and CPM for the requested window.

Ad-set diagnostics are joined to ads by provider ad-set ID. If an ad has performance but the metadata join fails, its
metrics remain present and only the affected diagnostic family becomes `unavailable` with a reason.

### 4.3 Cadence and read-through

No new cron is introduced. Campaign/ad diagnostics piggyback on the existing daily ad-spend and creative sync flow.
The focused daily-check reads 5–15 flagged campaigns, so read tools retain a bounded read-through refresh when the
requested family is missing or older than 24 hours. Search terms are populated only by this campaign-scoped
read-through path rather than scanning the whole book daily.

Read-through failures return cached data when available, clearly marked stale with the attempted refresh result.
They do not delete prior valid evidence.

## 5. Read-tool contracts

### 5.1 `get_ad_breakdown`

Each row gains:

```text
approvalStatus
providerApprovalStatus
approvalReviewStatus
policyIssues[]
approvalAsOf
approvalDataStatus: fresh | stale | unavailable | unsupported
approvalUnavailableReason
adSetId
adSetName
learningStage
providerLearningStage
learningStageAsOf
learningStageDataStatus: fresh | stale | unavailable | unsupported
learningStageUnavailableReason
frequency
cpm
metricsAsOf
```

Fields remain absent/null when a platform or campaign type does not supply them; `dataStatus` and reason explain why.
The response declares row caps and whether more rows exist. Policy messages and ad-set names are treated as
untrusted platform text and remain under the registry's untrusted-content safeguards.

### 5.2 `get_campaign_breakdown`

Each campaign row gains:

```text
servingStatus
servingStatusReasons[]
providerServingStatusReasons[]
servingStatusAsOf
servingStatusDataStatus: fresh | stale | unavailable | unsupported
servingStatusUnavailableReason
impressionShare: { share, lostBudget, lostRank, asOf } | absent
impressionShareDataStatus: fresh | stale | unavailable | unsupported
impressionShareUnavailableReason
```

The impression-share block is absent for unsupported campaign types, not zero-filled. Values are rendered as ratios
on `[0,1]`; acceptance checks allow provider threshold/capping behavior instead of requiring mathematical equality.

### 5.3 `get_search_terms`

A new read-only tool is warranted because search terms are campaign-scoped rows, not ad creative rows.

- Permission and scope: `MEDIA_BUYING`, same client resolver and organization scope as the ad-spend tools.
- Inputs: client name, campaign name or provider campaign ID, start/end dates, sort (`cost` default or `clicks`),
  cursor, limit (default 20, maximum 50), and optional refresh.
- Output: resolved client/campaign/platform/window, coverage, coverage reason, `asOf`, refresh status, terms
  `{ searchTerm, matchType, targetingStatus, impressions, clicks, cost, cpc }`, `more`, and next cursor.
- Safety: `mutates` is false/omitted; `returnsUntrusted` is true because search terms originate with end users.

Non-Google campaigns return `unsupported` rather than an empty healthy result. Provider errors are isolated to
Google and do not activate a Meta halt.

### 5.4 `get_ad_creative_text`

The base branch already provides both scheduled `campaign_creatives` population and a Google campaign-scoped
read-through repair. This round preserves that design and adds live acceptance evidence rather than duplicating the
pipeline. Empty Google creative results must report whether sync was attempted, whether it succeeded, and the
provider/storage reason if rows remain empty.

## 6. Freshness, failure, and halt semantics

Every family follows this invariant:

```text
data value + its own asOf + dataStatus + unavailableReason
```

`asOf` means the time that family was successfully collected, not the time the MCP response was rendered. A failed
refresh must not advance it. `fresh` means at most 24 hours old; `stale` means older cached evidence; `unsupported`
means the provider/campaign type has no comparable field; `unavailable` means collection was expected but failed or
has never succeeded.

Provider payloads and operational errors are sanitized before projection. No provider token, account secret, raw
request, stack trace, or full upstream response is stored or returned. Existing platform-scoped circuit breakers
remain authoritative: only the failing provider family is halted.

## 7. Test and acceptance plan

Implementation is test-driven and covers:

1. pure Google and Meta normalizers, including unknown provider codes and capped text;
2. provider client queries/requests and pagination without a silent small-result cap;
3. storage upserts, transactional search-term replacement, and separate family clocks;
4. partial failure: metrics survive policy/learning failure and one platform survives the other;
5. read projections for fresh, stale, unsupported, and unavailable states;
6. impression-share absence for unsupported types and sensible ratios for Search;
7. PMax search-term coverage marked `limited` and cursor/cap behavior;
8. Meta ad-set frequency/CPM merged onto every matching ad row;
9. tool registry projection, `MEDIA_BUYING` RBAC, read-only status, untrusted marking, and MCP schema exposure;
10. D-6 scheduled and read-through creative population regressions.

Focused Vitest suites, typecheck for changed code, migration verification, and the repository build run before
completion. The repository-wide baseline currently has unrelated failures; completion evidence will distinguish
pre-existing failures from changed-scope results rather than claiming a false green run.

The feature is not complete until an authenticated connected session performs real MCP-transport calls and state is
re-read afterward:

- disapproved and approved ad examples show honest policy state;
- a constrained Google campaign and learning-limited Meta ad set expose provider evidence;
- a Search campaign returns impression share and top terms;
- PMax coverage is labeled limited;
- Meta frequency/CPM are non-null where impressions exist;
- a Google campaign with creatives returns headlines/descriptions;
- cached database rows are re-read to verify persisted state, not merely trusted from the tool response.

If live accounts do not contain a particular adverse state, the transport check verifies real healthy/available
rows and the adverse-state contract is proven with provider-shaped fixtures; the final report names that limitation.

## 8. Documentation and public surface

Update the MCP capability guide and tool inventory for the new fields/tool. Because platform diagnostics materially
expand XeroFlow's ad-performance analysis, update the existing advertising/analytics entries in
`app/pages/features/index.vue` and `app/pages/features/[slug].vue`. The marketing mega-menu changes only if no current
advertising category link covers the feature; no new top-level navigation category is created for diagnostics.

## 9. Rollout and rollback

Rollout uses the repository's guarded Cloudflare Pages deployment path only after `pnpm deploy:check` passes. The
schema changes are additive and nullable. No new environment variable or cron trigger is required.

Operational rollback can disable the diagnostic read-through calls while leaving stored columns/table in place;
the prior MCP projections continue to work because all fields are additive. A provider-specific failure never
requires disabling the other provider. Database rollback is not required because old code ignores the new schema.

## 10. Explicit non-goals

- changing campaign, ad-set, ad, budget, bid, keyword, negative-keyword, or creative state;
- automatic remediation based on diagnostic output;
- inventing Meta/Search parity where provider data differs;
- whole-book daily search-term scans or a new cron;
- historical backfill beyond requested/read-through windows;
- presenting missing diagnostics as healthy defaults.

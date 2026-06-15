# Google Recommendations passthrough (v1) — design

**Date:** 2026-06-16
**Branch:** `feat/google-recommendations`
**Builds on:** spend-sync + Google read auth (`resolveGoogleWriteAuth`, `gaqlQuery`), the guard-railed budget-write execute path, and the plan→approve→apply action log.
**Research basis:** `docs/research/2026-06-16-ai-campaign-tooling.md` (roadmap #2, folding in #4).

## Problem / goal
Google Ads already computes high-quality optimization recommendations (budget, target-CPA/ROAS, keywords, PMax ad-strength, tag coverage) and exposes them via `RecommendationService`. Rather than re-deriving optimization logic, **surface Google's own recommendations inside our spend UI and let an admin apply the safe ones through our existing guard-railed approve→apply→audit chain.** This is high value, low effort, low risk — Google does the analysis; we wrap it in our safety + accountability layer.

## Decisions (confirmed)
- **Budget recommendations apply through OUR guard-railed write**, not Google's `ApplyRecommendation`: we extract Google's recommended daily budget and feed it into the existing plan→approve→`execute.post.ts` chain (±20% clamp, max-multiple, monthly-margin, per-platform min, read-back, audit). Our guardrails always win.
- **v1 surfaces ALL recommendation types** (+ optimization score) but **applies only the safe subset**: budget recs (via our guardrails). All other types render with impact + a **"Review in Google Ads" deep-link**.
- **Tracking-health (#4):** `IMPROVE_GOOGLE_TAG_COVERAGE` + low optimization score are surfaced as a read-only "tracking health" signal alongside our existing zero-conversion detector. No auto-apply.
- **The native-recommendations passthrough is Google-only by necessity** (see "Network coverage" below — Meta has no API equivalent). **Reads are unflagged** (read-only is safe); **applying a budget rec still requires the existing `liveBudgetChangesEnabled + googleBudgetWritesEnabled` flags.**
- **Deferred (out of scope for v1):** `RecommendationSubscriptionService` autopilot, a scheduled recommendations sync table, native `ApplyRecommendation` for non-budget types, a Meta-native-recommendations surface (blocked — see below).

## Network coverage (Meta + Google)

This was reviewed explicitly. The two networks are covered by **two complementary surfaces**, not one:

| Surface | Meta | Google | Notes |
|---|---|---|---|
| **Pacing recommendations** (our deterministic detectors + "Analyze with AI") | ✅ | ✅ | Already shipped; both networks. Feeds the guard-railed write. |
| **Guard-railed budget write** (apply) | ✅ (CBO/ABO + split) | ✅ | Already shipped; both networks. |
| **Native platform optimization recommendations** (this feature) | ❌ no API | ✅ `RecommendationService` | Google-only |

**Why Google-only for native recs:** Verified against the Meta Marketing API — it exposes campaign lifecycle, Insights, and the Conversions API, but **no list-and-apply recommendations service** comparable to Google's `RecommendationService`. Meta's "recommendations"/Opportunity Score are surfaced in Ads Manager UI only, not programmatically queryable/applyable. (Meta reads are also dev-tier-blocked from our prod egress until the app-tier upgrade — a second blocker.)

**So Meta is NOT left out:** it is fully covered by the existing cross-network **pacing-review + AI-analysis recommend** surface and the **guard-railed write** (both Meta + Google). This feature *adds* the Google-specific richness Google exposes that our pacing engine doesn't compute (keyword, tCPA/tROAS, PMax ad-strength, tag-coverage). A **Meta-native-recommendations surface is deferred** and gated on (a) Meta exposing such an API and (b) the Meta app-tier upgrade.

**UI labeling (avoid concept blur):** the spend page already shows a "Recommendations" count for *our pacing* items. To prevent confusion between the two notions, this feature's panel is titled **"Google optimization recommendations"** (explicitly Google + "optimization", Google's own term), kept visually distinct from the pacing-review strip. Code is namespaced `googleRecommendations` / `SpendGoogleRecommendations` to avoid collision with the unrelated **Financial Advisor `recommendations` table** (migration 068).

## Architecture

### 1. Fetch + normalize — `server/utils/googleRecommendations.ts` (new)
`fetchGoogleRecommendations(customerId, token, developerToken, loginCustomerId)`:
- Runs a GAQL query on the `recommendation` resource via the existing `gaqlQuery`:
  ```
  SELECT recommendation.type,
         recommendation.campaign,
         recommendation.campaign_budget_recommendation.current_budget_amount_micros,
         recommendation.campaign_budget_recommendation.recommended_budget_amount_micros,
         recommendation.impact.base_metrics.impressions,
         recommendation.impact.potential_metrics.impressions,
         recommendation.resource_name
  FROM recommendation
  ```
- Separately fetches optimization score + deep-link: `SELECT customer.optimization_score, metrics.optimization_score_url FROM customer`.
- Auth: the caller resolves `{ accessToken, loginCustomerId }` via the existing `resolveGoogleWriteAuth` (token refresh + MCC + 403-without-manager fallback). Same proven read path as spend-sync.

**Pure normalizer** `normalizeRecommendations(rows, optScore, scoreUrl)` (same file, no I/O):
- Maps each row to:
  ```ts
  interface NormalizedRecommendation {
    type: string                      // raw Google type, e.g. 'CAMPAIGN_BUDGET'
    campaignId: string | null         // from recommendation.campaign resource name
    title: string                     // human label per type
    currentDailyMajor: number | null  // budget recs only (micros/1e6)
    recommendedDailyMajor: number | null
    impactSummary: string | null      // e.g. "+1,240 impressions"
    resourceName: string
    applyability: 'budget_guardrailed' | 'review_only'
    deepLink: string                  // optimization_score_url
  }
  ```
- `applyability = 'budget_guardrailed'` when `type ∈ {CAMPAIGN_BUDGET, FORECASTING_CAMPAIGN_BUDGET}` **and** a finite `recommendedDailyMajor > 0` is present; else `'review_only'`.
- micros→major = `Number(micros) / 1_000_000`, guarded against non-numeric (→ null, classified `review_only`).
- `IMPROVE_GOOGLE_TAG_COVERAGE` is tagged `review_only` and additionally flagged as a tracking-health item via a `trackingHealth: true` boolean on the normalized object (so the UI can group it).
- Returns `{ optimizationScore: number|null, recommendations: NormalizedRecommendation[] }`.

### 2. Endpoint — `server/api/agency/social/spend/[id]/google-recommendations.get.ts` (new)
- **Spend-scoped** (keyed by `media_spend.id`, matching the slideover's data model — the spend page is cross-account, so there is no page-level "selected account").
- `requireAuth` + `requireRole(['owner','admin'])`. Resolves the connection **and** `campaign_id` server-side from `media_spend(id) JOIN social_connections` (so the UI never threads a connectionId). Google rows only; for a Meta spend row it returns an empty result.
- Resolves auth (`resolveGoogleWriteAuth`), calls `fetchGoogleRecommendations` for that one account, normalizes, and returns `{ optimizationScore, recommendations, campaignId }` — `recommendations` includes that account's recs; the UI highlights the one whose `campaignId` matches this campaign.
- **One API call per campaign-open** (no 100-account fan-out).
- **Fail-safe:** any Google/network error → `{ optimizationScore: null, recommendations: [], campaignId: null, error: <message> }` with HTTP 200. Never blocks the slideover.
- Unflagged (read-only).

### 3. Apply (budget recs) — reuse existing chain, one additive change
- The UI "Apply" on a `budget_guardrailed` rec calls the **existing** `plan.post.ts` with `currentDailyBudget = currentDailyMajor`, `recommendedDailyBudget = recommendedDailyMajor`, plus a new optional `source: 'google_recommendation'` and `recommendationResourceName`.
- **Minimal additive change to `plan.post.ts`:** accept an optional `body.source` (default `'ai_pacing_review'` for backward-compat) and use it both in the recorded `metadata.source` and in the dedupe `WHERE metadata->>'source' = $source`. Stash `recommendationResourceName` in metadata when present. No behaviour change for existing callers (default preserved).
- Approve + apply then flow through the **unchanged** approve endpoint and `execute.post.ts` → guard-railed Google write. **No new write code.**
- Applying our *clamped* value (not Google's exact number) means the Google rec stays "open" in Google's UI — acceptable; we do **not** call Google's `ApplyRecommendation` or dismiss it.

### 4. UI — inside `app/components/social/SpendCampaignHistorySlideover.vue` (the per-campaign Review slideover)
- Recs are fetched **on slideover open** (in the existing `loadHistory(spendId)` flow) via the spend-scoped endpoint — 1 call per campaign-open. Rendered through a small presentational child `SpendGoogleRecommendations.vue`.
- **The matching campaign budget rec** (`campaignId` == this campaign) is shown next to the existing pacing / "Analyze with AI" numbers, with an **"Apply (guardrailed)"** button — enabled only when the budget-write flags are armed (otherwise "recommend-only", mirroring `app/utils/socialSpendPacingTable.ts`). Apply reuses the slideover's existing plan→approve→apply path (just with `source: 'google_recommendation'`).
- `review_only` recs for the account: type label + impact + **"Review in Google Ads"** deep-link.
- Tracking-health items grouped under a small "Tracking health" subsection alongside the existing zero-conversion signal.
- Titled **"Google optimization recommendations"** to stay distinct from the pacing "Recommendations" count. Reuses existing card/badge/button patterns (Nuxt UI v4). No spend-page panel; no new visual system.

## Error handling
- Fetch: fail-safe to empty + error flag (endpoint never throws to the page).
- Normalizer: non-numeric/missing budget fields → `review_only`, never `NaN`.
- Apply: unchanged — inherits the execute endpoint's guardrail blocks, read-back-mismatch handling, and audit.

## Testing
- **`test/server/utils/googleRecommendations.test.ts`** (pure normalizer): type→applyability classification (budget vs review_only), micros→major, non-numeric→review_only+null, tracking-health flag for tag-coverage, impact summary formatting, deep-link passthrough, empty input.
- Endpoint is integration-level (consistent with existing spend endpoints).
- Apply path is already covered by existing budget-write / execute tests; add one `plan.post.ts` assertion that a provided `source` is recorded + used in dedupe.

## Files
- Create: `server/utils/googleRecommendations.ts`, `server/api/agency/social/spend/[id]/google-recommendations.get.ts`, `app/components/social/SpendGoogleRecommendations.vue`, `test/server/utils/googleRecommendations.test.ts`.
- Modify: `server/api/agency/social/spend/[id]/actions/plan.post.ts` (optional `source` + rec metadata), `app/components/social/SpendCampaignHistorySlideover.vue` (fetch on open + render the recs child + apply).
- Marketing: extend the `campaign-alerts` feature entry to mention surfacing Google's optimization recommendations.

## Safety
- Reads are read-only and unflagged. The only money-moving path (budget apply) reuses the existing flag-gated, guard-railed, audited write — **nothing new is armed.** No migration.

## No migration
Reuses `campaign_action_log` (+ existing statuses) and `agency_settings` flags.

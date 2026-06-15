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
- **Google only** (Meta's recommendations API is thin). **Reads are unflagged** (read-only is safe); **applying a budget rec still requires the existing `liveBudgetChangesEnabled + googleBudgetWritesEnabled` flags.**
- **Deferred (out of scope for v1):** `RecommendationSubscriptionService` autopilot, a scheduled recommendations sync table, native `ApplyRecommendation` for non-budget types, Meta recommendations.

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

### 2. Endpoint — `server/api/agency/social/spend/google-recommendations.get.ts` (new)
- `requireAuth` + `requireRole(['owner','admin'])`. Query param `connectionId` (or `customerId`).
- Loads the Google `social_connections` row, resolves auth (`resolveGoogleWriteAuth`), calls `fetchGoogleRecommendations`, normalizes, returns `{ optimizationScore, recommendations }`.
- **Fail-safe:** any Google/network error → `{ optimizationScore: null, recommendations: [], error: <message> }` with HTTP 200. Never blocks the spend page.
- Unflagged (read-only).

### 3. Apply (budget recs) — reuse existing chain, one additive change
- The UI "Apply" on a `budget_guardrailed` rec calls the **existing** `plan.post.ts` with `currentDailyBudget = currentDailyMajor`, `recommendedDailyBudget = recommendedDailyMajor`, plus a new optional `source: 'google_recommendation'` and `recommendationResourceName`.
- **Minimal additive change to `plan.post.ts`:** accept an optional `body.source` (default `'ai_pacing_review'` for backward-compat) and use it both in the recorded `metadata.source` and in the dedupe `WHERE metadata->>'source' = $source`. Stash `recommendationResourceName` in metadata when present. No behaviour change for existing callers (default preserved).
- Approve + apply then flow through the **unchanged** approve endpoint and `execute.post.ts` → guard-railed Google write. **No new write code.**
- Applying our *clamped* value (not Google's exact number) means the Google rec stays "open" in Google's UI — acceptable; we do **not** call Google's `ApplyRecommendation` or dismiss it.

### 4. UI — `app/components/social/SpendGoogleRecommendations.vue` (new)
- A panel in the spend view: optimization-score header, then a list of recs.
- `budget_guardrailed` rows: current → recommended daily + impact, with an **"Apply (guardrailed)"** button (only enabled when the budget-write flags are armed; otherwise shows "recommend-only", mirroring the existing pacing-review gating in `app/utils/socialSpendPacingTable.ts`).
- `review_only` rows: type label + impact + **"Review in Google Ads"** deep-link (`deepLink`).
- Tracking-health items grouped under a small "Tracking health" subsection alongside a reference to the existing zero-conversion signal.
- Reuses existing card/badge/button patterns (Nuxt UI v4). No new visual system.

## Error handling
- Fetch: fail-safe to empty + error flag (endpoint never throws to the page).
- Normalizer: non-numeric/missing budget fields → `review_only`, never `NaN`.
- Apply: unchanged — inherits the execute endpoint's guardrail blocks, read-back-mismatch handling, and audit.

## Testing
- **`test/server/utils/googleRecommendations.test.ts`** (pure normalizer): type→applyability classification (budget vs review_only), micros→major, non-numeric→review_only+null, tracking-health flag for tag-coverage, impact summary formatting, deep-link passthrough, empty input.
- Endpoint is integration-level (consistent with existing spend endpoints).
- Apply path is already covered by existing budget-write / execute tests; add one `plan.post.ts` assertion that a provided `source` is recorded + used in dedupe.

## Files
- Create: `server/utils/googleRecommendations.ts`, `server/api/agency/social/spend/google-recommendations.get.ts`, `app/components/social/SpendGoogleRecommendations.vue`, `test/server/utils/googleRecommendations.test.ts`.
- Modify: `server/api/agency/social/spend/[id]/actions/plan.post.ts` (optional `source` + rec metadata), `app/pages/agency/social/spend.vue` (mount the panel + fetch).
- Marketing: extend the `campaign-alerts` feature entry to mention surfacing Google's optimization recommendations.

## Safety
- Reads are read-only and unflagged. The only money-moving path (budget apply) reuses the existing flag-gated, guard-railed, audited write — **nothing new is armed.** No migration.

## No migration
Reuses `campaign_action_log` (+ existing statuses) and `agency_settings` flags.

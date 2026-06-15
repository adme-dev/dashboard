# Phase 1.5 — Multi-ABO proportional budget split (design)

**Date:** 2026-06-16
**Branch:** `feat/abo-budget-split`
**Builds on:** budget-write execution (flag-gated), IM-01 atomic-claim (migration 179), `resolveMetaBudgetTarget`.

## Problem

The live budget-write execute endpoint (`server/api/agency/social/spend/[id]/actions/[actionId]/execute.post.ts`) can push an approved campaign-level daily budget to Meta when the campaign is **CBO** (write the campaign) or **single-ABO** (write the one active ad set). When a campaign is **ABO with ≥2 active ad sets**, `resolveMetaBudgetTarget` returns `level: 'manual'` and the action is skipped — the media buyer has to apply it by hand on the platform.

Phase 1.5 closes that gap: split the approved campaign-level daily budget across the active ad sets, preserving the buyer's existing per-ad-set weighting.

**Out of scope:** CBO / single-ABO paths (unchanged); Google (Google campaigns write at the campaign-budget level, no ABO split concept here); arming any flag (this ships dormant behind the existing `liveBudgetChangesEnabled` + `metaBudgetWritesEnabled`).

## Decisions (confirmed)

- **Split basis:** proportional to each participating ad set's **current `daily_budget`**. Ad sets without a `daily_budget` (lifetime-budget ad sets) are **left untouched** and excluded from the split.
- **Partial-write failure:** Meta has no transaction/rollback across N ad-set writes. If any ad set write fails or its read-back mismatches, the action is marked **`failed`**, already-written ad sets are **left in place**, and the full per-ad-set result is recorded for manual reconciliation.

## Design

### 1. Target resolution — `resolveMetaBudgetTarget` (`server/utils/metaClient.ts`)

Add a new level `'adset_split'` to `MetaBudgetTarget`:

```ts
interface MetaBudgetTarget {
  level: 'campaign' | 'adset' | 'adset_split' | 'manual'
  targetId: string | null
  optimizationGoal: string | null
  adSetCount: number
  // populated only for 'adset_split':
  splitAdSets?: Array<{ id: string; currentDailyMajor: number; optimizationGoal: string | null }>
}
```

Resolution order (after the CBO check is unchanged):
1. Fetch active ad sets (`status === 'ACTIVE'`).
2. **Participants** = active ad sets with `daily_budget` present and `> 0` (major units = cents/100).
3. Branch on participant count:
   - `participants.length === 0` → `'manual'` (unchanged behaviour: nothing splittable, e.g. all lifetime-budget).
   - `participants.length === 1` → `'adset'` (existing single-write path; `targetId` = that ad set, `optimizationGoal` = its goal).
   - `participants.length >= 2` → `'adset_split'` with `splitAdSets` populated and `adSetCount = participants.length`.
4. If there are active ad sets but **none** are participants, and `> 1` active overall, still `'manual'` (can't split lifetime budgets here).

`getAdSets` already returns `id, name, status, optimization_goal, daily_budget` — no new Graph fields needed.

### 2. Guardrails on the campaign total (`execute.post.ts`)

For `'adset_split'`:
- `currentDaily` = **sum** of `splitAdSets[].currentDailyMajor`.
- `recommendedDaily` = the approved campaign target (`row.recommended_daily`, unchanged source).
- `perAdsetMin` = `max(splitAdSets.map(a => platformDailyMinimum(a.optimizationGoal)))`.
- Total minimum passed to `decideExecution` = `perAdsetMin * participantCount` (so a clamped total can be divided without starving any ad set).
- `decideExecution` is reused unchanged → applies ±20% clamp, `maxMultiple` cap, monthly-margin cap, once-per-day rate-limit, and yields `finalDailyTotal`.

### 3. Pure split function — `splitDailyBudget` (new `server/utils/budgetSplit.ts`)

```ts
splitDailyBudget(
  participants: Array<{ id: string; currentDailyMajor: number }>,
  finalDailyTotal: number,
  perAdsetMin: number,
): { ok: true; splits: Array<{ id: string; newDailyMajor: number }> }
 | { ok: false; reason: 'adset_share_below_min' | 'no_participants' | 'zero_current_total' }
```

Algorithm:
1. `sumCurrent = Σ currentDailyMajor`. If `participants.length === 0` → `no_participants`. If `sumCurrent <= 0` → `zero_current_total` (can't weight; caller blocks).
2. For each participant: `rawShare = finalDailyTotal * (currentDailyMajor / sumCurrent)`, rounded to 2 dp (cents).
3. **Exact-sum reconciliation:** compute the rounding drift `finalDailyTotal - Σ rounded` and add it to the **largest-current** ad set, so `Σ newDailyMajor === finalDailyTotal` to the cent.
4. If **any** `newDailyMajor < perAdsetMin` → `{ ok: false, reason: 'adset_share_below_min' }` (block; do not bump — bumping would exceed the guardrail-approved total and risk overspend).
5. Else `{ ok: true, splits }`.

This unit is pure and fully tested; it never calls the network or DB.

### 4. Per-ad-set write + read-back (`execute.post.ts`, new branch)

When `metaTarget.level === 'adset_split'` and the decision proceeds:
- Call `splitDailyBudget(...)`. If `!ok` → release the claim (retryable guardrail block) and return `{ status: 'blocked', reason }`.
- Iterate `splits` **sequentially**: `updateMetaDailyBudget(adSetId, newDailyMajor, token)`, then verify `|readBack - newDailyMajor| < 0.01`. Collect `splitResults: Array<{ adSetId, requested, readBack, verified }>`. Wrap each call so a throw is captured into `{ verified: false, error }` and the loop stops (no further writes after the first hard failure).

### 5. Status + audit

- **All `verified`** → `action_status = 'applied'`; `new_value = { totalDailyBudget: finalDailyTotal, splits: splitResults }`; `metadata` keeps `{ clamped, clampReasons, override, appliedBy }`.
- **Any not verified / threw** → `action_status = 'failed'`; `error_message` = `"ABO split partial: <n>/<total> ad sets failed: <ids>"`; `metadata.splitResults` = full array. Already-written ad sets stay written (documented; no rollback).
- On full success, run the existing KV cache-bust (`spend:summary:<tenant>:<period>:{all,meta}`) identically to the single-target path.

### 6. Claim / release interaction (reuses IM-01, migration 179)

- The split runs inside the post-claim flow. `adset_share_below_min` / `zero_current_total` blocks → `releaseActionClaim` (returns to `approved`, retryable).
- Write-phase failures → terminal `failed` (no release).
- The Meta target-resolution throw already releases (the C-1 fix wraps `resolveMetaBudgetTarget`).
- The `EXISTS … applied today` rate-limit subquery already covers split actions (it counts any `applied` row for the media_spend that day).

### 7. Marketing sync

Light copy touch on the `campaign-alerts` detail entry (`app/pages/features/[slug].vue`) noting that ABO campaigns are split proportionally across ad sets when a recommendation is applied. Still framed as the recommend/apply flow (not over-marketing dormant live writes).

## Testing

- `budgetSplit.test.ts` (new): proportional weighting; exact-sum rounding remainder to the largest ad set; `adset_share_below_min` block; `zero_current_total`; `no_participants`; two- and three-ad-set cases.
- `metaClient` resolution: extend coverage so 0/1/≥2 participant counts map to `manual`/`adset`/`adset_split`, and lifetime-budget ad sets are excluded.
- Endpoint write-loop is integration-level (consistent with existing endpoint tests covering the pure decision layer).

## Safety

- Entirely behind `liveBudgetChangesEnabled && metaBudgetWritesEnabled` (both default `false`). No flag armed by this work. No live write performed during development.
- Conservative-by-default: blocks (does not silently bump) when a proportional share would fall below the per-ad-set minimum.

## No migration

Reuses `campaign_action_log` and the `'executing'` status from migration 179.

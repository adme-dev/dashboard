# Design: AI pacing budget-write execution (Meta + Google)

**Date:** 2026-06-15
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** Phase 1 of "AI applies pacing recommendations to live ad budgets"

## Problem

The AI ad-spend pacing review (`/agency/social/spend`) recommends daily-budget
changes per campaign and records them through a `plan → approve → ?` audit chain
(`campaign_action_log`). The final step — actually writing the new budget to
Meta / Google — **does not exist**. The UI even admits it: *"platform execution
still requires the server write layer."* The three flags
(`liveBudgetChangesEnabled`, `metaBudgetWritesEnabled`, `googleBudgetWritesEnabled`)
gate nothing because there is no execution code.

This design adds the execution layer, behind a human approval gate and hard
guardrails, because it changes **live client ad budgets** (spends real money).

## Goals

- From the Review slideover, an authorized user can push an approved pacing
  recommendation to Meta or Google as a real budget change.
- Every change is guardrailed (learning-phase-safe, capped, rate-limited),
  audited, and read-back-verified.
- Off by default; flag-gated per platform; fails loud (never a silent no-op —
  the exact failure mode that hid the broken sync earlier).

## Non-goals (Phase 1)

- Multi-ad-set ABO automatic distribution (flagged manual; see Phase 1.5).
- Lifetime budgets (daily only).
- Fully autonomous (no-human) application.
- Bid / targeting / creative changes — budget only.

## Decisions (locked in brainstorming)

| Decision | Choice |
|---|---|
| Apply trigger | Two explicit human steps: **approve**, then **Apply** button. No auto-apply. |
| Who can Apply | **Admin/owner only.** Plan + approve stay open to the media role. |
| Platforms | **Meta + Google** in Phase 1. |
| Budget type | **Daily** budgets only. |
| Campaign structure | **CBO** (campaign-level write) + **single-ad-set ABO** (that ad set). Multi-ad-set ABO **flagged manual** in Phase 1. |
| ±20% learning-phase rule | **Clamp** to ±20% of current; convergence happens via the **daily** re-recommendation, not an internal scheduler. |
| Absolute overspend protection | **Relative cap**, not flat dollars: new daily ≤ `maxMultiple` × current daily AND must not project the campaign past its monthly budget by more than `monthlyMarginPct`. Global defaults + optional per-campaign override. |
| Meta minimums | Hard-enforced ($1/day impressions, $5/day conversions; in account currency). |
| Rate limit | Max **1 applied change per campaign per day**. |
| Guardrail violation | Clamp where a safe clamped value exists (±20%, cap, minimum); hard-block otherwise; **authorized + audited override** for exceptions. |
| Execution model | **Synchronous** (one API call per Apply; no queue). |

## Architecture

### Components (each independently testable)

1. **Guardrail engine** — `server/utils/budgetGuardrails.ts` (PURE, no I/O).
   - Input: `{ currentDaily, recommendedDaily, platform, optimizationGoal, maxMultiple, monthlyBudget, mtdSpend, monthDaysRemaining, monthlyMarginPct, platformMinimum, alreadyAppliedToday, override }`.
   - Output: `{ finalDaily, clamped: boolean, clampReasons: string[], blocked: boolean, blockReason?: string }`.
   - Order of operations: rate-limit check → compute raw target → clamp to ±20% of current → clamp down to relative cap (multiple + monthly-margin) → clamp up to platform minimum → if still inconsistent (e.g. minimum > cap), block. `override=true` skips the ±20% clamp and the relative cap (NOT the platform minimum or rate-limit).
   - Fully unit-tested (clamp up/down, cap, minimum, rate-limit, override, conflict→block).

2. **Meta write** — add to `server/utils/metaClient.ts`:
   - `updateCampaignDailyBudget(campaignId, dailyMinorUnits, token)` → `POST /{campaign_id}` `daily_budget=<minor units>`.
   - `updateAdSetDailyBudget(adSetId, dailyMinorUnits, token)` → `POST /{adset_id}`.
   - `getCampaignBudgetShape(campaignId, token)` → returns `{ level: 'campaign' | 'adset', adSets: [...] }` using existing `getCampaigns`/`getAdSets` + `daily_budget`/`budget_type`. Determines CBO vs ABO and ad-set count.
   - Minor-unit conversion uses the account currency from connection `metadata.currency`.

3. **Google write** — add to `server/utils/googleAdsClient.ts`:
   - `updateCampaignBudgetAmount(customerId, budgetResourceName, amountMicros, token, developerToken, loginCustomerId)` → `POST customers/{cid}/campaignBudgets:mutate` with `updateMask=amount_micros`. Dollars × 1,000,000 = micros.
   - Resolve and pass `login-customer-id` (MCC) correctly — fixes the same header bug that 403s Google spend reads (`resolveGoogleManagerId`). The campaign's `CampaignBudget` resource name is fetched/cached as part of the write.

4. **Execute endpoint** — `POST /api/agency/social/spend/[id]/actions/[actionId]/execute`:
   - Auth: `requireRole(event, ['admin','owner'])` (Apply is admin/owner only).
   - Load the action (must be `approved`, not already `applied` — idempotency) + its `media_spend` row (platform, account, campaign id, current budget, monthly budget, mtd spend).
   - Check the per-platform flag (`metaBudgetWritesEnabled` / `googleBudgetWritesEnabled`) and `liveBudgetChangesEnabled`; reject if off.
   - For Meta: `getCampaignBudgetShape` → CBO or single-ad-set ABO → run guardrail engine → write → **read back** the object's budget and confirm it equals `finalDaily` → on match update `campaign_action_log` (`applied`, `executed_at`, `appliedValue`, `clamped`, `clampReasons`); on mismatch/error mark `failed` with the message. Multi-ad-set ABO → reject with `manual_required`.
   - For Google: guardrail engine → mutate → read back amount → log.
   - Bust the spend KV cache keys for the period on success.
   - Return `{ status, appliedValue, clamped, clampReasons }` or a structured error.

5. **UI** — `app/components/social/SpendCampaignHistorySlideover.vue`:
   - On an `approved` action, show an **"Apply to {platform}"** button — visible only to admin/owner.
   - Before applying, show the guardrail preview computed server-side (e.g. *"recommended +35% → will apply +20% (learning-safe)"*, or *"ABO campaign, 3 ad sets — apply manually"*, or *"would exceed cap — blocked"*).
   - Result state: green "Applied $X (was $Y)" with timestamp + who, or red "Failed: {reason}".
   - Override affordance (admin/owner) on a clamped/blocked action: a confirm modal that records `override=true` in the audit log.

### Data flow

```
plan ──> approve ──> (admin) Apply
                        │
                        ▼
              flag check ──> guardrail engine ──> platform write ──> read-back verify
                        │                                                   │
                   (off → reject)                          match → log "applied" + bust cache
                                                          mismatch/err → log "failed"
```

Convergence to a large target happens across days: the daily pacing review
re-recommends the remaining gap, the admin applies another ≤20% step.

### Audit-log additions

`campaign_action_log` already stores plan/approve/cancel. Add on execute:
`action_status` `applied`/`failed`/`manual_required`, `executed_at`, `applied_value`,
`clamped` (bool), `clamp_reasons` (jsonb), `error_message`, `overridden_by`. (Confirm
which columns already exist vs. need a migration during planning.)

### Error handling

- Token 403 / expired → `failed` with explicit message; never silent success.
- Platform write succeeds but log update fails → budget is changed; next sync
  reflects it; read-back already confirmed the platform side. Acceptable; logged.
- Concurrent Apply (two admins) → status guard (`approved` → `applied` is a
  single guarded transition); second attempt sees non-`approved` and no-ops.
- Multi-ad-set ABO → `manual_required`, surfaced in UI, no write attempted.

### Testing

- Guardrail engine: exhaustive pure unit tests.
- Meta/Google writes: mocked-fetch tests — CBO path, single-ad-set ABO path,
  Google micros + MCC header, minor-unit conversion, read-back match/mismatch.
- Execute endpoint: role gate (non-admin → 403), flag-off → reject, clamp
  applied, blocked, success + log, platform-failure → `failed`, idempotency,
  multi-ad-set ABO → `manual_required`.
- All flag-gated; off by default in prod.

## Rollout

1. Ship behind `metaBudgetWritesEnabled` / `googleBudgetWritesEnabled` = false.
2. Verify on 1–2 real CBO campaigns with small deltas, read-back confirmed.
3. Broaden once confident.
4. Phase 1.5: multi-ad-set ABO proportional distribution.

## Open items for planning

- Confirm `campaign_action_log` columns vs. migration need.
- Confirm `requireRole` admin/owner values match the RBAC enum.
- Confirm where global cap defaults (`maxMultiple`, `monthlyMarginPct`) live —
  extend `socialBudgetControlConfig` vs. new settings key.

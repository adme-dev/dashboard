# Multi-ABO Proportional Budget Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Meta ABO campaign has ≥2 active ad sets, split an approved campaign-level daily budget across them proportionally to current per-ad-set budgets, instead of skipping as `manual`.

**Architecture:** A pure `splitDailyBudget` function does the weighting/rounding/min-check math. `resolveMetaBudgetTarget` gains an `adset_split` level returning the participating ad sets. The execute endpoint adds an `adset_split` branch that runs existing guardrails on the campaign total, splits, writes each ad set sequentially with read-back, and records a per-ad-set audit. All behind the existing flag gate.

**Tech Stack:** Nitro (Nuxt 4 server), TypeScript, Vitest. Reuses `decideExecution`, `platformDailyMinimum`, `updateMetaDailyBudget`, `claimApprovedAction`/`releaseActionClaim`, migration 179.

**Spec:** `docs/superpowers/specs/2026-06-16-abo-multi-adset-budget-split-design.md`

**Working dir:** worktree `.worktrees/abo-budget-split` (branch `feat/abo-budget-split`). Run `npx nuxt prepare` once if `.nuxt` is missing.

---

## Task 1: Pure split function `splitDailyBudget`

**Files:**
- Create: `server/utils/budgetSplit.ts`
- Test: `test/server/utils/budgetSplit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/budgetSplit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { splitDailyBudget } from '~~/server/utils/budgetSplit'

describe('splitDailyBudget', () => {
  it('splits equally when current budgets are equal', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 10 }, { id: 'b', currentDailyMajor: 10 }], 100, 1)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.splits).toEqual([{ id: 'a', newDailyMajor: 50 }, { id: 'b', newDailyMajor: 50 }])
    }
  })

  it('splits proportionally to current budget share', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 30 }, { id: 'b', currentDailyMajor: 10 }], 80, 1)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.splits).toEqual([{ id: 'a', newDailyMajor: 60 }, { id: 'b', newDailyMajor: 20 }])
  })

  it('assigns rounding drift to the largest-current ad set so parts sum exactly to the total', () => {
    const r = splitDailyBudget(
      [{ id: 'a', currentDailyMajor: 50 }, { id: 'b', currentDailyMajor: 25 }, { id: 'c', currentDailyMajor: 25 }],
      100, 1,
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      const sum = r.splits.reduce((s, x) => s + x.newDailyMajor, 0)
      expect(Math.round(sum * 100) / 100).toBe(100)
      // largest-current ('a') absorbs the drift
      expect(r.splits.find(s => s.id === 'a')!.newDailyMajor).toBeCloseTo(50, 2)
    }
  })

  it('blocks when any proportional share falls below the per-ad-set minimum', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 100 }, { id: 'b', currentDailyMajor: 1 }], 20, 5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('adset_share_below_min')
  })

  it('blocks when the total current budget is zero (cannot weight)', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 0 }, { id: 'b', currentDailyMajor: 0 }], 20, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('zero_current_total')
  })

  it('blocks when there are no participants', () => {
    const r = splitDailyBudget([], 20, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_participants')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/utils/budgetSplit.test.ts`
Expected: FAIL — `splitDailyBudget` is not defined / cannot find module.

- [ ] **Step 3: Write minimal implementation**

Create `server/utils/budgetSplit.ts`:

```ts
/**
 * Pure proportional daily-budget split for multi-ABO Meta campaigns (Phase 1.5).
 * Distributes an approved campaign-level daily total across participating ad sets
 * in proportion to their current daily budgets, rounding to cents and pushing the
 * rounding drift onto the largest-current ad set so the parts sum EXACTLY to the
 * total. Blocks (never silently bumps) when a share would fall below the per-ad-set
 * minimum — bumping would exceed the guardrail-approved total and risk overspend.
 * No network / DB — fully unit-testable.
 */

export interface SplitParticipant {
  id: string
  currentDailyMajor: number
}

export type SplitResult =
  | { ok: true; splits: Array<{ id: string; newDailyMajor: number }> }
  | { ok: false; reason: 'adset_share_below_min' | 'no_participants' | 'zero_current_total' }

const round2 = (n: number) => Math.round(n * 100) / 100

export function splitDailyBudget(
  participants: SplitParticipant[],
  finalDailyTotal: number,
  perAdsetMin: number,
): SplitResult {
  if (participants.length === 0) return { ok: false, reason: 'no_participants' }
  const sumCurrent = participants.reduce((s, p) => s + p.currentDailyMajor, 0)
  if (sumCurrent <= 0) return { ok: false, reason: 'zero_current_total' }

  const splits = participants.map(p => ({
    id: p.id,
    newDailyMajor: round2(finalDailyTotal * (p.currentDailyMajor / sumCurrent)),
  }))

  // Exact-sum reconciliation: push the rounding drift onto the largest-current ad set.
  const drift = round2(finalDailyTotal - splits.reduce((s, x) => s + x.newDailyMajor, 0))
  if (drift !== 0) {
    let largestIdx = 0
    for (let i = 1; i < participants.length; i++) {
      if (participants[i].currentDailyMajor > participants[largestIdx].currentDailyMajor) largestIdx = i
    }
    splits[largestIdx].newDailyMajor = round2(splits[largestIdx].newDailyMajor + drift)
  }

  if (splits.some(s => s.newDailyMajor < perAdsetMin)) {
    return { ok: false, reason: 'adset_share_below_min' }
  }
  return { ok: true, splits }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/server/utils/budgetSplit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/budgetSplit.ts test/server/utils/budgetSplit.test.ts
git commit -m "feat(spend): pure splitDailyBudget for multi-ABO proportional split"
```

---

## Task 2: `resolveMetaBudgetTarget` gains `adset_split`

**Files:**
- Modify: `server/utils/metaClient.ts` (`MetaBudgetTarget` interface ~line 1075; `resolveMetaBudgetTarget` ~line 1088–1104)
- Test: `test/server/utils/metaBudgetWrite.test.ts`

- [ ] **Step 1: Update the failing tests**

In `test/server/utils/metaBudgetWrite.test.ts`, REPLACE the `'flags ABO with multiple active ad sets as manual'` test with these two:

```ts
  it('returns adset_split for ABO with multiple active ad sets that have daily budgets', async () => {
    ofetchMock
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] })
      .mockResolvedValueOnce({ data: [
        { id: 'as1', name: 'A', status: 'ACTIVE', optimization_goal: 'OFFSITE_CONVERSIONS', daily_budget: '30000' },
        { id: 'as2', name: 'B', status: 'ACTIVE', optimization_goal: 'OFFSITE_CONVERSIONS', daily_budget: '10000' },
      ] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('adset_split')
    expect(r.adSetCount).toBe(2)
    expect(r.splitAdSets).toEqual([
      { id: 'as1', currentDailyMajor: 300, optimizationGoal: 'OFFSITE_CONVERSIONS' },
      { id: 'as2', currentDailyMajor: 100, optimizationGoal: 'OFFSITE_CONVERSIONS' },
    ])
  })

  it('excludes lifetime-budget ad sets; a single daily-budget ad set falls back to adset', async () => {
    ofetchMock
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] })
      .mockResolvedValueOnce({ data: [
        { id: 'as1', name: 'A', status: 'ACTIVE', optimization_goal: 'LINK_CLICKS', daily_budget: '10000' },
        { id: 'as2', name: 'B', status: 'ACTIVE', optimization_goal: 'LINK_CLICKS' }, // lifetime, no daily_budget
      ] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('adset')
    expect(r.targetId).toBe('as1')
  })

  it('flags as manual when no active ad set carries a daily budget', async () => {
    ofetchMock
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] })
      .mockResolvedValueOnce({ data: [
        { id: 'as1', name: 'A', status: 'ACTIVE', optimization_goal: 'LINK_CLICKS' },
        { id: 'as2', name: 'B', status: 'ACTIVE', optimization_goal: 'LINK_CLICKS' },
      ] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('manual')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/server/utils/metaBudgetWrite.test.ts`
Expected: FAIL — `adset_split` level not produced; `splitAdSets` undefined.

- [ ] **Step 3: Update `MetaBudgetTarget` interface**

In `server/utils/metaClient.ts`, REPLACE the interface (~line 1075):

```ts
export interface MetaBudgetTarget {
  level: 'campaign' | 'adset' | 'adset_split' | 'manual'
  targetId: string | null
  optimizationGoal: string | null
  adSetCount: number
  // Populated only for level === 'adset_split': the active ad sets that carry a
  // daily_budget and will share the campaign-level recommendation.
  splitAdSets?: Array<{ id: string; currentDailyMajor: number; optimizationGoal: string | null }>
}
```

- [ ] **Step 4: Update `resolveMetaBudgetTarget` body**

REPLACE the ABO section (the `const adSets = ...` through the final `return { level: 'manual', ... }`) with:

```ts
  const adSets = await getAdSets(campaignId, token)
  const active = adSets.filter(a => (a.status || '').toUpperCase() === 'ACTIVE')
  // Only ad sets with their own daily_budget can be split; lifetime-budget ad sets
  // are left untouched.
  const participants = active.filter(a => a.daily_budget != null && Number(a.daily_budget) > 0)

  if (participants.length === 1) {
    return { level: 'adset', targetId: participants[0].id, optimizationGoal: participants[0].optimization_goal ?? null, adSetCount: 1 }
  }
  if (participants.length >= 2) {
    return {
      level: 'adset_split',
      targetId: null,
      optimizationGoal: null,
      adSetCount: participants.length,
      splitAdSets: participants.map(a => ({
        id: a.id,
        currentDailyMajor: Number(a.daily_budget) / 100,
        optimizationGoal: a.optimization_goal ?? null,
      })),
    }
  }
  return { level: 'manual', targetId: null, optimizationGoal: null, adSetCount: active.length }
```

Also update the doc comment above the function to mention the `adset_split` case.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/server/utils/metaBudgetWrite.test.ts`
Expected: PASS (CBO, single-adset, adset_split, lifetime-exclusion, manual cases).

- [ ] **Step 6: Commit**

```bash
git add server/utils/metaClient.ts test/server/utils/metaBudgetWrite.test.ts
git commit -m "feat(spend): resolveMetaBudgetTarget returns adset_split for multi-ABO"
```

---

## Task 3: Wire the `adset_split` branch into the execute endpoint

**Files:**
- Modify: `server/api/agency/social/spend/[id]/actions/[actionId]/execute.post.ts`

This is integration-level glue over the unit-tested `splitDailyBudget` + `resolveMetaBudgetTarget`. No new unit test (consistent with the existing endpoint test covering only the pure decision layer); correctness is covered by Tasks 1–2 + the end-of-plan review.

- [ ] **Step 1: Add the `splitDailyBudget` import**

At the top, after the `claimApprovedAction` import line, add:

```ts
import { splitDailyBudget } from '~~/server/utils/budgetSplit'
```

- [ ] **Step 2: Set the right `platformMinimum` and decision `currentDaily` for split**

In the Meta block (after the manual-skip `return`), REPLACE:

```ts
    platformMinimum = platformDailyMinimum(metaTarget.optimizationGoal)
```

with:

```ts
    if (metaTarget.level === 'adset_split') {
      // Each ad set must clear its own platform minimum, so the campaign total
      // must clear (per-ad-set min × participant count) for a clean split.
      const perAdsetMin = Math.max(...metaTarget.splitAdSets!.map(a => platformDailyMinimum(a.optimizationGoal)))
      platformMinimum = perAdsetMin * metaTarget.splitAdSets!.length
    } else {
      platformMinimum = platformDailyMinimum(metaTarget.optimizationGoal)
    }
```

Then, just before the `const decision = decideExecution({` call, add a live current-total for the split (the campaign-level `row.current_daily` recorded at plan time isn't the ABO sum):

```ts
  // For an ABO split the "current daily" is the live sum of the participating ad
  // sets, not the campaign-level value recorded when the action was planned.
  const currentDailyForDecision = metaTarget?.level === 'adset_split'
    ? metaTarget.splitAdSets!.reduce((s, a) => s + a.currentDailyMajor, 0)
    : Number(row.current_daily)
```

and change the decision's `currentDaily` field from `currentDaily: Number(row.current_daily),` to:

```ts
    currentDaily: currentDailyForDecision,
```

- [ ] **Step 3: Add a shared cache-bust closure (DRY)**

Immediately after `const now = new Date()` (and `monthDaysRemaining`), add:

```ts
  const bustSpendCache = async () => {
    const nowPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const tenantSeg = tenantId || 'no-tenant'
    const periods = Array.from(new Set([row.period, nowPeriod].filter(Boolean) as string[]))
    for (const period of periods) {
      await kvDelete(event, `spend:summary:${tenantSeg}:${period}:all`)
      await kvDelete(event, `spend:summary:${tenantSeg}:${period}:${row.platform}`)
    }
  }
```

Then in the EXISTING single-target success path, REPLACE the inline KV-bust block (the `const nowPeriod = ...` through the `for (const period of periods) { ... }` loop) with:

```ts
    if (verified) {
      await bustSpendCache()
    }
```

- [ ] **Step 4: Add the `adset_split` write branch**

Inside the `try {` block (the one that begins `// Apply to the platform with read-back verification.`), as the FIRST statement after `let readBack: number`, insert the split branch. It returns directly, so the single-target code below it only runs for `campaign` / `adset` / Google:

```ts
    // Multi-ABO: split the clamped total across the participating ad sets.
    if (platform === 'meta' && metaTarget!.level === 'adset_split') {
      const perAdsetMin = Math.max(...metaTarget!.splitAdSets!.map(a => platformDailyMinimum(a.optimizationGoal)))
      const split = splitDailyBudget(
        metaTarget!.splitAdSets!.map(a => ({ id: a.id, currentDailyMajor: a.currentDailyMajor })),
        decision.finalDaily,
        perAdsetMin,
      )
      if (!split.ok) {
        // Pre-write block — release so the approval stays retryable.
        await releaseActionClaim({ execute }, actionId)
        return { status: 'blocked', reason: split.reason, clampReasons: decision.clampReasons }
      }

      const splitResults: Array<{ adSetId: string; requested: number; readBack: number | null; verified: boolean; error?: string }> = []
      let allVerified = true
      for (const s of split.splits) {
        try {
          const res = await updateMetaDailyBudget(s.id, s.newDailyMajor, row.access_token)
          const ok = Math.abs(res.readBackDailyMajor - s.newDailyMajor) < 0.01
          splitResults.push({ adSetId: s.id, requested: s.newDailyMajor, readBack: res.readBackDailyMajor, verified: ok })
          if (!ok) { allVerified = false; break }
        } catch (err: any) {
          splitResults.push({ adSetId: s.id, requested: s.newDailyMajor, readBack: null, verified: false, error: (err?.data?.error?.message || err?.message || 'write failed').slice(0, 300) })
          allVerified = false
          break
        }
      }

      const failedIds = splitResults.filter(r => !r.verified).map(r => r.adSetId)
      await execute(
        `UPDATE campaign_action_log
           SET action_status = $2, executed_at = NOW(),
               new_value = COALESCE(new_value,'{}'::jsonb) || $3::jsonb,
               error_message = $4,
               metadata = COALESCE(metadata,'{}'::jsonb) || $5::jsonb
         WHERE id = $1`,
        [
          actionId,
          allVerified ? 'applied' : 'failed',
          JSON.stringify({ totalDailyBudget: decision.finalDaily, splits: splitResults }),
          allVerified ? null : `ABO split partial: ${failedIds.length}/${split.splits.length} ad sets failed: ${failedIds.join(',')}`,
          JSON.stringify({ clamped: decision.clamped, clampReasons: decision.clampReasons, override, appliedBy: user.id, splitResults }),
        ]
      )

      if (allVerified) await bustSpendCache()
      return allVerified
        ? { status: 'applied', appliedDailyBudget: decision.finalDaily, clamped: decision.clamped, clampReasons: decision.clampReasons, splitResults }
        : { status: 'failed', reason: 'split_partial', splitResults }
    }
```

- [ ] **Step 4b: Verify the existing single-target path is untouched below the branch**

Read the file from the `try {` to the end. Confirm: the split branch returns before the `if (platform === 'meta') { const res = await updateMetaDailyBudget(metaTarget!.targetId!, ...) }` single-target line, so CBO / single-ABO / Google paths are unchanged, and `bustSpendCache()` replaced the inline KV loop in the single-target success path.

- [ ] **Step 5: Run the touched test suites + typecheck-by-vitest**

Run: `npx vitest run test/server/utils/budgetSplit.test.ts test/server/utils/metaBudgetWrite.test.ts test/server/api/socialSpendExecuteActionEndpoint.test.ts test/server/utils/budgetGuardrails.test.ts test/social/guardrails.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "server/api/agency/social/spend/[id]/actions/[actionId]/execute.post.ts"
git commit -m "feat(spend): split approved budget across ABO ad sets in execute endpoint"
```

---

## Task 4: Marketing copy sync

**Files:**
- Modify: `app/pages/features/[slug].vue` (the `campaign-alerts` entry)

- [ ] **Step 1: Extend the "Analyze With AI, Side By Side" detail content**

In the `campaign-alerts` entry, append to the `Analyze With AI, Side By Side` section's `content` (or add a sentence) noting ABO handling. Locate the section added in the prior feature and append:

```
 For ABO campaigns that budget at the ad-set level, an applied recommendation is divided proportionally across the active ad sets — preserving the buyer's existing weighting while only the campaign total moves.
```

(Append to the existing `content` string; keep it one string. Do not invent a new "live writes" claim — this stays within the recommend/apply framing.)

- [ ] **Step 2: Verify the page builds (lint-level)**

Run: `npx vitest run test/server/utils/budgetSplit.test.ts` (sanity that the workspace still compiles tests); the marketing page has no unit test.

- [ ] **Step 3: Commit**

```bash
git add "app/pages/features/[slug].vue"
git commit -m "docs(marketing): note ABO ad-set split in campaign-alerts feature page"
```

---

## Final verification (after all tasks)

- [ ] Run the full touched set: `npx vitest run test/server/utils/budgetSplit.test.ts test/server/utils/metaBudgetWrite.test.ts test/server/api/socialSpendExecuteActionEndpoint.test.ts test/server/utils/budgetGuardrails.test.ts test/server/utils/socialBudgetControlConfig.test.ts test/social/guardrails.test.ts` — all green.
- [ ] Adversarial code review of the diff (gsd-code-reviewer), focused on: partial-write audit completeness, the `metaTarget.level` narrowing/non-null assertions, claim release on the split-block path, and that `currentDailyForDecision` doesn't change CBO/adset/Google behaviour.
- [ ] Confirm no flag is armed; no live write performed.
```

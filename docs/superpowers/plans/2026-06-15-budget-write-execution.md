# Budget-Write Execution (Meta + Google) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin/owner push an approved AI pacing recommendation to a live Meta or Google campaign budget, behind hard guardrails, with full audit + read-back verification.

**Architecture:** A pure guardrail engine decides the safe final budget; thin platform-write helpers call Meta/Google; a synchronous `execute` endpoint orchestrates (flag check → guardrails → write → read-back → audit-log update → cache bust); the Review slideover gets an admin-only "Apply" button. Off by default behind existing per-platform flags.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`queryOne`/`execute`), `ofetch`/`metaFetch`, Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-15-budget-write-execution-design.md`

---

## File Structure

- `server/utils/budgetGuardrails.ts` — **new**, pure guardrail engine (no I/O).
- `test/server/utils/budgetGuardrails.test.ts` — **new**, exhaustive unit tests.
- `server/utils/socialBudgetControlConfig.ts` — **modify**, add cap defaults.
- `test/server/utils/socialBudgetControlConfig.test.ts` — **new**.
- `server/utils/metaClient.ts` — **modify**, add budget-write + budget-shape helpers.
- `test/server/utils/metaBudgetWrite.test.ts` — **new**, mocked-fetch.
- `server/utils/googleAdsClient.ts` — **modify**, add budget mutate helper.
- `test/server/utils/googleBudgetWrite.test.ts` — **new**, mocked-fetch.
- `server/api/agency/social/spend/[id]/actions/[actionId]/execute.post.ts` — **new**.
- `test/server/api/socialSpendExecuteActionEndpoint.test.ts` — **new**.
- `app/components/social/SpendCampaignHistorySlideover.vue` — **modify**, Apply button + states.

---

## Task 0: Prerequisite — apply audit-log migrations to prod & verify base flow

The `campaign_action_log` table (migrations 177/178) is **not applied to prod**, so the existing plan/approve/cancel flow is dormant there. Apply it before any write code.

**Files:** none (ops).

- [ ] **Step 1: Apply migrations 177 + 178 to the DB**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/177_social_campaign_action_log.sql
psql "$DATABASE_URL" -f server/database/migrations/178_social_campaign_action_log_active_index.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` (or no-op via `IF NOT EXISTS`).

- [ ] **Step 2: Verify the table exists**

Run: `psql "$DATABASE_URL" -c "\d campaign_action_log"`
Expected: table prints with columns `executed_at`, `previous_value`, `new_value`, `metadata`, `external_request_id`, `error_message`, `action_status`.

- [ ] **Step 3: Smoke-test the existing plan flow (manual)**

On `/agency/social/spend`, open a row's Review → "Save as planned action" → confirm no 500 and a `planned` row appears:
`psql "$DATABASE_URL" -c "SELECT action_status, new_value FROM campaign_action_log ORDER BY created_at DESC LIMIT 3;"`
Expected: a `planned` row. (No commit — this is verification.)

---

## Task 1: Guardrail engine (pure)

**Files:**
- Create: `server/utils/budgetGuardrails.ts`
- Test: `test/server/utils/budgetGuardrails.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/budgetGuardrails.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateBudgetGuardrails, type GuardrailInput } from '~~/server/utils/budgetGuardrails'

const base: GuardrailInput = {
  currentDaily: 100,
  recommendedDaily: 110,
  platformMinimum: 5,
  maxMultiple: 3,
  monthlyBudget: 0,
  mtdSpend: 0,
  monthDaysRemaining: 15,
  monthlyMarginPct: 0.1,
  alreadyAppliedToday: false,
  override: false,
}

describe('evaluateBudgetGuardrails', () => {
  it('passes a within-limits change unchanged', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 110 })
    expect(r.blocked).toBe(false)
    expect(r.finalDaily).toBe(110)
    expect(r.clamped).toBe(false)
  })

  it('clamps an increase above +20% to +20%', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 200 })
    expect(r.finalDaily).toBe(120)
    expect(r.clamped).toBe(true)
    expect(r.clampReasons).toContain('learning_phase_+20pct')
  })

  it('clamps a decrease below -20% to -20%', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 50 })
    expect(r.finalDaily).toBe(80)
    expect(r.clampReasons).toContain('learning_phase_-20pct')
  })

  it('clamps down to the relative max-multiple cap', () => {
    // current 100, +20% step = 120, but maxMultiple 1.1 => cap 110
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 200, maxMultiple: 1.1 })
    expect(r.finalDaily).toBe(110)
    expect(r.clampReasons).toContain('max_multiple')
  })

  it('clamps down to the monthly-budget margin', () => {
    // monthly 3000, spent 2000, +10% margin => 1300 remaining over 10 days = 130/day max
    const r = evaluateBudgetGuardrails({
      ...base, currentDaily: 200, recommendedDaily: 240,
      monthlyBudget: 3000, mtdSpend: 2000, monthDaysRemaining: 10, monthlyMarginPct: 0.1,
    })
    expect(r.finalDaily).toBe(130)
    expect(r.clampReasons).toContain('monthly_margin')
  })

  it('raises up to the platform minimum', () => {
    const r = evaluateBudgetGuardrails({ ...base, currentDaily: 6, recommendedDaily: 4, platformMinimum: 5 })
    expect(r.finalDaily).toBe(5)
    expect(r.clampReasons).toContain('platform_minimum')
  })

  it('blocks when already applied today', () => {
    const r = evaluateBudgetGuardrails({ ...base, alreadyAppliedToday: true })
    expect(r.blocked).toBe(true)
    expect(r.blockReason).toBe('rate_limited_today')
  })

  it('rate-limit blocks even with override', () => {
    const r = evaluateBudgetGuardrails({ ...base, alreadyAppliedToday: true, override: true })
    expect(r.blocked).toBe(true)
  })

  it('blocks when platform minimum exceeds the cap', () => {
    // cap by multiple = 4*1 = 4, but minimum 5 => cannot satisfy both
    const r = evaluateBudgetGuardrails({ ...base, currentDaily: 4, recommendedDaily: 4, maxMultiple: 1, platformMinimum: 5 })
    expect(r.blocked).toBe(true)
    expect(r.blockReason).toBe('minimum_exceeds_cap')
  })

  it('override skips the ±20% clamp and relative cap but not the minimum', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 500, maxMultiple: 1.1, override: true })
    expect(r.finalDaily).toBe(500)
    expect(r.clamped).toBe(false)
  })

  it('rounds to 2 decimals', () => {
    const r = evaluateBudgetGuardrails({ ...base, currentDaily: 33.33, recommendedDaily: 40 })
    expect(Number.isInteger(r.finalDaily * 100)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/server/utils/budgetGuardrails.test.ts`
Expected: FAIL — cannot import `evaluateBudgetGuardrails`.

- [ ] **Step 3: Implement the engine**

```ts
// server/utils/budgetGuardrails.ts
/**
 * Pure guardrail engine for AI pacing budget changes. No I/O.
 * All budgets in major currency units (e.g. dollars/AUD). Caller converts to
 * minor units (cents) / micros for the platform API.
 */
export interface GuardrailInput {
  currentDaily: number
  recommendedDaily: number
  platformMinimum: number
  maxMultiple: number
  monthlyBudget: number      // 0 when unknown → monthly check skipped
  mtdSpend: number
  monthDaysRemaining: number // clamped to >= 1 by the caller
  monthlyMarginPct: number   // e.g. 0.1 = allow 10% over monthly budget
  alreadyAppliedToday: boolean
  override: boolean          // skips ±20% + relative caps; NOT minimum or rate-limit
}

export interface GuardrailResult {
  finalDaily: number
  clamped: boolean
  clampReasons: string[]
  blocked: boolean
  blockReason?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function evaluateBudgetGuardrails(input: GuardrailInput): GuardrailResult {
  const clampReasons: string[] = []

  // Rate limit is absolute — override does not bypass it.
  if (input.alreadyAppliedToday) {
    return { finalDaily: input.currentDaily, clamped: false, clampReasons: [], blocked: true, blockReason: 'rate_limited_today' }
  }

  let target = input.recommendedDaily

  if (!input.override) {
    // ±20% learning-phase clamp
    const maxStep = input.currentDaily * 1.2
    const minStep = input.currentDaily * 0.8
    if (target > maxStep) { target = maxStep; clampReasons.push('learning_phase_+20pct') }
    else if (target < minStep) { target = minStep; clampReasons.push('learning_phase_-20pct') }

    // Relative cap: multiple of current
    const capByMultiple = input.currentDaily * input.maxMultiple
    if (target > capByMultiple) { target = capByMultiple; clampReasons.push('max_multiple') }

    // Relative cap: monthly-budget margin
    if (input.monthlyBudget > 0) {
      const allowed = input.monthlyBudget * (1 + input.monthlyMarginPct) - input.mtdSpend
      const daysLeft = Math.max(1, input.monthDaysRemaining)
      const maxDailyByMonth = allowed / daysLeft
      if (maxDailyByMonth < target) { target = maxDailyByMonth; clampReasons.push('monthly_margin') }
    }
  }

  // Platform minimum is absolute (applies even with override).
  if (target < input.platformMinimum) {
    target = input.platformMinimum
    if (!clampReasons.includes('platform_minimum')) clampReasons.push('platform_minimum')
  }

  // Conflict: raising to the minimum breached a hard relative cap → cannot satisfy both.
  if (!input.override) {
    const capByMultiple = input.currentDaily * input.maxMultiple
    if (target > capByMultiple) {
      return { finalDaily: input.currentDaily, clamped: false, clampReasons, blocked: true, blockReason: 'minimum_exceeds_cap' }
    }
  }

  const finalDaily = round2(target)
  return {
    finalDaily,
    clamped: clampReasons.length > 0,
    clampReasons,
    blocked: false,
  }
}

/** Meta/Google daily minimum by optimization goal (account-currency major units). */
export function platformDailyMinimum(optimizationGoal: string | null | undefined): number {
  const goal = (optimizationGoal || '').toUpperCase()
  const conversionGoals = ['OFFSITE_CONVERSIONS', 'CONVERSIONS', 'LEAD_GENERATION', 'PURCHASE', 'VALUE']
  return conversionGoals.some(g => goal.includes(g)) ? 5 : 1
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/server/utils/budgetGuardrails.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/budgetGuardrails.ts test/server/utils/budgetGuardrails.test.ts
git commit -m "feat(spend): pure budget guardrail engine (clamp/cap/minimum/rate-limit)"
```

---

## Task 2: Cap defaults in budget-control config

**Files:**
- Modify: `server/utils/socialBudgetControlConfig.ts`
- Test: `test/server/utils/socialBudgetControlConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/socialBudgetControlConfig.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG, mergeBudgetControlConfig } from '~~/server/utils/socialBudgetControlConfig'

describe('budget control config caps', () => {
  it('has safe cap defaults', () => {
    expect(DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG.maxMultiple).toBe(2)
    expect(DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG.monthlyMarginPct).toBe(0.1)
  })

  it('merges stored partial config over defaults', () => {
    const merged = mergeBudgetControlConfig({ maxMultiple: 1.5 })
    expect(merged.maxMultiple).toBe(1.5)
    expect(merged.monthlyMarginPct).toBe(0.1)
    expect(merged.liveBudgetChangesEnabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/utils/socialBudgetControlConfig.test.ts`
Expected: FAIL — `mergeBudgetControlConfig` / `maxMultiple` undefined.

- [ ] **Step 3: Implement — extend the interface, defaults, and a pure merge helper**

In `server/utils/socialBudgetControlConfig.ts`, extend the interface and defaults:
```ts
export interface SocialBudgetControlConfig {
  liveBudgetChangesEnabled: boolean
  metaBudgetWritesEnabled: boolean
  googleBudgetWritesEnabled: boolean
  maxMultiple: number          // new daily <= maxMultiple * current daily
  monthlyMarginPct: number     // allowed overshoot of monthly budget
}

export const DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG: SocialBudgetControlConfig = {
  liveBudgetChangesEnabled: false,
  metaBudgetWritesEnabled: false,
  googleBudgetWritesEnabled: false,
  maxMultiple: 2,
  monthlyMarginPct: 0.1,
}

/** Pure merge of a stored partial config over defaults. */
export function mergeBudgetControlConfig(stored: Partial<SocialBudgetControlConfig> | null | undefined): SocialBudgetControlConfig {
  return { ...DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG, ...(stored ?? {}) }
}
```
Then update `getSocialBudgetControlConfig` to return `mergeBudgetControlConfig(row?.value)` instead of the inline spread.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/server/utils/socialBudgetControlConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialBudgetControlConfig.ts test/server/utils/socialBudgetControlConfig.test.ts
git commit -m "feat(spend): add relative-cap defaults to budget control config"
```

---

## Task 3: Meta budget-write helpers + CBO/ABO resolution

**Files:**
- Modify: `server/utils/metaClient.ts`
- Test: `test/server/utils/metaBudgetWrite.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/metaBudgetWrite.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...a: any[]) => ofetchMock(...a) }))

import { resolveMetaBudgetTarget } from '~~/server/utils/metaClient'

beforeEach(() => ofetchMock.mockReset())

describe('resolveMetaBudgetTarget', () => {
  it('returns campaign-level target for CBO (campaign has daily_budget)', async () => {
    ofetchMock.mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS', daily_budget: '50000' }] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('campaign')
    expect(r.targetId).toBe('c1')
  })

  it('returns single ad-set target for ABO with one active ad set', async () => {
    ofetchMock
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] }) // no campaign daily_budget
      .mockResolvedValueOnce({ data: [{ id: 'as1', name: 'AS', status: 'ACTIVE', optimization_goal: 'OFFSITE_CONVERSIONS', daily_budget: '10000' }] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('adset')
    expect(r.targetId).toBe('as1')
    expect(r.optimizationGoal).toBe('OFFSITE_CONVERSIONS')
  })

  it('flags ABO with multiple active ad sets as manual', async () => {
    ofetchMock
      .mockResolvedValueOnce({ data: [{ id: 'c1', name: 'C', status: 'ACTIVE', objective: 'OUTCOME_LEADS' }] })
      .mockResolvedValueOnce({ data: [
        { id: 'as1', name: 'A', status: 'ACTIVE', daily_budget: '10000' },
        { id: 'as2', name: 'B', status: 'ACTIVE', daily_budget: '10000' },
      ] })
    const r = await resolveMetaBudgetTarget('act_1', 'c1', 'tok')
    expect(r.level).toBe('manual')
    expect(r.adSetCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/server/utils/metaBudgetWrite.test.ts`
Expected: FAIL — `resolveMetaBudgetTarget` not exported.

- [ ] **Step 3: Implement the helpers in `metaClient.ts`**

Append:
```ts
// ============================================
// Budget Writes (pacing execution)
// ============================================

export interface MetaBudgetTarget {
  level: 'campaign' | 'adset' | 'manual'
  targetId: string | null
  optimizationGoal: string | null
  adSetCount: number
}

/**
 * Decide where a campaign-level daily-budget recommendation should be written:
 * - CBO: the campaign carries daily_budget → write the campaign.
 * - ABO single active ad set → write that ad set.
 * - ABO multiple active ad sets → 'manual' (Phase 1 does not auto-split).
 */
export async function resolveMetaBudgetTarget(
  accountId: string,
  campaignId: string,
  token: string
): Promise<MetaBudgetTarget> {
  const campaigns = await getCampaigns(accountId, token)
  const campaign = campaigns.find(c => c.id === campaignId)
  if (campaign?.daily_budget && Number(campaign.daily_budget) > 0) {
    return { level: 'campaign', targetId: campaign.id, optimizationGoal: null, adSetCount: 0 }
  }
  const adSets = await getAdSets(campaignId, token)
  const active = adSets.filter(a => (a.status || '').toUpperCase() === 'ACTIVE')
  if (active.length === 1) {
    return { level: 'adset', targetId: active[0].id, optimizationGoal: active[0].optimization_goal ?? null, adSetCount: 1 }
  }
  return { level: 'manual', targetId: null, optimizationGoal: null, adSetCount: active.length }
}

/** Write a daily budget (major units) to a Meta campaign or ad set. Returns the read-back daily (major units). */
export async function updateMetaDailyBudget(
  objectId: string,
  dailyMajor: number,
  token: string
): Promise<{ readBackDailyMajor: number }> {
  const cents = String(Math.round(dailyMajor * 100))
  await metaFetch(`${META_GRAPH_BASE}/${objectId}`, token, { daily_budget: cents }, 3, 'POST')
  const back = await metaFetch<{ daily_budget?: string }>(`${META_GRAPH_BASE}/${objectId}`, token, { fields: 'daily_budget' })
  return { readBackDailyMajor: Number(back.daily_budget || '0') / 100 }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/server/utils/metaBudgetWrite.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add a write-path test for `updateMetaDailyBudget` read-back**

Append to the test file:
```ts
import { updateMetaDailyBudget } from '~~/server/utils/metaClient'

describe('updateMetaDailyBudget', () => {
  it('POSTs cents then reads back major units', async () => {
    ofetchMock
      .mockResolvedValueOnce({ success: true })                 // POST
      .mockResolvedValueOnce({ daily_budget: '12000' })          // read-back GET
    const r = await updateMetaDailyBudget('c1', 120, 'tok')
    expect(r.readBackDailyMajor).toBe(120)
    const postCall = ofetchMock.mock.calls[0]
    expect(postCall[1].method).toBe('POST')
    expect(postCall[1].body.toString()).toContain('daily_budget=12000')
  })
})
```

- [ ] **Step 6: Run + commit**

Run: `npx vitest run test/server/utils/metaBudgetWrite.test.ts` → PASS (4 tests).
```bash
git add server/utils/metaClient.ts test/server/utils/metaBudgetWrite.test.ts
git commit -m "feat(spend): Meta daily-budget write + CBO/ABO target resolution"
```

---

## Task 4: Google budget-write helper (with MCC login-customer-id)

**Files:**
- Modify: `server/utils/googleAdsClient.ts`
- Test: `test/server/utils/googleBudgetWrite.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/googleBudgetWrite.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...a: any[]) => ofetchMock(...a) }))
import { updateGoogleCampaignDailyBudget } from '~~/server/utils/googleAdsClient'

beforeEach(() => ofetchMock.mockReset())

describe('updateGoogleCampaignDailyBudget', () => {
  it('mutates amount_micros and sends MCC header', async () => {
    ofetchMock
      .mockResolvedValueOnce([{ results: [{ campaignBudget: { resourceName: 'customers/123/campaignBudgets/9', amountMicros: '0' } }] }]) // searchStream resolve
      .mockResolvedValueOnce({ results: [{ resourceName: 'customers/123/campaignBudgets/9' }] }) // mutate
      .mockResolvedValueOnce([{ results: [{ campaignBudget: { amountMicros: '120000000' } }] }]) // read-back
    const r = await updateGoogleCampaignDailyBudget({
      customerId: '123', campaignId: '555', dailyMajor: 120,
      token: 'tok', developerToken: 'dev', loginCustomerId: '5250473322',
    })
    expect(r.readBackDailyMajor).toBe(120)
    const mutateCall = ofetchMock.mock.calls[1]
    expect(mutateCall[1].headers['login-customer-id']).toBe('5250473322')
    expect(JSON.stringify(mutateCall[1].body)).toContain('amount_micros')
    expect(JSON.stringify(mutateCall[1].body)).toContain('120000000')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/utils/googleBudgetWrite.test.ts`
Expected: FAIL — function not exported.

- [ ] **Step 3: Implement in `googleAdsClient.ts`**

```ts
/**
 * Update a Google campaign's daily budget (major units). Resolves the campaign's
 * CampaignBudget resource, mutates amount_micros, reads back. Sends the MCC
 * login-customer-id header (dashes stripped) so client accounts under a manager
 * don't 403 — the same header the spend reads require.
 */
export async function updateGoogleCampaignDailyBudget(opts: {
  customerId: string
  campaignId: string
  dailyMajor: number
  token: string
  developerToken: string
  loginCustomerId?: string
}): Promise<{ readBackDailyMajor: number }> {
  const cid = opts.customerId.replace(/-/g, '')
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${opts.token}`,
    'developer-token': opts.developerToken,
    'Content-Type': 'application/json',
  }
  if (opts.loginCustomerId) headers['login-customer-id'] = opts.loginCustomerId.replace(/-/g, '')

  // Resolve the campaign's budget resource name.
  const search = await ofetch<any[]>(`${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:searchStream`, {
    method: 'POST', headers,
    body: { query: `SELECT campaign_budget.resource_name FROM campaign WHERE campaign.id = ${opts.campaignId}` },
  })
  const resourceName: string | undefined = search?.[0]?.results?.[0]?.campaignBudget?.resourceName
  if (!resourceName) throw new Error('Google: campaign budget resource not found')

  const amountMicros = String(Math.round(opts.dailyMajor * 1_000_000))
  await ofetch(`${GOOGLE_ADS_BASE}/customers/${cid}/campaignBudgets:mutate`, {
    method: 'POST', headers,
    body: { operations: [{ updateMask: 'amount_micros', update: { resourceName, amount_micros: amountMicros } }] },
  })

  const back = await ofetch<any[]>(`${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:searchStream`, {
    method: 'POST', headers,
    body: { query: `SELECT campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${opts.campaignId}` },
  })
  const micros = back?.[0]?.results?.[0]?.campaignBudget?.amountMicros
  return { readBackDailyMajor: Number(micros || '0') / 1_000_000 }
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run test/server/utils/googleBudgetWrite.test.ts` → PASS.
```bash
git add server/utils/googleAdsClient.ts test/server/utils/googleBudgetWrite.test.ts
git commit -m "feat(spend): Google campaign daily-budget mutate with MCC header"
```

---

## Task 5: Execute endpoint

**Files:**
- Create: `server/api/agency/social/spend/[id]/actions/[actionId]/execute.post.ts`
- Test: `test/server/api/socialSpendExecuteActionEndpoint.test.ts`

The endpoint logic is extracted into a pure orchestrator `planBudgetExecution()` (testable without HTTP), plus a thin handler. Build the pure part first.

- [ ] **Step 1: Write the failing test for the pure orchestrator**

```ts
// test/server/api/socialSpendExecuteActionEndpoint.test.ts
import { describe, it, expect } from 'vitest'
import { decideExecution, type ExecutionContext } from '~~/server/utils/budgetExecution'

const ctx: ExecutionContext = {
  platform: 'meta',
  flagEnabled: true,
  currentDaily: 100,
  recommendedDaily: 200,
  platformMinimum: 5,
  maxMultiple: 2,
  monthlyBudget: 0, mtdSpend: 0, monthDaysRemaining: 15, monthlyMarginPct: 0.1,
  alreadyAppliedToday: false,
  override: false,
}

describe('decideExecution', () => {
  it('rejects when the platform flag is off', () => {
    const d = decideExecution({ ...ctx, flagEnabled: false })
    expect(d.proceed).toBe(false)
    expect(d.reason).toBe('writes_disabled')
  })
  it('clamps +100% to +20% and proceeds', () => {
    const d = decideExecution(ctx)
    expect(d.proceed).toBe(true)
    expect(d.finalDaily).toBe(120)
    expect(d.clamped).toBe(true)
  })
  it('does not proceed when blocked by rate limit', () => {
    const d = decideExecution({ ...ctx, alreadyAppliedToday: true })
    expect(d.proceed).toBe(false)
    expect(d.reason).toBe('rate_limited_today')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run test/server/api/socialSpendExecuteActionEndpoint.test.ts`
Expected: FAIL — `decideExecution` missing.

- [ ] **Step 3: Implement the pure orchestrator**

```ts
// server/utils/budgetExecution.ts
import { evaluateBudgetGuardrails } from '~~/server/utils/budgetGuardrails'

export interface ExecutionContext {
  platform: 'meta' | 'google'
  flagEnabled: boolean
  currentDaily: number
  recommendedDaily: number
  platformMinimum: number
  maxMultiple: number
  monthlyBudget: number
  mtdSpend: number
  monthDaysRemaining: number
  monthlyMarginPct: number
  alreadyAppliedToday: boolean
  override: boolean
}

export interface ExecutionDecision {
  proceed: boolean
  finalDaily: number
  clamped: boolean
  clampReasons: string[]
  reason?: string
}

export function decideExecution(ctx: ExecutionContext): ExecutionDecision {
  if (!ctx.flagEnabled) {
    return { proceed: false, finalDaily: ctx.currentDaily, clamped: false, clampReasons: [], reason: 'writes_disabled' }
  }
  const g = evaluateBudgetGuardrails({
    currentDaily: ctx.currentDaily,
    recommendedDaily: ctx.recommendedDaily,
    platformMinimum: ctx.platformMinimum,
    maxMultiple: ctx.maxMultiple,
    monthlyBudget: ctx.monthlyBudget,
    mtdSpend: ctx.mtdSpend,
    monthDaysRemaining: ctx.monthDaysRemaining,
    monthlyMarginPct: ctx.monthlyMarginPct,
    alreadyAppliedToday: ctx.alreadyAppliedToday,
    override: ctx.override,
  })
  if (g.blocked) {
    return { proceed: false, finalDaily: ctx.currentDaily, clamped: g.clamped, clampReasons: g.clampReasons, reason: g.blockReason }
  }
  return { proceed: true, finalDaily: g.finalDaily, clamped: g.clamped, clampReasons: g.clampReasons }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/server/api/socialSpendExecuteActionEndpoint.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the HTTP handler (wires DB + platform writes)**

```ts
// server/api/agency/social/spend/[id]/actions/[actionId]/execute.post.ts
import { requireRole } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSocialBudgetControlConfig } from '~~/server/utils/socialBudgetControlConfig'
import { decideExecution } from '~~/server/utils/budgetExecution'
import { platformDailyMinimum } from '~~/server/utils/budgetGuardrails'
import { resolveMetaBudgetTarget, updateMetaDailyBudget } from '~~/server/utils/metaClient'
import { updateGoogleCampaignDailyBudget } from '~~/server/utils/googleAdsClient'
import { bustCache } from '~~/server/utils/kv'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'id')
  const actionId = getRouterParam(event, 'actionId')
  if (!id || !actionId) throw createError({ statusCode: 400, statusMessage: 'id and actionId required' })

  const body = await readBody(event).catch(() => ({})) as { override?: boolean }
  const override = body?.override === true

  // Load the approved action joined to its media_spend row.
  const row = await queryOne<{
    platform: 'meta' | 'google_ads'
    connection_id: string
    campaign_id: string
    account_id: string
    metadata: any
    access_token: string
    current_daily: string
    recommended_daily: string
    budget_allocated: string
    actual_spend: string
    applied_today: boolean
  }>(
    `SELECT cal.platform,
            ms.connection_id::text,
            ms.campaign_id,
            sc.account_id,
            sc.metadata,
            sc.access_token,
            COALESCE((cal.previous_value->>'dailyBudget')::numeric, 0)::text AS current_daily,
            COALESCE((cal.new_value->>'dailyBudget')::numeric, 0)::text       AS recommended_daily,
            COALESCE(ms.budget_allocated, 0)::text AS budget_allocated,
            COALESCE(ms.actual_spend, 0)::text     AS actual_spend,
            EXISTS (
              SELECT 1 FROM campaign_action_log x
              WHERE x.media_spend_id = cal.media_spend_id
                AND x.action_status = 'applied'
                AND x.executed_at::date = NOW()::date
            ) AS applied_today
     FROM campaign_action_log cal
     JOIN media_spend ms ON ms.id = cal.media_spend_id
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE cal.id = $2 AND cal.media_spend_id = $1 AND cal.action_status = 'approved'`,
    [id, actionId]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Approved action not found' })

  const platform = row.platform === 'google_ads' ? 'google' : 'meta'
  const tenantId = await getSelectedTenant(event)
  const cfg = await getSocialBudgetControlConfig(tenantId || '')
  const flagEnabled = platform === 'meta' ? cfg.metaBudgetWritesEnabled : cfg.googleBudgetWritesEnabled

  const now = new Date()
  const monthDaysRemaining = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1)

  // For Meta, resolve CBO/ABO BEFORE deciding (need optimization goal + manual gate).
  let metaTarget: Awaited<ReturnType<typeof resolveMetaBudgetTarget>> | null = null
  let platformMinimum = 5
  if (platform === 'meta') {
    metaTarget = await resolveMetaBudgetTarget(`act_${row.account_id}`, row.campaign_id, row.access_token)
    if (metaTarget.level === 'manual') {
      await execute(
        `UPDATE campaign_action_log SET action_status='skipped', metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$1`,
        [actionId, JSON.stringify({ reason: 'abo_multi_adset_manual', adSetCount: metaTarget.adSetCount })]
      )
      return { status: 'skipped', reason: 'abo_multi_adset_manual', adSetCount: metaTarget.adSetCount }
    }
    platformMinimum = platformDailyMinimum(metaTarget.optimizationGoal)
  }

  const decision = decideExecution({
    platform, flagEnabled,
    currentDaily: Number(row.current_daily),
    recommendedDaily: Number(row.recommended_daily),
    platformMinimum,
    maxMultiple: cfg.maxMultiple,
    monthlyBudget: Number(row.budget_allocated),
    mtdSpend: Number(row.actual_spend),
    monthDaysRemaining,
    monthlyMarginPct: cfg.monthlyMarginPct,
    alreadyAppliedToday: row.applied_today,
    override,
  })

  if (!decision.proceed) {
    return { status: 'blocked', reason: decision.reason, clampReasons: decision.clampReasons }
  }

  // Apply to the platform with read-back verification.
  try {
    let readBack: number
    if (platform === 'meta') {
      const res = await updateMetaDailyBudget(metaTarget!.targetId!, decision.finalDaily, row.access_token)
      readBack = res.readBackDailyMajor
    } else {
      const config = useRuntimeConfig()
      const res = await updateGoogleCampaignDailyBudget({
        customerId: row.account_id, campaignId: row.campaign_id, dailyMajor: decision.finalDaily,
        token: row.access_token, developerToken: config.googleDeveloperToken as string,
        loginCustomerId: (config.googleAdsLoginCustomerId as string) || undefined,
      })
      readBack = res.readBackDailyMajor
    }

    const verified = Math.abs(readBack - decision.finalDaily) < 0.01
    await execute(
      `UPDATE campaign_action_log
         SET action_status = $2, executed_at = NOW(),
             new_value = COALESCE(new_value,'{}'::jsonb) || $3::jsonb,
             error_message = $4,
             metadata = COALESCE(metadata,'{}'::jsonb) || $5::jsonb
       WHERE id = $1`,
      [
        actionId,
        verified ? 'applied' : 'failed',
        JSON.stringify({ appliedDailyBudget: decision.finalDaily, readBackDailyBudget: readBack }),
        verified ? null : `Read-back mismatch: expected ${decision.finalDaily}, got ${readBack}`,
        JSON.stringify({ clamped: decision.clamped, clampReasons: decision.clampReasons, override, appliedBy: user.id }),
      ]
    )

    if (verified && tenantId) {
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await bustCache(event, [
        `spend:summary:${tenantId}:${period}:all`,
        `spend:summary:${tenantId}:${period}:${platform}`,
      ])
    }
    return verified
      ? { status: 'applied', appliedDailyBudget: decision.finalDaily, clamped: decision.clamped, clampReasons: decision.clampReasons }
      : { status: 'failed', reason: 'read_back_mismatch', readBack }
  } catch (err: any) {
    await execute(
      `UPDATE campaign_action_log SET action_status='failed', executed_at=NOW(), error_message=$2 WHERE id=$1`,
      [actionId, (err?.data?.error?.message || err?.message || 'Platform write failed').slice(0, 1000)]
    )
    return { status: 'failed', reason: 'platform_error', message: err?.message || 'Platform write failed' }
  }
})
```

> **Note for the engineer:** confirm `bustCache(event, keys[])` exists in `server/utils/kv.ts`; if the helper is named differently (e.g. `invalidateCache`), use that. If no array helper exists, delete keys via the KV binding directly. Confirm `execute()` is exported from `server/utils/db.ts` (it is used by `recordSyncJobAccountResult`).

- [ ] **Step 6: Run the endpoint's pure tests + the full guardrail suite**

Run: `npx vitest run test/server/api/socialSpendExecuteActionEndpoint.test.ts test/server/utils/budgetGuardrails.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/utils/budgetExecution.ts server/api/agency/social/spend/'[id]'/actions/'[actionId]'/execute.post.ts test/server/api/socialSpendExecuteActionEndpoint.test.ts
git commit -m "feat(spend): admin-gated execute endpoint applies pacing budget to Meta/Google"
```

---

## Task 6: UI — "Apply" button + guardrail preview in the Review slideover

**Files:**
- Modify: `app/components/social/SpendCampaignHistorySlideover.vue`

- [ ] **Step 1: Add an Apply control on approved actions (admin/owner only)**

In the "Platform actions" section, for an action with `actionStatus === 'approved'`, render (alongside existing controls):
```vue
<UButton
  v-if="canApplyLive && item.actionStatus === 'approved'"
  size="xs"
  color="warning"
  icon="i-lucide-zap"
  :loading="applyingId === item.id"
  @click="applyAction(item)"
>
  Apply to {{ item.platform === 'google' ? 'Google' : 'Meta' }}
</UButton>
<UBadge v-else-if="item.actionStatus === 'skipped'" color="neutral" variant="subtle" size="xs">
  Manual (ABO — multiple ad sets)
</UBadge>
```

- [ ] **Step 2: Add the script logic**

In `<script setup>`:
```ts
const toast = useToast()
const applyingId = ref<string | null>(null)
const { user } = useAuth() // existing auth composable; adjust to project's accessor
const canApplyLive = computed(() => ['owner', 'admin'].includes((user.value as any)?.role))

async function applyAction(item: { id: string; mediaSpendId: string; platform: string }) {
  applyingId.value = item.id
  try {
    const res: any = await $fetch(`/api/agency/social/spend/${item.mediaSpendId}/actions/${item.id}/execute`, { method: 'POST' })
    if (res.status === 'applied') {
      toast.add({ title: `Applied $${res.appliedDailyBudget}/day`, description: res.clamped ? `Clamped: ${res.clampReasons.join(', ')}` : 'Live budget updated', color: 'success' })
    } else if (res.status === 'blocked') {
      toast.add({ title: 'Blocked by guardrail', description: res.reason, color: 'warning' })
    } else if (res.status === 'skipped') {
      toast.add({ title: 'Manual change needed', description: `ABO campaign with ${res.adSetCount} ad sets`, color: 'info' })
    } else {
      toast.add({ title: 'Apply failed', description: res.message || res.reason, color: 'error' })
    }
    emit('refresh') // re-fetch actions list; use the component's existing refresh mechanism
  } catch (e: any) {
    toast.add({ title: 'Apply failed', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    applyingId.value = null
  }
}
```

> **Note for the engineer:** match the component's existing auth accessor and actions-refresh mechanism (it already fetches actions for the slideover — reuse that fetch instead of a new `emit('refresh')` if one exists). Show `new_value.appliedDailyBudget` / `metadata.clampReasons` on `applied`/`failed` rows in the existing Platform-actions list so history reflects outcomes.

- [ ] **Step 3: Manual verification (dev)**

Run: `pnpm dev`, open a row's Review, confirm the Apply button shows only for admin/owner on an approved action, and that a non-armed platform returns a "blocked: writes_disabled" toast.

- [ ] **Step 4: Commit**

```bash
git add app/components/social/SpendCampaignHistorySlideover.vue
git commit -m "feat(spend): admin Apply button + guardrail feedback in pacing Review slideover"
```

---

## Task 7: Full suite + rollout guard

- [ ] **Step 1: Run the whole spend/social + new test suites**

Run: `npx vitest run test/server/utils/budgetGuardrails.test.ts test/server/utils/socialBudgetControlConfig.test.ts test/server/utils/metaBudgetWrite.test.ts test/server/utils/googleBudgetWrite.test.ts test/server/api/socialSpendExecuteActionEndpoint.test.ts`
Expected: all PASS.

- [ ] **Step 2: Confirm flags default off**

Verify `DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG` has `metaBudgetWritesEnabled: false` and `googleBudgetWritesEnabled: false`. The execute endpoint returns `blocked: writes_disabled` until an admin arms them in Settings.

- [ ] **Step 3: Commit any fixes, then stop for review before enabling in prod**

Do NOT flip the platform flags in prod as part of this plan. Rollout (per spec): apply on 1–2 real CBO campaigns with small deltas, confirm read-back, then broaden. Phase 1.5 = multi-ad-set ABO proportional split.

---

## Self-Review

**Spec coverage:** two-step approve→Apply (Task 5/6) ✓; admin/owner-only Apply (`requireRole` Task 5) ✓; Meta + Google writes (Tasks 3/4) ✓; CBO + single-ad-set ABO, multi-ABO→skipped (Task 3/5) ✓; clamp ±20% + relative cap + minimum + 1/day + override (Task 1) ✓; relative cap config (Task 2) ✓; synchronous execute + read-back (Task 5) ✓; fail-loud (Task 5 catch + read-back mismatch) ✓; audit via existing columns (Task 5 UPDATEs) ✓; flag-gated off by default (Task 2/7) ✓; migration prerequisite (Task 0) ✓; Google MCC header (Task 4) ✓.

**Placeholder scan:** two explicit "Note for the engineer" callouts (bustCache name, auth accessor / refresh mechanism) are verification pointers, not missing logic — acceptable. No TBD/TODO in code steps.

**Type consistency:** `evaluateBudgetGuardrails`/`GuardrailInput`/`GuardrailResult` (Task 1) reused by `decideExecution`/`ExecutionContext` (Task 5); `resolveMetaBudgetTarget`/`updateMetaDailyBudget` (Task 3) and `updateGoogleCampaignDailyBudget` (Task 4) called with matching args in Task 5; `mergeBudgetControlConfig`/`maxMultiple`/`monthlyMarginPct` (Task 2) consumed in Task 5. Consistent.

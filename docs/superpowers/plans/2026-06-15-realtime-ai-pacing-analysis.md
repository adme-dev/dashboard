# Real-time AI Pacing Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-campaign "Analyze with AI" button to the spend Review slideover that produces a real-time AI-proposed daily budget + rationale shown side-by-side with the deterministic pacing number; the human picks one and approves it, feeding the existing audited approve→Apply chain.

**Architecture:** A pure prompt-builder + tolerant response-parser + response-assembler unit (no I/O, fully unit-tested); a thin endpoint that loads the campaign's authoritative pacing data, calls Groq, and assembles the response (fail-safe to deterministic-only on AI error); a comparison card in the slideover whose "Approve this adjustment" reuses the existing `plan`+`approve` endpoints; the already-shipped admin-only "Apply to Meta/Google" remains the live-write gate. Optional single-campaign live refresh is a separate, deferrable task.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`queryOne`), `groqClient.generateGroqInsight`, existing `buildPacingReview`/`computeCampaignBudgetPacing`, Vitest + happy-dom, Nuxt UI v4.

**Spec:** `docs/superpowers/specs/2026-06-15-realtime-ai-pacing-analysis-design.md`

---

## File Structure

- `server/utils/spendAiAnalysis.ts` — **new**, pure: types + `buildAnalysisPrompt` + `parseAnalysisResult` + `buildAnalysisResponse`. No I/O.
- `test/server/utils/spendAiAnalysis.test.ts` — **new**, exhaustive unit tests.
- `server/api/agency/social/spend/[id]/ai-analysis.post.ts` — **new**, thin handler (DB load + Groq + assemble).
- `app/components/social/SpendCampaignHistorySlideover.vue` — **modify**, Analyze button + comparison card + approve-adjustment wiring.
- `server/utils/spendCampaignRefresh.ts` — **new (Task 5, deferrable)**, single-campaign live refetch.

---

## Task 1: Pure analysis unit — prompt + tolerant parser

**Files:**
- Create: `server/utils/spendAiAnalysis.ts`
- Test: `test/server/utils/spendAiAnalysis.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/spendAiAnalysis.test.ts
import { describe, it, expect } from 'vitest'
import { buildAnalysisPrompt, parseAnalysisResult, type AiAnalysisInput } from '~~/server/utils/spendAiAnalysis'

const input: AiAnalysisInput = {
  campaignName: 'Spring Leads',
  platform: 'meta',
  issueType: 'overpacing',
  monthlyBudget: 3000,
  mtdSpend: 2200,
  currentDailyBudget: 110,
  deterministicDailyBudget: 80,
  pacingRatio: 1.4,
  projectedMonthEnd: 4100,
  daysRemaining: 10,
  performance: { impressions: 50000, clicks: 900, conversions: 30, ctr: 1.8, cpc: 2.4, costPerConversion: 73 },
}

describe('buildAnalysisPrompt', () => {
  it('includes the campaign name, key metrics and the deterministic baseline', () => {
    const p = buildAnalysisPrompt(input)
    expect(p).toContain('Spring Leads')
    expect(p).toContain('3000')        // monthly budget
    expect(p).toContain('2200')        // mtd spend
    expect(p).toContain('80')          // deterministic daily
    expect(p).toMatch(/proposedDailyBudget/)  // asks for the JSON field
  })
})

describe('parseAnalysisResult', () => {
  const baseline = { currentDailyBudget: 110 }

  it('parses a well-formed JSON object', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 95, "rationale": "Trim to land on budget", "confidence": "high", "riskFlags": ["learning_phase"]}', baseline)
    expect(r.ok).toBe(true)
    expect(r.proposedDailyBudget).toBe(95)
    expect(r.rationale).toBe('Trim to land on budget')
    expect(r.confidence).toBe('high')
    expect(r.riskFlags).toEqual(['learning_phase'])
  })

  it('strips ```json fences', () => {
    const r = parseAnalysisResult('```json\n{"proposedDailyBudget": 90, "rationale": "x", "confidence": "medium"}\n```', baseline)
    expect(r.ok).toBe(true)
    expect(r.proposedDailyBudget).toBe(90)
  })

  it('extracts the JSON object from surrounding prose', () => {
    const r = parseAnalysisResult('Here is my analysis: {"proposedDailyBudget": 85, "rationale": "y", "confidence": "low"} hope that helps', baseline)
    expect(r.ok).toBe(true)
    expect(r.proposedDailyBudget).toBe(85)
  })

  it('fails safe on empty input', () => {
    expect(parseAnalysisResult('', baseline).ok).toBe(false)
  })

  it('fails safe on unparseable input', () => {
    expect(parseAnalysisResult('the budget should be lower', baseline).ok).toBe(false)
  })

  it('fails safe when proposedDailyBudget is missing', () => {
    expect(parseAnalysisResult('{"rationale": "no number"}', baseline).ok).toBe(false)
  })

  it('fails safe on a negative number', () => {
    expect(parseAnalysisResult('{"proposedDailyBudget": -5, "rationale": "x"}', baseline).ok).toBe(false)
  })

  it('clamps an absurd number to 10x current (defense-in-depth)', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 999999, "rationale": "x", "confidence": "high"}', baseline)
    expect(r.proposedDailyBudget).toBe(1100) // 110 * 10
  })

  it('defaults an invalid confidence to medium', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 90, "rationale": "x", "confidence": "banana"}', baseline)
    expect(r.confidence).toBe('medium')
  })

  it('coerces non-array riskFlags to an empty array', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 90, "rationale": "x", "riskFlags": "nope"}', baseline)
    expect(r.riskFlags).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/server/utils/spendAiAnalysis.test.ts`
Expected: FAIL — cannot import from `spendAiAnalysis`.

- [ ] **Step 3: Implement the pure unit**

```ts
// server/utils/spendAiAnalysis.ts
export type AiConfidence = 'low' | 'medium' | 'high'

export interface AiAnalysisInput {
  campaignName: string
  platform: 'meta' | 'google'
  issueType: string
  monthlyBudget: number
  mtdSpend: number
  currentDailyBudget: number
  deterministicDailyBudget: number
  pacingRatio: number
  projectedMonthEnd: number
  daysRemaining: number
  performance: {
    impressions: number
    clicks: number
    conversions: number
    ctr: number | null
    cpc: number | null
    costPerConversion: number | null
  }
}

export interface AiAnalysisResult {
  ok: boolean
  proposedDailyBudget: number | null
  rationale: string
  confidence: AiConfidence
  riskFlags: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildAnalysisPrompt(input: AiAnalysisInput): string {
  const p = input.performance
  return [
    `You are reviewing one ${input.platform.toUpperCase()} advertising campaign for monthly budget pacing.`,
    `Campaign: ${input.campaignName}`,
    `Detected issue: ${input.issueType}`,
    `Monthly budget: ${input.monthlyBudget}`,
    `Month-to-date spend: ${input.mtdSpend}`,
    `Current daily budget: ${input.currentDailyBudget}`,
    `Days remaining in month: ${input.daysRemaining}`,
    `Pacing ratio (spend pace / time pace): ${input.pacingRatio}`,
    `Projected month-end spend at current pace: ${input.projectedMonthEnd}`,
    `Deterministic recommended daily budget (rule-based baseline): ${input.deterministicDailyBudget}`,
    `Performance — impressions: ${p.impressions}, clicks: ${p.clicks}, conversions: ${p.conversions}, CTR: ${p.ctr ?? 'n/a'}, CPC: ${p.cpc ?? 'n/a'}, cost/conversion: ${p.costPerConversion ?? 'n/a'}`,
    '',
    `Recommend a new daily budget that lands the campaign on its monthly budget while respecting performance.`,
    `Respond ONLY with a JSON object of the form:`,
    `{"proposedDailyBudget": number, "rationale": string, "confidence": "low"|"medium"|"high", "riskFlags": string[]}`,
  ].join('\n')
}

export function parseAnalysisResult(raw: string, baseline: { currentDailyBudget: number }): AiAnalysisResult {
  const fail: AiAnalysisResult = { ok: false, proposedDailyBudget: null, rationale: '', confidence: 'low', riskFlags: [] }
  if (!raw || typeof raw !== 'string') return fail

  let jsonText = raw.trim()
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonText = fence[1].trim()
  const brace = jsonText.match(/\{[\s\S]*\}/)
  if (brace) jsonText = brace[0]

  let parsed: any
  try { parsed = JSON.parse(jsonText) } catch { return fail }
  if (!parsed || typeof parsed !== 'object') return fail

  const num = Number(parsed.proposedDailyBudget ?? parsed.proposed_daily_budget)
  if (!Number.isFinite(num) || num < 0) return fail

  // Defense-in-depth ceiling — the real ±20%/cap guardrails run at Apply time.
  const ceiling = Math.max(1, baseline.currentDailyBudget) * 10
  const proposedDailyBudget = round2(Math.min(num, ceiling))

  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 2000) : ''
  const confRaw = String(parsed.confidence ?? '').toLowerCase()
  const confidence: AiConfidence = (confRaw === 'high' || confRaw === 'low' || confRaw === 'medium') ? confRaw : 'medium'
  const flagsRaw = parsed.riskFlags ?? parsed.risk_flags
  const riskFlags = Array.isArray(flagsRaw) ? flagsRaw.filter((x: any) => typeof x === 'string').slice(0, 10) : []

  return { ok: true, proposedDailyBudget, rationale, confidence, riskFlags }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/server/utils/spendAiAnalysis.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/spendAiAnalysis.ts test/server/utils/spendAiAnalysis.test.ts
git commit -m "feat(spend): pure AI pacing analysis prompt + tolerant parser"
```

---

## Task 2: Pure response assembler

**Files:**
- Modify: `server/utils/spendAiAnalysis.ts`
- Test: `test/server/utils/spendAiAnalysis.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `test/server/utils/spendAiAnalysis.test.ts`:
```ts
import { buildAnalysisResponse } from '~~/server/utils/spendAiAnalysis'

describe('buildAnalysisResponse', () => {
  const okAi = { ok: true, proposedDailyBudget: 95, rationale: 'r', confidence: 'high' as const, riskFlags: ['x'] }
  const failAi = { ok: false, proposedDailyBudget: null, rationale: '', confidence: 'low' as const, riskFlags: [] }

  it('includes the AI block when the result is ok', () => {
    const res = buildAnalysisResponse({ deterministicDaily: 80, deterministicAction: 'Trim spend', ai: okAi, syncedAt: '2026-06-15T03:00:00Z', refreshed: false, modelId: 'm1' })
    expect(res.deterministic).toEqual({ dailyBudget: 80, action: 'Trim spend' })
    expect(res.ai).toEqual({ proposedDailyBudget: 95, rationale: 'r', confidence: 'high', riskFlags: ['x'] })
    expect(res.dataFreshness).toEqual({ syncedAt: '2026-06-15T03:00:00Z', refreshed: false })
    expect(res.modelId).toBe('m1')
  })

  it('nulls the AI block when the result failed', () => {
    const res = buildAnalysisResponse({ deterministicDaily: 80, deterministicAction: 'a', ai: failAi, syncedAt: null, refreshed: false, modelId: 'm1' })
    expect(res.ai).toBe(null)
  })

  it('includes refreshError only when present', () => {
    const withErr = buildAnalysisResponse({ deterministicDaily: 80, deterministicAction: 'a', ai: okAi, syncedAt: null, refreshed: false, refreshError: 'boom', modelId: 'm1' })
    expect(withErr.dataFreshness.refreshError).toBe('boom')
    const without = buildAnalysisResponse({ deterministicDaily: 80, deterministicAction: 'a', ai: okAi, syncedAt: null, refreshed: true, modelId: 'm1' })
    expect('refreshError' in without.dataFreshness).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run test/server/utils/spendAiAnalysis.test.ts`
Expected: FAIL — `buildAnalysisResponse` not exported.

- [ ] **Step 3: Implement**

Append to `server/utils/spendAiAnalysis.ts`:
```ts
export interface AnalysisResponse {
  deterministic: { dailyBudget: number, action: string }
  ai: { proposedDailyBudget: number, rationale: string, confidence: AiConfidence, riskFlags: string[] } | null
  dataFreshness: { syncedAt: string | null, refreshed: boolean, refreshError?: string }
  modelId: string
}

export function buildAnalysisResponse(args: {
  deterministicDaily: number
  deterministicAction: string
  ai: AiAnalysisResult
  syncedAt: string | null
  refreshed: boolean
  refreshError?: string
  modelId: string
}): AnalysisResponse {
  const ai = args.ai.ok && args.ai.proposedDailyBudget != null
    ? { proposedDailyBudget: args.ai.proposedDailyBudget, rationale: args.ai.rationale, confidence: args.ai.confidence, riskFlags: args.ai.riskFlags }
    : null
  const dataFreshness: AnalysisResponse['dataFreshness'] = { syncedAt: args.syncedAt, refreshed: args.refreshed }
  if (args.refreshError) dataFreshness.refreshError = args.refreshError
  return {
    deterministic: { dailyBudget: args.deterministicDaily, action: args.deterministicAction },
    ai,
    dataFreshness,
    modelId: args.modelId,
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/server/utils/spendAiAnalysis.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/spendAiAnalysis.ts test/server/utils/spendAiAnalysis.test.ts
git commit -m "feat(spend): assemble AI pacing analysis response (fail-safe to deterministic)"
```

---

## Task 3: Analysis endpoint (synced data)

**Files:**
- Create: `server/api/agency/social/spend/[id]/ai-analysis.post.ts`

This handler is thin I/O glue over the Task 1/2 pure functions; following the repo convention for `plan.post.ts`/`approve.post.ts` it has no unit test — it is verified manually in Step 3. All branching logic lives in the tested pure functions.

- [ ] **Step 1: Implement the handler**

```ts
// server/api/agency/social/spend/[id]/ai-analysis.post.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { buildPacingReview, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { buildAnalysisPrompt, parseAnalysisResult, buildAnalysisResponse, type AiAnalysisResult } from '~~/server/utils/spendAiAnalysis'

export default eventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  // Reuse the EXACT SELECT (all PacingReviewRow columns + ms.synced_at) from
  // server/api/agency/social/spend/pacing-review.get.ts, adding `WHERE ms.id = $1`
  // and dropping any status/at-risk filter so a single row always loads.
  const row = await queryOne<PacingReviewRow & { synced_at: string | null }>(
    `SELECT ms.id::text AS media_spend_id,
            COALESCE(ac.name, ms.campaign_name) AS client_name,
            ms.platform, ms.campaign_id, ms.campaign_name, ms.campaign_status,
            ms.budget_allocated, ms.actual_spend, ms.impressions, ms.clicks, ms.conversions,
            ms.reach, ms.frequency, ms.impression_share, ms.lost_impression_share_budget,
            ms.lost_impression_share_rank, ms.bid_strategy, ms.budget_type, ms.period,
            ms.synced_at, ms.end_date
       FROM media_spend ms
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
      WHERE ms.id = $1`,
    [id]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })

  const now = new Date()
  const review = buildPacingReview([row], { now, period: row.period })
  const item = review.items[0]
  if (!item) throw createError({ statusCode: 422, statusMessage: 'Campaign is not currently flagged for pacing review' })

  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = Math.max(1, lastDay - now.getDate() + 1)

  const prompt = buildAnalysisPrompt({
    campaignName: item.campaignName,
    platform: item.platform,
    issueType: item.issueType,
    monthlyBudget: item.budget,
    mtdSpend: item.mtdSpend,
    currentDailyBudget: item.currentDailyBudget,
    deterministicDailyBudget: item.recommendedDailyBudget,
    pacingRatio: item.pacingRatio,
    projectedMonthEnd: item.projectedMonthEnd,
    daysRemaining,
    performance: {
      impressions: item.performance.impressions,
      clicks: item.performance.clicks,
      conversions: item.performance.conversions,
      ctr: item.performance.ctr,
      cpc: item.performance.cpc,
      costPerConversion: item.performance.costPerConversion,
    },
  })

  const modelId = GROQ_MODELS.LLAMA_70B
  let aiResult: AiAnalysisResult = { ok: false, proposedDailyBudget: null, rationale: '', confidence: 'low', riskFlags: [] }
  try {
    const raw = await generateGroqInsight(prompt, {
      model: modelId,
      temperature: 0.2,
      maxTokens: 800,
      systemPrompt: 'You are a senior paid-media strategist. Respond ONLY with valid JSON and no prose.',
    })
    aiResult = parseAnalysisResult(raw, { currentDailyBudget: item.currentDailyBudget })
  } catch (err: any) {
    console.warn('[ai-analysis] groq failed:', err?.message || err)
  }

  return buildAnalysisResponse({
    deterministicDaily: item.recommendedDailyBudget,
    deterministicAction: item.recommendedAction,
    ai: aiResult,
    syncedAt: row.synced_at,
    refreshed: false,
    modelId,
  })
})
```

> **Note for the engineer:** open `server/api/agency/social/spend/pacing-review.get.ts` and confirm the column list / table aliases in its `queryRows<PacingReviewRow>(...)` SELECT match the ones above (the join alias for the client name and the exact `media_spend` columns). If that file selects a column differently, copy its version verbatim and just add `WHERE ms.id = $1`. Also confirm `PacingReviewItem` exposes `budget`, `mtdSpend`, `currentDailyBudget`, `recommendedDailyBudget`, `pacingRatio`, `projectedMonthEnd`, `performance.{impressions,clicks,conversions,ctr,cpc,costPerConversion}`, `campaignName`, `platform`, `issueType`, `recommendedAction` (it does per `server/utils/socialSpendPacingReview.ts` and the slideover's `PacingReviewItem` interface).

- [ ] **Step 2: Verify it type-checks / imports resolve**

Run: `npx vitest run test/server/utils/spendAiAnalysis.test.ts` (ensures the imported pure module is intact)
Expected: PASS (14 tests). The handler relies on Nitro auto-imports (`eventHandler`, `getRouterParam`, `createError`), same as the sibling `plan.post.ts`.

- [ ] **Step 3: Manual verification (dev)**

Run `pnpm dev`. As a logged-in media/admin user, open `/agency/social/spend`, then in a browser console:
`await $fetch('/api/agency/social/spend/<a-real-media_spend_id>/ai-analysis', { method: 'POST' })`
Expected: an object with `deterministic.dailyBudget` (number), `ai` (object or `null`), `dataFreshness.syncedAt`, `modelId`. With a valid Groq key, `ai` is populated; if Groq is unconfigured/errors, `ai` is `null` and the call still returns 200.

- [ ] **Step 4: Commit**

```bash
git add "server/api/agency/social/spend/[id]/ai-analysis.post.ts"
git commit -m "feat(spend): per-campaign AI pacing analysis endpoint (synced data, fail-safe)"
```

---

## Task 4: Slideover — Analyze button, comparison card, approve-adjustment

**Files:**
- Modify: `server/api/agency/social/spend/[id]/actions/plan.post.ts`
- Modify: `app/components/social/SpendCampaignHistorySlideover.vue`

- [ ] **Step 1: Persist AI provenance in the planned action's metadata**

`plan.post.ts` builds an explicit `metadata` object and hardcodes `source: 'ai_pacing_review'` (which the dedupe query and the `idx_campaign_action_log_active_ai_pacing_budget` index both key on — do NOT change `source`). Extend that metadata object to also carry AI provenance when present. In `server/api/agency/social/spend/[id]/actions/plan.post.ts`, change the `metadata` object in the `recordCampaignAction({ ... })` call from:
```ts
    metadata: {
      source: 'ai_pacing_review',
      issueType: typeof body?.issueType === 'string' ? body.issueType : null,
      pacingRatio: numberOrNull(body?.pacingRatio),
      projectedMonthEnd: numberOrNull(body?.projectedMonthEnd),
      monthlyBudget: numberOrNull(body?.budget),
      campaignName: spend.campaign_name,
    },
```
to:
```ts
    metadata: {
      source: 'ai_pacing_review',
      issueType: typeof body?.issueType === 'string' ? body.issueType : null,
      pacingRatio: numberOrNull(body?.pacingRatio),
      projectedMonthEnd: numberOrNull(body?.projectedMonthEnd),
      monthlyBudget: numberOrNull(body?.budget),
      campaignName: spend.campaign_name,
      ...(typeof body?.chosenSource === 'string'
        ? {
            aiAnalysis: {
              chosenSource: body.chosenSource,
              aiProposedDaily: numberOrNull(body?.aiProposedDaily),
              deterministicDaily: numberOrNull(body?.deterministicDaily),
              confidence: typeof body?.confidence === 'string' ? body.confidence : null,
              riskFlags: Array.isArray(body?.riskFlags) ? body.riskFlags.filter((x: unknown) => typeof x === 'string') : [],
              modelId: typeof body?.modelId === 'string' ? body.modelId : null,
            },
          }
        : {}),
    },
```
This is additive: existing manual-plan callers (which send no `chosenSource`) get exactly the same metadata as before.

- [ ] **Step 2: Add script state + actions**

In `<script setup>`, after the existing `applyApprovedAction` function, add:
```ts
interface AiAnalysisResponse {
  deterministic: { dailyBudget: number, action: string }
  ai: { proposedDailyBudget: number, rationale: string, confidence: 'low' | 'medium' | 'high', riskFlags: string[] } | null
  dataFreshness: { syncedAt: string | null, refreshed: boolean, refreshError?: string }
  modelId: string
}

const analyzing = ref(false)
const aiAnalysis = ref<AiAnalysisResponse | null>(null)
const chosenSource = ref<'ai' | 'deterministic'>('ai')
const approvingAdjustment = ref(false)

const chosenDailyBudget = computed(() => {
  if (!aiAnalysis.value) return props.item?.recommendedDailyBudget ?? 0
  if (chosenSource.value === 'ai' && aiAnalysis.value.ai) return aiAnalysis.value.ai.proposedDailyBudget
  return aiAnalysis.value.deterministic.dailyBudget
})

function freshnessLabel(syncedAt: string | null) {
  if (!syncedAt) return 'no sync timestamp'
  return `synced ${formatBudgetHistoryTime(syncedAt)}`
}

async function analyzeWithAi() {
  if (!props.item || analyzing.value) return
  analyzing.value = true
  try {
    const res = await $fetch<AiAnalysisResponse>(`/api/agency/social/spend/${props.item.mediaSpendId}/ai-analysis`, {
      method: 'POST',
      body: {},
    })
    aiAnalysis.value = res
    chosenSource.value = res.ai ? 'ai' : 'deterministic'
    if (!res.ai) {
      toast.add({ title: 'AI analysis unavailable', description: 'Showing the deterministic recommendation only.', color: 'warning' })
    }
  } catch (e: any) {
    toast.add({ title: 'Analysis failed', description: e.data?.statusMessage || e.message || 'Could not analyze this campaign', color: 'error' })
  } finally {
    analyzing.value = false
  }
}

async function approveAdjustment() {
  if (!props.item || approvingAdjustment.value || !aiAnalysis.value) return
  approvingAdjustment.value = true
  try {
    const chosen = chosenDailyBudget.value
    const plan = await $fetch<{ action: { id: string, actionStatus: string } }>(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/plan`, {
      method: 'POST',
      body: {
        currentDailyBudget: props.item.currentDailyBudget,
        recommendedDailyBudget: chosen,
        reason: aiAnalysis.value.ai?.rationale || props.item.recommendedAction,
        issueType: props.item.issueType,
        pacingRatio: props.item.pacingRatio,
        projectedMonthEnd: props.item.projectedMonthEnd,
        budget: props.item.budget,
        aiProposedDaily: aiAnalysis.value.ai?.proposedDailyBudget ?? null,
        deterministicDaily: aiAnalysis.value.deterministic.dailyBudget,
        chosenSource: chosenSource.value,
        confidence: aiAnalysis.value.ai?.confidence ?? null,
        riskFlags: aiAnalysis.value.ai?.riskFlags ?? [],
        modelId: aiAnalysis.value.modelId,
      },
    })
    if (plan?.action?.id && plan.action.actionStatus === 'planned') {
      await $fetch(`/api/agency/social/spend/${props.item.mediaSpendId}/actions/${plan.action.id}/approve`, { method: 'POST' })
    }
    toast.add({ title: 'Adjustment approved', description: 'Ready for an admin to apply to the platform.', color: 'success' })
    aiAnalysis.value = null
    await loadHistory(props.item.mediaSpendId, true)
  } catch (e: any) {
    toast.add({ title: 'Could not approve adjustment', description: e.data?.statusMessage || e.message || 'The adjustment was not recorded', color: 'error' })
  } finally {
    approvingAdjustment.value = false
  }
}

function confidenceColor(c: 'low' | 'medium' | 'high') {
  return c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'neutral'
}
```

> **Note for the engineer:** Step 1 (above) already extended `plan.post.ts`'s metadata to persist `aiAnalysis` from these body fields, keyed on `chosenSource` being present. `plan.post.ts` accepts `currentDailyBudget`/`recommendedDailyBudget`/`reason`/`issueType`/`pacingRatio`/`projectedMonthEnd`/`budget` and uses `reason` as the action's rationale (so the AI rationale rides in `reason`). The `plan` response shape is `{ planned, action }` / `{ existing, action }` where `action` has `id` + `actionStatus`. If the recommendation was already planned, `actionStatus` may already be `approved` — the `approve` call is guarded by `actionStatus === 'planned'`, so a re-approve is skipped harmlessly.

- [ ] **Step 3: Add the comparison card to the template**

In the **Current recommendation** `<section>` (the one with "Save as planned action"), add — after the existing `<p class="text-sm text-default">{{ item.recommendedAction }}</p>` line — the Analyze control and result card:
```vue
          <div class="mt-3">
            <UButton
              size="xs"
              variant="soft"
              color="primary"
              icon="i-lucide-sparkles"
              :loading="analyzing"
              @click="analyzeWithAi"
            >
              Analyze with AI
            </UButton>
          </div>

          <div v-if="aiAnalysis" class="mt-3 rounded-lg border border-default p-3">
            <p class="mb-2 text-[11px] uppercase text-muted font-medium">
              Recommended daily budget · {{ freshnessLabel(aiAnalysis.dataFreshness.syncedAt) }}
            </p>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-lg border p-3 text-left transition"
                :class="chosenSource === 'deterministic' ? 'border-primary bg-primary/5' : 'border-default'"
                @click="chosenSource = 'deterministic'"
              >
                <p class="text-xs text-muted">Rule-based</p>
                <p class="mt-0.5 text-base font-semibold tabular-nums">{{ formatCurrency(aiAnalysis.deterministic.dailyBudget) }}/day</p>
              </button>
              <button
                v-if="aiAnalysis.ai"
                type="button"
                class="rounded-lg border p-3 text-left transition"
                :class="chosenSource === 'ai' ? 'border-primary bg-primary/5' : 'border-default'"
                @click="chosenSource = 'ai'"
              >
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs text-muted">AI proposed</p>
                  <UBadge :color="confidenceColor(aiAnalysis.ai.confidence) as any" variant="subtle" size="xs">
                    {{ aiAnalysis.ai.confidence }}
                  </UBadge>
                </div>
                <p class="mt-0.5 text-base font-semibold tabular-nums">{{ formatCurrency(aiAnalysis.ai.proposedDailyBudget) }}/day</p>
              </button>
              <div v-else class="rounded-lg border border-dashed border-default p-3 text-xs text-muted">
                AI analysis unavailable
              </div>
            </div>

            <p v-if="aiAnalysis.ai" class="mt-2 text-xs text-muted">{{ aiAnalysis.ai.rationale }}</p>
            <div v-if="aiAnalysis.ai && aiAnalysis.ai.riskFlags.length" class="mt-2 flex flex-wrap gap-1">
              <UBadge v-for="flag in aiAnalysis.ai.riskFlags" :key="flag" color="warning" variant="subtle" size="xs">
                {{ flag }}
              </UBadge>
            </div>
            <p v-if="aiAnalysis.dataFreshness.refreshError" class="mt-2 text-xs text-amber-500">
              Live refresh failed — using last-synced data.
            </p>

            <div class="mt-3 flex justify-end">
              <UButton
                size="xs"
                color="primary"
                icon="i-lucide-clipboard-check"
                :loading="approvingAdjustment"
                @click="approveAdjustment"
              >
                Approve {{ formatCurrency(chosenDailyBudget) }}/day adjustment
              </UButton>
            </div>
          </div>
```

- [ ] **Step 4: Manual verification (dev)**

Run `pnpm dev`. Open a flagged campaign's Review → click "Analyze with AI": a comparison card shows the rule-based number and (with Groq configured) an AI number + rationale + confidence. Pick a card, click "Approve … adjustment", and confirm an `approved` action appears in the Platform actions list. With Groq unconfigured, the card still shows the rule-based number and an "AI analysis unavailable" panel.

- [ ] **Step 5: Commit**

```bash
git add "server/api/agency/social/spend/[id]/actions/plan.post.ts" app/components/social/SpendCampaignHistorySlideover.vue
git commit -m "feat(spend): AI analysis comparison card + approve-adjustment in Review slideover"
```

---

## Task 5: (Deferrable) Single-campaign live refresh

This task adds the optional "Refresh from platform" path. It is independent — Tasks 1–4 ship a working feature on synced data without it. Defer if Meta/Google refetch scope balloons; ship the rest first.

**Files:**
- Create: `server/utils/spendCampaignRefresh.ts`
- Modify: `server/api/agency/social/spend/[id]/ai-analysis.post.ts`
- Modify: `app/components/social/SpendCampaignHistorySlideover.vue`

- [ ] **Step 1: Implement a single-campaign Meta refetch helper (Google = fail-safe no-op for now)**

```ts
// server/utils/spendCampaignRefresh.ts
import { queryOne, execute } from '~~/server/utils/db'
import { getCampaignInsights } from '~~/server/utils/metaClient'

/**
 * Re-pull ONE campaign's month-to-date core metrics and update its media_spend row.
 * Single platform call (not the multi-account fan-out that rate-limits Meta).
 * Meta only for now; Google returns refreshed:false with a reason (the MCC
 * login-customer-id read bug is unresolved — see budget-health memory).
 */
export async function refreshSingleCampaignSpend(mediaSpendId: string): Promise<{ refreshed: boolean, error?: string }> {
  const row = await queryOne<{
    platform: 'meta' | 'google_ads'
    campaign_id: string | null
    account_id: string | null
    access_token: string | null
    period: string
  }>(
    `SELECT ms.platform, ms.campaign_id, sc.account_id, sc.access_token, ms.period
       FROM media_spend ms
       JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE ms.id = $1`,
    [mediaSpendId]
  )
  if (!row || !row.campaign_id || !row.account_id || !row.access_token) {
    return { refreshed: false, error: 'missing connection or campaign' }
  }
  if (row.platform !== 'meta') {
    return { refreshed: false, error: 'live refresh supported for Meta only' }
  }

  const [year, month] = row.period.split('-').map(Number)
  try {
    // One insights call for this account+month, filtered to the campaign.
    const insights = await getCampaignInsights(`act_${row.account_id}`, row.access_token, month, year)
    const match = insights.find(i => i.campaign_id === row.campaign_id)
    if (!match) return { refreshed: false, error: 'campaign not in insights' }
    await execute(
      `UPDATE media_spend
          SET actual_spend = $2, impressions = $3, clicks = $4, synced_at = NOW()
        WHERE id = $1`,
      [mediaSpendId, Number(match.spend || 0), Number(match.impressions || 0), Number(match.clicks || 0)]
    )
    return { refreshed: true }
  } catch (err: any) {
    return { refreshed: false, error: (err?.data?.error?.message || err?.message || 'refresh failed').slice(0, 300) }
  }
}
```

> **Note for the engineer:** confirm `getCampaignInsights(accountId, token, month, year)` exists in `metaClient.ts` and returns objects with `campaign_id`, `spend`, `impressions`, `clicks` (the spend sync uses it). If the exact name differs (e.g. `getCampaignMonthlyInsights`), use that. Keep the helper to a single API call.

- [ ] **Step 2: Wire refresh into the endpoint**

In `ai-analysis.post.ts`, after reading `id` and before the `queryOne` row load, add:
```ts
  const body = await readBody(event).catch(() => ({})) as { refresh?: boolean }
  let refreshed = false
  let refreshError: string | undefined
  if (body?.refresh === true) {
    const { refreshSingleCampaignSpend } = await import('~~/server/utils/spendCampaignRefresh')
    const r = await refreshSingleCampaignSpend(id)
    refreshed = r.refreshed
    refreshError = r.error
  }
```
Then change the final `buildAnalysisResponse({ ... refreshed: false, modelId })` call to `refreshed, refreshError,` (pass the computed values).

- [ ] **Step 3: Wire the UI toggle**

In the slideover script, add `const refreshFromPlatform = ref(false)` and change the analyze body to `body: { refresh: refreshFromPlatform.value }`. In the template, next to the "Analyze with AI" button add:
```vue
            <UCheckbox v-model="refreshFromPlatform" label="Refresh from platform first" size="xs" class="mt-2" />
```

- [ ] **Step 4: Manual verification (dev)**

With a Meta campaign, tick "Refresh from platform first", click Analyze. Expect the freshness line to read a just-now sync and `dataFreshness.refreshed=true`. With a Google campaign, expect the amber "Live refresh failed — using last-synced data." note and analysis to proceed on synced data.

- [ ] **Step 5: Commit**

```bash
git add server/utils/spendCampaignRefresh.ts "server/api/agency/social/spend/[id]/ai-analysis.post.ts" app/components/social/SpendCampaignHistorySlideover.vue
git commit -m "feat(spend): optional single-campaign live refresh before AI analysis (Meta)"
```

---

## Task 6: Full suite + graph + review gate

- [ ] **Step 1: Run the new + related suites**

Run: `npx vitest run test/server/utils/spendAiAnalysis.test.ts test/server/utils/budgetGuardrails.test.ts test/server/utils/socialSpendPacingReview.test.ts test/server/utils/budgetPacing.test.ts`
Expected: all PASS, zero regressions.

- [ ] **Step 2: Rebuild the project knowledge graph (per CLAUDE.md)**

Run: `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"`
Expected: completes without error (keeps `graphify-out/` current after the code changes).

- [ ] **Step 3: Confirm no live-write coupling changed**

Verify this feature performs NO platform writes: the only write path remains the admin `execute.post.ts` (unchanged). `ai-analysis.post.ts` and `approveAdjustment` only read + write `campaign_action_log` rows (`planned`/`approved`). Grep to confirm:
Run: `grep -rnE "updateMetaDailyBudget|updateGoogleCampaignDailyBudget" server/api/agency/social/spend/'[id]'/ai-analysis.post.ts || echo "no live-write calls (correct)"`
Expected: `no live-write calls (correct)`.

- [ ] **Step 4: Stop for review**

Do not merge/deploy as part of this plan. Hand back for the standard review → merge → (dormant; the Apply step still requires armed flags) flow. No flags are introduced by this feature; the AI analysis + approve steps are always available to media/admin roles, but they cannot move money — only the existing admin Apply can, and only when the budget-write flags are armed.

---

## Self-Review

**Spec coverage:** "Analyze with AI" button (Task 4) ✓; both numbers side-by-side + rationale/confidence/risk-flags (Task 4 card) ✓; synced-data default (Task 3) ✓; optional single-campaign live refresh, fail-safe, deferrable (Task 5) ✓; "Approve this adjustment" → existing plan+approve chain, admin Apply unchanged (Task 4) ✓; no migration, reuse campaign_action_log metadata (Task 4 body) ✓; AI failure → deterministic-only fail-safe (Task 1 parser + Task 2 assembler + Task 3 try/catch) ✓; unit tests for prompt/parse/clamp/fail-safe/assemble (Tasks 1–2) ✓; pure-orchestrator (`buildAnalysisResponse`) test (Task 2) ✓; graph rebuild (Task 6) ✓.

**Placeholder scan:** Two "Note for the engineer" callouts (pacing SELECT parity; plan.post.ts metadata pass-through; `getCampaignInsights` name) are verification pointers with concrete fallback instructions, not missing logic. No TBD/TODO in code steps.

**Type consistency:** `AiAnalysisInput`/`AiAnalysisResult`/`AiConfidence` (Task 1) reused by `buildAnalysisResponse`/`AnalysisResponse` (Task 2) and the endpoint (Task 3); the UI `AiAnalysisResponse` interface (Task 4) mirrors `AnalysisResponse` field-for-field; `chosenDailyBudget`/`chosenSource` consistent across Task 4 script + template; `refreshSingleCampaignSpend` return `{refreshed,error}` consumed as `{refreshed,refreshError}` in Task 5 Step 2. Consistent.

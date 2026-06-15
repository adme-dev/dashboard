# Google Recommendations Passthrough (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Google Ads' own optimization recommendations + optimization score inside the spend view, and let an admin apply budget recommendations through the existing guard-railed approve→apply→audit chain.

**Architecture:** A pure normalizer + thin fetch in `server/utils/googleRecommendations.ts` (reusing `gaqlQuery` + `resolveGoogleWriteAuth`), a read-only fail-safe endpoint, a minimal additive `source` param on `plan.post.ts` so budget recs reuse the existing write path with zero new money-code, and a UI panel. Google-only (Meta has no API equivalent; Meta is covered by the existing pacing/AI recommend + write). No migration.

**Tech Stack:** Nitro (Nuxt 4 server), TypeScript, Vitest, Nuxt UI v4. Google Ads API `RecommendationService` via GAQL.

**Spec:** `docs/superpowers/specs/2026-06-16-google-recommendations-passthrough-design.md`
**Working dir:** worktree `.worktrees/google-recs` (branch `feat/google-recommendations`). Run `npx nuxt prepare` once if `.nuxt` is missing.

---

## Task 1: Pure recommendation normalizer

**Files:**
- Create: `server/utils/googleRecommendations.ts`
- Test: `test/server/utils/googleRecommendations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/googleRecommendations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeRecommendations } from '~~/server/utils/googleRecommendations'

const DEEP = 'https://ads.google.com/aw/recommendations?ocid=123'

describe('normalizeRecommendations', () => {
  it('classifies a CAMPAIGN_BUDGET rec as budget_guardrailed and converts micros→major', () => {
    const rows = [{
      recommendation: {
        type: 'CAMPAIGN_BUDGET',
        campaign: 'customers/999/campaigns/555',
        resourceName: 'customers/999/recommendations/abc',
        campaignBudgetRecommendation: {
          currentBudgetAmountMicros: '20000000',
          recommendedBudgetAmountMicros: '24000000',
        },
        impact: { baseMetrics: { impressions: '1000' }, potentialMetrics: { impressions: '1250' } },
      },
    }]
    const r = normalizeRecommendations(rows, { optimizationScore: 0.82, deepLink: DEEP })
    expect(r.optimizationScore).toBe(0.82)
    expect(r.recommendations).toHaveLength(1)
    const rec = r.recommendations[0]
    expect(rec.type).toBe('CAMPAIGN_BUDGET')
    expect(rec.campaignId).toBe('555')
    expect(rec.currentDailyMajor).toBe(20)
    expect(rec.recommendedDailyMajor).toBe(24)
    expect(rec.applyability).toBe('budget_guardrailed')
    expect(rec.trackingHealth).toBe(false)
    expect(rec.impactSummary).toBe('+250 impressions')
    expect(rec.deepLink).toBe(DEEP)
  })

  it('treats FORECASTING_CAMPAIGN_BUDGET with a recommended amount as budget_guardrailed', () => {
    const rows = [{ recommendation: { type: 'FORECASTING_CAMPAIGN_BUDGET', resourceName: 'rn', campaignBudgetRecommendation: { recommendedBudgetAmountMicros: '15000000' } } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].applyability).toBe('budget_guardrailed')
    expect(r.recommendations[0].recommendedDailyMajor).toBe(15)
  })

  it('classifies non-budget types as review_only', () => {
    const rows = [{ recommendation: { type: 'KEYWORD', resourceName: 'rn' } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].applyability).toBe('review_only')
    expect(r.recommendations[0].recommendedDailyMajor).toBeNull()
  })

  it('flags IMPROVE_GOOGLE_TAG_COVERAGE as trackingHealth + review_only', () => {
    const rows = [{ recommendation: { type: 'IMPROVE_GOOGLE_TAG_COVERAGE', resourceName: 'rn' } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].trackingHealth).toBe(true)
    expect(r.recommendations[0].applyability).toBe('review_only')
  })

  it('downgrades a budget type with non-numeric micros to review_only with null amounts', () => {
    const rows = [{ recommendation: { type: 'CAMPAIGN_BUDGET', resourceName: 'rn', campaignBudgetRecommendation: { recommendedBudgetAmountMicros: 'xx' } } }]
    const r = normalizeRecommendations(rows, { optimizationScore: null, deepLink: DEEP })
    expect(r.recommendations[0].applyability).toBe('review_only')
    expect(r.recommendations[0].recommendedDailyMajor).toBeNull()
  })

  it('returns an empty list for no rows', () => {
    const r = normalizeRecommendations([], { optimizationScore: 0.5, deepLink: DEEP })
    expect(r.recommendations).toEqual([])
    expect(r.optimizationScore).toBe(0.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/utils/googleRecommendations.test.ts`
Expected: FAIL — cannot find module / `normalizeRecommendations` not exported.

- [ ] **Step 3: Write the normalizer**

Create `server/utils/googleRecommendations.ts`:

```ts
import { gaqlQuery } from '~~/server/utils/googleAdsClient'

export interface NormalizedRecommendation {
  type: string
  campaignId: string | null
  title: string
  currentDailyMajor: number | null
  recommendedDailyMajor: number | null
  impactSummary: string | null
  resourceName: string
  applyability: 'budget_guardrailed' | 'review_only'
  trackingHealth: boolean
  deepLink: string
}

export interface RecommendationsResult {
  optimizationScore: number | null
  recommendations: NormalizedRecommendation[]
  error?: string
}

const BUDGET_TYPES = new Set(['CAMPAIGN_BUDGET', 'FORECASTING_CAMPAIGN_BUDGET'])

const TITLES: Record<string, string> = {
  CAMPAIGN_BUDGET: 'Raise a budget-constrained campaign’s budget',
  FORECASTING_CAMPAIGN_BUDGET: 'Pre-empt a forecasted budget constraint',
  KEYWORD: 'Add suggested keywords',
  FORECASTING_SET_TARGET_ROAS: 'Set a target ROAS ahead of a seasonal peak',
  FORECASTING_SET_TARGET_CPA: 'Set a target CPA ahead of a seasonal peak',
  IMPROVE_PERFORMANCE_MAX_AD_STRENGTH: 'Improve Performance Max asset-group strength',
  IMPROVE_GOOGLE_TAG_COVERAGE: 'Improve Google tag coverage (conversion tracking)',
}

function humanize(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
}

function microsToMajor(micros: unknown): number | null {
  if (micros == null) return null
  const n = Number(micros)
  if (!Number.isFinite(n)) return null
  return Math.round((n / 1_000_000) * 100) / 100
}

function campaignIdFromResource(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const m = name.match(/campaigns\/(\d+)/)
  return m ? m[1] : null
}

function impactSummary(impact: any): string | null {
  const base = Number(impact?.baseMetrics?.impressions)
  const pot = Number(impact?.potentialMetrics?.impressions)
  if (!Number.isFinite(base) || !Number.isFinite(pot)) return null
  const delta = Math.round(pot - base)
  if (delta === 0) return null
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString('en-US')} impressions`
}

export function normalizeRecommendations(
  rows: any[],
  opts: { optimizationScore: number | null; deepLink: string },
): RecommendationsResult {
  const recommendations = (rows || []).map((row): NormalizedRecommendation => {
    const r = row?.recommendation || {}
    const type = typeof r.type === 'string' ? r.type : 'UNKNOWN'
    const budget = r.campaignBudgetRecommendation || {}
    const currentDailyMajor = microsToMajor(budget.currentBudgetAmountMicros)
    const recommendedDailyMajor = microsToMajor(budget.recommendedBudgetAmountMicros)
    const isBudget = BUDGET_TYPES.has(type) && recommendedDailyMajor != null && recommendedDailyMajor > 0
    return {
      type,
      campaignId: campaignIdFromResource(r.campaign),
      title: TITLES[type] || humanize(type),
      currentDailyMajor,
      recommendedDailyMajor,
      impactSummary: impactSummary(r.impact),
      resourceName: typeof r.resourceName === 'string' ? r.resourceName : '',
      applyability: isBudget ? 'budget_guardrailed' : 'review_only',
      trackingHealth: type === 'IMPROVE_GOOGLE_TAG_COVERAGE',
      deepLink: opts.deepLink,
    }
  })
  return { optimizationScore: opts.optimizationScore, recommendations }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/server/utils/googleRecommendations.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/googleRecommendations.ts test/server/utils/googleRecommendations.test.ts
git commit -m "feat(spend): pure normalizer for Google optimization recommendations"
```

---

## Task 2: Fetch function (GAQL → normalize)

**Files:**
- Modify: `server/utils/googleRecommendations.ts`
- Test: `test/server/utils/googleRecommendationsFetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/googleRecommendationsFetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
const ofetchMock = vi.fn()
vi.mock('ofetch', () => ({ ofetch: (...a: any[]) => ofetchMock(...a) }))
import { fetchGoogleRecommendations } from '~~/server/utils/googleRecommendations'

beforeEach(() => ofetchMock.mockReset())

describe('fetchGoogleRecommendations', () => {
  it('queries recommendations + optimization score and returns a normalized result', async () => {
    ofetchMock
      // recommendations searchStream
      .mockResolvedValueOnce([{ results: [
        { recommendation: { type: 'CAMPAIGN_BUDGET', resourceName: 'rn1', campaign: 'customers/9/campaigns/55', campaignBudgetRecommendation: { recommendedBudgetAmountMicros: '24000000', currentBudgetAmountMicros: '20000000' } } },
      ] }])
      // optimization score searchStream
      .mockResolvedValueOnce([{ results: [{ customer: { optimizationScore: 0.77 }, metrics: { optimizationScoreUrl: 'https://ads.google.com/x' } }] }])
    const r = await fetchGoogleRecommendations('9', 'tok', 'dev', '5250473322')
    expect(r.optimizationScore).toBe(0.77)
    expect(r.recommendations[0].recommendedDailyMajor).toBe(24)
    expect(r.recommendations[0].deepLink).toBe('https://ads.google.com/x')
  })

  it('fails safe to an empty result with an error flag when the API throws', async () => {
    ofetchMock.mockRejectedValue(new Error('boom'))
    const r = await fetchGoogleRecommendations('9', 'tok', 'dev', undefined)
    expect(r.recommendations).toEqual([])
    expect(r.optimizationScore).toBeNull()
    expect(r.error).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/server/utils/googleRecommendationsFetch.test.ts`
Expected: FAIL — `fetchGoogleRecommendations` not exported.

- [ ] **Step 3: Add the fetch function**

Append to `server/utils/googleRecommendations.ts`:

```ts
/**
 * Fetch + normalize Google optimization recommendations for one customer.
 * Fail-safe: any API error returns an empty result with an error flag so the
 * spend page never breaks. Auth (token + login-customer-id) is resolved by the
 * caller via resolveGoogleWriteAuth — the same path as spend reads.
 */
export async function fetchGoogleRecommendations(
  customerId: string,
  token: string,
  developerToken: string,
  loginCustomerId: string | undefined,
): Promise<RecommendationsResult> {
  try {
    const recRows = await gaqlQuery(
      customerId, token, developerToken,
      `SELECT recommendation.type, recommendation.campaign, recommendation.resource_name,
              recommendation.campaign_budget_recommendation.current_budget_amount_micros,
              recommendation.campaign_budget_recommendation.recommended_budget_amount_micros,
              recommendation.impact.base_metrics.impressions,
              recommendation.impact.potential_metrics.impressions
       FROM recommendation`,
      loginCustomerId,
    )
    let optimizationScore: number | null = null
    let deepLink = 'https://ads.google.com/aw/recommendations'
    try {
      const scoreRows = await gaqlQuery(
        customerId, token, developerToken,
        `SELECT customer.optimization_score, metrics.optimization_score_url FROM customer`,
        loginCustomerId,
      )
      const c = scoreRows?.[0]
      const s = Number(c?.customer?.optimizationScore)
      optimizationScore = Number.isFinite(s) ? s : null
      if (typeof c?.metrics?.optimizationScoreUrl === 'string' && c.metrics.optimizationScoreUrl) {
        deepLink = c.metrics.optimizationScoreUrl
      }
    } catch {
      // score is best-effort; recommendations still return
    }
    return normalizeRecommendations(recRows, { optimizationScore, deepLink })
  } catch (err: any) {
    return { optimizationScore: null, recommendations: [], error: (err?.message || 'Google recommendations fetch failed').slice(0, 300) }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/server/utils/googleRecommendationsFetch.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/googleRecommendations.ts test/server/utils/googleRecommendationsFetch.test.ts
git commit -m "feat(spend): fetch Google optimization recommendations (fail-safe)"
```

---

## Task 3: Spend-scoped read endpoint

**Files:**
- Create: `server/api/agency/social/spend/[id]/google-recommendations.get.ts`

Spend-scoped (keyed by `media_spend.id`) so it matches the slideover's data model and resolves the account server-side — the spend page is cross-account with no "selected account". Integration glue over tested units (no unit test; verified by Task 5 + manual).

- [ ] **Step 1: Write the endpoint**

Create `server/api/agency/social/spend/[id]/google-recommendations.get.ts`:

```ts
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { resolveGoogleWriteAuth } from '~~/server/utils/googleWriteAuth'
import { fetchGoogleRecommendations } from '~~/server/utils/googleRecommendations'

/**
 * GET /api/agency/social/spend/:id/google-recommendations
 * Read-only (unflagged). Resolves the Google account + campaign for this
 * media_spend row, fetches that account's optimization recommendations, and
 * returns them with the campaign id so the slideover can highlight the matching
 * budget rec. Google rows only; Meta rows return empty. Fail-safe.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const row = await queryOne<{
    platform: 'meta' | 'google_ads'
    campaign_id: string | null
    conn_id: string
    account_id: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
  }>(
    `SELECT ms.platform, ms.campaign_id,
            sc.id::text AS conn_id, sc.account_id, sc.access_token, sc.refresh_token, sc.token_expires_at
     FROM media_spend ms
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.id = $1`,
    [id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })

  // Google-only feature; Meta has no equivalent recommendations API.
  if (row.platform !== 'google_ads') {
    return { optimizationScore: null, recommendations: [], campaignId: row?.campaign_id ?? null }
  }

  const config = useRuntimeConfig()
  try {
    const { refreshGoogleToken, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
    const { accessToken, loginCustomerId } = await resolveGoogleWriteAuth(
      { id: row.conn_id, account_id: row.account_id, access_token: row.access_token, refresh_token: row.refresh_token, token_expires_at: row.token_expires_at },
      {
        googleClientId: config.googleClientId as string,
        googleClientSecret: config.googleClientSecret as string,
        googleDeveloperToken: config.googleDeveloperToken as string,
        googleAdsLoginCustomerId: (config.googleAdsLoginCustomerId as string) || '',
      },
      {
        refreshGoogleToken,
        listAccessibleCustomers,
        updateToken: async (cid, tok, exp) => {
          await execute(
            `UPDATE social_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
            [tok, exp, cid],
          )
        },
      },
    )
    const result = await fetchGoogleRecommendations(row.account_id, accessToken, config.googleDeveloperToken as string, loginCustomerId)
    return { ...result, campaignId: row.campaign_id }
  } catch (err: any) {
    return { optimizationScore: null, recommendations: [], campaignId: row.campaign_id, error: (err?.message || 'failed').slice(0, 300) }
  }
})
```

- [ ] **Step 2: Verify it compiles (build the server types)**

Run: `npx nuxt prepare`
Expected: completes without error referencing this file.

- [ ] **Step 3: Commit**

```bash
git add "server/api/agency/social/spend/[id]/google-recommendations.get.ts"
git commit -m "feat(spend): spend-scoped read endpoint for Google optimization recommendations"
```

---

## Task 4: `plan.post.ts` — optional `source` so budget recs reuse the write path

**Files:**
- Modify: `server/api/agency/social/spend/[id]/actions/plan.post.ts`

- [ ] **Step 1: Add a `source` constant from the body (default preserves current behaviour)**

In `plan.post.ts`, after `const recommendedDailyBudget = parseBudgetNumber(...)`, add:

```ts
  const source = typeof body?.source === 'string' && body.source.trim() ? body.source.trim() : 'ai_pacing_review'
  const recommendationResourceName = typeof body?.recommendationResourceName === 'string' ? body.recommendationResourceName : null
```

- [ ] **Step 2: Use `source` in the dedupe query**

Change the dedupe query's `AND metadata->>'source' = 'ai_pacing_review'` line to:

```ts
       AND metadata->>'source' = $3
```

and add `source` as the third query param: change `[id, recommendedDailyBudget]` to `[id, recommendedDailyBudget, source]`.

- [ ] **Step 3: Record `source` + rec resource name in metadata**

In the `recordCampaignAction` `metadata` object, change `source: 'ai_pacing_review',` to:

```ts
      source,
      recommendationResourceName,
```

- [ ] **Step 4: Run the existing plan endpoint test for regressions**

Run: `npx vitest run test/server/api/socialSpendPlanCampaignActionEndpoint.test.ts`
Expected: PASS (existing behaviour preserved — default `source` unchanged).

- [ ] **Step 5: Commit**

```bash
git add "server/api/agency/social/spend/[id]/actions/plan.post.ts"
git commit -m "feat(spend): plan.post accepts optional source (google_recommendation) + rec resource name"
```

---

## Task 5: Slideover integration (per-campaign)

**Files:**
- Create: `app/components/social/SpendGoogleRecommendations.vue` (presentational child)
- Modify: `app/components/social/SpendCampaignHistorySlideover.vue` (fetch on open, render, apply)

- [ ] **Step 1: Create the presentational component**

Create `app/components/social/SpendGoogleRecommendations.vue`:

```vue
<script setup lang="ts">
interface Rec {
  type: string
  campaignId: string | null
  title: string
  currentDailyMajor: number | null
  recommendedDailyMajor: number | null
  impactSummary: string | null
  resourceName: string
  applyability: 'budget_guardrailed' | 'review_only'
  trackingHealth: boolean
  deepLink: string
}
const props = defineProps<{
  optimizationScore: number | null
  recommendations: Rec[]
  campaignId: string | null
  armed: boolean
  applying?: string | null
}>()
const emit = defineEmits<{ (e: 'apply', rec: Rec): void }>()

const scorePct = computed(() => props.optimizationScore == null ? null : Math.round(props.optimizationScore * 100))
// Only THIS campaign's budget rec is applyable from the slideover.
const applyable = computed(() => props.recommendations.filter(r => r.applyability === 'budget_guardrailed' && r.campaignId === props.campaignId))
const trackingRecs = computed(() => props.recommendations.filter(r => r.trackingHealth))
const otherRecs = computed(() => props.recommendations.filter(r => !r.trackingHealth && !(r.applyability === 'budget_guardrailed' && r.campaignId === props.campaignId)))
const fmt = (n: number | null) => n == null ? '—' : `$${n.toFixed(2)}`
</script>

<template>
  <div v-if="recommendations.length || optimizationScore != null" class="rounded-lg border border-default p-3 space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="text-primary" />
        <span class="text-xs font-medium">Google optimization recommendations</span>
      </div>
      <UBadge v-if="scorePct != null" :color="scorePct >= 80 ? 'success' : scorePct >= 60 ? 'warning' : 'error'" variant="soft" size="xs">
        Score {{ scorePct }}%
      </UBadge>
    </div>

    <div v-for="rec in applyable" :key="rec.resourceName" class="flex items-center justify-between rounded-lg bg-default/40 px-3 py-2">
      <div class="min-w-0">
        <p class="text-xs font-medium truncate">{{ rec.title }}</p>
        <p class="text-[11px] text-muted">{{ fmt(rec.currentDailyMajor) }} → {{ fmt(rec.recommendedDailyMajor) }}/day<span v-if="rec.impactSummary"> · {{ rec.impactSummary }}</span></p>
      </div>
      <UButton size="xs" :color="armed ? 'primary' : 'neutral'" :variant="armed ? 'solid' : 'soft'" :loading="applying === rec.resourceName" :disabled="!armed" @click="emit('apply', rec)">
        {{ armed ? 'Apply (guardrailed)' : 'Recommend only' }}
      </UButton>
    </div>

    <div v-if="trackingRecs.length" class="space-y-1">
      <p class="text-[10px] uppercase text-muted font-medium">Tracking health</p>
      <div v-for="rec in trackingRecs" :key="rec.resourceName" class="flex items-center justify-between rounded-lg bg-warning/5 px-3 py-2">
        <p class="text-xs truncate">{{ rec.title }}</p>
        <UButton size="xs" variant="ghost" :to="rec.deepLink" target="_blank" trailing-icon="i-lucide-external-link">Review</UButton>
      </div>
    </div>

    <div v-if="otherRecs.length" class="space-y-1">
      <p class="text-[10px] uppercase text-muted font-medium">Other (review in Google Ads)</p>
      <div v-for="rec in otherRecs" :key="rec.resourceName" class="flex items-center justify-between rounded-lg bg-default/40 px-3 py-2">
        <p class="text-xs truncate">{{ rec.title }}<span v-if="rec.impactSummary" class="text-muted"> · {{ rec.impactSummary }}</span></p>
        <UButton size="xs" variant="ghost" :to="rec.deepLink" target="_blank" trailing-icon="i-lucide-external-link">Review</UButton>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add fetch + apply state to the slideover**

In `app/components/social/SpendCampaignHistorySlideover.vue` `<script setup>`, add (near the other refs; confirm `const toast = useToast()` exists, else add it):

```ts
const googleRecs = ref<{ optimizationScore: number | null; recommendations: any[]; campaignId: string | null }>({ optimizationScore: null, recommendations: [], campaignId: null })
const applyingRec = ref<string | null>(null)
const recsArmed = computed(() =>
  props.item?.platform === 'google'
  && Boolean(props.budgetControl?.liveBudgetChangesEnabled)
  && Boolean(props.budgetControl?.googleBudgetWritesEnabled))

async function loadGoogleRecs(spendId: string) {
  if (props.item?.platform !== 'google') { googleRecs.value = { optimizationScore: null, recommendations: [], campaignId: null }; return }
  try {
    googleRecs.value = await $fetch(`/api/agency/social/spend/${spendId}/google-recommendations`)
  } catch {
    googleRecs.value = { optimizationScore: null, recommendations: [], campaignId: null }
  }
}

async function applyGoogleRec(rec: any) {
  const spendId = props.item?.mediaSpendId
  if (!spendId || rec.recommendedDailyMajor == null) return
  applyingRec.value = rec.resourceName
  try {
    const planned = await $fetch(`/api/agency/social/spend/${spendId}/actions/plan`, {
      method: 'POST',
      body: {
        currentDailyBudget: rec.currentDailyMajor ?? props.item?.currentDailyBudget ?? 0,
        recommendedDailyBudget: rec.recommendedDailyMajor,
        source: 'google_recommendation',
        recommendationResourceName: rec.resourceName,
        reason: rec.title,
      },
    }) as any
    const actionId = planned?.action?.id
    if (actionId) {
      await $fetch(`/api/agency/social/spend/${spendId}/actions/${actionId}/approve`, { method: 'POST' })
      await $fetch(`/api/agency/social/spend/${spendId}/actions/${actionId}/execute`, { method: 'POST', body: {} })
    }
    toast.add({ title: 'Applied', description: 'Recommendation sent through the guard-railed write.', color: 'success' })
    await loadHistory(spendId, true)
  } catch (e: any) {
    toast.add({ title: 'Apply failed', description: e?.data?.statusMessage || e?.message || 'Error', color: 'error' })
  } finally {
    applyingRec.value = null
  }
}
```

The component reads `props.budgetControl` for the armed flags — the slideover already receives a `budgetControl`/`budgetControlSettings` prop (confirm the exact prop name by reading the `defineProps` block; use that name in `recsArmed`).

- [ ] **Step 3: Fetch recs when the slideover opens**

In `loadHistory(spendId, force)`, after the existing history/actions fetch completes, add a non-blocking recs load:

```ts
    void loadGoogleRecs(spendId)
```

(Place it after `loadedSpendId.value = spendId` so it runs once per open; it must not block or throw into `loadHistory`.)

- [ ] **Step 4: Render the component in the slideover template**

In the slideover template, near the "Analyze with AI" / pacing section, add:

```vue
        <SpendGoogleRecommendations
          :optimization-score="googleRecs.optimizationScore"
          :recommendations="googleRecs.recommendations"
          :campaign-id="googleRecs.campaignId"
          :armed="recsArmed"
          :applying="applyingRec"
          @apply="applyGoogleRec"
        />
```

- [ ] **Step 5: Verify build of types**

Run: `npx nuxt prepare`
Expected: completes; `SpendGoogleRecommendations` auto-import resolves from `components/social/`.

- [ ] **Step 6: Commit**

```bash
git add app/components/social/SpendGoogleRecommendations.vue app/components/social/SpendCampaignHistorySlideover.vue
git commit -m "feat(spend): Google optimization recommendations in the campaign Review slideover (guardrailed apply)"
```

---

## Task 6: Marketing sync

**Files:**
- Modify: `app/pages/features/[slug].vue` (the `campaign-alerts` entry)

- [ ] **Step 1: Append to the "Analyze With AI, Side By Side" detail content**

Append to that section's `content` string:

```
 For Google accounts, the dashboard also surfaces Google’s own optimization recommendations and optimization score — applying a budget recommendation routes it through the same guard-railed, audited write, while keyword, target-CPA/ROAS and tracking-health suggestions link straight into Google Ads.
```

- [ ] **Step 2: Commit**

```bash
git add "app/pages/features/[slug].vue"
git commit -m "docs(marketing): note Google optimization recommendations in campaign-alerts"
```

---

## Final verification (after all tasks)

- [ ] Run: `npx vitest run test/server/utils/googleRecommendations.test.ts test/server/utils/googleRecommendationsFetch.test.ts test/server/api/socialSpendPlanCampaignActionEndpoint.test.ts test/server/utils/budgetGuardrails.test.ts` — all green.
- [ ] `npx nuxt prepare` clean.
- [ ] Adversarial review (gsd-code-reviewer) of the diff, focused on: fail-safe behaviour (page never breaks on Google error), the apply path correctly reusing approve→execute with `source: 'google_recommendation'`, the armed-gating on the Apply button matching server flag-gating, and GAQL field-name correctness vs the Google Ads API version in `GOOGLE_ADS_BASE`.
- [ ] Confirm: reads are unflagged; budget apply still requires `liveBudgetChangesEnabled + googleBudgetWritesEnabled`; no migration; no flag armed by this work.
```

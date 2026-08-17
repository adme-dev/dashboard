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

function campaignIdFromRecommendation(r: any): string | null {
  return campaignIdFromResource(r.campaign)
    || campaignIdFromResource(Array.isArray(r.campaigns) ? r.campaigns[0] : null)
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
    const budget = r.campaignBudgetRecommendation || r.forecastingCampaignBudgetRecommendation || {}
    const currentDailyMajor = microsToMajor(budget.currentBudgetAmountMicros)
    const recommendedDailyMajor = microsToMajor(budget.recommendedBudgetAmountMicros)
    const isBudget = BUDGET_TYPES.has(type) && recommendedDailyMajor != null && recommendedDailyMajor > 0
    return {
      type,
      campaignId: campaignIdFromRecommendation(r),
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
      `SELECT recommendation.type,
              recommendation.resource_name,
              recommendation.campaigns,
              recommendation.campaign_budget_recommendation,
              recommendation.forecasting_campaign_budget_recommendation,
              recommendation.impact
       FROM recommendation`,
      loginCustomerId,
    )
    let optimizationScore: number | null = null
    let deepLink = 'https://ads.google.com/aw/recommendations'
    try {
      const scoreRows = await gaqlQuery(
        customerId, token, developerToken,
        // Google Ads API v23 exposes the score on customer and its deep link on metrics.
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

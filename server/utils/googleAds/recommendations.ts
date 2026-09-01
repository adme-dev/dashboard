import { z } from 'zod'
import type { GoogleAdsAuth } from '~~/server/utils/googleAds/api'
import {
  executeGoogleAdsQuery,
  type ExecuteGoogleAdsQueryInput
} from '~~/server/utils/googleAds/query'

export const GOOGLE_ADS_RECOMMENDATION_TYPES = [
  'CALLOUT_ASSET', 'CALL_ASSET', 'CAMPAIGN_BUDGET', 'CUSTOM_AUDIENCE_OPT_IN',
  'DISPLAY_EXPANSION_OPT_IN', 'DYNAMIC_IMAGE_EXTENSION_OPT_IN', 'ENHANCED_CPC_OPT_IN',
  'FORECASTING_CAMPAIGN_BUDGET', 'FORECASTING_SET_TARGET_CPA', 'FORECASTING_SET_TARGET_ROAS',
  'IMPROVE_DEMAND_GEN_AD_STRENGTH', 'IMPROVE_GOOGLE_TAG_COVERAGE',
  'IMPROVE_PERFORMANCE_MAX_AD_STRENGTH', 'KEYWORD', 'KEYWORD_MATCH_TYPE', 'LEAD_FORM_ASSET',
  'LOWER_TARGET_ROAS', 'MARGINAL_ROI_CAMPAIGN_BUDGET', 'MAXIMIZE_CLICKS_OPT_IN',
  'MAXIMIZE_CONVERSIONS_OPT_IN', 'MAXIMIZE_CONVERSION_VALUE_OPT_IN',
  'MIGRATE_DYNAMIC_SEARCH_ADS_CAMPAIGN_TO_PERFORMANCE_MAX', 'MOVE_UNUSED_BUDGET',
  'OPTIMIZE_AD_ROTATION', 'PERFORMANCE_MAX_FINAL_URL_OPT_IN', 'PERFORMANCE_MAX_OPT_IN',
  'RAISE_TARGET_CPA', 'RAISE_TARGET_CPA_BID_TOO_LOW', 'REFRESH_CUSTOMER_MATCH_LIST',
  'RESPONSIVE_SEARCH_AD', 'RESPONSIVE_SEARCH_AD_ASSET',
  'RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH', 'SEARCH_PARTNERS_OPT_IN', 'SET_TARGET_CPA',
  'SET_TARGET_ROAS', 'SHOPPING_ADD_AGE_GROUP', 'SHOPPING_ADD_COLOR', 'SHOPPING_ADD_GENDER',
  'SHOPPING_ADD_GTIN', 'SHOPPING_ADD_MORE_IDENTIFIERS', 'SHOPPING_ADD_PRODUCTS_TO_CAMPAIGN',
  'SHOPPING_ADD_SIZE', 'SHOPPING_FIX_DISAPPROVED_PRODUCTS',
  'SHOPPING_FIX_MERCHANT_CENTER_ACCOUNT_SUSPENSION_WARNING',
  'SHOPPING_FIX_SUSPENDED_MERCHANT_CENTER_ACCOUNT',
  'SHOPPING_MIGRATE_REGULAR_SHOPPING_CAMPAIGN_OFFERS_TO_PERFORMANCE_MAX',
  'SHOPPING_TARGET_ALL_OFFERS', 'SITELINK_ASSET', 'TARGET_CPA_OPT_IN', 'TARGET_ROAS_OPT_IN',
  'TEXT_AD', 'UPGRADE_LOCAL_CAMPAIGN_TO_PERFORMANCE_MAX',
  'UPGRADE_SMART_SHOPPING_CAMPAIGN_TO_PERFORMANCE_MAX', 'USE_BROAD_MATCH_KEYWORD',
  'UNKNOWN', 'UNSPECIFIED'
] as const

export const GoogleAdsRecommendationTypeSchema = z.enum(GOOGLE_ADS_RECOMMENDATION_TYPES)
const MetricValueSchema = z.union([z.string(), z.number()]).transform(String)
const MetricsSchema = z.object({
  impressions: MetricValueSchema.optional(),
  clicks: MetricValueSchema.optional(),
  conversions: MetricValueSchema.optional(),
  costMicros: MetricValueSchema.optional(),
  conversionValue: MetricValueSchema.optional()
})
const RecommendationSchema = z.object({
  resourceName: z.string(),
  type: GoogleAdsRecommendationTypeSchema,
  dismissed: z.boolean().default(false),
  campaign: z.string().optional(),
  campaigns: z.array(z.string()).default([]),
  adGroup: z.string().optional(),
  campaignBudget: z.string().optional(),
  campaignBudgetRecommendation: z.object({
    recommendedBudgetAmountMicros: MetricValueSchema.optional()
  }).optional(),
  forecastingCampaignBudgetRecommendation: z.object({
    recommendedBudgetAmountMicros: MetricValueSchema.optional()
  }).optional(),
  marginalRoiCampaignBudgetRecommendation: z.object({
    recommendedBudgetAmountMicros: MetricValueSchema.optional()
  }).optional(),
  impact: z.object({
    baseMetrics: MetricsSchema.optional(),
    potentialMetrics: MetricsSchema.optional()
  }).optional()
})
const ListInputSchema = z.strictObject({
  customerId: z.string().regex(/^\d{1,20}$/),
  auth: z.custom<GoogleAdsAuth>(),
  maxResults: z.number().int().min(1).max(100),
  types: z.array(GoogleAdsRecommendationTypeSchema).max(50),
  includeDismissed: z.boolean()
})

export interface ListGoogleAdsRecommendationsInput {
  customerId: string
  auth: GoogleAdsAuth
  maxResults: number
  types: string[]
  includeDismissed: boolean
}

interface RecommendationReadDependencies {
  query(input: ExecuteGoogleAdsQueryInput): Promise<{ rows: unknown[], more: number }>
}

const defaultDependencies: RecommendationReadDependencies = {
  query: input => executeGoogleAdsQuery(input)
}

function normalizeRecommendation(customerId: string, row: unknown): Record<string, unknown> {
  const value = row && typeof row === 'object'
    ? (row as Record<string, unknown>).recommendation
    : undefined
  if (!value) throw new Error('Google Ads returned an invalid recommendation row')
  const parsed = RecommendationSchema.parse(value)
  if (!new RegExp(`^customers/${customerId}/recommendations/[A-Za-z0-9_-]+$`).test(parsed.resourceName)) {
    throw new Error('Google Ads returned a cross-customer recommendation')
  }
  const targets = [parsed.campaign, parsed.adGroup, parsed.campaignBudget, ...parsed.campaigns]
    .filter((target): target is string => Boolean(target))
  if (targets.some(target => !target.startsWith(`customers/${customerId}/`))) {
    throw new Error('Google Ads returned a cross-customer recommendation target')
  }
  const budget = parsed.campaignBudgetRecommendation
    ?? parsed.forecastingCampaignBudgetRecommendation
    ?? parsed.marginalRoiCampaignBudgetRecommendation
  return {
    resourceName: parsed.resourceName,
    type: parsed.type,
    dismissed: parsed.dismissed,
    ...(parsed.campaign ? { campaign: parsed.campaign } : {}),
    campaigns: parsed.campaigns,
    ...(parsed.adGroup ? { adGroup: parsed.adGroup } : {}),
    ...(parsed.campaignBudget ? { campaignBudget: parsed.campaignBudget } : {}),
    ...(budget?.recommendedBudgetAmountMicros
      ? { recommendedBudgetAmountMicros: budget.recommendedBudgetAmountMicros }
      : {}),
    ...(parsed.impact ? { impact: parsed.impact } : {})
  }
}

export async function listGoogleAdsRecommendations(
  rawInput: ListGoogleAdsRecommendationsInput,
  dependencies: Partial<RecommendationReadDependencies> = {}
): Promise<Record<string, unknown>> {
  const input = ListInputSchema.parse(rawInput)
  const resolved = { ...defaultDependencies, ...dependencies }
  const filters = [
    ...(input.includeDismissed ? [] : ['recommendation.dismissed = FALSE']),
    ...(input.types.length > 0 ? [`recommendation.type IN (${input.types.join(', ')})`] : [])
  ]
  const result = await resolved.query({
    customerId: input.customerId,
    auth: input.auth,
    maxRows: input.maxResults,
    query: `SELECT recommendation.resource_name,
  recommendation.type,
  recommendation.dismissed,
  recommendation.campaign,
  recommendation.campaigns,
  recommendation.ad_group,
  recommendation.campaign_budget,
  recommendation.campaign_budget_recommendation,
  recommendation.forecasting_campaign_budget_recommendation,
  recommendation.marginal_roi_campaign_budget_recommendation,
  recommendation.impact
FROM recommendation${filters.length > 0 ? `\nWHERE ${filters.join('\n  AND ')}` : ''}`
  })
  const score = await resolved.query({
    customerId: input.customerId,
    auth: input.auth,
    maxRows: 1,
    query: 'SELECT customer.optimization_score, customer.optimization_score_url FROM customer'
  })
  const customer = score.rows[0] && typeof score.rows[0] === 'object'
    ? (score.rows[0] as Record<string, unknown>).customer
    : undefined
  const parsedCustomer = z.object({
    optimizationScore: z.union([z.string(), z.number()])
      .transform(Number)
      .pipe(z.number().finite())
      .optional(),
    optimizationScoreUrl: z.string().url().regex(/^https:\/\//).optional()
  }).catch({}).parse(customer)
  return {
    customerId: input.customerId,
    optimizationScore: parsedCustomer.optimizationScore ?? null,
    ...(parsedCustomer.optimizationScoreUrl
      ? { optimizationScoreUrl: parsedCustomer.optimizationScoreUrl }
      : {}),
    recommendations: result.rows.map(row => normalizeRecommendation(input.customerId, row)),
    ...(result.more > 0 ? { truncated: true } : {})
  }
}

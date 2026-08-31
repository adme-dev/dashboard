import { z } from 'zod'
import { GOOGLE_ADS_MUTATION_SERVICES } from '~~/server/utils/googleAds/mutate'

export const GoogleAdsRiskTierSchema = z.enum([
  'read',
  'automatic',
  'confirm',
  'rich_confirm',
  'destructive_confirm',
  'blocked',
])
export type GoogleAdsRiskTier = z.infer<typeof GoogleAdsRiskTierSchema>

export const GoogleAdsExecutionModeSchema = z.enum(['automatic', 'proposal', 'blocked'])
export type GoogleAdsExecutionMode = z.infer<typeof GoogleAdsExecutionModeSchema>

export const GoogleAdsResourceTypeSchema = z.enum([
  'account',
  'campaign',
  'budget',
  'bidding_strategy',
  'ad_group',
  'ad',
  'keyword',
  'negative_keyword',
  'shared_negative_set',
  'location',
  'language',
  'ad_schedule',
  'device',
  'demographic',
  'placement',
  'content_exclusion',
  'audience',
  'custom_audience',
  'asset',
  'asset_link',
  'asset_group',
  'listing_group',
  'conversion_action',
  'conversion_goal',
  'recommendation',
])
export type GoogleAdsResourceType = z.infer<typeof GoogleAdsResourceTypeSchema>

export const GoogleAdsOperationTypeSchema = z.enum([
  'create_campaign',
  'update_campaign',
  'set_campaign_status',
  'pause_campaign',
  'enable_campaign',
  'archive_campaign',
  'remove_campaign',
  'create_budget',
  'update_budget',
  'create_bidding_strategy',
  'update_bidding',
  'create_ad_group',
  'update_ad_group',
  'set_ad_group_status',
  'pause_ad_group',
  'enable_ad_group',
  'archive_ad_group',
  'remove_ad_group',
  'create_ad',
  'replace_ad',
  'update_ad_status',
  'pause_ad',
  'enable_ad',
  'archive_ad',
  'remove_ad',
  'add_keywords',
  'update_keyword',
  'set_keyword_status',
  'pause_keyword',
  'enable_keyword',
  'remove_keyword',
  'add_negative_keywords',
  'remove_negative_keyword',
  'manage_shared_negative_set',
  'set_locations',
  'set_location_match_mode',
  'set_languages',
  'set_ad_schedule',
  'set_devices',
  'set_demographics',
  'set_placements',
  'set_content_exclusions',
  'set_audience_associations',
  'manage_custom_audience',
  'set_pmax_signals',
  'set_search_themes',
  'create_asset',
  'attach_asset',
  'detach_asset',
  'archive_asset_link',
  'remove_asset',
  'create_asset_group',
  'update_asset_group',
  'manage_asset_group_assets',
  'manage_listing_groups',
  'create_conversion_action',
  'update_conversion_action',
  'set_conversion_primary_state',
  'set_campaign_conversion_goals',
  'set_conversion_goal',
  'set_customer_goal_biddability',
  'apply_recommendation',
  'dismiss_recommendation',
  'run_search_term_policy',
  'run_pause_policy',
  'reverify_resource',
])
export type GoogleAdsOperationType = z.infer<typeof GoogleAdsOperationTypeSchema>

export const GoogleAdsPolicyDecisionSchema = z.strictObject({
  allowed: z.boolean(),
  riskTier: GoogleAdsRiskTierSchema,
  executionMode: GoogleAdsExecutionModeSchema,
  code: z.string().min(1).max(100).optional(),
})
export type GoogleAdsPolicyDecision = z.infer<typeof GoogleAdsPolicyDecisionSchema>

export const GoogleAdsVerificationDiffSchema = z.strictObject({
  field: z.string().min(1).max(500),
  expected: z.unknown(),
  actual: z.unknown(),
})
export type GoogleAdsVerificationDiff = z.infer<typeof GoogleAdsVerificationDiffSchema>

export const GoogleAdsStateDiffSchema = z.strictObject({
  field: z.string().min(1).max(500),
  before: z.unknown(),
  after: z.unknown(),
})
export type GoogleAdsStateDiff = z.infer<typeof GoogleAdsStateDiffSchema>

const JsonObjectSchema = z.record(z.string(), z.unknown())
const ProviderOperationSchema = z.union([
  z.strictObject({ create: JsonObjectSchema }),
  z.strictObject({ update: JsonObjectSchema, updateMask: z.string().trim().min(1).max(2_000) }),
  z.strictObject({ remove: z.string().trim().min(1).max(1_000) }),
])

export const GoogleAdsProviderMutationSchema = z.strictObject({
  service: z.enum(GOOGLE_ADS_MUTATION_SERVICES),
  atomicity: z.enum(['independent', 'interdependent']),
  partialFailure: z.boolean().default(false),
  operations: z.array(ProviderOperationSchema).min(1).max(1_000),
})
export type GoogleAdsProviderMutation = z.infer<typeof GoogleAdsProviderMutationSchema>

export const GoogleAdsActionStatusSchema = z.enum([
  'planned',
  'pending_approval',
  'approved',
  'executing',
  'verified',
  'partially_verified',
  'provider_rejected',
  'verification_failed',
  'recovery_required',
  'cancelled',
  'expired',
])
export type GoogleAdsActionStatus = z.infer<typeof GoogleAdsActionStatusSchema>

export const GoogleAdsActionPlanSchema = z.strictObject({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  customerId: z.string().regex(/^\d{1,20}$/),
  actorId: z.string().uuid(),
  grantId: z.string().min(1).max(255).nullable().optional(),
  source: z.enum(['mcp', 'chat', 'ui', 'automation']),
  toolName: z.string().min(1).max(255),
  resourceType: GoogleAdsResourceTypeSchema,
  resourceName: z.string().min(1).max(1_000).nullable(),
  operation: GoogleAdsOperationTypeSchema,
  currentState: z.unknown(),
  desiredState: z.unknown(),
  currentStateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  diff: z.array(GoogleAdsStateDiffSchema).max(10_000),
  providerOperations: z.array(GoogleAdsProviderMutationSchema).min(1).max(100),
  riskTier: GoogleAdsRiskTierSchema,
  executionMode: GoogleAdsExecutionModeSchema,
  policyVersion: z.string().min(1).max(255),
  policyDecision: GoogleAdsPolicyDecisionSchema,
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().min(1).max(255),
  status: GoogleAdsActionStatusSchema,
  approvalId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }).optional(),
})
export type GoogleAdsActionPlan = z.infer<typeof GoogleAdsActionPlanSchema>

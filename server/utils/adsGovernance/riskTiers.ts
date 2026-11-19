// server/utils/adsGovernance/riskTiers.ts
// Governance risk tiers for ad-account action families. Pure; no I/O.
//
//   read   — no gate (lists, reads, validation, reverification).
//   low    — one independent approval (requester never approves their own): e.g. add negative keywords.
//   medium — manager approval (MARKETING_MANAGEMENT / MANAGEMENT / ADMIN, or owner): budgets, bidding,
//            conversion settings, pause/enable and every other serving change.
//   high   — owner only, NEVER automatable: removals of campaigns, conversion actions and other
//            provider resources (the same set the Google Ads policy treats as destructive).
//
// This governance tier is separate from — and never relaxes — the technical Google Ads policy tier
// (`automatic` / `confirm` / `rich_confirm` / `destructive_confirm`) in server/utils/googleAds/policy.ts.
// Anything unrecognised classifies as `high` (fail closed).
import type { GoogleAdsOperationType } from '~~/server/utils/googleAds/contracts'

export type AdsRiskTier = 'read' | 'low' | 'medium' | 'high'

export const ADS_RISK_ORDER: Record<AdsRiskTier, number> = { read: 0, low: 1, medium: 2, high: 3 }

export interface AdsTierApprovalRequirement {
  /** Independent approvals required before execution. */
  approvals: 0 | 1
  /** Minimum reviewer authority. */
  reviewer: 'none' | 'independent' | 'manager' | 'owner'
  /** Whether an automation rule may ever execute this tier without a human approval. */
  automatable: boolean
}

export const ADS_TIER_REQUIREMENTS: Record<AdsRiskTier, AdsTierApprovalRequirement> = {
  read: { approvals: 0, reviewer: 'none', automatable: true },
  low: { approvals: 1, reviewer: 'independent', automatable: true },
  medium: { approvals: 1, reviewer: 'manager', automatable: true },
  high: { approvals: 1, reviewer: 'owner', automatable: false }
}

/**
 * Exhaustive by construction: adding a Google Ads operation without classifying it fails typecheck.
 */
export const GOOGLE_ADS_OPERATION_TIERS: Record<GoogleAdsOperationType, AdsRiskTier> = {
  reverify_resource: 'read',

  add_negative_keywords: 'low',
  run_search_term_policy: 'low',
  dismiss_recommendation: 'low',

  create_campaign: 'medium',
  update_campaign: 'medium',
  set_campaign_status: 'medium',
  pause_campaign: 'medium',
  enable_campaign: 'medium',
  archive_campaign: 'medium',
  create_budget: 'medium',
  update_budget: 'medium',
  create_bidding_strategy: 'medium',
  update_bidding: 'medium',
  create_ad_group: 'medium',
  update_ad_group: 'medium',
  set_ad_group_status: 'medium',
  pause_ad_group: 'medium',
  enable_ad_group: 'medium',
  archive_ad_group: 'medium',
  create_ad: 'medium',
  replace_ad: 'medium',
  update_ad_status: 'medium',
  pause_ad: 'medium',
  enable_ad: 'medium',
  archive_ad: 'medium',
  add_keywords: 'medium',
  update_keyword: 'medium',
  set_keyword_status: 'medium',
  pause_keyword: 'medium',
  enable_keyword: 'medium',
  manage_shared_negative_set: 'medium',
  set_locations: 'medium',
  set_location_match_mode: 'medium',
  set_languages: 'medium',
  set_ad_schedule: 'medium',
  set_devices: 'medium',
  set_demographics: 'medium',
  set_placements: 'medium',
  set_content_exclusions: 'medium',
  set_audience_associations: 'medium',
  manage_custom_audience: 'medium',
  set_pmax_signals: 'medium',
  set_search_themes: 'medium',
  create_asset: 'medium',
  attach_asset: 'medium',
  detach_asset: 'medium',
  archive_asset_link: 'medium',
  create_asset_group: 'medium',
  update_asset_group: 'medium',
  manage_asset_group_assets: 'medium',
  manage_listing_groups: 'medium',
  create_conversion_action: 'medium',
  update_conversion_action: 'medium',
  archive_conversion_action: 'medium',
  create_custom_conversion_goal: 'medium',
  update_custom_conversion_goal: 'medium',
  set_conversion_primary_state: 'medium',
  set_campaign_conversion_goals: 'medium',
  set_conversion_goal: 'medium',
  set_customer_goal_biddability: 'medium',
  apply_recommendation: 'medium',
  run_pause_policy: 'medium',

  remove_campaign: 'high',
  remove_ad_group: 'high',
  remove_ad: 'high',
  remove_keyword: 'high',
  remove_negative_keyword: 'high',
  remove_asset: 'high',
  remove_conversion_action: 'high',
  archive_custom_audience: 'high',
  archive_custom_conversion_goal: 'high'
}

/** Tool / family names that are not 1:1 with a Google Ads operation type. */
const NAMED_FAMILY_TIERS: Record<string, AdsRiskTier> = {
  // Google Ads MCP planning tools (the remainder map via their operation suffix below).
  google_ads_plan_pause: 'medium',
  google_ads_plan_enable: 'medium',
  google_ads_plan_archive: 'medium',
  google_ads_plan_remove: 'high',
  google_ads_plan_create_search_campaign: 'medium',
  google_ads_plan_update_bidding_strategy: 'medium',
  google_ads_plan_create_responsive_search_ad: 'medium',
  google_ads_plan_replace_responsive_search_ad: 'medium',
  google_ads_plan_set_campaign_goal_config: 'medium',
  google_ads_plan_set_asset_group_assets: 'medium',
  google_ads_plan_set_listing_groups: 'medium',
  google_ads_plan_create_custom_audience: 'medium',
  google_ads_plan_update_custom_audience: 'medium',
  google_ads_plan_set_pmax_audience_signals: 'medium',
  google_ads_plan_set_pmax_search_themes: 'medium',
  google_ads_run_search_term_policy: 'low',
  google_ads_run_pause_policy: 'medium',
  google_ads_validate_action_plan: 'read',
  google_ads_reverify_resource: 'read',
  google_ads_review_portfolio: 'read',
  propose_google_ads_action: 'high', // generic proposal: tier comes from its typed operation, never the tool

  // Marketing department budget / spend families.
  department_budget_allocation: 'medium',
  marketing_propose_budget_allocations: 'medium',
  marketing_review_budget_allocations: 'medium',
  marketing_set_budget_allocations: 'medium',
  propose_set_campaign_budget: 'medium',
  propose_bulk_set_campaign_budgets: 'medium',
  propose_budget_change: 'medium',
  marketing_get_budget_proposal: 'read',
  marketing_list_budget_allocations: 'read',
  marketing_budget_health: 'read',

  // Abstract families used by automation rules.
  negative_keywords: 'low',
  recommendation_dismissal: 'low',
  pause: 'medium',
  enable: 'medium',
  budget: 'medium',
  bidding: 'medium',
  conversion_settings: 'medium',
  asset_detachment: 'medium',
  campaign_removal: 'high',
  conversion_action_removal: 'high'
}

const READ_PREFIXES = ['google_ads_list_', 'google_ads_get_', 'google_ads_resolve_', 'meta_list_', 'meta_get_', 'marketing_list_', 'marketing_get_']

function isOperation(value: string): value is GoogleAdsOperationType {
  return Object.prototype.hasOwnProperty.call(GOOGLE_ADS_OPERATION_TIERS, value)
}

/**
 * Governance risk tier for an action family, a Google Ads operation type or an MCP tool name.
 * Unknown or malformed input is `high` (owner-only, never automatable).
 */
export function classifyAdsActionRisk(familyOrToolName: string): AdsRiskTier {
  if (typeof familyOrToolName !== 'string') return 'high'
  const name = familyOrToolName.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{0,99}$/.test(name)) return 'high'
  if (Object.prototype.hasOwnProperty.call(NAMED_FAMILY_TIERS, name)) return NAMED_FAMILY_TIERS[name]!
  if (isOperation(name)) return GOOGLE_ADS_OPERATION_TIERS[name]
  if (name.startsWith('google_ads_plan_')) {
    const operation = name.slice('google_ads_plan_'.length)
    if (isOperation(operation)) return GOOGLE_ADS_OPERATION_TIERS[operation]
    return 'high'
  }
  if (READ_PREFIXES.some(prefix => name.startsWith(prefix))) return 'read'
  return 'high'
}

export function maxAdsRiskTier(...tiers: AdsRiskTier[]): AdsRiskTier {
  return tiers.reduce<AdsRiskTier>((max, tier) => ADS_RISK_ORDER[tier] > ADS_RISK_ORDER[max] ? tier : max, 'read')
}

export interface TierReviewerFacts {
  requesterId: string
  reviewerId: string
  /** Fresh system role of the reviewer (e.g. `owner`). */
  reviewerRole: string | null | undefined
  /** Fresh permission groups of the reviewer. */
  reviewerGroups: readonly string[] | null | undefined
}

export type TierApprovalDenial
  = | 'ADS_TIER_SELF_APPROVAL'
    | 'ADS_TIER_REVIEWER_REQUIRED'
    | 'ADS_TIER_MANAGER_REQUIRED'
    | 'ADS_TIER_OWNER_REQUIRED'

const MANAGER_GROUPS = ['MARKETING_MANAGEMENT', 'MANAGEMENT', 'ADMIN']

/**
 * Whether `reviewer` may approve an action of `tier` requested by `requesterId`. This is applied ON TOP
 * of the existing independent-review gates and can only narrow who may approve.
 */
export function evaluateTierApproval(tier: AdsRiskTier, facts: TierReviewerFacts): { ok: true } | { ok: false, code: TierApprovalDenial } {
  if (tier === 'read') return { ok: true }
  const requester = String(facts.requesterId ?? '').toLowerCase()
  const reviewer = String(facts.reviewerId ?? '').toLowerCase()
  if (!requester || !reviewer) return { ok: false, code: 'ADS_TIER_REVIEWER_REQUIRED' }
  if (requester === reviewer) return { ok: false, code: 'ADS_TIER_SELF_APPROVAL' }
  const isOwner = facts.reviewerRole === 'owner'
  if (tier === 'high') return isOwner ? { ok: true } : { ok: false, code: 'ADS_TIER_OWNER_REQUIRED' }
  if (tier === 'medium') {
    const groups = facts.reviewerGroups ?? []
    return isOwner || MANAGER_GROUPS.some(group => groups.includes(group))
      ? { ok: true }
      : { ok: false, code: 'ADS_TIER_MANAGER_REQUIRED' }
  }
  return { ok: true }
}

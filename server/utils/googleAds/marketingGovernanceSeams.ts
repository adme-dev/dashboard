// server/utils/googleAds/marketingGovernanceSeams.ts
// Phase-3 (draft → approve) seams for the marketing automation governance plan
// (.planning/todos/008-marketing-automation-governance.md).
//
// PHASE 2 OWNS THESE DECISIONS. Phase 2 (risk tiers, hard limits, kill switch, rule registry) replaces
// both functions below with its classifier and limit engine. Until then they encode TODAY's behaviour
// exactly, so wiring phase 3 changes nobody's authority:
//   - every delegated marketing Google Ads plan needs ONE independent approval from a current ADMIN or
//     MARKETING_MANAGEMENT member who covers the client (requireIndependentMarketingReviewer), or the
//     active owner; the requester can never approve their own plan; nothing here is automatable;
//   - there are no per-account/per-day limits and no kill switch, so the limit check always admits.
// Keep the signatures stable: the review service, MCP staff tools, native chat and owner God-mode tools
// all call through here and never re-derive approval policy themselves.
import type { GoogleAdsActionPlan, GoogleAdsOperationType } from './contracts'

/** Action families as phase 2 will classify them (read/low/medium/high tiers attach to these). */
export type MarketingAdsActionFamily
  = | 'negative_keywords'
    | 'pause'
    | 'enable'
    | 'budget'
    | 'bidding'
    | 'conversion_settings'
    | 'archive_remove'
    | 'other'

const FAMILY_BY_OPERATION: Partial<Record<GoogleAdsOperationType, MarketingAdsActionFamily>> = {
  add_negative_keywords: 'negative_keywords',
  manage_shared_negative_set: 'negative_keywords',
  remove_negative_keyword: 'negative_keywords',
  pause_campaign: 'pause',
  pause_ad_group: 'pause',
  pause_ad: 'pause',
  pause_keyword: 'pause',
  enable_campaign: 'enable',
  enable_ad_group: 'enable',
  enable_ad: 'enable',
  enable_keyword: 'enable',
  create_budget: 'budget',
  update_budget: 'budget',
  create_bidding_strategy: 'bidding',
  update_bidding: 'bidding',
  archive_campaign: 'archive_remove',
  archive_ad_group: 'archive_remove',
  archive_ad: 'archive_remove',
  remove_campaign: 'archive_remove',
  remove_ad_group: 'archive_remove',
  remove_ad: 'archive_remove',
  remove_keyword: 'archive_remove'
}

export function marketingAdsActionFamilyForOperation(operation: GoogleAdsOperationType | string): MarketingAdsActionFamily {
  return FAMILY_BY_OPERATION[operation as GoogleAdsOperationType] ?? 'other'
}

export interface RequiredMarketingApproval {
  /** Distinct approvals required before execution. Today: always one. */
  approvals: 1
  /** Who may approve. Today: an independent ADMIN / MARKETING_MANAGEMENT reviewer covering the client. */
  approver: 'independent_marketing_reviewer'
  /** The active owner (God mode) may always approve, never their own request. */
  ownerMayApprove: true
  /** The requester can never approve their own plan, at any tier. */
  requesterMayApprove: false
  /** Whether a rule may auto-apply this family. Today: never (phase 5 is gated). */
  automatable: false
}

const TODAY: RequiredMarketingApproval = Object.freeze({
  approvals: 1,
  approver: 'independent_marketing_reviewer',
  ownerMayApprove: true,
  requesterMayApprove: false,
  automatable: false
})

/**
 * SEAM — replaced by phase 2's risk-tier classifier (low → one independent approval, medium → manager
 * approval, high → owner only and never automatable). Returns today's single rule for every family.
 */
export function requiredApprovalForFamily(
  _family: MarketingAdsActionFamily,
  _riskTier?: GoogleAdsActionPlan['riskTier']
): RequiredMarketingApproval {
  return TODAY
}

export type GovernanceLimitDecision
  = | { allowed: true }
    | { allowed: false, code: 'kill_switch' | 'limit_exceeded' | 'outside_business_hours', message: string }

/**
 * SEAM — replaced by phase 2's hard limits (max ±% budget change, max changes per account per day,
 * business-hours window) and the global automation kill switch. Called immediately before an approved
 * plan is handed to the existing executor. Today there are no limits, so it always admits.
 */
export async function checkMarketingExecutionLimits(
  _plan: Pick<GoogleAdsActionPlan, 'id' | 'clientId' | 'customerId' | 'operation' | 'riskTier'>
): Promise<GovernanceLimitDecision> {
  return { allowed: true }
}

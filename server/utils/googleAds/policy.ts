import {
  GoogleAdsPolicyDecisionSchema,
  type GoogleAdsOperationType,
  type GoogleAdsPolicyDecision,
  type GoogleAdsRiskTier
} from '~~/server/utils/googleAds/contracts'

export type GoogleAdsAutomaticActionClass
  = | 'negative_keywords'
    | 'pause'
    | 'recommendation_dismissal'
    | 'asset_detachment'

export interface GoogleAdsAccountPolicyInput {
  enabled: boolean
  actionClass?: GoogleAdsAutomaticActionClass
  minimumRiskTier?: Exclude<GoogleAdsRiskTier, 'read' | 'blocked'>
}

export interface ResolveGoogleAdsPolicyInput {
  operation: GoogleAdsOperationType
  actorRole: string
  hasMediaPermission: boolean
  hasElevatedPermission: boolean
  hasWriteScope: boolean
  globalWriteEnabled: boolean
  automationEnabled: boolean
  destructiveEnabled: boolean
  requestedMode: 'automatic' | 'proposal'
  /** Server-derived risk of the typed underlying mutation (for example a budget recommendation). */
  actionRiskTier?: Exclude<GoogleAdsRiskTier, 'read' | 'blocked'>
  accountPolicy: GoogleAdsAccountPolicyInput
}

const RISK_ORDER: Record<Exclude<GoogleAdsRiskTier, 'read' | 'blocked'>, number> = {
  automatic: 0,
  confirm: 1,
  rich_confirm: 2,
  destructive_confirm: 3
}

const RICH_CONFIRM_OPERATIONS = new Set<GoogleAdsOperationType>([
  'create_budget',
  'update_budget',
  'create_bidding_strategy',
  'update_bidding',
  'set_campaign_status',
  'enable_campaign',
  'set_ad_group_status',
  'enable_ad_group',
  'update_ad_status',
  'enable_ad',
  'set_keyword_status',
  'enable_keyword',
  'create_conversion_action',
  'update_conversion_action',
  'archive_conversion_action',
  'set_conversion_primary_state',
  'set_campaign_conversion_goals',
  'set_audience_associations',
  'manage_custom_audience',
  'set_pmax_signals',
  'set_search_themes',
  'set_conversion_goal',
  'set_customer_goal_biddability'
])

const DESTRUCTIVE_OPERATIONS = new Set<GoogleAdsOperationType>([
  'remove_campaign',
  'remove_ad_group',
  'remove_ad',
  'remove_keyword',
  'remove_negative_keyword',
  'archive_custom_audience',
  'remove_conversion_action',
  'remove_asset'
])

const AUTOMATIC_ACTION_CLASSES: Partial<Record<GoogleAdsOperationType, GoogleAdsAutomaticActionClass>> = {
  add_negative_keywords: 'negative_keywords',
  pause_campaign: 'pause',
  pause_ad_group: 'pause',
  pause_ad: 'pause',
  pause_keyword: 'pause',
  dismiss_recommendation: 'recommendation_dismissal',
  detach_asset: 'asset_detachment',
  run_search_term_policy: 'negative_keywords',
  run_pause_policy: 'pause'
}

export function googleAdsAutomaticActionClassForOperation(
  operation: GoogleAdsOperationType
): GoogleAdsAutomaticActionClass | undefined {
  return AUTOMATIC_ACTION_CLASSES[operation]
}

function blocked(code: string): GoogleAdsPolicyDecision {
  return GoogleAdsPolicyDecisionSchema.parse({
    allowed: false,
    riskTier: 'blocked',
    executionMode: 'blocked',
    code
  })
}

function maximumRisk(
  left: Exclude<GoogleAdsRiskTier, 'read' | 'blocked'>,
  right?: Exclude<GoogleAdsRiskTier, 'read' | 'blocked'>
): Exclude<GoogleAdsRiskTier, 'read' | 'blocked'> {
  if (!right) return left
  return RISK_ORDER[right] > RISK_ORDER[left] ? right : left
}

function hardRiskFloor(operation: GoogleAdsOperationType): Exclude<GoogleAdsRiskTier, 'read' | 'blocked'> {
  if (DESTRUCTIVE_OPERATIONS.has(operation)) return 'destructive_confirm'
  if (RICH_CONFIRM_OPERATIONS.has(operation)) return 'rich_confirm'
  if (AUTOMATIC_ACTION_CLASSES[operation]) return 'automatic'
  return 'confirm'
}

export function resolveGoogleAdsPolicy(input: ResolveGoogleAdsPolicyInput): GoogleAdsPolicyDecision {
  if (!input.globalWriteEnabled) return blocked('writes_disabled')
  if (!input.hasWriteScope) return blocked('insufficient_scope')
  if (!input.hasMediaPermission) return blocked('media_permission_required')
  if (!input.accountPolicy.enabled) return blocked('account_policy_disabled')

  const floor = maximumRisk(hardRiskFloor(input.operation), input.actionRiskTier)
  const actionClass = AUTOMATIC_ACTION_CLASSES[input.operation]
  const automaticAllowed = floor === 'automatic'
    && input.requestedMode === 'automatic'
    && input.automationEnabled
    && actionClass !== undefined
    && input.accountPolicy.actionClass === actionClass

  let riskTier: Exclude<GoogleAdsRiskTier, 'read' | 'blocked'> = automaticAllowed
    ? 'automatic'
    : floor === 'automatic' ? 'confirm' : floor
  riskTier = maximumRisk(riskTier, input.accountPolicy.minimumRiskTier)

  if (riskTier === 'destructive_confirm') {
    if (!input.destructiveEnabled) return blocked('destructive_actions_disabled')
    if (input.actorRole !== 'owner' && input.actorRole !== 'admin') {
      return blocked('owner_or_admin_required')
    }
  }
  if (riskTier === 'rich_confirm' && !input.hasElevatedPermission) {
    return blocked('elevated_permission_required')
  }

  return GoogleAdsPolicyDecisionSchema.parse({
    allowed: true,
    riskTier,
    executionMode: riskTier === 'automatic' ? 'automatic' : 'proposal'
  })
}

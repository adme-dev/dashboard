import type {
  GoogleAiMaxMigrationReason,
  GoogleAiMaxReadinessStatus,
  GoogleAiMaxRisk,
  GoogleAiMaxSearchMatchingStatus,
  GoogleAiMaxToggleStatus
} from '~/types'

export function aiMaxReadinessLabel(status: GoogleAiMaxReadinessStatus): string {
  return {
    ready: 'AI Max ready',
    scheduled_upgrade: 'Upgrade scheduled',
    needs_review: 'Needs review',
    not_affected: 'Not affected',
    unknown: 'Unknown'
  }[status]
}

export function aiMaxReadinessTone(status: GoogleAiMaxReadinessStatus) {
  return {
    ready: 'success',
    scheduled_upgrade: 'warning',
    needs_review: 'error',
    not_affected: 'neutral',
    unknown: 'error'
  }[status] as 'success' | 'warning' | 'error' | 'neutral'
}

export function aiMaxMigrationReasonLabel(reason: GoogleAiMaxMigrationReason): string {
  return {
    aca: 'Automatically created assets',
    campaign_broad_match: 'Campaign broad match',
    aca_and_campaign_broad_match: 'Automatically created assets + campaign broad match',
    none: 'No legacy trigger',
    unknown: 'Unknown evidence'
  }[reason]
}

const RISK_LABELS: Record<GoogleAiMaxRisk, string> = {
  AUTO_UPGRADE_PENDING: 'Automatic upgrade pending',
  BUNDLING_REQUIRED: 'Google requires bundled AI Max controls',
  PARTIAL_SEARCH_MATCHING: 'Some ad groups disable search-term matching',
  UNKNOWN_CONFIGURATION: 'Google configuration is incomplete or unrecognized',
  ALL_AD_GROUPS_MATCHING_DISABLED: 'Every ad group disables search-term matching',
  STALE_SCAN: 'Scan evidence is stale',
  SMART_BIDDING_MISMATCH: 'Bidding strategy needs review',
  FINAL_URL_EXPANSION_ENABLED: 'Final URL expansion is enabled',
  TEXT_CUSTOMISATION_ENABLED: 'Text customisation is enabled'
}

export function aiMaxRiskLabel(risk: GoogleAiMaxRisk): string {
  return RISK_LABELS[risk] ?? risk
}

export function aiMaxToggleLabel(status: GoogleAiMaxToggleStatus): string {
  return { enabled: 'Enabled', disabled: 'Disabled', unknown: 'Unknown' }[status]
}

export function aiMaxSearchMatchingLabel(status: GoogleAiMaxSearchMatchingStatus): string {
  return {
    enabled: 'Enabled',
    partially_disabled: 'Partially disabled',
    disabled: 'Disabled',
    unknown: 'Unknown'
  }[status]
}

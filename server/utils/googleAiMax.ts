export type AiMaxMigrationReason =
  | 'aca'
  | 'campaign_broad_match'
  | 'aca_and_campaign_broad_match'
  | 'none'
  | 'unknown'

export type AiMaxReadinessStatus =
  | 'ready'
  | 'scheduled_upgrade'
  | 'needs_review'
  | 'not_affected'
  | 'unknown'

export type AiMaxRisk =
  | 'AUTO_UPGRADE_PENDING'
  | 'BUNDLING_REQUIRED'
  | 'PARTIAL_SEARCH_MATCHING'
  | 'UNKNOWN_CONFIGURATION'
  | 'ALL_AD_GROUPS_MATCHING_DISABLED'

export type EffectiveToggleStatus = 'enabled' | 'disabled' | 'unknown'
export type EffectiveSearchTermMatchingStatus = EffectiveToggleStatus | 'partially_disabled'

export interface GoogleAiMaxObservation {
  apiVersion: string
  tenantId: string
  connectionId: string
  customerId: string
  campaignId: string
  campaignName: string
  campaignStatus: string
  advertisingChannelType: string
  biddingStrategyType: string | null
  keywordMatchType: string | null
  aiMaxEnabled: boolean | null
  bundlingRequired: string | null
  textAssetAutomationStatus: string | null
  finalUrlExpansionStatus: string | null
  adGroupCount: number | null
  searchTermMatchingDisabledAdGroupCount: number | null
  observedAt: string
}

export interface GoogleAiMaxClassification {
  migrationReason: AiMaxMigrationReason
  status: AiMaxReadinessStatus
  risks: AiMaxRisk[]
  effectiveSettings: {
    searchTermMatching: EffectiveSearchTermMatchingStatus
    textCustomisation: EffectiveToggleStatus
    finalUrlExpansion: EffectiveToggleStatus
  }
}

interface RawAssetAutomationSetting {
  assetAutomationType?: string
  assetAutomationStatus?: string
}

interface RawGoogleCampaignRow {
  campaign?: {
    id?: string | number
    name?: string
    status?: string
    advertisingChannelType?: string
    biddingStrategyType?: string
    keywordMatchType?: string
    aiMaxSetting?: {
      enableAiMax?: boolean
      bundlingRequired?: string
    }
    assetAutomationSettings?: RawAssetAutomationSetting[]
  }
}

interface RawGoogleAdGroupRow {
  adGroup?: {
    id?: string | number
    campaign?: string
    status?: string
    aiMaxAdGroupSetting?: {
      disableSearchTermMatching?: boolean
    }
  }
}

export interface NormalizeGoogleAiMaxObservationInput {
  apiVersion: string
  tenantId: string
  connectionId: string
  customerId: string
  observedAt: string
  campaignRow: RawGoogleCampaignRow
  adGroupRows: RawGoogleAdGroupRow[]
}

const KNOWN_KEYWORD_MATCH_TYPES = new Set(['BROAD', 'UNSPECIFIED'])
const KNOWN_AUTOMATION_STATUSES = new Set(['OPTED_IN', 'OPTED_OUT'])
const KNOWN_BUNDLING_STATUSES = new Set(['REQUIRED', 'NOT_REQUIRED'])

function assetAutomationStatus(
  settings: RawAssetAutomationSetting[] | undefined,
  type: string,
): string | null {
  if (!Array.isArray(settings)) return null
  const setting = settings.find(item => item.assetAutomationType === type)
  return typeof setting?.assetAutomationStatus === 'string'
    ? setting.assetAutomationStatus
    : null
}

function campaignIdFromResourceName(resourceName: string | undefined): string | null {
  if (!resourceName) return null
  return resourceName.match(/\/campaigns\/(\d+)$/)?.[1] ?? null
}

export function normalizeGoogleAiMaxObservation(
  input: NormalizeGoogleAiMaxObservationInput,
): GoogleAiMaxObservation {
  const campaign = input.campaignRow.campaign ?? {}
  const campaignId = campaign.id == null ? '' : String(campaign.id)
  const matchingAdGroups = input.adGroupRows.filter((row) => {
    const adGroup = row.adGroup
    return adGroup?.status !== 'REMOVED'
      && campaignIdFromResourceName(adGroup?.campaign) === campaignId
  })
  const hasCompleteAdGroupEvidence = matchingAdGroups.every(
    row => typeof row.adGroup?.aiMaxAdGroupSetting?.disableSearchTermMatching === 'boolean',
  )

  return {
    apiVersion: input.apiVersion,
    tenantId: input.tenantId,
    connectionId: input.connectionId,
    customerId: input.customerId,
    campaignId,
    campaignName: typeof campaign.name === 'string' ? campaign.name : '',
    campaignStatus: typeof campaign.status === 'string' ? campaign.status : '',
    advertisingChannelType: typeof campaign.advertisingChannelType === 'string'
      ? campaign.advertisingChannelType
      : '',
    biddingStrategyType: typeof campaign.biddingStrategyType === 'string'
      ? campaign.biddingStrategyType
      : null,
    keywordMatchType: typeof campaign.keywordMatchType === 'string'
      ? campaign.keywordMatchType
      : null,
    aiMaxEnabled: typeof campaign.aiMaxSetting?.enableAiMax === 'boolean'
      ? campaign.aiMaxSetting.enableAiMax
      : null,
    bundlingRequired: typeof campaign.aiMaxSetting?.bundlingRequired === 'string'
      ? campaign.aiMaxSetting.bundlingRequired
      : null,
    textAssetAutomationStatus: assetAutomationStatus(
      campaign.assetAutomationSettings,
      'TEXT_ASSET_AUTOMATION',
    ),
    finalUrlExpansionStatus: assetAutomationStatus(
      campaign.assetAutomationSettings,
      'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION',
    ),
    adGroupCount: hasCompleteAdGroupEvidence ? matchingAdGroups.length : null,
    searchTermMatchingDisabledAdGroupCount: hasCompleteAdGroupEvidence
      ? matchingAdGroups.filter(
          row => row.adGroup?.aiMaxAdGroupSetting?.disableSearchTermMatching === true,
        ).length
      : null,
    observedAt: input.observedAt,
  }
}

function hasCompleteEvidence(observation: GoogleAiMaxObservation): boolean {
  return observation.advertisingChannelType === 'SEARCH'
    && observation.aiMaxEnabled !== null
    && observation.keywordMatchType !== null
    && KNOWN_KEYWORD_MATCH_TYPES.has(observation.keywordMatchType)
    && observation.textAssetAutomationStatus !== null
    && KNOWN_AUTOMATION_STATUSES.has(observation.textAssetAutomationStatus)
    && observation.finalUrlExpansionStatus !== null
    && KNOWN_AUTOMATION_STATUSES.has(observation.finalUrlExpansionStatus)
    && observation.bundlingRequired !== null
    && KNOWN_BUNDLING_STATUSES.has(observation.bundlingRequired)
    && observation.adGroupCount !== null
    && observation.adGroupCount >= 0
    && observation.searchTermMatchingDisabledAdGroupCount !== null
    && observation.searchTermMatchingDisabledAdGroupCount >= 0
    && observation.searchTermMatchingDisabledAdGroupCount <= observation.adGroupCount
}

function deriveMigrationReason(observation: GoogleAiMaxObservation): AiMaxMigrationReason {
  const hasAca = observation.textAssetAutomationStatus === 'OPTED_IN'
  const hasCampaignBroadMatch = observation.keywordMatchType === 'BROAD'

  if (hasAca && hasCampaignBroadMatch) return 'aca_and_campaign_broad_match'
  if (hasAca) return 'aca'
  if (hasCampaignBroadMatch) return 'campaign_broad_match'
  return 'none'
}

function automationStatus(value: string | null): EffectiveToggleStatus {
  if (value === 'OPTED_IN') return 'enabled'
  if (value === 'OPTED_OUT') return 'disabled'
  return 'unknown'
}

function searchTermMatchingStatus(
  observation: GoogleAiMaxObservation,
): EffectiveSearchTermMatchingStatus {
  if (observation.aiMaxEnabled === false) return 'disabled'
  if (observation.aiMaxEnabled !== true
    || observation.adGroupCount === null
    || observation.searchTermMatchingDisabledAdGroupCount === null) {
    return 'unknown'
  }

  const disabled = observation.searchTermMatchingDisabledAdGroupCount
  if (observation.adGroupCount > 0 && disabled === observation.adGroupCount) return 'disabled'
  if (disabled > 0) return 'partially_disabled'
  return 'enabled'
}

export function classifyAiMaxReadiness(
  observation: GoogleAiMaxObservation,
): GoogleAiMaxClassification {
  if (!hasCompleteEvidence(observation)) {
    return {
      migrationReason: 'unknown',
      status: 'unknown',
      risks: ['UNKNOWN_CONFIGURATION'],
      effectiveSettings: {
        searchTermMatching: 'unknown',
        textCustomisation: automationStatus(observation.textAssetAutomationStatus),
        finalUrlExpansion: automationStatus(observation.finalUrlExpansionStatus),
      },
    }
  }

  const migrationReason = deriveMigrationReason(observation)
  const searchTermMatching = searchTermMatchingStatus(observation)
  const risks: AiMaxRisk[] = []

  if (migrationReason !== 'none' && observation.aiMaxEnabled === false) {
    risks.push('AUTO_UPGRADE_PENDING')
  }
  if (observation.bundlingRequired === 'REQUIRED') {
    risks.push('BUNDLING_REQUIRED')
  }
  if (searchTermMatching === 'partially_disabled') {
    risks.push('PARTIAL_SEARCH_MATCHING')
  }
  if (observation.aiMaxEnabled === true
    && observation.adGroupCount > 0
    && observation.searchTermMatchingDisabledAdGroupCount === observation.adGroupCount) {
    risks.push('ALL_AD_GROUPS_MATCHING_DISABLED')
  }

  let status: AiMaxReadinessStatus
  if (risks.some(risk => risk !== 'AUTO_UPGRADE_PENDING')) {
    status = 'needs_review'
  } else if (migrationReason !== 'none' && observation.aiMaxEnabled === false) {
    status = 'scheduled_upgrade'
  } else if (observation.aiMaxEnabled === true) {
    status = 'ready'
  } else {
    status = 'not_affected'
  }

  return {
    migrationReason,
    status,
    risks,
    effectiveSettings: {
      searchTermMatching,
      textCustomisation: automationStatus(observation.textAssetAutomationStatus),
      finalUrlExpansion: automationStatus(observation.finalUrlExpansionStatus),
    },
  }
}

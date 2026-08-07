import {
  normalizeFixedFlightBudget,
  type FixedFlightBudgetContract
} from '~~/server/utils/googleCampaignBudgetContract'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'

export interface GooglePmaxInventoryLaunchConfig {
  schemaVersion: 2
  briefId: string
  briefVersion: number
  tenantId: string
  clientId: string
  connectionId: string
  customerId: string
  campaignName: string
  budget: FixedFlightBudgetContract
  bidding: {
    strategy: 'MAXIMIZE_CONVERSIONS' | 'MAXIMIZE_CONVERSION_VALUE'
    targetCpaMicros?: string
    targetRoas?: number
  }
  schedule: { startDate: string, endDate: string }
  locations: Array<{ criterionId: string, displayName: string }>
  languages: string[]
  finalUrls: string[]
  merchantCenterId: string
  inventorySource: {
    providerId: 'social-dashboard'
    linkId: string
    feedId: string
    platform: 'google'
  }
  inventoryFilter: {
    listingSource: 'SHOPPING'
    conditions: Array<'NEW' | 'USED'>
  }
  assetGroup: {
    mode: 'MERCHANT_ONLY' | 'PROVIDED'
    name: string
    businessName: string
    headlines: string[]
    longHeadlines: string[]
    descriptions: string[]
    imageAssetResourceNames: string[]
    logoAssetResourceNames: string[]
    youtubeVideoAssetResourceNames: string[]
  }
  conversionGoals: Array<{
    conversionActionId: string
    resourceName: string
    category: string
    origin: string
  }>
  approval: {
    required: true
    complianceAcknowledged: boolean
  }
}

export interface GooglePmaxLaunchConfigIssue {
  code: string
  path: string
  message: string
}

export interface GooglePmaxLaunchNormalizationInput {
  brief: {
    id: string
    version: number
    tenantId: string
    clientId: string
    status: string
    templateSlug: string
  }
  fieldValues: Record<string, unknown> | Array<{ fieldKey: string, value: unknown }>
  provider: {
    selectedConnectionId: string
    connectionId: string
    selectedConversionActionIds: string[]
    customerId: string
    accountCurrency: string
    accountTimezone: string
    inventorySource: {
      linkId: string
      providerId: string
      selectedFeedId: string
      feedId: string
      platform: string
      active: boolean
    }
    locations: Array<{ criterionId: string, displayName: string, sourceText: string }>
    assetGroup: {
      requiredAssetCoverageComplete: boolean
      imageAssetResourceNames: string[]
      logoAssetResourceNames: string[]
      youtubeVideoAssetResourceNames: string[]
    }
    conversionGoals: Array<{
      conversionActionId: string
      resourceName: string
      category: string
      origin: string
    }>
  }
}

export type GooglePmaxLaunchNormalizationResult
  = { ok: true, value: { config: GooglePmaxInventoryLaunchConfig, configHash: string } }
    | { ok: false, issues: GooglePmaxLaunchConfigIssue[] }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedStrings(value: unknown, splitPattern: RegExp = /\r?\n/): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(splitPattern)
      : []
  return [...new Set(values
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean))]
    .sort(lexicalCompare)
}

function requiredString(
  value: unknown,
  code: string,
  path: string,
  issues: GooglePmaxLaunchConfigIssue[]
): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  issues.push({ code, path, message: `${path} is required for a Google PMax Inventory launch plan.` })
  return ''
}

function fieldMap(
  input: GooglePmaxLaunchNormalizationInput['fieldValues'],
  issues: GooglePmaxLaunchConfigIssue[]
): Map<string, unknown> {
  const entries = Array.isArray(input)
    ? input.map(field => [field.fieldKey, field.value] as const)
    : Object.entries(input)
  const fields = new Map<string, unknown>()
  for (const [fieldKey, value] of entries) {
    if (fields.has(fieldKey)) {
      issues.push(issue('PMAX_FIELD_DUPLICATE', fieldKey, `Field ${fieldKey} has ambiguous duplicate values.`))
      continue
    }
    fields.set(fieldKey, value)
  }
  return fields
}

function issue(code: string, path: string, message: string): GooglePmaxLaunchConfigIssue {
  return { code, path, message }
}

function isNonPublicIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some(octet => octet < 0 || octet > 255)) return true
  const [first, second] = octets as [number, number, number, number]
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224
}

function isNonPublicHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.home.arpa')
  ) return true

  if (isNonPublicIpv4(hostname)) return true
  if (!hostname.includes(':')) return false

  const firstGroup = hostname.split(':').find(Boolean) || ''
  const firstGroupValue = Number.parseInt(firstGroup, 16)
  return hostname === '::'
    || hostname === '::1'
    || hostname.startsWith('::ffff:')
    || /^f[cd]/.test(firstGroup)
    || (Number.isFinite(firstGroupValue) && firstGroupValue >= 0xfe80 && firstGroupValue <= 0xfebf)
}

function normalizeUrl(value: string, issues: GooglePmaxLaunchConfigIssue[]): string {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || isNonPublicHostname(url.hostname)
    ) throw new Error('not public HTTPS')
    url.hash = ''
    return url.toString()
  } catch {
    issues.push(issue('PMAX_FINAL_URL_INVALID', 'final_url', 'Final URL must be a valid public HTTPS URL.'))
    return ''
  }
}

function sortedLocations(locations: GooglePmaxLaunchNormalizationInput['provider']['locations']) {
  const seen = new Map<string, { criterionId: string, displayName: string, sourceText: string }>()
  const conflicts: string[] = []
  const normalized = [...locations]
    .map(location => ({
      criterionId: String(location.criterionId).trim(),
      displayName: String(location.displayName).trim(),
      sourceText: String(location.sourceText).trim()
    }))
    .filter(location => location.criterionId && location.displayName && location.sourceText)
  for (const location of normalized) {
    const prior = seen.get(location.criterionId)
    if (prior && JSON.stringify(prior) !== JSON.stringify(location)) conflicts.push(location.criterionId)
    else if (!prior) seen.set(location.criterionId, location)
  }
  return {
    locations: [...seen.values()].sort((left, right) => lexicalCompare(left.criterionId, right.criterionId)),
    conflicts
  }
}

function sortedConversionGoals(
  goals: GooglePmaxLaunchNormalizationInput['provider']['conversionGoals'],
  customerId: string,
  issues: GooglePmaxLaunchConfigIssue[]
) {
  const seen = new Map<string, string>()
  return [...goals].map(goal => ({
    conversionActionId: String(goal.conversionActionId).trim(),
    resourceName: String(goal.resourceName).trim(),
    category: String(goal.category).trim(),
    origin: String(goal.origin).trim()
  }))
    .filter((goal) => {
      const expectedResource = `customers/${customerId}/conversionActions/${goal.conversionActionId}`
      if (!goal.conversionActionId || !goal.category || !goal.origin || goal.resourceName !== expectedResource) {
        issues.push(issue('PMAX_CONVERSION_RESOURCE_INVALID', 'provider.conversionGoals', 'Conversion goal identity does not match the selected customer and action.'))
        return false
      }
      const serialized = JSON.stringify(goal)
      const prior = seen.get(goal.conversionActionId)
      if (prior && prior !== serialized) {
        issues.push(issue('PMAX_CONVERSION_GOAL_CONFLICT', 'provider.conversionGoals', 'Conversion action has conflicting provider evidence.'))
        return false
      }
      if (prior) return false
      seen.set(goal.conversionActionId, serialized)
      return true
    })
    .sort((left, right) => lexicalCompare(left.conversionActionId, right.conversionActionId))
}

function normalizedAssetResources(
  values: string[],
  customerId: string,
  issues: GooglePmaxLaunchConfigIssue[]
): string[] {
  const expected = new RegExp(`^customers/${customerId}/assets/[1-9]\\d*$`)
  const normalized = normalizedStrings(values)
  if (normalized.some(value => !expected.test(value))) {
    issues.push(issue('PMAX_ASSET_RESOURCE_INVALID', 'provider.assetGroup', 'Asset resource does not belong to the selected customer.'))
  }
  return normalized.filter(value => expected.test(value))
}

function strictNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !/^-?(?:\d+|\d*\.\d+)$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeGooglePmaxInventoryLaunchConfig(
  input: GooglePmaxLaunchNormalizationInput
): GooglePmaxLaunchNormalizationResult {
  const issues: GooglePmaxLaunchConfigIssue[] = []
  const fields = fieldMap(input.fieldValues, issues)

  const briefId = input.brief.id.toLowerCase()
  const tenantId = input.brief.tenantId.toLowerCase()
  const clientId = input.brief.clientId.toLowerCase()
  const providerConnectionId = input.provider.connectionId.toLowerCase()
  const selectedConnectionId = input.provider.selectedConnectionId.toLowerCase()

  if (!UUID_PATTERN.test(briefId)) issues.push(issue('PMAX_BRIEF_ID_INVALID', 'brief.id', 'Brief ID must be a UUID.'))
  if (!UUID_PATTERN.test(tenantId)) issues.push(issue('PMAX_TENANT_ID_INVALID', 'brief.tenantId', 'Tenant ID must be a UUID.'))
  if (!UUID_PATTERN.test(clientId)) issues.push(issue('PMAX_CLIENT_ID_INVALID', 'brief.clientId', 'Client ID must be a UUID.'))
  if (!Number.isInteger(input.brief.version) || input.brief.version <= 0) {
    issues.push(issue('PMAX_BRIEF_VERSION_INVALID', 'brief.version', 'Brief version must be a positive integer.'))
  }
  if (input.brief.templateSlug !== 'google-pmax') {
    issues.push(issue('PMAX_TEMPLATE_INVALID', 'brief.templateSlug', 'Launch normalization requires the google-pmax template.'))
  }
  if (input.brief.status !== 'approved') {
    issues.push(issue('PMAX_BRIEF_NOT_APPROVED', 'brief.status', 'The brief must be approved before a launch plan is created.'))
  }
  if (fields.get('pmax_type') !== 'inventory') {
    issues.push(issue('PMAX_TYPE_INVALID', 'pmax_type', 'The first launch workflow supports PMax Inventory only.'))
  }

  if (!UUID_PATTERN.test(selectedConnectionId)) {
    issues.push(issue('PMAX_CONNECTION_MISSING', 'provider.selectedConnectionId', 'A provider-backed Google Ads connection selection is required.'))
  }
  if (!UUID_PATTERN.test(providerConnectionId)) {
    issues.push(issue('PMAX_CONNECTION_INVALID', 'provider.connectionId', 'Provider connection ID must be a UUID.'))
  } else if (selectedConnectionId && selectedConnectionId !== providerConnectionId) {
    issues.push(issue('PMAX_CONNECTION_MISMATCH', 'provider.selectedConnectionId', 'Selected connection does not match resolved provider evidence.'))
  }

  const customerId = input.provider.customerId.replace(/[\s-]/g, '')
  if (!/^\d{10}$/.test(customerId)) {
    issues.push(issue('PMAX_CUSTOMER_ID_INVALID', 'provider.customerId', 'Google Ads customer ID must contain ten digits.'))
  }

  const campaignName = requiredString(fields.get('campaign_name'), 'PMAX_CAMPAIGN_NAME_MISSING', 'campaign_name', issues)
  const merchantCenterId = requiredString(fields.get('merchant_centre_id'), 'PMAX_MERCHANT_CENTER_MISSING', 'merchant_centre_id', issues)
  if (merchantCenterId && !/^\d+$/.test(merchantCenterId)) {
    issues.push(issue('PMAX_MERCHANT_CENTER_INVALID', 'merchant_centre_id', 'Merchant Center ID must contain digits only.'))
  }

  const selectedFeedId = requiredString(fields.get('google_feed_id'), 'PMAX_FEED_SELECTION_MISSING', 'google_feed_id', issues)
  const inventorySource = input.provider.inventorySource
  const linkId = String(inventorySource.linkId || '').trim().toLowerCase()
  const resolvedFeedId = String(inventorySource.feedId || '').trim()
  const providerSelectedFeedId = String(inventorySource.selectedFeedId || '').trim()
  if (!UUID_PATTERN.test(linkId)) {
    issues.push(issue('PMAX_FEED_LINK_INVALID', 'provider.inventorySource.linkId', 'The client feed link must be a provider-resolved UUID.'))
  }
  if (inventorySource.providerId !== 'social-dashboard') {
    issues.push(issue('PMAX_FEED_PROVIDER_INVALID', 'provider.inventorySource.providerId', 'The first launch workflow requires the XeroFlow vehicle feed provider.'))
  }
  if (inventorySource.platform !== 'google') {
    issues.push(issue('PMAX_FEED_PLATFORM_INVALID', 'provider.inventorySource.platform', 'The selected source feed must be configured for Google.'))
  }
  if (!inventorySource.active) {
    issues.push(issue('PMAX_FEED_INACTIVE', 'provider.inventorySource.active', 'The selected source feed must be active.'))
  }
  if (!resolvedFeedId || selectedFeedId !== providerSelectedFeedId || selectedFeedId !== resolvedFeedId) {
    issues.push(issue('PMAX_FEED_SELECTION_MISMATCH', 'provider.inventorySource.feedId', 'Selected feed does not match resolved provider evidence.'))
  }

  const budget = normalizeFixedFlightBudget({
    currency: typeof fields.get('budget_currency') === 'string' ? fields.get('budget_currency') as string : '',
    accountCurrency: input.provider.accountCurrency,
    accountTimezone: input.provider.accountTimezone,
    startDate: typeof fields.get('start_date') === 'string' ? fields.get('start_date') as string : '',
    endDate: typeof fields.get('end_date') === 'string' ? fields.get('end_date') as string : '',
    allocatedTotal: strictNumber(fields.get('allocated_total')) ?? Number.NaN
  })
  if (fields.get('budget_period') !== 'fixed_flight') {
    issues.push(issue('BUDGET_PERIOD_INVALID', 'budget_period', 'Budget period must be fixed_flight.'))
  }
  if (budget.ok === false) issues.push(issue(budget.code, 'budget', budget.message))

  const biddingValue = fields.get('bidding')
  const bidding: GooglePmaxInventoryLaunchConfig['bidding'] = biddingValue === 'max_value'
    ? { strategy: 'MAXIMIZE_CONVERSION_VALUE' }
    : { strategy: 'MAXIMIZE_CONVERSIONS' }
  if (biddingValue === 'target_cpa') {
    const target = strictNumber(fields.get('target_cpa_roas'))
    const micros = target === null ? 0 : Math.round(target * 1_000_000)
    if (!Number.isSafeInteger(micros) || micros <= 0) {
      issues.push(issue('PMAX_TARGET_CPA_INVALID', 'target_cpa_roas', 'Target CPA must be a positive amount in major currency units.'))
    } else {
      bidding.targetCpaMicros = String(micros)
    }
  } else if (biddingValue === 'target_roas') {
    issues.push(issue('PMAX_TARGET_ROAS_AMBIGUOUS', 'target_cpa_roas', 'Target ROAS requires an explicit ratio unit before normalization.'))
  } else if (biddingValue !== 'max_conversions' && biddingValue !== 'max_value') {
    issues.push(issue('PMAX_BIDDING_INVALID', 'bidding', 'Select a supported PMax bidding strategy.'))
  }

  const condition = typeof fields.get('inventory_condition') === 'string'
    ? (fields.get('inventory_condition') as string).trim().toUpperCase()
    : ''
  const conditions: Array<'NEW' | 'USED'> = condition === 'ALL'
    ? ['NEW', 'USED']
    : condition === 'NEW' || condition === 'USED'
      ? [condition]
      : []
  if (!conditions.length) {
    issues.push(issue('PMAX_INVENTORY_CONDITION_INVALID', 'inventory_condition', 'Inventory condition must be NEW, USED or ALL.'))
  }

  const locationResult = sortedLocations(input.provider.locations)
  const locations = locationResult.locations
  if (locationResult.conflicts.length) {
    issues.push(issue('PMAX_LOCATION_EVIDENCE_CONFLICT', 'provider.locations', 'A location criterion has conflicting provider evidence.'))
  }
  if (!locations.length) issues.push(issue('PMAX_LOCATIONS_MISSING', 'provider.locations', 'At least one resolved location criterion is required.'))
  const approvedLocationIntent = normalizedStrings(fields.get('locations'))
  const resolvedLocationIntent = [...new Set(locations.map(location => location.sourceText))].sort(lexicalCompare)
  if (!approvedLocationIntent.length) {
    issues.push(issue('PMAX_LOCATION_INTENT_MISSING', 'locations', 'Approved target locations are required.'))
  } else if (JSON.stringify(approvedLocationIntent) !== JSON.stringify(resolvedLocationIntent)) {
    issues.push(issue('PMAX_LOCATION_SELECTION_MISMATCH', 'provider.locations', 'Resolved location evidence does not match approved location intent.'))
  }

  const languages = normalizedStrings(fields.get('languages'), /[\r\n,]+/)
  if (!languages.length) languages.push('en')

  const selectedConversionIds = normalizedStrings(input.provider.selectedConversionActionIds, /[\r\n,]+/)
  const conversionGoals = sortedConversionGoals(input.provider.conversionGoals, customerId, issues)
  const resolvedConversionIds = conversionGoals.map(goal => goal.conversionActionId)
  if (!conversionGoals.length) {
    issues.push(issue('PMAX_CONVERSION_GOALS_MISSING', 'provider.conversionGoals', 'At least one resolved conversion goal is required.'))
  } else if (JSON.stringify(selectedConversionIds) !== JSON.stringify(resolvedConversionIds)) {
    issues.push(issue('PMAX_CONVERSION_SELECTION_MISMATCH', 'provider.selectedConversionActionIds', 'Selected conversion actions do not match resolved provider evidence.'))
  }

  const complianceAcknowledged = fields.get('acct_compliance_ack') === true
  if (!complianceAcknowledged) {
    issues.push(issue('PMAX_COMPLIANCE_NOT_ACKNOWLEDGED', 'acct_compliance_ack', 'Compliance acknowledgement is required.'))
  }

  const assetGroupName = requiredString(fields.get('asset_group_name'), 'PMAX_ASSET_GROUP_NAME_MISSING', 'asset_group_name', issues)
  const finalUrlValue = requiredString(fields.get('final_url'), 'PMAX_FINAL_URL_MISSING', 'final_url', issues)
  const finalUrl = finalUrlValue ? normalizeUrl(finalUrlValue, issues) : ''
  const assetModeValue = typeof fields.get('asset_mode') === 'string'
    ? (fields.get('asset_mode') as string).trim().toLowerCase()
    : ''
  const assetMode: GooglePmaxInventoryLaunchConfig['assetGroup']['mode'] = assetModeValue === 'merchant_only'
    ? 'MERCHANT_ONLY'
    : 'PROVIDED'
  if (!['merchant_only', 'provided'].includes(assetModeValue)) {
    issues.push(issue('PMAX_ASSET_MODE_INVALID', 'asset_mode', 'Asset mode must be merchant_only or provided.'))
  }

  const businessNameValue = typeof fields.get('business_name') === 'string'
    ? (fields.get('business_name') as string).trim()
    : ''
  const headlines = normalizedStrings(fields.get('headlines'))
  const longHeadlines = normalizedStrings(fields.get('long_headlines'))
  const descriptions = normalizedStrings(fields.get('descriptions'))

  const imageAssetResourceNames = normalizedAssetResources(input.provider.assetGroup.imageAssetResourceNames, customerId, issues)
  const logoAssetResourceNames = normalizedAssetResources(input.provider.assetGroup.logoAssetResourceNames, customerId, issues)
  const youtubeVideoAssetResourceNames = normalizedAssetResources(input.provider.assetGroup.youtubeVideoAssetResourceNames, customerId, issues)
  const hasAnyManualAsset = Boolean(
    businessNameValue
    || headlines.length
    || longHeadlines.length
    || descriptions.length
    || imageAssetResourceNames.length
    || logoAssetResourceNames.length
    || youtubeVideoAssetResourceNames.length
  )

  if (assetMode === 'MERCHANT_ONLY' && hasAnyManualAsset) {
    issues.push(issue(
      'PMAX_ASSET_MODE_CONFLICT',
      'asset_mode',
      'Merchant-only launches must contain no linked text, image, logo, or video assets.'
    ))
  }
  if (assetMode === 'PROVIDED') {
    if (!businessNameValue) issues.push(issue('PMAX_BUSINESS_NAME_MISSING', 'business_name', 'Business name is required when manual assets are provided.'))
    if (headlines.length < 3) issues.push(issue('PMAX_HEADLINES_INCOMPLETE', 'headlines', 'At least three headlines are required when manual assets are provided.'))
    if (longHeadlines.length < 1) issues.push(issue('PMAX_LONG_HEADLINES_INCOMPLETE', 'long_headlines', 'At least one long headline is required when manual assets are provided.'))
    if (descriptions.length < 2) issues.push(issue('PMAX_DESCRIPTIONS_INCOMPLETE', 'descriptions', 'At least two descriptions are required when manual assets are provided.'))
    if (
      !input.provider.assetGroup.requiredAssetCoverageComplete
      || imageAssetResourceNames.length === 0
      || logoAssetResourceNames.length === 0
    ) {
      issues.push(issue(
        'PMAX_ASSET_COVERAGE_INCOMPLETE',
        'provider.assetGroup',
        'Manual assets must satisfy the complete provider-verified PMax asset requirements.'
      ))
    }
  }

  if (issues.length || !budget.ok) return { ok: false, issues }

  const config: GooglePmaxInventoryLaunchConfig = {
    schemaVersion: 2,
    briefId,
    briefVersion: input.brief.version,
    tenantId,
    clientId,
    connectionId: providerConnectionId,
    customerId,
    campaignName,
    budget: budget.value,
    bidding,
    schedule: { startDate: budget.value.startDate, endDate: budget.value.endDate },
    locations: locations.map(({ criterionId, displayName }) => ({ criterionId, displayName })),
    languages,
    finalUrls: [finalUrl],
    merchantCenterId,
    inventorySource: {
      providerId: 'social-dashboard',
      linkId,
      feedId: resolvedFeedId,
      platform: 'google'
    },
    inventoryFilter: { listingSource: 'SHOPPING', conditions },
    assetGroup: {
      mode: assetMode,
      name: assetGroupName,
      businessName: businessNameValue,
      headlines,
      longHeadlines,
      descriptions,
      imageAssetResourceNames,
      logoAssetResourceNames,
      youtubeVideoAssetResourceNames
    },
    conversionGoals,
    approval: { required: true, complianceAcknowledged }
  }

  return {
    ok: true,
    value: { config, configHash: hashCanonicalLaunchJson(config) }
  }
}

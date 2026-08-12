import { validateProviderBudgetAmounts } from '~~/server/utils/googleCampaignBudgetContract'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'

export type GooglePmaxPreflightStatus = 'pass' | 'warning' | 'fail'

export interface GooglePmaxPreflightCheck {
  code: string
  category: 'account' | 'budget' | 'inventory' | 'merchant' | 'conversion' | 'targeting' | 'assets' | 'destination' | 'provider'
  status: GooglePmaxPreflightStatus
  message: string
  remediation: string | null
}

export interface GooglePmaxPreflightEvidence {
  providerRequestId: string | null
  connection: {
    id: string
    clientId: string
    status: 'active' | 'inactive' | 'error'
    customerId: string
    currency: string
    timezone: string
  }
  merchant: {
    linkedMerchantCenterIds: string[]
    sourceStatus: 'healthy' | 'warning' | 'error'
    eligibleItemCount: number
    vehicleItemCount: number
    disapprovedItemCount: number
  }
  internalFeed: {
    linkId: string
    feedId: string
    platform: 'google' | 'facebook'
    status: 'ready' | 'partial' | 'blocked' | 'empty' | 'unknown'
    matchedItemCount: number
    validatedItemCount: number
    invalidItemCount: number
    conditions: Array<'NEW' | 'USED'>
    fetchedAt: string
  }
  conversions: Array<{
    conversionActionId: string
    resourceName: string
    status: 'ENABLED' | 'REMOVED' | 'HIDDEN'
    primaryForGoal: boolean
    includeInConversionsMetric: boolean
    recentConversions: boolean
  }>
  assets: {
    mode: 'merchant_only' | 'provided'
    textCoverageComplete: boolean
    mediaCoverageComplete: boolean
    allApproved: boolean
  }
  destinations: {
    allFinalUrlsVerified: boolean
  }
}

export interface GooglePmaxPreflightResult {
  ready: boolean
  blockerCount: number
  warningCount: number
  providerRequestId: string | null
  checkedAt: string
  checks: GooglePmaxPreflightCheck[]
}

interface GooglePmaxPreflightDependencies {
  readEvidence: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxPreflightEvidence>
  now?: () => Date
}

function check(
  code: string,
  category: GooglePmaxPreflightCheck['category'],
  status: GooglePmaxPreflightStatus,
  message: string,
  remediation: string | null = null
): GooglePmaxPreflightCheck {
  return { code, category, status, message, remediation }
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

function safeProviderRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,255}$/.test(value)
    ? value
    : null
}

function result(
  checks: GooglePmaxPreflightCheck[],
  providerRequestId: string | null,
  now: () => Date
): GooglePmaxPreflightResult {
  const blockerCount = checks.filter(item => item.status === 'fail').length
  const warningCount = checks.filter(item => item.status === 'warning').length
  return {
    ready: blockerCount === 0,
    blockerCount,
    warningCount,
    providerRequestId,
    checkedAt: now().toISOString(),
    checks
  }
}

function accountChecks(
  config: GooglePmaxInventoryLaunchConfig,
  evidence: GooglePmaxPreflightEvidence
): GooglePmaxPreflightCheck[] {
  const checks: GooglePmaxPreflightCheck[] = []
  const connection = evidence.connection
  if (connection.id !== config.connectionId || connection.clientId !== config.clientId) {
    checks.push(check(
      'PMAX_ACCOUNT_OWNERSHIP_MISMATCH',
      'account',
      'fail',
      'The selected Google Ads connection is not mapped to this client.',
      'Select an active Google Ads account mapped to this client.'
    ))
  }
  if (connection.status !== 'active' || connection.customerId !== config.customerId) {
    checks.push(check(
      'PMAX_ACCOUNT_CONNECTION_INVALID',
      'account',
      'fail',
      'The selected Google Ads connection is inactive or resolves to another customer.',
      'Reconnect the intended Google Ads customer and regenerate the launch plan.'
    ))
  }
  if (connection.currency.toUpperCase() !== config.budget.currency) {
    checks.push(check(
      'PMAX_ACCOUNT_CURRENCY_MISMATCH',
      'account',
      'fail',
      'The approved budget currency does not match the Google Ads account currency.',
      'Correct the brief currency or select the matching Google Ads account.'
    ))
  }
  if (!isValidTimezone(connection.timezone)) {
    checks.push(check(
      'PMAX_ACCOUNT_TIMEZONE_INVALID',
      'account',
      'fail',
      'Google returned an invalid account timezone.',
      'Resolve the Google Ads account timezone before approval.'
    ))
  }
  if (!checks.length) {
    checks.push(check('PMAX_ACCOUNT_READY', 'account', 'pass', 'Google Ads account identity, ownership, currency, and timezone are ready.'))
  }
  return checks
}

function budgetChecks(config: GooglePmaxInventoryLaunchConfig): GooglePmaxPreflightCheck[] {
  const provider = validateProviderBudgetAmounts(config.budget.period, config.budget.provider)
  const scheduleMatches = config.schedule.startDate === config.budget.startDate
    && config.schedule.endDate === config.budget.endDate
  if (
    provider.ok === false
    || config.budget.period !== 'CUSTOM_PERIOD'
    || config.budget.allocatedTotal <= 0
    || config.budget.dailyBudget !== null
    || !scheduleMatches
  ) {
    return [check(
      'PMAX_BUDGET_CONTRACT_INVALID',
      'budget',
      'fail',
      'The launch budget does not satisfy the fixed-flight provider contract.',
      'Regenerate the plan from an approved total allocation and matching flight dates.'
    )]
  }
  return [check('PMAX_BUDGET_READY', 'budget', 'pass', 'Fixed-flight total, schedule, and CUSTOM_PERIOD provider amount are consistent.')]
}

function merchantChecks(
  config: GooglePmaxInventoryLaunchConfig,
  evidence: GooglePmaxPreflightEvidence
): GooglePmaxPreflightCheck[] {
  if (!evidence.merchant.linkedMerchantCenterIds.includes(config.merchantCenterId)) {
    return [check(
      'PMAX_MERCHANT_LINK_MISSING',
      'merchant',
      'fail',
      'The approved Merchant Center account is not linked to the selected Google Ads customer.',
      'Link the exact Merchant Center account in Google, then rerun preflight.'
    )]
  }
  if (
    evidence.merchant.sourceStatus === 'error'
    || evidence.merchant.eligibleItemCount <= 0
    || evidence.merchant.vehicleItemCount <= 0
  ) {
    return [check(
      'PMAX_MERCHANT_ITEMS_UNAVAILABLE',
      'merchant',
      'fail',
      'The linked Merchant Center account has no eligible vehicle items for this launch.',
      'Resolve feed diagnostics and eligible vehicle inventory before approval.'
    )]
  }
  if (evidence.merchant.sourceStatus === 'warning' || evidence.merchant.disapprovedItemCount > 0) {
    return [check(
      'PMAX_MERCHANT_READY_WITH_WARNINGS',
      'merchant',
      'warning',
      'Eligible vehicle inventory exists, with feed warnings or disapproved items to review.',
      'Review Merchant Center diagnostics before activation.'
    )]
  }
  return [check('PMAX_MERCHANT_READY', 'merchant', 'pass', 'Merchant Center linkage and eligible vehicle inventory are ready.')]
}

function internalFeedChecks(
  config: GooglePmaxInventoryLaunchConfig,
  evidence: GooglePmaxPreflightEvidence
): GooglePmaxPreflightCheck[] {
  const feed = evidence.internalFeed
  if (
    feed.linkId.toLowerCase() !== config.inventorySource.linkId.toLowerCase()
    || feed.feedId !== config.inventorySource.feedId
    || feed.platform !== config.inventorySource.platform
  ) {
    return [check(
      'PMAX_INTERNAL_FEED_IDENTITY_MISMATCH',
      'inventory',
      'fail',
      'Feed evidence does not match the exact client-owned source bound into this launch plan.',
      'Reselect the intended active Google feed and regenerate the launch plan.'
    )]
  }
  if (
    feed.platform !== 'google'
    || feed.status !== 'ready'
    || feed.matchedItemCount <= 0
    || feed.validatedItemCount <= 0
    || feed.invalidItemCount !== 0
    || feed.validatedItemCount !== feed.matchedItemCount
  ) {
    return [check(
      'PMAX_INTERNAL_FEED_NOT_READY',
      'inventory',
      'fail',
      'The client-owned Google vehicle feed is empty, incomplete, or blocked.',
      'Resolve source feed validation and regenerate the Google feed before launch approval.'
    )]
  }

  const conditions = new Set(feed.conditions)
  if (config.inventoryFilter.conditions.some(condition => !conditions.has(condition))) {
    return [check(
      'PMAX_INTERNAL_FEED_CONDITION_MISMATCH',
      'inventory',
      'fail',
      'The approved inventory conditions are not present in the client-owned source feed.',
      'Correct the brief condition or publish a reconciled feed containing the approved stock type.'
    )]
  }

  const checks = [check(
    'PMAX_INTERNAL_FEED_READY',
    'inventory',
    'pass',
    'The active client-owned Google feed contains validated inventory for the approved conditions.'
  )]
  if (feed.validatedItemCount !== evidence.merchant.vehicleItemCount) {
    checks.push(check(
      'PMAX_FEED_COUNT_DRIFT',
      'inventory',
      'warning',
      'Validated XeroFlow inventory and Merchant Center vehicle counts do not currently match.',
      'Confirm Merchant Center has completed its latest import and review rejected or delayed items.'
    ))
  }
  return checks
}

function conversionChecks(
  config: GooglePmaxInventoryLaunchConfig,
  evidence: GooglePmaxPreflightEvidence
): GooglePmaxPreflightCheck[] {
  const byId = new Map(evidence.conversions.map(item => [item.conversionActionId, item]))
  const resolved = config.conversionGoals.map(goal => byId.get(goal.conversionActionId))
  const invalid = resolved.some((item, index) => {
    const expected = config.conversionGoals[index]
    return !item
      || item.resourceName !== expected?.resourceName
      || item.status !== 'ENABLED'
      || !item.primaryForGoal
      || !item.includeInConversionsMetric
  })
  if (invalid || !resolved.length) {
    return [check(
      'PMAX_CONVERSIONS_NOT_READY',
      'conversion',
      'fail',
      'One or more approved conversion actions are missing, disabled, or not biddable.',
      'Select enabled primary conversion actions included in the conversions metric.'
    )]
  }
  if (resolved.some(item => !item?.recentConversions)) {
    return [check(
      'PMAX_CONVERSIONS_NO_RECENT_SIGNAL',
      'conversion',
      'warning',
      'Selected conversion actions are biddable but have no recent recorded conversions.',
      'Confirm tag and lead-event health before activation.'
    )]
  }
  return [check('PMAX_CONVERSIONS_READY', 'conversion', 'pass', 'Selected conversion actions are enabled, primary, and recording recent signal.')]
}

function targetingChecks(config: GooglePmaxInventoryLaunchConfig): GooglePmaxPreflightCheck[] {
  if (!config.locations.length || !config.languages.length) {
    return [check(
      'PMAX_TARGETING_INCOMPLETE',
      'targeting',
      'fail',
      'Resolved location criteria and languages are required.',
      'Resolve every approved location and confirm campaign languages.'
    )]
  }
  return [check('PMAX_TARGETING_READY', 'targeting', 'pass', 'Location criteria and languages are resolved.')]
}

function assetChecks(
  config: GooglePmaxInventoryLaunchConfig,
  evidence: GooglePmaxPreflightEvidence
): GooglePmaxPreflightCheck[] {
  const expectedMode = config.assetGroup.mode === 'MERCHANT_ONLY' ? 'merchant_only' : 'provided'
  if (evidence.assets.mode !== expectedMode) {
    return [check(
      'PMAX_ASSET_MODE_MISMATCH',
      'assets',
      'fail',
      'Provider asset evidence does not match the asset mode bound into this launch plan.',
      'Regenerate the plan from current provider assets before approval.'
    )]
  }
  if (evidence.assets.mode === 'merchant_only') {
    return [check(
      'PMAX_ASSETS_MERCHANT_ONLY',
      'assets',
      'warning',
      'This retail asset group will use Merchant Center assets only, limiting non-Shopping reach.',
      'Provide a complete approved asset set when broader PMax inventory is required.'
    )]
  }
  if (!evidence.assets.textCoverageComplete || !evidence.assets.mediaCoverageComplete || !evidence.assets.allApproved) {
    return [check(
      'PMAX_ASSET_COVERAGE_INCOMPLETE',
      'assets',
      'fail',
      'Provided assets do not meet the complete approved PMax asset set.',
      'Complete and approve all required text, image, logo, and video assets together.'
    )]
  }
  return [check('PMAX_ASSETS_READY', 'assets', 'pass', 'Provided asset coverage and approval status are ready.')]
}

function destinationChecks(evidence: GooglePmaxPreflightEvidence): GooglePmaxPreflightCheck[] {
  if (!evidence.destinations.allFinalUrlsVerified) {
    return [check(
      'PMAX_FINAL_URL_NOT_VERIFIED',
      'destination',
      'fail',
      'One or more final URLs do not match an approved Merchant Center destination.',
      'Use a public HTTPS URL associated with the linked Merchant Center account.'
    )]
  }
  return [check('PMAX_FINAL_URLS_READY', 'destination', 'pass', 'Final URLs are verified against the approved retail destination.')]
}

export function createGooglePmaxPreflight(dependencies: GooglePmaxPreflightDependencies) {
  const now = dependencies.now || (() => new Date())
  return {
    async run(config: GooglePmaxInventoryLaunchConfig): Promise<GooglePmaxPreflightResult> {
      try {
        const evidence = await dependencies.readEvidence(config)
        const checks = [
          ...accountChecks(config, evidence),
          ...budgetChecks(config),
          ...internalFeedChecks(config, evidence),
          ...merchantChecks(config, evidence),
          ...conversionChecks(config, evidence),
          ...targetingChecks(config),
          ...assetChecks(config, evidence),
          ...destinationChecks(evidence)
        ]
        return result(checks, safeProviderRequestId(evidence.providerRequestId), now)
      } catch (error: unknown) {
        const providerRequestId = safeProviderRequestId(
          typeof error === 'object' && error !== null && 'requestId' in error
            ? (error as { requestId?: unknown }).requestId
            : null
        )
        return result([
          check(
            'PMAX_PROVIDER_READ_FAILED',
            'provider',
            'fail',
            'Google readiness evidence could not be read.',
            'Confirm Google authorization and account access, then rerun preflight.'
          )
        ], providerRequestId, now)
      }
    }
  }
}

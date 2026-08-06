import type { GoogleAiMaxRows } from '~~/server/utils/googleAdsClient'
import type { GoogleAiMaxPortfolioAccount } from '~~/server/utils/googleAiMaxScanner'

type CountMap = Record<string, number>

export interface GoogleAiMaxLiveAuditSummary {
  campaignCount: number
  adGroupCount: number
  campaignStatuses: CountMap
  keywordMatchTypes: CountMap
  aiMaxEnabled: CountMap
  textAssetAutomation: CountMap
  finalUrlExpansion: CountMap
  bundlingRequired: CountMap
  adGroupMatchingDisabled: CountMap
  caseCoverage: {
    acaOnly: number
    broadOnly: number
    bothLegacySettings: number
    neitherLegacySetting: number
    aiMaxEnabled: number
    incompleteEvidence: number
  }
}

const MISSING = 'MISSING'

function enumCounts(values: string[], preferredOrder: string[]): CountMap {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)

  const ordered = [
    ...preferredOrder.filter(value => counts.has(value)),
    ...Array.from(counts.keys())
      .filter(value => !preferredOrder.includes(value))
      .sort()
  ]
  return Object.fromEntries(ordered.map(value => [value, counts.get(value)!]))
}

function automationStatus(
  settings: Array<{ assetAutomationType?: string, assetAutomationStatus?: string }> | undefined,
  type: string
) {
  const value = settings?.find(setting => setting.assetAutomationType === type)
    ?.assetAutomationStatus
  return typeof value === 'string' ? value : MISSING
}

export function summarizeGoogleAiMaxRows(rows: GoogleAiMaxRows): GoogleAiMaxLiveAuditSummary {
  const campaigns = rows.campaignRows.map(row => row.campaign ?? {})
  const adGroups = rows.adGroupRows.map(row => row.adGroup ?? {})
  const statuses = campaigns.map(campaign => campaign.status ?? MISSING)
  const keywordMatchTypes = campaigns.map(campaign => campaign.keywordMatchType ?? MISSING)
  const aiMaxEnabled = campaigns.map((campaign) => {
    const value = campaign.aiMaxSetting?.enableAiMax
    return typeof value === 'boolean' ? String(value) : 'missing'
  })
  const textStatuses = campaigns.map(campaign => automationStatus(
    campaign.assetAutomationSettings,
    'TEXT_ASSET_AUTOMATION'
  ))
  const finalUrlStatuses = campaigns.map(campaign => automationStatus(
    campaign.assetAutomationSettings,
    'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION'
  ))
  const bundlingStatuses = campaigns.map(
    campaign => campaign.aiMaxSetting?.bundlingRequired ?? MISSING
  )
  const matchingDisabled = adGroups.map((adGroup) => {
    const value = adGroup.aiMaxAdGroupSetting?.disableSearchTermMatching
    return typeof value === 'boolean' ? String(value) : 'missing'
  })

  const caseCoverage = {
    acaOnly: 0,
    broadOnly: 0,
    bothLegacySettings: 0,
    neitherLegacySetting: 0,
    aiMaxEnabled: 0,
    incompleteEvidence: 0
  }
  campaigns.forEach((campaign, index) => {
    const aiMax = campaign.aiMaxSetting?.enableAiMax
    const keyword = keywordMatchTypes[index]
    const text = textStatuses[index]
    if (typeof aiMax !== 'boolean' || keyword === MISSING || text === MISSING) {
      caseCoverage.incompleteEvidence += 1
      return
    }
    if (aiMax) {
      caseCoverage.aiMaxEnabled += 1
      return
    }

    const hasAca = text === 'OPTED_IN'
    const hasBroad = keyword === 'BROAD'
    if (hasAca && hasBroad) caseCoverage.bothLegacySettings += 1
    else if (hasAca) caseCoverage.acaOnly += 1
    else if (hasBroad) caseCoverage.broadOnly += 1
    else caseCoverage.neitherLegacySetting += 1
  })

  return {
    campaignCount: campaigns.length,
    adGroupCount: adGroups.length,
    campaignStatuses: enumCounts(statuses, ['ENABLED', 'PAUSED', MISSING]),
    keywordMatchTypes: enumCounts(keywordMatchTypes, ['BROAD', 'UNSPECIFIED', MISSING]),
    aiMaxEnabled: enumCounts(aiMaxEnabled, ['true', 'false', 'missing']),
    textAssetAutomation: enumCounts(textStatuses, ['OPTED_IN', 'OPTED_OUT', MISSING]),
    finalUrlExpansion: enumCounts(finalUrlStatuses, ['OPTED_IN', 'OPTED_OUT', MISSING]),
    bundlingRequired: enumCounts(bundlingStatuses, ['REQUIRED', 'NOT_REQUIRED', MISSING]),
    adGroupMatchingDisabled: enumCounts(matchingDisabled, ['true', 'false', 'missing']),
    caseCoverage
  }
}

export function parseGoogleAiMaxAuditLimit(value: string | undefined): number {
  if (value == null || value.trim() === '') return 2
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 2
  return Math.min(5, Math.max(1, parsed))
}

export function redactGoogleAiMaxAuditError(error: unknown, secrets: string[] = []): string {
  const message = error instanceof Error ? error.message : String(error)
  return secrets
    .filter(Boolean)
    .reduce((value, secret) => value.split(secret).join('[REDACTED]'), message)
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/customers\/\d+/gi, 'customers/[REDACTED]')
    .replace(/\b\d{8,}\b/g, '[REDACTED]')
    .slice(0, 500)
}

interface GoogleAiMaxLiveAuditDependencies {
  fetchRows: (
    customerId: string,
    accessToken: string,
    developerToken: string,
    loginCustomerId?: string
  ) => Promise<GoogleAiMaxRows>
}

export async function runGoogleAiMaxLiveAudit(
  input: {
    developerToken: string
    accounts: GoogleAiMaxPortfolioAccount[]
    limit: number
  },
  dependencies: GoogleAiMaxLiveAuditDependencies
) {
  const sampledAccounts = input.accounts.slice(0, Math.min(5, Math.max(1, input.limit)))
  const output: {
    requestedAccountCount: number
    sampledAccountCount: number
    successfulAccounts: number
    failedAccounts: number
    authModes: { direct: number, managerLinked: number }
    accounts: Array<{
      sample: number
      authMode: 'direct' | 'manager_linked'
      summary?: GoogleAiMaxLiveAuditSummary
      error?: string
    }>
  } = {
    requestedAccountCount: input.accounts.length,
    sampledAccountCount: sampledAccounts.length,
    successfulAccounts: 0,
    failedAccounts: 0,
    authModes: { direct: 0, managerLinked: 0 },
    accounts: []
  }

  for (const [index, account] of sampledAccounts.entries()) {
    let accessToken = account.accessToken ?? ''
    let loginCustomerId = account.loginCustomerId
    let effectiveLoginCustomerId = loginCustomerId
    try {
      if (account.resolveAuth) {
        const resolved = await account.resolveAuth()
        accessToken = resolved.accessToken
        loginCustomerId = resolved.loginCustomerId
        effectiveLoginCustomerId = resolved.loginCustomerId
      }
      if (!accessToken) throw new Error('Google connection has no usable credential')

      let rows: GoogleAiMaxRows
      try {
        rows = await dependencies.fetchRows(
          account.customerId,
          accessToken,
          input.developerToken,
          effectiveLoginCustomerId
        )
      } catch (error) {
        const status = error && typeof error === 'object'
          ? Number((error as Record<string, unknown>).status
            ?? (error as Record<string, unknown>).statusCode)
          : 0
        if (status !== 403 || !effectiveLoginCustomerId) throw error
        effectiveLoginCustomerId = undefined
        rows = await dependencies.fetchRows(
          account.customerId,
          accessToken,
          input.developerToken,
          undefined
        )
      }
      const authMode = effectiveLoginCustomerId ? 'manager_linked' : 'direct'
      if (authMode === 'manager_linked') output.authModes.managerLinked += 1
      else output.authModes.direct += 1
      output.successfulAccounts += 1
      output.accounts.push({
        sample: index + 1,
        authMode,
        summary: summarizeGoogleAiMaxRows(rows)
      })
    } catch (error) {
      const authMode = effectiveLoginCustomerId ? 'manager_linked' : 'direct'
      if (authMode === 'manager_linked') output.authModes.managerLinked += 1
      else output.authModes.direct += 1

      output.failedAccounts += 1
      output.accounts.push({
        sample: index + 1,
        authMode,
        error: redactGoogleAiMaxAuditError(error, [
          accessToken,
          input.developerToken,
          account.customerId,
          loginCustomerId ?? ''
        ])
      })
    }
  }

  const status = output.successfulAccounts === 0
    ? 'failed'
    : output.failedAccounts > 0
      ? 'partial'
      : 'completed'
  return { status, ...output }
}

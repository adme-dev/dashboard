export type CampaignBudgetIdentityIssue =
  | 'missing_tenant_id'
  | 'missing_client_id'
  | 'missing_account_id'
  | 'missing_campaign_external_id'
  | 'missing_period'

export interface CampaignBudgetIdentityInput {
  tenantId?: string | null
  clientId?: string | null
  platform?: string | null
  accountId?: string | null
  connectionId?: string | null
  campaignExternalId?: string | null
  campaignName?: string | null
  mediaSpendId?: string | null
  period?: string | null
}

export interface CampaignBudgetIdentity {
  tenantId: string
  clientId: string
  platform: string
  accountId: string | null
  campaignExternalId: string | null
  period: string | null
  key: string | null
  fallbackKey: string
  actionable: boolean
  issues: CampaignBudgetIdentityIssue[]
}

const PLATFORM_ALIASES: Record<string, string> = {
  facebook: 'meta',
  fb: 'meta',
  instagram: 'meta',
  meta_ads: 'meta',
  google: 'google_ads',
  googleads: 'google_ads',
  google_ads: 'google_ads',
  google_adwords: 'google_ads',
  microsoft: 'microsoft_ads',
  microsoftads: 'microsoft_ads',
  microsoft_ads: 'microsoft_ads',
  bing: 'microsoft_ads',
  linkedin_ads: 'linkedin',
  pinterest_ads: 'pinterest',
  snapchat_ads: 'snapchat',
  tiktok_ads: 'tiktok',
  twitter_ads: 'twitter',
  x: 'twitter',
  x_ads: 'twitter'
}

function clean(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text.length ? text : null
}

function keyPart(value: string): string {
  return value.replace(/\|/g, '%7C')
}

export function normalizeBudgetPlatform(platform: unknown): string {
  const value = clean(platform)?.toLowerCase().replace(/[\s-]+/g, '_')
  if (!value) return 'unknown'
  return PLATFORM_ALIASES[value] ?? value
}

export function normalizeBudgetPeriod(period: unknown): string | null {
  const value = clean(period)
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  return match ? `${match[1]}-${match[2]}` : value
}

function fallbackCampaign(input: CampaignBudgetIdentityInput, campaignExternalId: string | null): string {
  if (campaignExternalId) return `campaign:${campaignExternalId}`
  const mediaSpendId = clean(input.mediaSpendId)
  if (mediaSpendId) return `campaign-fallback:media-spend:${mediaSpendId}`
  const campaignName = clean(input.campaignName)
  if (campaignName) return `campaign-fallback:name:${campaignName}`
  return 'campaign-fallback:unmapped'
}

export function buildCampaignBudgetIdentity(input: CampaignBudgetIdentityInput): CampaignBudgetIdentity {
  const tenantId = clean(input.tenantId) ?? 'no-tenant'
  const clientId = clean(input.clientId) ?? 'unmapped-client'
  const platform = normalizeBudgetPlatform(input.platform)
  const accountId = clean(input.accountId)
  const connectionId = clean(input.connectionId)
  const accountFallback = accountId ?? (connectionId ? `connection:${connectionId}` : 'unmapped-account')
  const campaignExternalId = clean(input.campaignExternalId)
  const period = normalizeBudgetPeriod(input.period)

  const issues: CampaignBudgetIdentityIssue[] = []
  if (!clean(input.tenantId)) issues.push('missing_tenant_id')
  if (!clean(input.clientId)) issues.push('missing_client_id')
  if (!accountId) issues.push('missing_account_id')
  if (!campaignExternalId) issues.push('missing_campaign_external_id')
  if (!period) issues.push('missing_period')

  const fullParts = [
    `tenant:${keyPart(tenantId)}`,
    `client:${keyPart(clientId)}`,
    `platform:${keyPart(platform)}`,
    `account:${keyPart(accountId ?? accountFallback)}`,
    `campaign:${keyPart(campaignExternalId ?? '')}`,
    `period:${keyPart(period ?? 'unmapped-period')}`
  ]

  const fallbackParts = [
    `tenant:${keyPart(tenantId)}`,
    `client:${keyPart(clientId)}`,
    `platform:${keyPart(platform)}`,
    `account:${keyPart(accountFallback)}`,
    keyPart(fallbackCampaign(input, campaignExternalId)),
    `period:${keyPart(period ?? 'unmapped-period')}`
  ]

  const actionable = issues.length === 0

  return {
    tenantId,
    clientId,
    platform,
    accountId,
    campaignExternalId,
    period,
    key: actionable ? fullParts.join('|') : null,
    fallbackKey: actionable ? fullParts.join('|') : fallbackParts.join('|'),
    actionable,
    issues
  }
}

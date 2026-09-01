/**
 * Google Ads API Client
 * Lightweight client using ofetch (matches metaClient.ts pattern)
 * API v25 — https://developers.google.com/google-ads/api/rest/reference/rest/v25
 */

import { ofetch } from 'ofetch'
import type {
  RawGoogleAdGroupRow,
  RawGoogleCampaignRow
} from '~~/server/utils/googleAiMax'
import {
  normalizeGoogleApprovalStatus,
  normalizeGooglePolicyIssues,
  normalizeGoogleServingReasons,
  sanitizeDiagnosticError,
  sanitizeDiagnosticText,
  type PolicyIssue,
} from '~~/server/utils/adDiagnostics'
import { executeGoogleAdsQuery } from '~~/server/utils/googleAds/query'
import { GOOGLE_ADS_BASE_URL } from '~~/server/utils/googleAds/version'

const GOOGLE_ADS_BASE = GOOGLE_ADS_BASE_URL
const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const GOOGLE_ADS_OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/content',
  'https://www.googleapis.com/auth/datamanager',
]

// ============================================
// Types
// ============================================

export interface GoogleAdsCustomer {
  customerId: string
  name: string
  currencyCode: string
  descriptiveName?: string
}

export interface GoogleAdsCampaign {
  campaignId: string
  campaignName: string
  status: string
}

export interface GoogleAdsCampaignSpend {
  campaignId: string
  campaignName: string
  costMicros: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionsValue: number
  status: string
  channelType: string
  endDate?: string | null
  bidStrategy?: string | null
  budgetType?: 'daily' | 'lifetime' | null
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the Google OAuth authorization URL
 */
export function getGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  options: { loginHint?: string } = {}
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: GOOGLE_ADS_OAUTH_SCOPES.join(' '),
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent'
  })
  if (options.loginHint) params.set('login_hint', options.loginHint)
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`
}

export async function getGoogleOAuthIdentity(accessToken: string): Promise<{ email: string }> {
  const identity = await ofetch<{ email?: string }>('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  const email = identity.email?.trim().toLowerCase() || ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Google OAuth identity email is unavailable')
  }
  return { email }
}

/**
 * Exchange authorization code for access + refresh tokens
 */
export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  return ofetch<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    body: {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }
  })
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleTokenResponse> {
  try {
    return await ofetch<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
      method: 'POST',
      body: {
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      }
    })
  } catch (err: unknown) {
    throw new Error(formatGoogleOAuthError(err))
  }
}

function formatGoogleOAuthError(err: unknown): string {
  const errorLike = isObjectRecord(err) ? err : {}
  const status = typeof errorLike.status === 'number'
    ? errorLike.status
    : typeof errorLike.statusCode === 'number'
      ? errorLike.statusCode
      : undefined
  const response = isObjectRecord(errorLike.response) ? errorLike.response : {}
  const data = isObjectRecord(errorLike.data)
    ? errorLike.data
    : isObjectRecord(response._data)
      ? response._data
      : {}
  const code = typeof data.error === 'string' ? data.error : ''
  const description = typeof data.error_description === 'string' ? data.error_description : ''
  const detail = [code, description].filter(Boolean).join(': ')
  if (detail) return status ? `${detail} (${status})` : detail
  return typeof errorLike.message === 'string'
    ? errorLike.message
    : status ? `Google OAuth error ${status}` : 'Google OAuth error'
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function redactGoogleAdsDiagnostic(value: unknown): string {
  let serialized: string
  try {
    serialized = JSON.stringify(value) ?? String(value)
  } catch {
    serialized = '[unserializable Google Ads diagnostic]'
  }
  return serialized
    .replace(/customers\/\d+/gi, 'customers/[REDACTED]')
    .replace(/\b\d{8,}\b/g, '[REDACTED]')
    .slice(0, 500)
}

// ============================================
// GAQL Query Helper
// ============================================

/**
 * Execute a Google Ads Query Language (GAQL) query via searchStream
 */
export async function gaqlQuery(
  customerId: string,
  token: string,
  developerToken: string,
  query: string,
  loginCustomerId?: string,
  retries = 3
): Promise<any[]> {
  try {
    const result = await executeGoogleAdsQuery({
      customerId,
      query,
      auth: {
        accessToken: token,
        developerToken,
        loginCustomerId
      },
      retries,
      preserveProviderErrors: true
    })
    return result.rows
  } catch (error: unknown) {
    const providerError = isObjectRecord(error) ? error : {}
    const status = typeof providerError.status === 'number'
      ? providerError.status
      : typeof providerError.statusCode === 'number'
        ? providerError.statusCode
        : undefined
    if ((status === 400 || status === 403) && providerError.data) {
      const data = providerError.data
      const dataRecord = isObjectRecord(data) ? data : {}
      const envelope = isObjectRecord(dataRecord.error) ? dataRecord.error : {}
      const details = Array.isArray(envelope.details) ? envelope.details : []
      const firstDetail = details.length && isObjectRecord(details[0]) ? details[0] : {}
      const errors = Array.isArray(firstDetail.errors) ? firstDetail.errors : []
      console.error(
        `[GoogleAds] GAQL ${status} diagnostic (customer [REDACTED]):`,
        redactGoogleAdsDiagnostic(errors[0] ?? data)
      )
    }
    throw error
  }
}

// ============================================
// API Functions
// ============================================

/**
 * List all customer accounts accessible by the authenticated user
 */
export async function listAccessibleCustomers(
  token: string,
  developerToken: string
): Promise<string[]> {
  const response = await googleAdsFetch<{ resourceNames: string[] }>(
    `${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`,
    token,
    developerToken
  )
  return (response.resourceNames || []).map((rn: string) => rn.replace('customers/', ''))
}

/**
 * Get customer name, currency, and descriptive info
 */
export async function getCustomerInfo(
  customerId: string,
  token: string,
  developerToken: string
): Promise<GoogleAdsCustomer | null> {
  const query = `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.status
    FROM customer
    LIMIT 1
  `
  const results = await gaqlQuery(customerId, token, developerToken, query)
  if (!results.length) return null

  const c = results[0].customer
  return {
    customerId: String(c.id),
    name: c.descriptiveName || `Account ${c.id}`,
    currencyCode: c.currencyCode || 'AUD',
    descriptiveName: c.descriptiveName
  }
}

/**
 * List all non-manager client accounts under an MCC (Manager) account.
 * Uses login-customer-id header to authenticate as the MCC.
 */
export async function listClientAccounts(
  mccId: string,
  token: string,
  developerToken: string
): Promise<GoogleAdsCustomer[]> {
  const query = `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.status,
      customer_client.manager
    FROM customer_client
    WHERE customer_client.status = 'ENABLED'
      AND customer_client.manager = false
  `
  const results = await gaqlQuery(mccId, token, developerToken, query, mccId)

  return results.map((r: any) => {
    const cc = r.customerClient
    return {
      customerId: String(cc.id),
      name: cc.descriptiveName || `Account ${cc.id}`,
      currencyCode: cc.currencyCode || 'AUD',
      descriptiveName: cc.descriptiveName || null
    }
  })
}

/**
 * Get all campaigns for a customer
 */
export async function getGoogleCampaigns(
  customerId: string,
  token: string,
  developerToken: string
): Promise<GoogleAdsCampaign[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status
    FROM campaign
    ORDER BY campaign.name
  `
  const results = await gaqlQuery(customerId, token, developerToken, query)

  return results.map((r: any) => ({
    campaignId: String(r.campaign.id),
    campaignName: r.campaign.name,
    status: r.campaign.status
  }))
}

export interface GoogleAiMaxRows {
  campaignRows: RawGoogleCampaignRow[]
  adGroupRows: RawGoogleAdGroupRow[]
}

/**
 * Fetch the current AI Max and legacy migration evidence for active/paused
 * Search campaigns in one account. The caller owns auth and persistence; this
 * helper remains a read-only, account-level GAQL boundary.
 */
export async function getGoogleAiMaxRows(
  customerId: string,
  token: string,
  developerToken: string,
  loginCustomerId?: string
): Promise<GoogleAiMaxRows> {
  const campaignRows = await gaqlQuery(
    customerId,
    token,
    developerToken,
    `SELECT
       campaign.id,
       campaign.name,
       campaign.status,
       campaign.advertising_channel_type,
       campaign.bidding_strategy_type,
       campaign.keyword_match_type,
       campaign.ai_max_setting.enable_ai_max,
       campaign.ai_max_setting.bundling_required,
       campaign.asset_automation_settings
     FROM campaign
     WHERE campaign.advertising_channel_type = 'SEARCH'
       AND campaign.status IN ('ENABLED', 'PAUSED')
     ORDER BY campaign.name`,
    loginCustomerId
  )

  const adGroupRows = await gaqlQuery(
    customerId,
    token,
    developerToken,
    `SELECT
       ad_group.id,
       ad_group.campaign,
       ad_group.status,
       ad_group.ai_max_ad_group_setting.disable_search_term_matching
     FROM ad_group
     WHERE campaign.advertising_channel_type = 'SEARCH'
       AND campaign.status IN ('ENABLED', 'PAUSED')
       AND ad_group.status IN ('ENABLED', 'PAUSED')`,
    loginCustomerId
  )

  return { campaignRows, adGroupRows }
}

/** Google uses 2037-12-30 as the "no end date" sentinel. Treat that (and any 2037+) as no end. */
export function normalizeGoogleEndDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  if (Number(d.slice(0, 4)) >= 2037) return null
  return d
}

export function googleBudgetTypeFromPeriod(period: string | null | undefined): 'daily' | 'lifetime' | null {
  if (period === 'CUSTOM_PERIOD') return 'lifetime'
  if (period === 'DAILY') return 'daily'
  return null
}

/**
 * Get monthly spend aggregated by campaign
 * Google Ads amounts are in cost_micros — divide by 1,000,000 for dollars
 */
export async function getMonthlySpend(
  customerId: string,
  token: string,
  developerToken: string,
  month: number,
  year: number,
  loginCustomerId?: string
): Promise<GoogleAdsCampaignSpend[]> {
  const { since, until } = getMonthRange(month, year)

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.end_date_time,
      campaign.bidding_strategy_type,
      campaign_budget.period,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY campaign.name
  `
  const results = await gaqlQuery(customerId, token, developerToken, query, loginCustomerId)

  return results.map((r: any) => {
    const costMicros = r.metrics?.costMicros || '0'
    return {
      campaignId: String(r.campaign.id),
      campaignName: r.campaign.name,
      costMicros,
      spend: parseInt(costMicros, 10) / 1_000_000,
      impressions: parseInt(r.metrics?.impressions || '0', 10),
      clicks: parseInt(r.metrics?.clicks || '0', 10),
      conversions: parseFloat(r.metrics?.conversions || '0'),
      conversionsValue: parseFloat(r.metrics?.conversionsValue || '0'),
      status: r.campaign.status || 'UNKNOWN',
      channelType: r.campaign.advertisingChannelType || 'UNKNOWN',
      endDate: normalizeGoogleEndDate(r.campaign.endDateTime),
      bidStrategy: r.campaign.biddingStrategyType || null,
      budgetType: googleBudgetTypeFromPeriod(r.campaignBudget?.period)
    }
  })
}

// ============================================
// Daily Spend
// ============================================

export interface GoogleAdsDailySpend {
  campaignId: string
  campaignName: string
  date: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionsValue: number
}

/**
 * Get daily spend breakdown by campaign for a month
 */
export async function getDailySpend(
  customerId: string,
  token: string,
  developerToken: string,
  month: number,
  year: number,
  loginCustomerId?: string
): Promise<GoogleAdsDailySpend[]> {
  const { since, until } = getMonthRange(month, year)

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY segments.date
  `
  const results = await gaqlQuery(customerId, token, developerToken, query, loginCustomerId)

  return results.map((r: any) => {
    const costMicros = r.metrics?.costMicros || '0'
    return {
      campaignId: String(r.campaign.id),
      campaignName: r.campaign.name,
      date: r.segments.date,
      spend: parseInt(costMicros, 10) / 1_000_000,
      impressions: parseInt(r.metrics?.impressions || '0', 10),
      clicks: parseInt(r.metrics?.clicks || '0', 10),
      conversions: parseFloat(r.metrics?.conversions || '0'),
      conversionsValue: parseFloat(r.metrics?.conversionsValue || '0')
    }
  })
}

// ============================================
// Breakdown Data (Age, Gender, Device, Geo)
// ============================================

export interface GoogleBreakdownRow {
  campaignId: string
  dimensionValue: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

/**
 * Get breakdown data for campaigns by a specific segment.
 * v25: age/gender use dedicated view resources; device/geo use campaign resource.
 */
export async function getBreakdownData(
  customerId: string,
  token: string,
  developerToken: string,
  month: number,
  year: number,
  segment: 'age' | 'gender' | 'device' | 'geo',
  loginCustomerId?: string
): Promise<GoogleBreakdownRow[]> {
  const { since, until } = getMonthRange(month, year)
  const dateFilter = `segments.date BETWEEN '${since}' AND '${until}'`
  const metricsFields = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value'

  let query: string
  let extractDv: (r: any) => string

  if (segment === 'age') {
    query = `SELECT campaign.id, ad_group_criterion.age_range.type, ${metricsFields} FROM age_range_view WHERE ${dateFilter}`
    extractDv = (r) => normalizeGoogleAge(r.adGroupCriterion?.ageRange?.type)
  } else if (segment === 'gender') {
    query = `SELECT campaign.id, ad_group_criterion.gender.type, ${metricsFields} FROM gender_view WHERE ${dateFilter}`
    extractDv = (r) => normalizeGoogleGender(r.adGroupCriterion?.gender?.type)
  } else if (segment === 'device') {
    query = `SELECT campaign.id, segments.device, ${metricsFields} FROM campaign WHERE ${dateFilter}`
    extractDv = (r) => normalizeGoogleDevice(r.segments?.device)
  } else if (segment === 'geo') {
    query = `SELECT campaign.id, geographic_view.country_criterion_id, ${metricsFields} FROM geographic_view WHERE ${dateFilter}`
    extractDv = (r) => String(r.geographicView?.countryCriterionId || 'unknown')
  } else {
    return []
  }

  const results = await gaqlQuery(customerId, token, developerToken, query, loginCustomerId)

  return results.map((r: any) => {
    const costMicros = r.metrics?.costMicros || '0'
    return {
      campaignId: String(r.campaign?.id || ''),
      dimensionValue: extractDv(r),
      spend: parseInt(costMicros, 10) / 1_000_000,
      impressions: parseInt(r.metrics?.impressions || '0', 10),
      clicks: parseInt(r.metrics?.clicks || '0', 10),
      conversions: parseFloat(r.metrics?.conversions || '0'),
      revenue: parseFloat(r.metrics?.conversionsValue || '0'),
    }
  })
}

function normalizeGoogleAge(val: string | undefined): string {
  if (!val) return 'unknown'
  const map: Record<string, string> = {
    AGE_RANGE_18_24: '18-24', AGE_RANGE_25_34: '25-34', AGE_RANGE_35_44: '35-44',
    AGE_RANGE_45_54: '45-54', AGE_RANGE_55_64: '55-64', AGE_RANGE_65_UP: '65+',
    AGE_RANGE_UNDETERMINED: 'unknown',
  }
  return map[val] || 'unknown'
}

function normalizeGoogleGender(val: string | undefined): string {
  if (!val) return 'unknown'
  const map: Record<string, string> = { MALE: 'male', FEMALE: 'female', UNDETERMINED: 'unknown' }
  return map[val] || 'unknown'
}

function normalizeGoogleDevice(val: string | undefined): string {
  if (!val) return 'unknown'
  const map: Record<string, string> = {
    MOBILE: 'mobile', DESKTOP: 'desktop', TABLET: 'tablet',
    CONNECTED_TV: 'connected_tv', OTHER: 'other',
  }
  return map[val] || 'other'
}

// ============================================
// Campaign Ad Assets (Creatives)
// ============================================

export interface GoogleAdAsset {
  creativeId: string
  adId: string
  adName: string | null
  type: string
  thumbnailUrl: string | null
  title: string | null
  body: string | null
}

export interface GoogleAdPerformance {
  adId: string
  adName: string | null
  spend: number
  impressions: number
  clicks: number
  conversions: number
  reach: null
  frequency: null
  firstServedDate: string | null
  lastServedDate: string | null
  approvalStatus: string | null
  providerApprovalStatus: string | null
  approvalReviewStatus: string | null
  policyIssues: PolicyIssue[] | null
  approvalSyncedAt: string | null
  approvalUnavailableReason: string | null
}

/** Fetch and aggregate daily ad-level Google delivery. Google Ads does not expose reach/frequency at ad level. */
export async function getGoogleCampaignAdPerformance(
  customerId: string,
  token: string,
  developerToken: string,
  campaignId: string,
  since: string,
  until: string,
  loginCustomerId?: string,
): Promise<GoogleAdPerformance[]> {
  const cleanCampaignId = String(campaignId).replace(/[^0-9]/g, '')
  const [performanceResult, policyResult] = await Promise.allSettled([
    gaqlQuery(customerId, token, developerToken, `
      SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, segments.date,
             metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
        FROM ad_group_ad
       WHERE campaign.id = '${cleanCampaignId}'
         AND segments.date BETWEEN '${since}' AND '${until}'
    `, loginCustomerId),
    gaqlQuery(customerId, token, developerToken, `
      SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status,
             ad_group_ad.policy_summary.approval_status,
             ad_group_ad.policy_summary.review_status,
             ad_group_ad.policy_summary.policy_topic_entries
        FROM ad_group_ad
       WHERE campaign.id = '${cleanCampaignId}'
    `, loginCustomerId),
  ])
  if (performanceResult.status === 'rejected') throw performanceResult.reason
  const rows = performanceResult.value
  const policyRows = policyResult.status === 'fulfilled' ? policyResult.value : []
  const approvalSyncedAt = policyResult.status === 'fulfilled' ? new Date().toISOString() : null
  const approvalUnavailableReason = policyResult.status === 'rejected'
    ? sanitizeDiagnosticError(policyResult.reason)
    : null
  const grouped = new Map<string, GoogleAdPerformance>()
  for (const row of rows as any[]) {
    const ad = row.adGroupAd?.ad || {}
    const adId = String(ad.id || '')
    if (!adId) continue
    const spend = Number(row.metrics?.costMicros || 0) / 1_000_000
    const day = String(row.segments?.date || '') || null
    const current = grouped.get(adId) || {
      adId, adName: ad.name || null, spend: 0, impressions: 0, clicks: 0, conversions: 0,
      reach: null, frequency: null, firstServedDate: null, lastServedDate: null,
      approvalStatus: null, providerApprovalStatus: null, approvalReviewStatus: null,
      policyIssues: null, approvalSyncedAt, approvalUnavailableReason,
    }
    current.spend += spend
    current.impressions += Number(row.metrics?.impressions || 0)
    current.clicks += Number(row.metrics?.clicks || 0)
    current.conversions += Number(row.metrics?.conversions || 0)
    if (spend > 0 && day) {
      if (!current.firstServedDate || day < current.firstServedDate) current.firstServedDate = day
      if (!current.lastServedDate || day > current.lastServedDate) current.lastServedDate = day
    }
    grouped.set(adId, current)
  }
  for (const row of policyRows as any[]) {
    const adGroupAd = row.adGroupAd || {}
    const ad = adGroupAd.ad || {}
    const adId = String(ad.id || '')
    if (!adId) continue
    const summary = adGroupAd.policySummary || {}
    const providerApprovalStatus = sanitizeDiagnosticText(summary.approvalStatus, 80)?.toUpperCase() || null
    const current = grouped.get(adId) || {
      adId, adName: ad.name || null, spend: 0, impressions: 0, clicks: 0, conversions: 0,
      reach: null, frequency: null, firstServedDate: null, lastServedDate: null,
      approvalStatus: null, providerApprovalStatus: null, approvalReviewStatus: null,
      policyIssues: null, approvalSyncedAt, approvalUnavailableReason,
    }
    current.adName = current.adName || ad.name || null
    current.providerApprovalStatus = providerApprovalStatus
    current.approvalStatus = normalizeGoogleApprovalStatus(providerApprovalStatus)
    current.approvalReviewStatus = sanitizeDiagnosticText(summary.reviewStatus, 80)?.toUpperCase() || null
    current.policyIssues = normalizeGooglePolicyIssues(summary.policyTopicEntries)
    current.approvalSyncedAt = approvalSyncedAt
    current.approvalUnavailableReason = null
    grouped.set(adId, current)
  }
  if (policyResult.status === 'fulfilled') {
    const policyIds = new Set((policyRows as any[]).map(row => String(row.adGroupAd?.ad?.id || '')).filter(Boolean))
    for (const row of grouped.values()) {
      if (policyIds.has(row.adId)) continue
      row.approvalSyncedAt = null
      row.approvalUnavailableReason = 'No Google Ads policy row returned for this ad.'
    }
  }
  return [...grouped.values()]
}

export interface GoogleCampaignDiagnostic {
  campaignId: string
  channelType: string | null
  servingStatus: string | null
  servingStatusReasons: string[]
  providerServingStatusReasons: string[]
  servingSyncedAt: string | null
  servingUnavailableReason: string | null
  impressionShare: number | null
  lostImpressionShareBudget: number | null
  lostImpressionShareRank: number | null
  impressionShareSyncedAt: string | null
  impressionShareUnavailableReason: string | null
}

/** Campaign delivery metadata and Search impression share are separate failure domains. */
export async function getGoogleCampaignDiagnostics(
  customerId: string,
  token: string,
  developerToken: string,
  since: string,
  until: string,
  campaignId?: string,
  loginCustomerId?: string,
): Promise<GoogleCampaignDiagnostic[]> {
  const cleanCampaignId = campaignId ? String(campaignId).replace(/[^0-9]/g, '') : null
  const campaignFilter = cleanCampaignId ? ` AND campaign.id = ${cleanCampaignId}` : ''
  const [servingResult, impressionShareResult] = await Promise.allSettled([
    gaqlQuery(customerId, token, developerToken, `
      SELECT campaign.id, campaign.advertising_channel_type,
             campaign.primary_status, campaign.primary_status_reasons
        FROM campaign
       WHERE campaign.status != 'REMOVED'${campaignFilter}
    `, loginCustomerId),
    gaqlQuery(customerId, token, developerToken, `
      SELECT campaign.id, campaign.advertising_channel_type,
             metrics.search_impression_share,
             metrics.search_budget_lost_impression_share,
             metrics.search_rank_lost_impression_share
        FROM campaign
       WHERE campaign.status != 'REMOVED'
         AND segments.date BETWEEN '${since}' AND '${until}'${campaignFilter}
    `, loginCustomerId),
  ])
  if (servingResult.status === 'rejected' && impressionShareResult.status === 'rejected') {
    throw new Error(`Google campaign diagnostics failed: ${sanitizeDiagnosticError(servingResult.reason)}`)
  }
  const servingError = servingResult.status === 'rejected' ? sanitizeDiagnosticError(servingResult.reason) : null
  const impressionShareError = impressionShareResult.status === 'rejected'
    ? sanitizeDiagnosticError(impressionShareResult.reason)
    : null
  const servingSyncedAt = servingResult.status === 'fulfilled' ? new Date().toISOString() : null
  const impressionShareSyncedAt = impressionShareResult.status === 'fulfilled' ? new Date().toISOString() : null
  const byCampaign = new Map<string, GoogleCampaignDiagnostic>()
  const empty = (id: string): GoogleCampaignDiagnostic => ({
    campaignId: id,
    channelType: null,
    servingStatus: null,
    servingStatusReasons: [],
    providerServingStatusReasons: [],
    servingSyncedAt,
    servingUnavailableReason: servingError,
    impressionShare: null,
    lostImpressionShareBudget: null,
    lostImpressionShareRank: null,
    impressionShareSyncedAt,
    impressionShareUnavailableReason: impressionShareError,
  })
  if (servingResult.status === 'fulfilled') {
    for (const row of servingResult.value as any[]) {
      const campaign = row.campaign || {}
      const id = String(campaign.id || '')
      if (!id) continue
      const reasons = normalizeGoogleServingReasons(campaign.primaryStatusReasons)
      byCampaign.set(id, {
        ...empty(id),
        channelType: sanitizeDiagnosticText(campaign.advertisingChannelType, 80)?.toUpperCase() || null,
        servingStatus: sanitizeDiagnosticText(campaign.primaryStatus, 80)?.toUpperCase() || null,
        servingStatusReasons: reasons.normalized,
        providerServingStatusReasons: reasons.provider,
        servingUnavailableReason: null,
      })
    }
  }
  if (impressionShareResult.status === 'fulfilled') {
    for (const row of impressionShareResult.value as any[]) {
      const campaign = row.campaign || {}
      const id = String(campaign.id || '')
      if (!id) continue
      const metrics = row.metrics || {}
      const current = byCampaign.get(id) || empty(id)
      current.channelType = current.channelType
        || sanitizeDiagnosticText(campaign.advertisingChannelType, 80)?.toUpperCase()
        || null
      current.impressionShare = metrics.searchImpressionShare == null ? null : Number(metrics.searchImpressionShare)
      current.lostImpressionShareBudget = metrics.searchBudgetLostImpressionShare == null
        ? null
        : Number(metrics.searchBudgetLostImpressionShare)
      current.lostImpressionShareRank = metrics.searchRankLostImpressionShare == null
        ? null
        : Number(metrics.searchRankLostImpressionShare)
      current.impressionShareUnavailableReason = null
      byCampaign.set(id, current)
    }
  }
  return [...byCampaign.values()]
}

export interface GoogleSearchTerm {
  searchTerm: string
  matchType: string | null
  targetingStatus: string | null
  impressions: number
  clicks: number
  cost: number
}

/** Fetch all searchStream batches, aggregate duplicate rows, and return highest-cost terms first. */
export async function getGoogleCampaignSearchTerms(
  customerId: string,
  token: string,
  developerToken: string,
  campaignId: string,
  since: string,
  until: string,
  loginCustomerId?: string,
): Promise<GoogleSearchTerm[]> {
  const cleanCampaignId = String(campaignId).replace(/[^0-9]/g, '')
  const rows = await gaqlQuery(customerId, token, developerToken, `
    SELECT campaign_search_term_view.search_term,
           segments.search_term_match_type,
           metrics.cost_micros, metrics.impressions, metrics.clicks
      FROM campaign_search_term_view
     WHERE campaign.id = ${cleanCampaignId}
       AND segments.date BETWEEN '${since}' AND '${until}'
  `, loginCustomerId)
  const grouped = new Map<string, GoogleSearchTerm>()
  for (const row of rows as any[]) {
    const view = row.campaignSearchTermView || {}
    const searchTerm = sanitizeDiagnosticText(view.searchTerm, 500)
    if (!searchTerm) continue
    const matchType = sanitizeDiagnosticText(row.segments?.searchTermMatchType, 80)?.toUpperCase() || null
    const key = `${searchTerm}\u0000${matchType || ''}`
    const current = grouped.get(key) || {
      searchTerm,
      matchType,
      // campaign_search_term_view has no status field in Google Ads v23. Keep this
      // explicitly unknown instead of borrowing a criterion status from another scope.
      targetingStatus: null,
      impressions: 0,
      clicks: 0,
      cost: 0,
    }
    current.impressions += Number(row.metrics?.impressions || 0)
    current.clicks += Number(row.metrics?.clicks || 0)
    current.cost += Number(row.metrics?.costMicros || 0) / 1_000_000
    grouped.set(key, current)
  }
  return [...grouped.values()].sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
}

/**
 * Get ad assets for a campaign.
 * Step 1: Fetch ads with headlines/descriptions via ad_group_ad.
 * Step 2: Resolve image URLs via ad_group_ad_asset_view (asset.image_asset.full_size.url).
 */
/**
 * Per-campaign cap for the ad-asset pull (X-1a). searchStream returns every batch, so this is a
 * self-imposed bound for payload size, not an API page. We fetch one extra row so a campaign with
 * more ads than the cap is DECLARED truncated (`truncated` on the returned array) instead of silently
 * returning a subset — the old hard `LIMIT 5` did exactly that.
 */
export const GOOGLE_AD_ASSETS_CAP = 200

export type GoogleAdAssetList = GoogleAdAsset[] & { truncated: boolean, cap: number, total: number }

export async function getCampaignAdAssets(
  customerId: string,
  token: string,
  developerToken: string,
  campaignId: string,
  loginCustomerId?: string
): Promise<GoogleAdAssetList> {
  const cleanCampaignId = String(campaignId).replace(/[^0-9]/g, '')
  try {
    // Step 1: Get ads with text content
    const adQuery = `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.ad.image_ad.image_url,
        ad_group_ad.ad.responsive_display_ad.headlines,
        ad_group_ad.ad.responsive_display_ad.descriptions,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions
      FROM ad_group_ad
      WHERE campaign.id = '${cleanCampaignId}'
    `
    const allAdResults = await gaqlQuery(customerId, token, developerToken, adQuery, loginCustomerId)
    const total = allAdResults.length
    const truncated = allAdResults.length > GOOGLE_AD_ASSETS_CAP
    const adResults = truncated ? allAdResults.slice(0, GOOGLE_AD_ASSETS_CAP) : allAdResults
    if (truncated) {
      console.warn(`[GoogleAds] campaign ${cleanCampaignId} has more than ${GOOGLE_AD_ASSETS_CAP} ads; creative registry is truncated`)
    }

    // Step 2: Resolve image asset URLs for this campaign
    const imageMap = new Map<string, string>() // adId → imageUrl
    try {
      const assetQuery = `
        SELECT
          ad_group_ad.ad.id,
          asset.image_asset.full_size.url
        FROM ad_group_ad_asset_view
        WHERE campaign.id = '${cleanCampaignId}'
          AND asset.type = 'IMAGE'
        LIMIT ${GOOGLE_AD_ASSETS_CAP * 2}
      `
      const assetResults = await gaqlQuery(customerId, token, developerToken, assetQuery, loginCustomerId)
      for (const r of assetResults) {
        const adId = String(r.adGroupAd?.ad?.id || '')
        const url = r.asset?.imageAsset?.fullSize?.url
        if (adId && url && !imageMap.has(adId)) {
          imageMap.set(adId, url)
        }
      }
    } catch {
      // Asset view query may fail for some campaign types — continue without images
    }

    const assets = adResults.map((r: any) => {
      const ad = r.adGroupAd?.ad || {}
      const rda = ad.responsiveDisplayAd || {}
      const rsa = ad.responsiveSearchAd || {}
      const headlines = rda.headlines || rsa.headlines || []
      const descriptions = rda.descriptions || rsa.descriptions || []
      const adId = String(ad.id || '')

      // Image priority: image_ad URL > asset view URL > null
      const imageUrl = ad.imageAd?.imageUrl || imageMap.get(adId) || null

      return {
        creativeId: adId,
        adId,
        adName: ad.name || null,
        type: (ad.type || 'UNKNOWN').toLowerCase().replace(/_/g, ' '),
        thumbnailUrl: imageUrl,
        title: headlines[0]?.text || ad.name || null,
        body: descriptions[0]?.text || null,
      }
    })
    return Object.assign(assets, { truncated, cap: GOOGLE_AD_ASSETS_CAP, total })
  } catch (err: any) {
    // Rethrow: "the API failed" must never look like "this campaign has no creatives". Both callers
    // (onDemandSync, spendSync) already catch + log per campaign and skip the upsert.
    console.warn(`[GoogleAds] Failed to fetch ad assets for campaign ${campaignId}:`, err.message)
    throw err
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Google Ads API fetch wrapper with rate-limit awareness
 */
async function googleAdsFetch<T>(
  url: string,
  token: string,
  developerToken: string,
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ofetch<T>(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'developer-token': developerToken
        }
      })
    } catch (err: any) {
      const status = err?.status || err?.statusCode
      if ((status === 429 || status === 500 || status === 503) && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('Google Ads API: max retries exceeded')
}

// ============================================
// Lead Form Assets (for the form-picker dropdown in leads engine)
// ============================================

export interface GoogleLeadFormAsset {
  id: string
  name: string
  business_name?: string
}

export async function listGoogleLeadFormAssets(
  customerId: string,
  token: string,
  developerToken: string,
  loginCustomerId?: string,
): Promise<GoogleLeadFormAsset[]> {
  const query = `
    SELECT asset.id, asset.name, asset.lead_form_asset.business_name
    FROM asset
    WHERE asset.type = 'LEAD_FORM'
  `
  try {
    const results = await gaqlQuery(customerId, token, developerToken, query, loginCustomerId)
    return results.map((r: any) => ({
      id: String(r.asset?.id ?? ''),
      name: String(r.asset?.name ?? `Form ${r.asset?.id ?? ''}`),
      business_name: r.asset?.leadFormAsset?.businessName,
    })).filter((f) => f.id)
  } catch {
    return []
  }
}

// Local helper (not exported — avoids Nitro duplicate import warning with metaClient.ts)
function getMonthRange(month: number, year: number): { since: string; until: string } {
  const since = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const until = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { since, until }
}

/**
 * Update a Google campaign's daily budget (major units). Resolves the campaign's
 * CampaignBudget resource, mutates amount_micros, reads back. Sends the MCC
 * login-customer-id header (dashes stripped) so client accounts under a manager
 * don't 403 — the same header the spend reads require.
 */
function googleAdsMutationDiagnostic(error: any): string | null {
  const providerError = error?.data?.error
  const first = providerError?.details
    ?.flatMap((detail: any) => Array.isArray(detail?.errors) ? detail.errors : [])
    ?.[0]
  if (!first) return null

  const code = Object.values(first.errorCode || {}).find(value => typeof value === 'string')
  const path = first.location?.fieldPathElements
    ?.map((part: any) => `${part.fieldName || 'field'}${Number.isInteger(part.index) ? `[${part.index}]` : ''}`)
    .join('.')
  const message = typeof first.message === 'string' ? first.message : providerError?.message
  if (!code || !message) return null

  return `Google Ads budget update rejected: ${code}${path ? ` at ${path}` : ''} — ${message}`.slice(0, 1000)
}

export async function updateGoogleCampaignDailyBudget(opts: {
  customerId: string
  campaignId: string
  dailyMajor: number
  token: string
  developerToken: string
  loginCustomerId?: string
}): Promise<{ readBackDailyMajor: number }> {
  const cid = opts.customerId.replace(/-/g, '')
  // Sanitize the campaign id to digits before interpolating into GAQL (matches
  // the hardened pattern used elsewhere in this client; ids are numeric).
  const cleanCampaignId = String(opts.campaignId).replace(/[^0-9]/g, '')
  if (!cleanCampaignId) throw new Error('Google: invalid campaign id')
  const amountMicros = String(Math.round(opts.dailyMajor * 1_000_000))

  const attempt = async (loginCustomerId?: string): Promise<{ readBackDailyMajor: number }> => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${opts.token}`,
      'developer-token': opts.developerToken,
      'Content-Type': 'application/json',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/-/g, '')

    // Resolve the campaign's budget resource name.
    const search = await ofetch<any[]>(`${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST', headers,
      body: { query: `SELECT campaign_budget.resource_name, campaign_budget.period, campaign_budget.total_amount_micros FROM campaign WHERE campaign.id = ${cleanCampaignId}` },
    })
    const campaignBudget = search?.[0]?.results?.[0]?.campaignBudget
    const resourceName: string | undefined = campaignBudget?.resourceName
    if (!resourceName) throw new Error('Google: campaign budget resource not found')
    if (campaignBudget?.period === 'CUSTOM_PERIOD') {
      throw new Error('Google: campaign uses a custom-period total budget; daily-budget updates are not supported')
    }

    try {
      await ofetch(`${GOOGLE_ADS_BASE}/customers/${cid}/campaignBudgets:mutate`, {
        method: 'POST', headers,
        body: { operations: [{ updateMask: 'amountMicros', update: { resourceName, amountMicros } }] },
      })
    } catch (error: any) {
      const diagnostic = googleAdsMutationDiagnostic(error)
      if (diagnostic) throw new Error(diagnostic)
      throw error
    }

    const back = await ofetch<any[]>(`${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST', headers,
      body: { query: `SELECT campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${cleanCampaignId}` },
    })
    const micros = back?.[0]?.results?.[0]?.campaignBudget?.amountMicros
    return { readBackDailyMajor: Number(micros || '0') / 1_000_000 }
  }

  try {
    return await attempt(opts.loginCustomerId)
  } catch (err: any) {
    // A 403 under a manager context can also mean this account is directly
    // owned (not a child of the MCC) — retry once without the manager header,
    // exactly like the spend read path (processGoogleConnection).
    const status = err?.status || err?.statusCode
    if (status === 403 && opts.loginCustomerId) {
      return await attempt(undefined)
    }
    throw err
  }
}

/**
 * Fetch ONE campaign's month-to-date core metrics directly (single GAQL filtered
 * by campaign.id) for an on-demand refresh. Returns null when the campaign has
 * no rows in the window. Used by refreshSingleCampaignSpend for Google.
 */
export async function getCampaignSpendById(
  customerId: string,
  token: string,
  developerToken: string,
  campaignId: string,
  month: number,
  year: number,
  loginCustomerId?: string,
): Promise<{ spend: number; impressions: number; clicks: number } | null> {
  const cleanCampaignId = String(campaignId).replace(/[^0-9]/g, '')
  if (!cleanCampaignId) return null
  const { since, until } = getMonthRange(month, year)
  const query = `
    SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE campaign.id = ${cleanCampaignId}
      AND segments.date BETWEEN '${since}' AND '${until}'
  `
  const results = await gaqlQuery(customerId, token, developerToken, query, loginCustomerId)
  if (!results.length) return null
  // searchStream returns one row per matching day-segment — aggregate.
  let costMicros = 0, impressions = 0, clicks = 0
  for (const r of results) {
    costMicros += parseInt(r.metrics?.costMicros || '0', 10)
    impressions += parseInt(r.metrics?.impressions || '0', 10)
    clicks += parseInt(r.metrics?.clicks || '0', 10)
  }
  return { spend: costMicros / 1_000_000, impressions, clicks }
}

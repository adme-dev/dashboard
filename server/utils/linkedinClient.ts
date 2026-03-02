/**
 * LinkedIn Marketing API Client
 * Lightweight client using ofetch (matches tiktokClient.ts pattern)
 * LinkedIn Marketing API — https://learn.microsoft.com/en-us/linkedin/marketing/
 */

import { ofetch } from 'ofetch'

export const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'

// ============================================
// Types
// ============================================

export interface LinkedInAdAccount {
  id: string
  name: string
  currency: string
  status: string
}

export interface LinkedInCampaignInsight {
  campaign_id: string
  campaign_name: string
  spend: string
  impressions: string
  clicks: string
  conversions: string
  date: string // YYYY-MM-DD when daily
}

export interface LinkedInTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the LinkedIn OAuth authorization URL
 */
export function getLinkedInAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'r_ads,r_ads_reporting',
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

/**
 * Exchange authorization code for an access token.
 * LinkedIn tokens are short-lived (60 days) and may include a refresh token.
 */
export async function exchangeLinkedInToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<LinkedInTokenResponse> {
  const res = await ofetch<{
    access_token: string
    expires_in: number
    refresh_token?: string
    refresh_token_expires_in?: number
  }>('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  })

  return {
    access_token: res.access_token,
    expires_in: res.expires_in,
    refresh_token: res.refresh_token,
    refresh_token_expires_in: res.refresh_token_expires_in,
  }
}

/**
 * Refresh a LinkedIn access token using the refresh token.
 */
export async function refreshLinkedInToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<LinkedInTokenResponse> {
  const res = await ofetch<{
    access_token: string
    expires_in: number
    refresh_token?: string
    refresh_token_expires_in?: number
  }>('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })

  return {
    access_token: res.access_token,
    expires_in: res.expires_in,
    refresh_token: res.refresh_token || refreshToken,
    refresh_token_expires_in: res.refresh_token_expires_in,
  }
}

// ============================================
// Ad Account Endpoints
// ============================================

/**
 * Get ad accounts accessible by the token.
 * Uses LinkedIn REST API v2 with versioned headers.
 */
export async function getLinkedInAdAccounts(accessToken: string): Promise<LinkedInAdAccount[]> {
  const res = await linkedinFetch<{
    elements: Array<{
      id: number | string
      name: string
      currency: string
      status: string
    }>
  }>(`${LINKEDIN_API_BASE}/adAccounts`, accessToken, {
    q: 'search',
    'search.status.values[0]': 'ACTIVE',
    'search.status.values[1]': 'DRAFT',
    count: 100,
  })

  return (res.elements || []).map(a => ({
    id: String(a.id),
    name: a.name,
    currency: a.currency || 'USD',
    status: a.status,
  }))
}

// ============================================
// Insights Endpoints
// ============================================

/**
 * Get campaign-level insights for a specific month (aggregated).
 * LinkedIn Ad Analytics API with pivot=CAMPAIGN, timeGranularity=MONTHLY.
 */
export async function getLinkedInCampaignInsights(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<LinkedInCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)
  const [startYear, startMonth, startDay] = since.split('-').map(Number) as [number, number, number]
  const [endYear, endMonth, endDay] = until.split('-').map(Number) as [number, number, number]

  const res = await linkedinFetch<{
    elements: Array<{
      pivotValues: string[]
      costInLocalCurrency: string
      impressions: number
      clicks: number
      externalWebsiteConversions: number
      dateRange: {
        start: { year: number; month: number; day: number }
        end: { year: number; month: number; day: number }
      }
    }>
  }>(`${LINKEDIN_API_BASE}/adAnalytics`, accessToken, {
    q: 'analytics',
    pivot: 'CAMPAIGN',
    timeGranularity: 'MONTHLY',
    'dateRange.start.year': startYear,
    'dateRange.start.month': startMonth,
    'dateRange.start.day': startDay,
    'dateRange.end.year': endYear,
    'dateRange.end.month': endMonth,
    'dateRange.end.day': endDay,
    accounts: `urn:li:sponsoredAccount:${accountId}`,
    fields: 'costInLocalCurrency,impressions,clicks,externalWebsiteConversions',
  })

  // Fetch campaign names in bulk
  const campaignIds = (res.elements || []).map(e => extractCampaignId(e.pivotValues))
  const campaignNames = await fetchCampaignNames(accessToken, campaignIds)

  return (res.elements || []).map(item => {
    const campaignId = extractCampaignId(item.pivotValues)
    return {
      campaign_id: campaignId,
      campaign_name: campaignNames.get(campaignId) || `Campaign ${campaignId}`,
      spend: item.costInLocalCurrency || '0',
      impressions: String(item.impressions || 0),
      clicks: String(item.clicks || 0),
      conversions: String(item.externalWebsiteConversions || 0),
      date: since,
    }
  })
}

/**
 * Get campaign-level daily insights for a specific month.
 * Same as getLinkedInCampaignInsights() but with timeGranularity=DAILY.
 */
export async function getLinkedInCampaignDailyInsights(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<LinkedInCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)
  const [startYear, startMonth, startDay] = since.split('-').map(Number) as [number, number, number]
  const [endYear, endMonth, endDay] = until.split('-').map(Number) as [number, number, number]

  const res = await linkedinFetch<{
    elements: Array<{
      pivotValues: string[]
      costInLocalCurrency: string
      impressions: number
      clicks: number
      externalWebsiteConversions: number
      dateRange: {
        start: { year: number; month: number; day: number }
        end: { year: number; month: number; day: number }
      }
    }>
  }>(`${LINKEDIN_API_BASE}/adAnalytics`, accessToken, {
    q: 'analytics',
    pivot: 'CAMPAIGN',
    timeGranularity: 'DAILY',
    'dateRange.start.year': startYear,
    'dateRange.start.month': startMonth,
    'dateRange.start.day': startDay,
    'dateRange.end.year': endYear,
    'dateRange.end.month': endMonth,
    'dateRange.end.day': endDay,
    accounts: `urn:li:sponsoredAccount:${accountId}`,
    fields: 'costInLocalCurrency,impressions,clicks,externalWebsiteConversions',
  })

  // Fetch campaign names in bulk
  const campaignIds = [...new Set((res.elements || []).map(e => extractCampaignId(e.pivotValues)))]
  const campaignNames = await fetchCampaignNames(accessToken, campaignIds)

  return (res.elements || []).map(item => {
    const campaignId = extractCampaignId(item.pivotValues)
    const start = item.dateRange?.start
    const dateStr = start
      ? `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`
      : since
    return {
      campaign_id: campaignId,
      campaign_name: campaignNames.get(campaignId) || `Campaign ${campaignId}`,
      spend: item.costInLocalCurrency || '0',
      impressions: String(item.impressions || 0),
      clicks: String(item.clicks || 0),
      conversions: String(item.externalWebsiteConversions || 0),
      date: dateStr,
    }
  })
}

// ============================================
// Helpers
// ============================================

/**
 * LinkedIn API fetch wrapper with rate-limit handling.
 * LinkedIn uses Bearer token and requires versioned headers.
 * Rate limit: 100 calls/day/member.
 */
async function linkedinFetch<T>(
  url: string,
  token: string,
  query: Record<string, any>,
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ofetch<T>(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401',
        },
        query,
      })
    } catch (err: any) {
      const status = err?.status || err?.statusCode
      if ((status === 429 || status === 500) && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('LinkedIn API: max retries exceeded')
}

/**
 * Extract campaign ID from pivotValues URN.
 * LinkedIn returns campaign URNs like "urn:li:sponsoredCampaign:123456"
 */
function extractCampaignId(pivotValues: string[]): string {
  const urn = (pivotValues || [])[0] || ''
  const parts = urn.split(':')
  return parts[parts.length - 1] || urn
}

/**
 * Fetch campaign names in bulk from LinkedIn Campaigns API.
 */
async function fetchCampaignNames(
  accessToken: string,
  campaignIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (!campaignIds.length) return names

  // LinkedIn supports batch GET via IDs parameter
  try {
    const res = await linkedinFetch<{
      elements: Array<{
        id: number | string
        name: string
      }>
    }>(`${LINKEDIN_API_BASE}/adCampaigns`, accessToken, {
      q: 'search',
      'search.id.values': campaignIds,
      count: 1000,
    })

    for (const c of res.elements || []) {
      names.set(String(c.id), c.name)
    }
  } catch {
    // Graceful degradation — campaign names are non-critical
  }

  return names
}

/**
 * Get first and last day of a month as YYYY-MM-DD strings
 */
function getMonthRange(month: number, year: number): { since: string; until: string } {
  const since = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const until = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { since, until }
}

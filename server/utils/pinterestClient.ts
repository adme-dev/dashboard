/**
 * Pinterest Ads API v5 Client
 * Lightweight client using ofetch (matches tiktokClient.ts pattern)
 * API v5 — https://developers.pinterest.com/docs/api/v5/
 */

import { ofetch } from 'ofetch'

export const PINTEREST_API_BASE = 'https://api.pinterest.com/v5'

// ============================================
// Types
// ============================================

export interface PinterestAdAccount {
  id: string
  name: string
  currency: string
  status: string
  country: string
}

export interface PinterestCampaignInsight {
  campaign_id: string
  campaign_name: string
  spend: string
  impressions: string
  clicks: string
  conversions: string
  date: string // YYYY-MM-DD when daily
}

export interface PinterestTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the Pinterest OAuth authorization URL.
 * Pinterest uses standard OAuth2 with code grant.
 */
export function getPinterestAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'ads:read',
    state,
  })
  return `https://www.pinterest.com/oauth/?${params.toString()}`
}

/**
 * Exchange authorization code for tokens.
 * Pinterest uses Basic auth header: Authorization: Basic base64(appId:appSecret)
 * Body is form-urlencoded.
 */
export async function exchangePinterestToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<PinterestTokenResponse> {
  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  const res = await ofetch<PinterestTokenResponse>(`${PINTEREST_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  })

  return res
}

/**
 * Refresh an expired access token.
 * Pinterest access tokens last only ~1 hour. Refresh tokens last 1 year.
 * Uses Basic auth header same as token exchange.
 */
export async function refreshPinterestToken(
  refreshToken: string,
  appId: string,
  appSecret: string
): Promise<PinterestTokenResponse> {
  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  const res = await ofetch<PinterestTokenResponse>(`${PINTEREST_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })

  return res
}

// ============================================
// Ad Account Endpoints
// ============================================

/**
 * Get ad accounts accessible by the token.
 */
export async function getPinterestAdAccounts(accessToken: string): Promise<PinterestAdAccount[]> {
  const res = await pinterestFetch<{
    items: Array<{
      id: string
      name: string
      currency: string
      status: string
      country: string
    }>
  }>(`${PINTEREST_API_BASE}/ad_accounts`, accessToken)

  return (res.items || []).map(a => ({
    id: a.id,
    name: a.name,
    currency: a.currency || 'USD',
    status: a.status || 'ACTIVE',
    country: a.country || '',
  }))
}

// ============================================
// Insights Endpoints
// ============================================

/**
 * Get campaign-level insights for a specific month (aggregated).
 * Uses the ad_accounts analytics endpoint with CAMPAIGN level.
 */
export async function getPinterestCampaignInsights(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<PinterestCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  // First, list campaigns for this ad account
  const campaignsRes = await pinterestFetch<{
    items: Array<{ id: string; name: string; status: string }>
  }>(`${PINTEREST_API_BASE}/ad_accounts/${accountId}/campaigns`, accessToken)

  const campaigns = campaignsRes.items || []
  if (campaigns.length === 0) return []

  const campaignIds = campaigns.map(c => c.id)
  const campaignNameMap = new Map(campaigns.map(c => [c.id, c.name]))

  // Fetch analytics for all campaigns
  const analyticsRes = await pinterestFetch<Array<{
    CAMPAIGN_ID: string
    SPEND_IN_DOLLAR: number
    IMPRESSION_1: number
    CLICKTHROUGH_1: number
    TOTAL_CONVERSIONS: number
  }>>(`${PINTEREST_API_BASE}/ad_accounts/${accountId}/campaigns/analytics`, accessToken, {
    start_date: since,
    end_date: until,
    campaign_ids: campaignIds.join(','),
    columns: 'SPEND_IN_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1,TOTAL_CONVERSIONS',
    granularity: 'MONTH',
  })

  const rows = Array.isArray(analyticsRes) ? analyticsRes : []

  return rows.map(item => ({
    campaign_id: String(item.CAMPAIGN_ID || ''),
    campaign_name: campaignNameMap.get(String(item.CAMPAIGN_ID)) || '',
    spend: String(item.SPEND_IN_DOLLAR || 0),
    impressions: String(item.IMPRESSION_1 || 0),
    clicks: String(item.CLICKTHROUGH_1 || 0),
    conversions: String(item.TOTAL_CONVERSIONS || 0),
    date: since,
  }))
}

/**
 * Get campaign-level daily insights for a specific month.
 * Same as getPinterestCampaignInsights but with DAY granularity.
 */
export async function getPinterestDailyInsights(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<PinterestCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  // List campaigns
  const campaignsRes = await pinterestFetch<{
    items: Array<{ id: string; name: string; status: string }>
  }>(`${PINTEREST_API_BASE}/ad_accounts/${accountId}/campaigns`, accessToken)

  const campaigns = campaignsRes.items || []
  if (campaigns.length === 0) return []

  const campaignIds = campaigns.map(c => c.id)
  const campaignNameMap = new Map(campaigns.map(c => [c.id, c.name]))

  const analyticsRes = await pinterestFetch<Array<{
    CAMPAIGN_ID: string
    DATE: string
    SPEND_IN_DOLLAR: number
    IMPRESSION_1: number
    CLICKTHROUGH_1: number
    TOTAL_CONVERSIONS: number
  }>>(`${PINTEREST_API_BASE}/ad_accounts/${accountId}/campaigns/analytics`, accessToken, {
    start_date: since,
    end_date: until,
    campaign_ids: campaignIds.join(','),
    columns: 'SPEND_IN_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1,TOTAL_CONVERSIONS',
    granularity: 'DAY',
  })

  const rows = Array.isArray(analyticsRes) ? analyticsRes : []

  return rows.map(item => ({
    campaign_id: String(item.CAMPAIGN_ID || ''),
    campaign_name: campaignNameMap.get(String(item.CAMPAIGN_ID)) || '',
    spend: String(item.SPEND_IN_DOLLAR || 0),
    impressions: String(item.IMPRESSION_1 || 0),
    clicks: String(item.CLICKTHROUGH_1 || 0),
    conversions: String(item.TOTAL_CONVERSIONS || 0),
    date: item.DATE || since,
  }))
}

// ============================================
// Helpers
// ============================================

/**
 * Pinterest API fetch wrapper with rate-limit handling.
 * Pinterest uses standard Bearer token auth.
 * Rate limit: 1000 requests/min (generous).
 */
async function pinterestFetch<T>(
  url: string,
  token: string,
  query?: Record<string, string>,
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ofetch<T>(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
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
  throw new Error('Pinterest API: max retries exceeded')
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

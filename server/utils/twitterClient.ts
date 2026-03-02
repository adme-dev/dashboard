/**
 * X (Twitter) Ads API v12 Client
 * Uses OAuth 2.0 with PKCE flow — https://developer.x.com/en/docs/authentication/oauth-2-0
 * Ads API reference — https://developer.x.com/en/docs/twitter-ads-api
 */

import crypto from 'crypto'
import { ofetch } from 'ofetch'

export const TWITTER_ADS_API_BASE = 'https://ads-api.x.com/12'

// ============================================
// Types
// ============================================

export interface TwitterAdAccount {
  id: string
  name: string
  currency: string
  timezone: string
  approval_status: string
}

export interface TwitterCampaignInsight {
  campaign_id: string
  campaign_name: string
  spend: number // converted from micros
  impressions: number
  clicks: number
  conversions: number
  date: string // YYYY-MM-DD
}

export interface TwitterTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

// ============================================
// PKCE Helpers
// ============================================

/**
 * Generate a cryptographically random code verifier (43-128 chars, base64url).
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Generate a code challenge from a verifier using SHA-256 + base64url.
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest('base64')
  // Convert base64 to base64url: replace + with -, / with _, remove trailing =
  return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the X OAuth 2.0 authorization URL with PKCE.
 */
export function getTwitterAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'ads.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://api.x.com/2/oauth2/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for tokens using PKCE.
 * Uses Basic auth (client_id:client_secret) in Authorization header.
 */
export async function exchangeTwitterToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TwitterTokenResponse> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await ofetch<TwitterTokenResponse>('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  })

  return res
}

/**
 * Refresh an expired access token.
 */
export async function refreshTwitterToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TwitterTokenResponse> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await ofetch<TwitterTokenResponse>('https://api.x.com/2/oauth2/token', {
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
export async function getTwitterAdAccounts(accessToken: string): Promise<TwitterAdAccount[]> {
  const res = await twitterFetch<{
    data: Array<{
      id: string
      name: string
      currency: string
      timezone: string
      approval_status: string
    }>
  }>(`${TWITTER_ADS_API_BASE}/accounts`, accessToken)

  return (res.data || []).map(a => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    approval_status: a.approval_status,
  }))
}

// ============================================
// Campaign Stats Endpoints
// ============================================

/**
 * Get campaign-level stats for a specific month.
 * Uses the synchronous stats endpoint with CAMPAIGN entity.
 * Spend is returned in micros (billed_charge_local_micro) — divide by 1,000,000.
 */
export async function getTwitterCampaignStats(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<TwitterCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  // First get list of campaigns for this account
  const campaignsRes = await twitterFetch<{
    data: Array<{
      id: string
      name: string
      entity_status: string
    }>
  }>(`${TWITTER_ADS_API_BASE}/accounts/${accountId}/campaigns`, accessToken, {
    count: 1000,
    with_deleted: 'false',
  })

  const campaigns = campaignsRes.data || []
  if (campaigns.length === 0) return []

  const campaignIds = campaigns.map(c => c.id)
  const campaignNameMap = new Map(campaigns.map(c => [c.id, c.name]))

  // Fetch stats for all campaigns
  const statsRes = await twitterFetch<{
    data: Array<{
      id: string
      id_data: Array<{
        segment: null
        metrics: {
          billed_charge_local_micro: string[]
          impressions: string[]
          clicks: string[]
          url_clicks: string[]
        }
      }>
    }>
  }>(`${TWITTER_ADS_API_BASE}/stats/accounts/${accountId}`, accessToken, {
    entity: 'CAMPAIGN',
    entity_ids: campaignIds.join(','),
    start_time: `${since}T00:00:00Z`,
    end_time: `${until}T23:59:59Z`,
    granularity: 'TOTAL',
    metric_groups: 'BILLING,ENGAGEMENT',
    placement: 'ALL_ON_TWITTER',
  })

  const results: TwitterCampaignInsight[] = []

  for (const entry of statsRes.data || []) {
    const idData = entry.id_data?.[0]
    if (!idData?.metrics) continue

    const billedMicros = (idData.metrics.billed_charge_local_micro || [])
      .reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0)
    const spend = billedMicros / 1_000_000

    const impressions = (idData.metrics.impressions || [])
      .reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0)
    const clicks = (idData.metrics.clicks || idData.metrics.url_clicks || [])
      .reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0)

    results.push({
      campaign_id: entry.id,
      campaign_name: campaignNameMap.get(entry.id) || `Campaign ${entry.id}`,
      spend,
      impressions,
      clicks,
      conversions: 0, // Conversions require separate conversion tracking setup
      date: since,
    })
  }

  return results
}

/**
 * Get campaign-level daily stats for a specific month.
 */
export async function getTwitterCampaignDailyStats(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<TwitterCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  // Get campaigns
  const campaignsRes = await twitterFetch<{
    data: Array<{ id: string; name: string }>
  }>(`${TWITTER_ADS_API_BASE}/accounts/${accountId}/campaigns`, accessToken, {
    count: 1000,
    with_deleted: 'false',
  })

  const campaigns = campaignsRes.data || []
  if (campaigns.length === 0) return []

  const campaignIds = campaigns.map(c => c.id)
  const campaignNameMap = new Map(campaigns.map(c => [c.id, c.name]))

  // Fetch daily stats
  const statsRes = await twitterFetch<{
    data: Array<{
      id: string
      id_data: Array<{
        segment: null
        metrics: {
          billed_charge_local_micro: string[]
          impressions: string[]
          clicks: string[]
          url_clicks: string[]
        }
      }>
    }>
    request: {
      params: {
        start_time: string
        end_time: string
      }
    }
  }>(`${TWITTER_ADS_API_BASE}/stats/accounts/${accountId}`, accessToken, {
    entity: 'CAMPAIGN',
    entity_ids: campaignIds.join(','),
    start_time: `${since}T00:00:00Z`,
    end_time: `${until}T23:59:59Z`,
    granularity: 'DAY',
    metric_groups: 'BILLING,ENGAGEMENT',
    placement: 'ALL_ON_TWITTER',
  })

  const results: TwitterCampaignInsight[] = []

  // With DAY granularity, each metric array has one entry per day
  const daysInMonth = new Date(year, month, 0).getDate()

  for (const entry of statsRes.data || []) {
    const idData = entry.id_data?.[0]
    if (!idData?.metrics) continue

    const billedArr = idData.metrics.billed_charge_local_micro || []
    const imprArr = idData.metrics.impressions || []
    const clickArr = idData.metrics.clicks || idData.metrics.url_clicks || []

    for (let d = 0; d < daysInMonth; d++) {
      const daySpend = (parseInt(billedArr[d] || '0', 10) || 0) / 1_000_000
      const dayImpr = parseInt(imprArr[d] || '0', 10) || 0
      const dayClicks = parseInt(clickArr[d] || '0', 10) || 0

      if (daySpend === 0 && dayImpr === 0) continue

      const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`

      results.push({
        campaign_id: entry.id,
        campaign_name: campaignNameMap.get(entry.id) || `Campaign ${entry.id}`,
        spend: daySpend,
        impressions: dayImpr,
        clicks: dayClicks,
        conversions: 0,
        date: dayStr,
      })
    }
  }

  return results
}

// ============================================
// Helpers
// ============================================

/**
 * Twitter Ads API fetch wrapper with rate-limit handling.
 * Rate limit: 250 requests per 15 minutes.
 */
async function twitterFetch<T>(
  url: string,
  accessToken: string,
  query?: Record<string, any>,
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ofetch<T>(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        query,
      })
    } catch (err: any) {
      const status = err?.status || err?.statusCode
      // Rate limited (429) or server error (5xx) — retry with backoff
      if ((status === 429 || (status >= 500 && status < 600)) && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('Twitter Ads API: max retries exceeded')
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

/**
 * Snapchat Marketing API Client
 * Lightweight client using ofetch (matches tiktokClient.ts pattern)
 * API v1 — https://marketingapi.snapchat.com/docs/
 */

import { ofetch } from 'ofetch'

export const SNAPCHAT_API_BASE = 'https://adsapi.snapchat.com/v1'

// ============================================
// Types
// ============================================

export interface SnapchatOrganization {
  id: string
  name: string
  status: string
}

export interface SnapchatAdAccount {
  id: string
  name: string
  currency: string
  status: string
  organization_id: string
  type: string
}

export interface SnapchatCampaignInsight {
  campaign_id: string
  campaign_name: string
  spend: string        // in standard currency (already converted from microcurrency)
  impressions: string
  clicks: string       // mapped from "swipes"
  conversions: string
  date: string         // YYYY-MM-DD when daily
}

export interface SnapchatTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number   // 1800 seconds (30 minutes)
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the Snapchat OAuth authorization URL.
 * Snapchat uses standard OAuth 2.0 with response_type=code.
 */
export function getSnapchatAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snapchat-marketing-api',
    state,
  })
  return `https://accounts.snapchat.com/login/oauth2/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for access + refresh tokens.
 * Snapchat uses form-urlencoded POST with Basic auth.
 */
export async function exchangeSnapchatToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<SnapchatTokenResponse> {
  const res = await ofetch<{
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
  }>('https://accounts.snapchat.com/login/oauth2/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })

  return {
    access_token: res.access_token,
    refresh_token: res.refresh_token,
    token_type: res.token_type || 'Bearer',
    expires_in: res.expires_in || 1800,
  }
}

/**
 * Refresh an expired access token.
 * Snapchat access tokens last only 30 minutes — must refresh aggressively.
 */
export async function refreshSnapchatToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await ofetch<{
    access_token: string
    refresh_token: string
    expires_in: number
  }>('https://accounts.snapchat.com/login/oauth2/access_token', {
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
    refresh_token: res.refresh_token || refreshToken,
    expires_in: res.expires_in || 1800,
  }
}

// ============================================
// Organization & Account Endpoints
// ============================================

/**
 * Get organizations the authenticated user has access to.
 */
export async function getSnapchatOrganizations(
  accessToken: string
): Promise<SnapchatOrganization[]> {
  const res = await snapchatFetch<{
    request_status: string
    request_id: string
    organizations: Array<{
      organization: {
        id: string
        name: string
        status: string
      }
    }>
  }>(`${SNAPCHAT_API_BASE}/me/organizations`, accessToken)

  return (res.organizations || []).map(o => ({
    id: o.organization.id,
    name: o.organization.name,
    status: o.organization.status,
  }))
}

/**
 * Get ad accounts for a given organization.
 */
export async function getSnapchatAdAccounts(
  orgId: string,
  accessToken: string
): Promise<SnapchatAdAccount[]> {
  const res = await snapchatFetch<{
    request_status: string
    adaccounts: Array<{
      adaccount: {
        id: string
        name: string
        currency: string
        status: string
        organization_id: string
        type: string
      }
    }>
  }>(`${SNAPCHAT_API_BASE}/organizations/${orgId}/adaccounts`, accessToken)

  return (res.adaccounts || []).map(a => ({
    id: a.adaccount.id,
    name: a.adaccount.name,
    currency: a.adaccount.currency,
    status: a.adaccount.status,
    organization_id: a.adaccount.organization_id,
    type: a.adaccount.type || 'PARTNER',
  }))
}

// ============================================
// Insights Endpoints
// ============================================

/**
 * Get campaign-level insights for a specific month (aggregated).
 * Snapchat stats API: GET /adaccounts/{id}/stats
 * Spend is returned in MICROCURRENCY — divide by 1,000,000.
 * "swipes" maps to our "clicks" concept.
 */
export async function getSnapchatCampaignStats(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<SnapchatCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  // First, get all campaigns for this ad account
  const campaignsRes = await snapchatFetch<{
    request_status: string
    campaigns: Array<{
      campaign: {
        id: string
        name: string
        status: string
      }
    }>
  }>(`${SNAPCHAT_API_BASE}/adaccounts/${accountId}/campaigns`, accessToken)

  const campaigns = (campaignsRes.campaigns || []).map(c => c.campaign)
  if (campaigns.length === 0) return []

  // Fetch stats for the ad account with campaign breakdown
  const statsRes = await snapchatFetch<{
    request_status: string
    total_stats: Array<{
      total_stat: {
        id: string
        type: string
        granularity: string
        stats: {
          impressions: number
          swipes: number
          spend: number // microcurrency
          conversion_purchases: number
        }
      }
    }>
  }>(`${SNAPCHAT_API_BASE}/campaigns/${campaigns[0]?.id || accountId}/stats`, accessToken, {
    granularity: 'TOTAL',
    start_time: `${since}T00:00:00.000-00:00`,
    end_time: `${until}T23:59:59.000-00:00`,
  })

  // Fetch stats per campaign individually
  const results: SnapchatCampaignInsight[] = []

  for (const campaign of campaigns) {
    try {
      const campStats = await snapchatFetch<{
        request_status: string
        total_stats: Array<{
          total_stat: {
            id: string
            stats: {
              impressions?: number
              swipes?: number
              spend?: number
              conversion_purchases?: number
            }
          }
        }>
      }>(`${SNAPCHAT_API_BASE}/campaigns/${campaign.id}/stats`, accessToken, {
        granularity: 'TOTAL',
        start_time: `${since}T00:00:00.000-00:00`,
        end_time: `${until}T23:59:59.000-00:00`,
      })

      const stat = campStats.total_stats?.[0]?.total_stat?.stats
      if (!stat) continue

      results.push({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        spend: String((stat.spend || 0) / 1_000_000),
        impressions: String(stat.impressions || 0),
        clicks: String(stat.swipes || 0),
        conversions: String(stat.conversion_purchases || 0),
        date: since,
      })
    } catch (err: any) {
      console.warn(`[Snapchat] Failed to fetch stats for campaign ${campaign.name}:`, err.message)
    }
  }

  return results
}

/**
 * Get campaign-level daily insights for a specific month.
 * Same as getSnapchatCampaignStats() but with DAY granularity.
 */
export async function getSnapchatCampaignDailyStats(
  accountId: string,
  accessToken: string,
  month: number,
  year: number
): Promise<SnapchatCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  // Get all campaigns for this ad account
  const campaignsRes = await snapchatFetch<{
    request_status: string
    campaigns: Array<{
      campaign: {
        id: string
        name: string
      }
    }>
  }>(`${SNAPCHAT_API_BASE}/adaccounts/${accountId}/campaigns`, accessToken)

  const campaigns = (campaignsRes.campaigns || []).map(c => c.campaign)
  if (campaigns.length === 0) return []

  const results: SnapchatCampaignInsight[] = []

  for (const campaign of campaigns) {
    try {
      const campStats = await snapchatFetch<{
        request_status: string
        timeseries_stats: Array<{
          timeseries_stat: {
            id: string
            timeseries: Array<{
              start_time: string
              stats: {
                impressions?: number
                swipes?: number
                spend?: number
                conversion_purchases?: number
              }
            }>
          }
        }>
      }>(`${SNAPCHAT_API_BASE}/campaigns/${campaign.id}/stats`, accessToken, {
        granularity: 'DAY',
        start_time: `${since}T00:00:00.000-00:00`,
        end_time: `${until}T23:59:59.000-00:00`,
      })

      const timeseries = campStats.timeseries_stats?.[0]?.timeseries_stat?.timeseries || []
      for (const point of timeseries) {
        const stat = point.stats
        if (!stat) continue

        // Extract date from ISO string "2024-01-15T00:00:00.000-00:00"
        const date = (point.start_time || '').split('T')[0] || since

        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          spend: String((stat.spend || 0) / 1_000_000),
          impressions: String(stat.impressions || 0),
          clicks: String(stat.swipes || 0),
          conversions: String(stat.conversion_purchases || 0),
          date,
        })
      }
    } catch (err: any) {
      console.warn(`[Snapchat] Failed to fetch daily stats for campaign ${campaign.name}:`, err.message)
    }
  }

  return results
}

// ============================================
// Helpers
// ============================================

/**
 * Snapchat API fetch wrapper with rate-limit handling.
 * Uses Bearer token authentication.
 */
async function snapchatFetch<T>(
  url: string,
  token: string,
  query?: Record<string, any>,
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ofetch<T>(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
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
  throw new Error('Snapchat API: max retries exceeded')
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

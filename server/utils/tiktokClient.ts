/**
 * TikTok Marketing API Client
 * Lightweight client using ofetch (matches metaClient.ts pattern)
 * API v1.3 — https://business-api.tiktok.com/marketing_api/docs
 */

import { ofetch } from 'ofetch'

export const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3'

// ============================================
// Types
// ============================================

export interface TikTokAdvertiser {
  advertiser_id: string
  advertiser_name: string
  currency: string
  status: string
}

export interface TikTokCampaignInsight {
  campaign_id: string
  campaign_name: string
  spend: string
  impressions: string
  clicks: string
  conversions: string
  date: string // YYYY-MM-DD when daily
}

export interface TikTokTokenResponse {
  access_token: string
  advertiser_ids: string[]
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the TikTok OAuth authorization URL
 */
export function getTikTokAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    app_id: appId,
    state,
    redirect_uri: redirectUri,
  })
  return `https://business-api.tiktok.com/portal/auth?${params.toString()}`
}

/**
 * Exchange authorization code for an access token.
 * TikTok uses `auth_code` (not `code`) and tokens are long-lived.
 */
export async function exchangeTikTokCode(
  authCode: string,
  appId: string,
  appSecret: string
): Promise<TikTokTokenResponse> {
  const res = await ofetch<{
    code: number
    message: string
    data: {
      access_token: string
      advertiser_ids: string[]
    }
  }>(`${TIKTOK_API_BASE}/oauth2/access_token/`, {
    method: 'POST',
    body: {
      app_id: appId,
      secret: appSecret,
      auth_code: authCode,
    },
  })

  if (res.code !== 0) {
    throw new Error(`TikTok token exchange failed: ${res.message}`)
  }

  return {
    access_token: res.data.access_token,
    advertiser_ids: res.data.advertiser_ids || [],
  }
}

// ============================================
// Advertiser Account Endpoints
// ============================================

/**
 * Get advertiser accounts accessible by the token.
 * Uses the advertiser IDs from the token response.
 */
export async function getAdvertiserAccounts(
  token: string,
  appId: string,
  advertiserIds?: string[]
): Promise<TikTokAdvertiser[]> {
  if (!advertiserIds?.length) return []

  const res = await tiktokFetch<{
    code: number
    message: string
    data: {
      list: Array<{
        advertiser_id: number | string
        advertiser_name: string
        currency: string
        status: string
      }>
    }
  }>(`${TIKTOK_API_BASE}/advertiser/info/`, token, {
    advertiser_ids: advertiserIds.map(String),
    fields: ['advertiser_id', 'advertiser_name', 'currency', 'status'],
  }, 'GET')

  if (res.code !== 0) {
    throw new Error(`TikTok advertiser fetch failed: ${res.message}`)
  }

  return (res.data?.list || []).map(a => ({
    advertiser_id: String(a.advertiser_id),
    advertiser_name: a.advertiser_name,
    currency: a.currency,
    status: a.status,
  }))
}

// ============================================
// Insights Endpoints
// ============================================

/**
 * Get campaign-level insights for a specific month (aggregated).
 * TikTok Reporting API uses GET to /report/integrated/get/
 */
export async function getCampaignInsights(
  advertiserId: string,
  token: string,
  month: number,
  year: number
): Promise<TikTokCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  const res = await tiktokFetch<{
    code: number
    message: string
    data: {
      list: Array<{
        dimensions: { campaign_id: string }
        metrics: {
          campaign_name: string
          spend: string
          impressions: string
          clicks: string
          conversion: string
        }
      }>
    }
  }>(`${TIKTOK_API_BASE}/report/integrated/get/`, token, {
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_CAMPAIGN',
    dimensions: ['campaign_id'],
    metrics: ['campaign_name', 'spend', 'impressions', 'clicks', 'conversion'],
    start_date: since,
    end_date: until,
    page_size: 1000,
  }, 'GET')

  if (res.code !== 0) {
    throw new Error(`TikTok insights failed: ${res.message}`)
  }

  return (res.data?.list || []).map(item => ({
    campaign_id: item.dimensions.campaign_id,
    campaign_name: item.metrics.campaign_name,
    spend: item.metrics.spend || '0',
    impressions: item.metrics.impressions || '0',
    clicks: item.metrics.clicks || '0',
    conversions: item.metrics.conversion || '0',
    date: since,
  }))
}

/**
 * Get campaign-level daily insights for a specific month.
 * Same as getCampaignInsights() but with stat_time_day dimension for daily breakdown.
 */
export async function getCampaignDailyInsights(
  advertiserId: string,
  token: string,
  month: number,
  year: number
): Promise<TikTokCampaignInsight[]> {
  const { since, until } = getMonthRange(month, year)

  const res = await tiktokFetch<{
    code: number
    message: string
    data: {
      list: Array<{
        dimensions: { campaign_id: string; stat_time_day: string }
        metrics: {
          campaign_name: string
          spend: string
          impressions: string
          clicks: string
          conversion: string
        }
      }>
    }
  }>(`${TIKTOK_API_BASE}/report/integrated/get/`, token, {
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    data_level: 'AUCTION_CAMPAIGN',
    dimensions: ['campaign_id', 'stat_time_day'],
    metrics: ['campaign_name', 'spend', 'impressions', 'clicks', 'conversion'],
    start_date: since,
    end_date: until,
    page_size: 1000,
  }, 'GET')

  if (res.code !== 0) {
    throw new Error(`TikTok daily insights failed: ${res.message}`)
  }

  return (res.data?.list || []).map(item => ({
    campaign_id: item.dimensions.campaign_id,
    campaign_name: item.metrics.campaign_name,
    spend: item.metrics.spend || '0',
    impressions: item.metrics.impressions || '0',
    clicks: item.metrics.clicks || '0',
    conversions: item.metrics.conversion || '0',
    // TikTok returns stat_time_day as "YYYY-MM-DD HH:MM:SS" — extract date part
    date: (item.dimensions.stat_time_day || '').split(' ')[0] || since,
  }))
}

// ============================================
// Helpers
// ============================================

/**
 * TikTok API fetch wrapper with rate-limit handling.
 * TikTok uses `Access-Token` header (NOT Bearer).
 * Reporting endpoints use GET; token exchange uses POST.
 */
async function tiktokFetch<T>(
  url: string,
  token: string,
  body: Record<string, any>,
  method: 'POST' | 'GET' = 'POST',
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const options: any = {
        method,
        headers: {
          'Access-Token': token,
          'Content-Type': 'application/json',
        },
      }

      if (method === 'GET') {
        // For GET requests, serialize arrays as JSON strings in query params
        const query: Record<string, string> = {}
        for (const [key, val] of Object.entries(body)) {
          query[key] = Array.isArray(val) ? JSON.stringify(val) : String(val)
        }
        options.query = query
      } else {
        options.body = body
      }

      return await ofetch<T>(url, options)
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
  throw new Error('TikTok API: max retries exceeded')
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

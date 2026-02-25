/**
 * Google Ads API Client
 * Lightweight client using ofetch (matches metaClient.ts pattern)
 * API v19 — https://developers.google.com/google-ads/api/rest/reference/rest/v19
 */

import { ofetch } from 'ofetch'

const GOOGLE_ADS_BASE = 'https://googleads.googleapis.com/v23'
const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

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
  status: string
  channelType: string
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
export function getGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'https://www.googleapis.com/auth/adwords',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`
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
  return ofetch<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    body: {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    }
  })
}

// ============================================
// GAQL Query Helper
// ============================================

/**
 * Execute a Google Ads Query Language (GAQL) query via searchStream
 */
async function gaqlQuery(
  customerId: string,
  token: string,
  developerToken: string,
  query: string,
  loginCustomerId?: string,
  retries = 3
): Promise<any[]> {
  const cleanCustomerId = customerId.replace(/-/g, '')

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json'
  }
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId.replace(/-/g, '')
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ofetch<any[]>(
        `${GOOGLE_ADS_BASE}/customers/${cleanCustomerId}/googleAds:searchStream`,
        {
          method: 'POST',
          headers,
          body: { query }
        }
      )

      // searchStream returns an array of result batches
      const results: any[] = []
      if (Array.isArray(response)) {
        for (const batch of response) {
          if (batch.results) {
            results.push(...batch.results)
          }
        }
      }
      return results
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
export async function getCampaigns(
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
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions
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
      status: r.campaign.status || 'UNKNOWN',
      channelType: r.campaign.advertisingChannelType || 'UNKNOWN'
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
      metrics.conversions
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
      conversions: parseFloat(r.metrics?.conversions || '0')
    }
  })
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

/**
 * Get first and last day of a month as YYYY-MM-DD strings
 */
function getMonthRange(month: number, year: number): { since: string; until: string } {
  const since = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const until = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { since, until }
}

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
  conversionsValue: number
  status: string
  channelType: string
  endDate?: string | null
  bidStrategy?: string | null
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
export async function gaqlQuery(
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
      // Log detailed GAQL error info for debugging 400s
      if (status === 400 && err.data) {
        const details = err.data?.error?.details?.[0]?.errors?.[0]
        if (details) {
          console.error(`[GoogleAds] GAQL 400 detail:`, JSON.stringify(details))
        } else {
          console.error(`[GoogleAds] GAQL 400 body:`, JSON.stringify(err.data).slice(0, 500))
        }
      }
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

/** Google uses 2037-12-30 as the "no end date" sentinel. Treat that (and any 2037+) as no end. */
export function normalizeGoogleEndDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  if (Number(d.slice(0, 4)) >= 2037) return null
  return d
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
      campaign.end_date,
      campaign.bidding_strategy_type,
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
      endDate: normalizeGoogleEndDate(r.campaign.endDate),
      bidStrategy: r.campaign.biddingStrategyType || null
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
 * v23: age/gender use dedicated view resources; device/geo use campaign resource.
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
  type: string
  thumbnailUrl: string | null
  title: string | null
  body: string | null
}

/**
 * Get ad assets for a campaign.
 * Step 1: Fetch ads with headlines/descriptions via ad_group_ad.
 * Step 2: Resolve image URLs via ad_group_ad_asset_view (asset.image_asset.full_size.url).
 */
export async function getCampaignAdAssets(
  customerId: string,
  token: string,
  developerToken: string,
  campaignId: string,
  loginCustomerId?: string
): Promise<GoogleAdAsset[]> {
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
      LIMIT 5
    `
    const adResults = await gaqlQuery(customerId, token, developerToken, adQuery, loginCustomerId)

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
        LIMIT 10
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

    return adResults.map((r: any) => {
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
        type: (ad.type || 'UNKNOWN').toLowerCase().replace(/_/g, ' '),
        thumbnailUrl: imageUrl,
        title: headlines[0]?.text || ad.name || null,
        body: descriptions[0]?.text || null,
      }
    })
  } catch (err: any) {
    console.warn(`[GoogleAds] Failed to fetch ad assets for campaign ${campaignId}:`, err.message)
    return []
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

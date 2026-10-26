/**
 * LinkedIn Marketing API Client
 * Lightweight client using ofetch (matches tiktokClient.ts pattern)
 * LinkedIn Marketing API — https://learn.microsoft.com/en-us/linkedin/marketing/
 */

import { ofetch } from 'ofetch'
import { createError } from 'h3'
import { LINKEDIN_API_VERSION } from '~~/server/utils/linkedinApiVersion'

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
    scope: 'r_ads r_ads_reporting',
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

/** Refresh expiring Ads credentials and persist rotation before making API calls. */
export async function ensureLinkedInAccessToken(
  connection: {
    id: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | Date | null
  },
  config: { linkedinClientId: string; linkedinClientSecret: string }
): Promise<string> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : null
  if (expiresAt === null || expiresAt > Date.now() + 5 * 60 * 1000) return connection.access_token

  if (!connection.refresh_token) {
    if (expiresAt > Date.now()) return connection.access_token
    throw createError({ statusCode: 401, statusMessage: 'LinkedIn token expired. Please reconnect.' })
  }
  if (!config.linkedinClientId || !config.linkedinClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'LinkedIn app credentials not configured' })
  }

  const refreshed = await refreshLinkedInToken(connection.refresh_token, config.linkedinClientId, config.linkedinClientSecret)
  const { queryOne } = await import('~~/server/utils/db')
  // Only persist over the grant we read: a reconnect that landed mid-refresh wins.
  const updated = await queryOne<{ id: string }>(
    `UPDATE social_connections SET access_token = $1, refresh_token = COALESCE($2, refresh_token), token_expires_at = $3, updated_at = NOW() WHERE id = $4 AND access_token = $5 RETURNING id`,
    [refreshed.access_token, refreshed.refresh_token || null, new Date(Date.now() + refreshed.expires_in * 1000), connection.id, connection.access_token]
  )
  if (updated) return refreshed.access_token
  const current = await queryOne<{ access_token: string }>(
    `SELECT access_token FROM social_connections WHERE id = $1`,
    [connection.id]
  )
  return current?.access_token || refreshed.access_token
}

// ============================================
// Ad Account Endpoints
// ============================================

/**
 * Get ad accounts accessible by the token.
 * Uses the versioned REST API and Rest.li 2.0 cursor-based search.
 */
export async function getLinkedInAdAccounts(accessToken: string): Promise<LinkedInAdAccount[]> {
  const accounts = await linkedinSearch<{
    id: number | string
    name: string
    currency: string
    status: string
  }>(`${LINKEDIN_API_BASE}/adAccounts`, accessToken, '(status:(values:List(ACTIVE,DRAFT)))')

  return accounts.map(a => ({
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
    dateRange: `(start:(year:${startYear},month:${startMonth},day:${startDay}),end:(year:${endYear},month:${endMonth},day:${endDay}))`,
    accounts: `List(${encodeRestliValue(`urn:li:sponsoredAccount:${accountId}`)})`,
    fields: 'costInLocalCurrency,impressions,clicks,externalWebsiteConversions,pivotValues,dateRange',
  })

  // Fetch campaign names in bulk
  const campaignIds = (res.elements || []).map(e => extractCampaignId(e.pivotValues))
  const campaignNames = await fetchCampaignNames(accountId, accessToken, campaignIds)

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
    dateRange: `(start:(year:${startYear},month:${startMonth},day:${startDay}),end:(year:${endYear},month:${endMonth},day:${endDay}))`,
    accounts: `List(${encodeRestliValue(`urn:li:sponsoredAccount:${accountId}`)})`,
    fields: 'costInLocalCurrency,impressions,clicks,externalWebsiteConversions,pivotValues,dateRange',
  })

  // Fetch campaign names in bulk
  const campaignIds = [...new Set((res.elements || []).map(e => extractCampaignId(e.pivotValues)))]
  const campaignNames = await fetchCampaignNames(accountId, accessToken, campaignIds)

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
 * Query values contain Rest.li syntax; encode data values before passing them.
 */
async function linkedinFetch<T>(
  url: string,
  token: string,
  query: Record<string, string | number>,
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Preserve List/record delimiters and already-encoded URNs. Passing query
      // to ofetch (or URLSearchParams) would serialize these a second time.
      const queryString = Object.entries(query).map(([key, value]) => `${key}=${value}`).join('&')
      return await ofetch<T>(`${url}?${queryString}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': LINKEDIN_API_VERSION,
        },
        retry: 0, // This wrapper owns rate-limit/server-error retries.
      })
    } catch (err: any) {
      const status = err?.status || err?.statusCode
      if ((status === 429 || (status >= 500 && status <= 504)) && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('LinkedIn API: max retries exceeded')
}

/** Encode data only, including characters reserved by Rest.li's grammar. */
function encodeRestliValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

// Guards against a cursor that never terminates (repeated or endless tokens).
const LINKEDIN_SEARCH_MAX_PAGES = 50

async function linkedinSearch<T>(url: string, token: string, search: string): Promise<T[]> {
  const elements: T[] = []
  const seenTokens = new Set<string>()
  let pageToken: string | undefined
  for (let page = 0; page < LINKEDIN_SEARCH_MAX_PAGES; page++) {
    const res = await linkedinFetch<{ elements?: T[]; metadata?: { nextPageToken?: string } }>(url, token, {
      q: 'search', search, pageSize: 100,
      ...(pageToken ? { pageToken: encodeRestliValue(pageToken) } : {}),
    })
    const pageElements = res.elements || []
    elements.push(...pageElements)
    pageToken = res.metadata?.nextPageToken
    if (!pageToken || !pageElements.length || seenTokens.has(pageToken)) break
    seenTokens.add(pageToken)
  }
  return elements
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
  accountId: string,
  accessToken: string,
  campaignIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (!campaignIds.length) return names

  // Search IDs are sponsoredCampaign URNs. Bound each query's URL length and
  // use the account-scoped campaign endpoint required by current versions.
  try {
    const ids = [...new Set(campaignIds.filter(Boolean))]
    for (let offset = 0; offset < ids.length; offset += 50) {
      const urns = ids.slice(offset, offset + 50).map(id => encodeRestliValue(`urn:li:sponsoredCampaign:${id}`))
      const campaigns = await linkedinSearch<{ id: number | string; name: string }>(
        `${LINKEDIN_API_BASE}/adAccounts/${encodeRestliValue(accountId)}/adCampaigns`,
        accessToken,
        `(id:(values:List(${urns.join(',')})))`
      )
      for (const c of campaigns) names.set(String(c.id), c.name)
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

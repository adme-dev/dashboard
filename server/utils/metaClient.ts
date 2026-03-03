/**
 * Meta (Facebook/Instagram) Marketing API Client
 * Lightweight client using ofetch (matches mondayClient.ts pattern)
 * API v21.0 — https://developers.facebook.com/docs/marketing-apis
 */

import { ofetch } from 'ofetch'

const META_GRAPH_BASE = 'https://graph.facebook.com/v22.0'

// ============================================
// Types
// ============================================

export interface MetaAdAccount {
  account_id: string
  id: string // act_XXXXXXX format
  name: string
  currency: string
  account_status: number
  business_name?: string
}

export interface MetaInsight {
  campaign_id?: string
  campaign_name?: string
  spend: string // decimal string e.g. "1234.56"
  impressions: string
  clicks: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
  date_start: string
  date_stop: string
}

export interface MetaTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

// ============================================
// OAuth Helpers
// ============================================

/**
 * Build the Meta OAuth authorization URL
 */
export function getMetaAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: 'ads_read',
    response_type: 'code'
  })
  return `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`
}

/**
 * Exchange authorization code for a short-lived token
 */
export async function exchangeMetaCode(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<MetaTokenResponse> {
  return ofetch<MetaTokenResponse>(`${META_GRAPH_BASE}/oauth/access_token`, {
    method: 'GET',
    query: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code
    }
  })
}

/**
 * Exchange short-lived token for a long-lived token (~60 days)
 */
export async function exchangeForLongLivedToken(
  shortToken: string,
  appId: string,
  appSecret: string
): Promise<MetaTokenResponse> {
  return ofetch<MetaTokenResponse>(`${META_GRAPH_BASE}/oauth/access_token`, {
    method: 'GET',
    query: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken
    }
  })
}

// ============================================
// Ad Account Endpoints
// ============================================

/**
 * Get all ad accounts accessible by the token
 */
export async function getAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const accounts: MetaAdAccount[] = []
  let url: string | null = `${META_GRAPH_BASE}/me/adaccounts`
  const query: Record<string, string> = {
    fields: 'account_id,name,currency,account_status,business_name',
    access_token: token,
    limit: '100'
  }

  // Paginate through all accounts
  while (url) {
    const res: { data: MetaAdAccount[]; paging?: { next?: string } } = await ofetch(url, {
      method: 'GET',
      query: url.includes('?') ? undefined : query
    })
    accounts.push(...(res.data || []))
    url = res.paging?.next || null
  }

  return accounts
}

// ============================================
// Insights Endpoints
// ============================================

/**
 * Get account-level insights for a specific month
 */
export async function getAccountInsights(
  accountId: string,
  token: string,
  month: number,
  year: number
): Promise<MetaInsight[]> {
  const { since, until } = getMonthRange(month, year)

  const response = await metaFetch<{ data: MetaInsight[] }>(
    `${META_GRAPH_BASE}/${accountId}/insights`,
    token,
    {
      fields: 'spend,impressions,clicks,actions',
      time_range: JSON.stringify({ since, until }),
      level: 'account'
    }
  )

  return response.data || []
}

/**
 * Get campaign-level insights for a specific month
 */
export async function getCampaignInsights(
  accountId: string,
  token: string,
  month: number,
  year: number
): Promise<MetaInsight[]> {
  const { since, until } = getMonthRange(month, year)
  const insights: MetaInsight[] = []
  let url: string | null = `${META_GRAPH_BASE}/${accountId}/insights`
  const query: Record<string, string> = {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',
    time_range: JSON.stringify({ since, until }),
    level: 'campaign',
    access_token: token,
    limit: '500'
  }

  while (url) {
    const res: { data: MetaInsight[]; paging?: { next?: string } } = await ofetch(url, {
      method: 'GET',
      query: url.includes('?') ? undefined : query
    })
    insights.push(...(res.data || []))
    url = res.paging?.next || null
  }

  return insights
}

// ============================================
// Helpers
// ============================================

/**
 * Meta API fetch wrapper with rate-limit awareness
 */
async function metaFetch<T>(url: string, token: string, params: Record<string, string>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await ofetch<T>(url, {
        method: 'GET',
        query: { ...params, access_token: token }
      })
      return response
    } catch (err: any) {
      const status = err?.status || err?.statusCode
      // Rate limited or transient error
      if ((status === 429 || status === 500) && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('Meta API: max retries exceeded')
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

/**
 * Get campaign-level daily insights for a specific month
 * Same as getCampaignInsights() but with time_increment=1 for daily breakdown
 */
export async function getCampaignDailyInsights(
  accountId: string,
  token: string,
  month: number,
  year: number
): Promise<MetaInsight[]> {
  const { since, until } = getMonthRange(month, year)
  const insights: MetaInsight[] = []
  let url: string | null = `${META_GRAPH_BASE}/${accountId}/insights`
  const query: Record<string, string> = {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    level: 'campaign',
    access_token: token,
    limit: '500'
  }

  while (url) {
    const res: { data: MetaInsight[]; paging?: { next?: string } } = await ofetch(url, {
      method: 'GET',
      query: url.includes('?') ? undefined : query
    })
    insights.push(...(res.data || []))
    url = res.paging?.next || null
  }

  return insights
}

/**
 * Extract conversion count from Meta's actions array
 */
export function extractConversions(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0
  const conversionTypes = ['offsite_conversion', 'onsite_conversion', 'lead', 'purchase']
  return actions
    .filter(a => conversionTypes.some(t => a.action_type.includes(t)))
    .reduce((sum, a) => sum + parseInt(a.value, 10), 0)
}

/**
 * Extract revenue from Meta's action_values array.
 * Looks for 'omni_purchase' or 'purchase' action values.
 */
export function extractRevenue(actionValues?: Array<{ action_type: string; value: string }>): number {
  if (!actionValues) return 0
  const revenueTypes = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
  return actionValues
    .filter(a => revenueTypes.some(t => a.action_type.includes(t)))
    .reduce((sum, a) => sum + parseFloat(a.value || '0'), 0)
}

// ============================================
// Breakdown Insights (Age, Gender, Device, Geo)
// ============================================

export interface MetaBreakdownRow {
  campaignId: string
  dimensionValue: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  revenue: number
}

/**
 * Get breakdown insights for campaigns by a specific dimension.
 * @param breakdown - 'age' | 'gender' | 'country' | 'impression_device'
 */
export async function getBreakdownInsights(
  accountId: string,
  token: string,
  month: number,
  year: number,
  breakdown: 'age' | 'gender' | 'country' | 'impression_device'
): Promise<MetaBreakdownRow[]> {
  const { since, until } = getMonthRange(month, year)
  const rows: MetaBreakdownRow[] = []
  let url: string | null = `${META_GRAPH_BASE}/${accountId}/insights`
  const query: Record<string, string> = {
    fields: 'campaign_id,spend,impressions,clicks,actions,action_values',
    time_range: JSON.stringify({ since, until }),
    level: 'campaign',
    breakdowns: breakdown,
    access_token: token,
    limit: '500'
  }

  while (url) {
    const res: { data: any[]; paging?: { next?: string } } = await ofetch(url, {
      method: 'GET',
      query: url.includes('?') ? undefined : query
    })
    for (const item of res.data || []) {
      rows.push({
        campaignId: item.campaign_id || '',
        dimensionValue: item[breakdown] || 'unknown',
        spend: parseFloat(item.spend || '0'),
        impressions: parseInt(item.impressions || '0', 10),
        clicks: parseInt(item.clicks || '0', 10),
        conversions: extractConversions(item.actions),
        revenue: extractRevenue(item.action_values),
      })
    }
    url = res.paging?.next || null
  }

  return rows
}

// ============================================
// Campaign Creatives
// ============================================

export interface MetaCreative {
  creativeId: string
  type: string
  thumbnailUrl: string | null
  title: string | null
  body: string | null
}

/**
 * Get ad creatives for a campaign (top 5).
 */
export async function getCampaignCreatives(
  campaignId: string,
  token: string
): Promise<MetaCreative[]> {
  try {
    const res = await ofetch<{
      data: Array<{
        id: string
        creative?: {
          thumbnail_url?: string
          image_url?: string
          title?: string
          body?: string
          object_type?: string
        }
      }>
    }>(`${META_GRAPH_BASE}/${campaignId}/ads`, {
      method: 'GET',
      query: {
        fields: 'id,creative{thumbnail_url,image_url,title,body,object_type}',
        limit: '5',
        access_token: token
      }
    })

    return (res.data || []).map(ad => ({
      creativeId: ad.id,
      type: ad.creative?.object_type || 'image',
      thumbnailUrl: ad.creative?.thumbnail_url || ad.creative?.image_url || null,
      title: ad.creative?.title || null,
      body: ad.creative?.body || null,
    }))
  } catch (err: any) {
    console.warn(`[MetaClient] Failed to fetch creatives for campaign ${campaignId}:`, err.message)
    return []
  }
}

// ============================================
// Billing / Spend Totals
// ============================================

export interface MetaAccountSpendSummary {
  accountId: string
  spend: number
  currency: string
}

/**
 * Get total spend for an ad account in a given month.
 * Uses the insights endpoint (reliable, same source as campaign-level data).
 * Returns the total amount Meta charged for the period.
 */
export async function getAccountMonthlySpend(
  accountId: string,
  token: string,
  month: number,
  year: number
): Promise<MetaAccountSpendSummary> {
  const { since, until } = getMonthRange(month, year)

  try {
    const res = await ofetch<{ data: Array<{ spend: string; date_start: string; date_stop: string }> }>(
      `${META_GRAPH_BASE}/${accountId}/insights`,
      {
        method: 'GET',
        query: {
          fields: 'spend',
          time_range: JSON.stringify({ since, until }),
          access_token: token,
        },
      }
    )

    const spend = parseFloat(res.data?.[0]?.spend || '0')
    return { accountId, spend, currency: 'AUD' }
  } catch (err: any) {
    console.warn(`[MetaBilling] Failed to fetch spend for ${accountId}:`, err.message)
    return { accountId, spend: 0, currency: 'AUD' }
  }
}

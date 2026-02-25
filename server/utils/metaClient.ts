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
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
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
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
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

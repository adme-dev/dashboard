/**
 * Meta (Facebook/Instagram) Marketing API Client
 * Lightweight client using ofetch (matches mondayClient.ts pattern)
 * API v22.0 — https://developers.facebook.com/docs/marketing-apis
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

export interface MetaCampaign {
  id: string
  name: string
  status: string
  objective: string
  daily_budget?: string
  lifetime_budget?: string
}

export interface MetaAdSet {
  id: string
  name: string
  status: string
  optimization_goal: string
  daily_budget?: string
}

export interface CreateCreativeParams {
  name: string
  imageHash: string
  pageId: string
  primaryTexts: string[]
  headlines: string[]
  descriptions: string[]
  callToAction: string
  linkUrl: string
}

export interface CreateAdParams {
  name: string
  adsetId: string
  creativeId: string
  status: string
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
    scope: 'ads_management,ads_read,pages_show_list,pages_read_engagement,pages_manage_ads,pages_manage_metadata,leads_retrieval,business_management',
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
async function metaFetch<T>(
  url: string,
  token: string,
  params: Record<string, any>,
  retries = 3,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, any> | FormData
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const options: any = { method }
      if (method === 'GET') {
        options.query = { ...params, access_token: token }
      } else {
        // POST: if body is FormData, send directly; otherwise send as form-urlencoded via query
        if (body instanceof FormData) {
          body.set('access_token', token)
          options.body = body
        } else {
          options.body = new URLSearchParams({
            ...params,
            ...(body || {}),
            access_token: token
          } as Record<string, string>)
          options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      }
      const response = await ofetch<T>(url, options)
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
export function getMonthRange(month: number, year: number): { since: string; until: string } {
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
          effective_image_url?: string
          object_story_spec?: {
            link_data?: { picture?: string; image_url?: string }
            video_data?: { image_url?: string }
            photo_data?: { url?: string }
          }
          title?: string
          body?: string
          object_type?: string
        }
      }>
    }>(`${META_GRAPH_BASE}/${campaignId}/ads`, {
      method: 'GET',
      query: {
        fields: 'id,creative{thumbnail_url,image_url,effective_image_url,object_story_spec,title,body,object_type}',
        limit: '5',
        access_token: token
      }
    })

    return (res.data || []).map(ad => ({
      creativeId: ad.id,
      type: ad.creative?.object_type || 'image',
      thumbnailUrl: getBestCreativeImage(ad.creative),
      title: ad.creative?.title || null,
      body: ad.creative?.body || null,
    }))
  } catch (err: any) {
    console.warn(`[MetaClient] Failed to fetch creatives for campaign ${campaignId}:`, err.message)
    return []
  }
}

/**
 * Extract the highest resolution image from a Meta creative.
 * Priority order (highest res first):
 *   1. effective_image_url — the actual displayed image (most reliable, high-res)
 *   2. image_url — the originally uploaded image
 *   3. object_story_spec link_data.image_url — full-res link ad image
 *   4. video_data.image_url — video poster image
 *   5. photo_data.url — photo ad image
 *   6. thumbnail_url — last resort (~64x64, very small)
 * Note: link_data.picture is just the OG preview thumbnail — skip it.
 */
function getBestCreativeImage(creative: any): string | null {
  if (!creative) return null
  // Best: the effective image actually displayed in the ad
  if (creative.effective_image_url) return creative.effective_image_url
  // Original upload
  if (creative.image_url) return creative.image_url
  // Story spec images (full-res versions)
  const spec = creative.object_story_spec
  if (spec?.link_data?.image_url) return spec.link_data.image_url
  if (spec?.video_data?.image_url) return spec.video_data.image_url
  if (spec?.photo_data?.url) return spec.photo_data.url
  // Last resort: thumbnail (small but at least shows something)
  return creative.thumbnail_url || null
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

// ============================================
// Campaign & Ad Set Browsing
// ============================================

/**
 * Get campaigns for an ad account.
 * @param accountId - act_XXXX format
 */
export async function getCampaigns(
  accountId: string,
  token: string,
  statusFilter?: string
): Promise<MetaCampaign[]> {
  const params: Record<string, string> = {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget',
    limit: '100'
  }
  if (statusFilter) {
    params.filtering = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: [statusFilter] }])
  }
  const res = await metaFetch<{ data: MetaCampaign[] }>(
    `${META_GRAPH_BASE}/${accountId}/campaigns`,
    token,
    params
  )
  return res.data || []
}

/**
 * Get ad sets for a campaign.
 */
export async function getAdSets(
  campaignId: string,
  token: string,
  statusFilter?: string
): Promise<MetaAdSet[]> {
  const params: Record<string, string> = {
    fields: 'id,name,status,optimization_goal,daily_budget',
    limit: '100'
  }
  if (statusFilter) {
    params.filtering = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: [statusFilter] }])
  }
  const res = await metaFetch<{ data: MetaAdSet[] }>(
    `${META_GRAPH_BASE}/${campaignId}/adsets`,
    token,
    params
  )
  return res.data || []
}

/**
 * Get Facebook Pages accessible by the user token.
 * Required for ad creative creation (page_id in object_story_spec).
 */
export async function getPages(
  token: string
): Promise<Array<{ id: string; name: string }>> {
  const res = await metaFetch<{ data: Array<{ id: string; name: string }> }>(
    `${META_GRAPH_BASE}/me/accounts`,
    token,
    { fields: 'id,name', limit: '100' }
  )
  return res.data || []
}

// ============================================
// Ad Creation (Write Operations)
// ============================================

/**
 * Upload an ad image from a Buffer.
 * Returns the image hash used to reference it in ad creatives.
 */
export async function uploadAdImage(
  accountId: string,
  token: string,
  imageBuffer: Buffer
): Promise<{ hash: string; url: string }> {
  const formData = new FormData()
  const blob = new Blob([imageBuffer], { type: 'image/png' })
  formData.set('bytes', blob, 'banner.png')

  const res = await metaFetch<{ images: Record<string, { hash: string; url: string }> }>(
    `${META_GRAPH_BASE}/${accountId}/adimages`,
    token,
    {},
    3,
    'POST',
    formData
  )

  // Response: { images: { "banner.png": { hash: "...", url: "..." } } }
  const imageData = Object.values(res.images || {})[0]
  if (!imageData?.hash) {
    throw new Error('Meta API: Image upload did not return a hash')
  }
  return { hash: imageData.hash, url: imageData.url || '' }
}

/**
 * Upload an ad image from a public URL.
 * Meta fetches the image from the URL and returns the hash.
 */
export async function uploadAdImageByUrl(
  accountId: string,
  token: string,
  imageUrl: string
): Promise<{ hash: string; url: string }> {
  const res = await metaFetch<{ images: Record<string, { hash: string; url: string }> }>(
    `${META_GRAPH_BASE}/${accountId}/adimages`,
    token,
    {},
    3,
    'POST',
    { url: imageUrl }
  )

  const imageData = Object.values(res.images || {})[0]
  if (!imageData?.hash) {
    throw new Error('Meta API: Image upload by URL did not return a hash')
  }
  return { hash: imageData.hash, url: imageData.url || '' }
}

/**
 * Create an ad creative with text variations.
 * Uses asset_feed_spec for multiple text/headline/description variants.
 */
export async function createAdCreative(
  accountId: string,
  token: string,
  params: CreateCreativeParams
): Promise<{ id: string }> {
  // Build asset_feed_spec for text variations
  const assetFeedSpec: Record<string, any> = {
    bodies: params.primaryTexts.map(text => ({ text })),
    titles: params.headlines.map(text => ({ text })),
    descriptions: params.descriptions.map(text => ({ text })),
    ad_formats: ['SINGLE_IMAGE'],
    images: [{ hash: params.imageHash }],
    link_urls: [{ website_url: params.linkUrl }],
    call_to_action_types: [params.callToAction]
  }

  const objectStorySpec: Record<string, any> = {
    page_id: params.pageId,
    link_data: {
      image_hash: params.imageHash,
      link: params.linkUrl,
      call_to_action: { type: params.callToAction }
    }
  }

  // For single text variant, use simple object_story_spec; for multiple, use asset_feed_spec
  const useAssetFeed = params.primaryTexts.length > 1 || params.headlines.length > 1 || params.descriptions.length > 1

  const postBody: Record<string, string> = {
    name: params.name
  }

  if (useAssetFeed) {
    postBody.asset_feed_spec = JSON.stringify(assetFeedSpec)
    postBody.object_story_spec = JSON.stringify({ page_id: params.pageId })
  } else {
    // Single variant: use object_story_spec directly
    objectStorySpec.link_data.message = params.primaryTexts[0] || ''
    objectStorySpec.link_data.name = params.headlines[0] || ''
    objectStorySpec.link_data.description = params.descriptions[0] || ''
    postBody.object_story_spec = JSON.stringify(objectStorySpec)
  }

  const res = await metaFetch<{ id: string }>(
    `${META_GRAPH_BASE}/${accountId}/adcreatives`,
    token,
    {},
    3,
    'POST',
    postBody
  )

  if (!res.id) {
    throw new Error('Meta API: Ad creative creation did not return an ID')
  }
  return { id: res.id }
}

/**
 * Create an ad within an ad set using a creative.
 */
export async function createAd(
  accountId: string,
  token: string,
  params: CreateAdParams
): Promise<{ id: string }> {
  const res = await metaFetch<{ id: string }>(
    `${META_GRAPH_BASE}/${accountId}/ads`,
    token,
    {},
    3,
    'POST',
    {
      name: params.name,
      adset_id: params.adsetId,
      creative: JSON.stringify({ creative_id: params.creativeId }),
      status: params.status
    }
  )

  if (!res.id) {
    throw new Error('Meta API: Ad creation did not return an ID')
  }
  return { id: res.id }
}

// ============================================
// Lead Generation Forms (for the form-picker dropdown in leads engine)
// ============================================
//
// Lead forms in Meta are owned by Pages, not Ad Accounts. The
// /act_{id}/leadgen_forms endpoint doesn't exist (Meta returns code 100,
// "nonexisting field"). The canonical path is:
//   1. /me/accounts → list pages the user manages (with per-page tokens)
//   2. /{page_id}/leadgen_forms → list forms on each page
// Requires `pages_show_list` (granted on existing OAuth tokens).

export interface MetaPageLeadForm {
  id: string
  name: string
  status: string
  page_id: string
  page_name: string
}

export interface MetaPageLeadFormsResult {
  forms: MetaPageLeadForm[]
  permission_denied_count: number
  pages_checked: number
}

interface PageEntry {
  id: string
  name: string
  access_token: string
}

const META_PAGE_LIMIT = 200 // safety cap on page traversal per token

/**
 * Lists all lead forms across all Pages a Meta user-access-token can manage.
 * Concurrency-bounded to avoid per-app rate limits on large agency accounts.
 *
 * Listing forms via /{page_id}/leadgen_forms requires the `leads_retrieval`
 * permission (which is part of Meta App Review). Without it the endpoint
 * returns code (#200). We track the denial count separately so the UI can
 * distinguish "no forms exist" from "no permission to read forms".
 */
/**
 * Verify Meta's webhook signature. Meta signs every webhook POST with an
 * HMAC-SHA256 of the raw body using the App Secret. The signature is sent
 * in the X-Hub-Signature-256 header as 'sha256=<hex>'. Reject any request
 * whose signature doesn't match — otherwise anyone could POST to our
 * endpoint and inject leads.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false
  const expected = signatureHeader.replace(/^sha256=/, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expected)) return false
  const { createHmac, timingSafeEqual } = await import('node:crypto')
  const computed = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  if (computed.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(expected))
  } catch { return false }
}

export interface MetaLeadgenResolved {
  id: string
  created_time?: string
  field_data: Array<{ name: string; values: string[] }>
  ad_id?: string
  ad_name?: string
  form_id?: string
  campaign_id?: string
  campaign_name?: string
}

/**
 * Fetch a single leadgen via Graph API. Requires the leads_retrieval
 * permission to have been granted on the access token (Meta App Review).
 *
 * Throws on permission denial so callers can branch on it. Returns null
 * for 404 (lead deleted in Meta UI before we fetched).
 */
export async function getMetaLeadgen(
  leadgenId: string,
  accessToken: string,
): Promise<MetaLeadgenResolved | null> {
  try {
    return await ofetch<MetaLeadgenResolved>(
      `${META_GRAPH_BASE}/${leadgenId}`,
      {
        query: {
          access_token: accessToken,
          fields: 'id,created_time,field_data,ad_id,ad_name,form_id,campaign_id,campaign_name',
        },
      },
    )
  } catch (e: any) {
    const status = e?.status ?? e?.response?.status
    if (status === 404) return null
    throw e
  }
}

export async function listMetaPageLeadForms(
  userAccessToken: string,
): Promise<MetaPageLeadFormsResult> {
  const pages: PageEntry[] = []

  // 1. Walk paginated /me/accounts to collect all manageable pages.
  let nextUrl: string | null =
    `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userAccessToken)}`
  let traversed = 0
  while (nextUrl && traversed < META_PAGE_LIMIT) {
    try {
      const r = await ofetch<{ data?: any[]; paging?: { next?: string } }>(nextUrl)
      for (const p of r.data ?? []) {
        if (p?.id && p?.access_token) {
          pages.push({ id: String(p.id), name: String(p.name ?? p.id), access_token: String(p.access_token) })
          traversed++
          if (traversed >= META_PAGE_LIMIT) break
        }
      }
      nextUrl = r.paging?.next ?? null
    } catch {
      break
    }
  }

  if (!pages.length) return { forms: [], permission_denied_count: 0, pages_checked: 0 }

  // 2. Fan out across pages with bounded concurrency.
  const out: MetaPageLeadForm[] = []
  const queue = [...pages]
  const CONCURRENCY = 6
  let permissionDenied = 0
  async function worker() {
    while (queue.length) {
      const page = queue.shift()
      if (!page) break
      try {
        const r = await ofetch<{ data?: any[] }>(
          `${META_GRAPH_BASE}/${page.id}/leadgen_forms`,
          {
            query: {
              access_token: page.access_token,
              fields: 'id,name,status',
              limit: 100,
            },
          },
        )
        for (const f of r.data ?? []) {
          out.push({
            id: String(f.id),
            name: String(f.name ?? `Form ${f.id}`),
            status: String(f.status ?? 'unknown'),
            page_id: page.id,
            page_name: page.name,
          })
        }
      } catch (e: any) {
        // Track permission denies so the UI can distinguish "no forms" from
        // "no permission". Meta returns OAuthException code 200 with message
        // "Requires pages_manage_ads permission" or similar when leads_retrieval
        // hasn't been granted via App Review.
        const msg = String(e?.data?.error?.message ?? e?.message ?? '')
        const code = e?.data?.error?.code ?? 0
        if (code === 200 || /permission/i.test(msg)) {
          permissionDenied++
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  return { forms: out, permission_denied_count: permissionDenied, pages_checked: pages.length }
}

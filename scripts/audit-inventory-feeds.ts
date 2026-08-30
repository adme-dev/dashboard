/**
 * Inventory feed attachment audit for running Meta AIA/catalog and Google PMax
 * inventory campaigns.
 *
 * Sources:
 * - Google Ads v25 `product_link.merchant_center.merchant_center_id`
 *   https://developers.google.com/google-ads/api/fields/v25/product_link
 * - Google Ads v25 `asset_group_listing_group_filter`
 *   https://developers.google.com/google-ads/api/fields/v25/asset_group_listing_group_filter
 * - Merchant feed/data-source details require Merchant/Content API scope
 *   https://developers.google.com/shopping-content/reference/rest/v2.1/datafeeds/list
 */
import pg from 'pg'
import { ofetch } from 'ofetch'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildCsv,
  hasInventoryIntent,
  hasGoogleContentScope,
  hasMetaCatalogScope,
  googleMerchantFeedRecommendedAction,
  metaCatalogRecommendedAction,
  summariseGoogleMerchantDatafeed,
  summariseGoogleListingFilter,
  summariseMetaProductSet,
} from '../server/utils/inventoryFeedAudit'
import { GOOGLE_ADS_BASE_URL } from '../server/utils/googleAds/version'

const GOOGLE_ADS_BASE = GOOGLE_ADS_BASE_URL
const GOOGLE_CONTENT_BASE = 'https://shoppingcontent.googleapis.com/content/v2.1'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'

type ConnectionRow = {
  id: string
  account_id: string
  account_name: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  scopes: unknown
  metadata: Record<string, any> | null
}

type GoogleCampaignRow = ConnectionRow & {
  platform: 'google_ads'
  period: string
  campaign_id: string
  campaign_name: string
  campaign_type: string | null
  campaign_status: string | null
  spend: string
  connection_id: string
}

type AuditError = {
  platform: 'google_ads' | 'meta'
  account?: string
  step: string
  error: string
  id?: string
}

function arg(name: string, fallback = ''): string {
  const prefix = `--${name}=`
  const found = process.argv.find(a => a.startsWith(prefix))
  if (found) return found.slice(prefix.length)
  const positional = process.argv[2]
  return name === 'period' && positional && !positional.startsWith('--') ? positional : fallback
}

function cleanCustomerId(id: string): string {
  return String(id || '').replace(/-/g, '')
}

function actId(row: Pick<ConnectionRow, 'account_id' | 'metadata'>): string {
  return row.metadata?.actId || `act_${row.account_id}`
}

function googleErrorSummary(err: any): string {
  const details = err?.data?.error?.details?.[0]?.errors
  if (Array.isArray(details) && details[0]) {
    const e = details[0]
    return `${e.message || 'GoogleAdsFailure'} ${JSON.stringify(e.errorCode || {})}`
  }
  return err?.data?.error?.message || err?.message || String(err)
}

function metaErrorSummary(err: any): string {
  const e = err?.data?.error
  return e ? `${e.message || 'Graph error'}${e.code ? ` (#${e.code})` : ''}` : err?.message || String(err)
}

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in?: number }> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing')
  }
  return ofetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    body: {
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    },
  })
}

async function ensureGoogleAccessToken(db: pg.Client, conn: ConnectionRow): Promise<string> {
  if (!conn.refresh_token) return conn.access_token
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : new Date(0)
  if (expiresAt.getTime() >= Date.now() + 5 * 60 * 1000) return conn.access_token

  const refreshed = await refreshGoogleToken(conn.refresh_token)
  const newExpiry = new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000)
  await db.query(
    'UPDATE social_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3',
    [refreshed.access_token, newExpiry, conn.id],
  )
  return refreshed.access_token
}

async function googleGaql(customerId: string, token: string, query: string, loginCustomerId?: string): Promise<any[]> {
  if (!process.env.GOOGLE_DEVELOPER_TOKEN) throw new Error('GOOGLE_DEVELOPER_TOKEN missing')
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = cleanCustomerId(loginCustomerId)

  const response = await ofetch<any[]>(
    `${GOOGLE_ADS_BASE}/customers/${cleanCustomerId(customerId)}/googleAds:searchStream`,
    { method: 'POST', headers, body: { query } },
  )
  return (Array.isArray(response) ? response : []).flatMap(batch => batch.results || [])
}

async function listAccessibleCustomers(token: string): Promise<string[]> {
  if (!process.env.GOOGLE_DEVELOPER_TOKEN) throw new Error('GOOGLE_DEVELOPER_TOKEN missing')
  const response = await ofetch<{ resourceNames?: string[] }>(
    `${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN,
      },
    },
  )
  return (response.resourceNames || []).map(r => r.replace('customers/', ''))
}

async function listMerchantDatafeeds(merchantCenterId: string, token: string): Promise<any[]> {
  const response = await ofetch<{ resources?: any[]; datafeeds?: any[] }>(
    `${GOOGLE_CONTENT_BASE}/${merchantCenterId}/datafeeds`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return response.resources || response.datafeeds || []
}

async function resolveGoogleLoginCustomerId(token: string, customerId: string, errors: AuditError[], accountName: string): Promise<string> {
  const configured = cleanCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '')
  if (configured) return configured
  try {
    const accessible = await listAccessibleCustomers(token)
    return accessible.find(id => cleanCustomerId(id) !== cleanCustomerId(customerId)) || accessible[0] || ''
  } catch (err: any) {
    errors.push({ platform: 'google_ads', account: accountName, step: 'listAccessibleCustomers', error: googleErrorSummary(err) })
    return ''
  }
}

async function graph(path: string, token: string, query: Record<string, string | number> = {}): Promise<any> {
  return ofetch(`${META_GRAPH_BASE}/${path.replace(/^\//, '')}`, {
    method: 'GET',
    query: { ...query, access_token: token },
  })
}

async function graphAll(path: string, token: string, query: Record<string, string | number> = {}): Promise<any[]> {
  const rows: any[] = []
  let url = `${META_GRAPH_BASE}/${path.replace(/^\//, '')}`
  let first = true
  while (url) {
    const res = await ofetch<any>(url, {
      method: 'GET',
      query: first ? { ...query, access_token: token } : undefined,
    })
    rows.push(...(res.data || []))
    url = res.paging?.next || ''
    first = false
  }
  return rows
}

async function getProductSet(productSetId: string, token: string, errors: AuditError[]): Promise<any> {
  const fieldSets = [
    'id,name,filter,product_catalog{id,name,vertical}',
    'id,name,product_catalog{id,name,vertical}',
    'id,name',
  ]
  for (const fields of fieldSets) {
    try {
      return await graph(productSetId, token, { fields })
    } catch (err: any) {
      errors.push({ platform: 'meta', id: productSetId, step: 'productSet', error: metaErrorSummary(err) })
    }
  }
  return { id: productSetId }
}

async function auditGoogle(db: pg.Client, period: string, errors: AuditError[]) {
  const result = await db.query<GoogleCampaignRow>(
    `SELECT
       ms.platform, ms.period, ms.campaign_id, ms.campaign_name, ms.campaign_type,
       ms.campaign_status, ms.actual_spend::text AS spend,
       sc.id, sc.id AS connection_id, sc.account_id, sc.account_name,
       sc.access_token, sc.refresh_token, sc.token_expires_at, sc.scopes, sc.metadata
     FROM media_spend ms
     JOIN social_connections sc ON sc.id = ms.connection_id
     WHERE ms.period = $1
       AND ms.platform = 'google_ads'
       AND sc.platform = 'google'
       AND sc.status = 'active'
       AND ms.campaign_status = 'ENABLED'
     ORDER BY sc.account_name, ms.campaign_name`,
    [period],
  )

  const candidates = result.rows.filter(row => hasInventoryIntent(row.campaign_name, row.campaign_type))
  const byConnection = new Map<string, GoogleCampaignRow[]>()
  for (const row of candidates) byConnection.set(row.connection_id, [...(byConnection.get(row.connection_id) || []), row])

  const rows: any[] = []
  const merchantDatafeedCache = new Map<string, any[]>()
  for (const campaigns of byConnection.values()) {
    const conn = campaigns[0]!
    console.error(`[google] ${conn.account_name}: ${campaigns.length} inventory campaign(s)`)
    const token = await ensureGoogleAccessToken(db, conn)
    const loginCustomerId = await resolveGoogleLoginCustomerId(token, conn.account_id, errors, conn.account_name)

    let merchantCenterIds: string[] = []
    try {
      const productLinks = await googleGaql(
        conn.account_id,
        token,
        `SELECT product_link.resource_name, product_link.type, product_link.merchant_center.merchant_center_id
         FROM product_link`,
        loginCustomerId,
      )
      merchantCenterIds = [...new Set(productLinks
        .filter(r => r.productLink?.type === 'MERCHANT_CENTER' || r.productLink?.merchantCenter?.merchantCenterId)
        .map(r => String(r.productLink?.merchantCenter?.merchantCenterId || '').trim())
        .filter(Boolean))]
    } catch (err: any) {
      errors.push({ platform: 'google_ads', account: conn.account_name, step: 'productLink', error: googleErrorSummary(err) })
    }

    const canListMerchantDatafeeds = hasGoogleContentScope(conn.scopes)
    const merchantDatafeedsById: Record<string, any[]> = {}
    if (merchantCenterIds.length && canListMerchantDatafeeds) {
      for (const merchantCenterId of merchantCenterIds) {
        const cacheKey = `${conn.id}:${merchantCenterId}`
        try {
          if (!merchantDatafeedCache.has(cacheKey)) {
            merchantDatafeedCache.set(cacheKey, await listMerchantDatafeeds(merchantCenterId, token))
          }
          merchantDatafeedsById[merchantCenterId] = (merchantDatafeedCache.get(cacheKey) || [])
            .map(summariseGoogleMerchantDatafeed)
        } catch (err: any) {
          errors.push({ platform: 'google_ads', account: conn.account_name, id: merchantCenterId, step: 'merchantDatafeeds', error: err?.data?.error?.message || err?.message || String(err) })
          merchantDatafeedsById[merchantCenterId] = []
        }
      }
    }

    const merchantDatafeeds = Object.entries(merchantDatafeedsById).flatMap(([merchantCenterId, datafeeds]) => (
      datafeeds.map(datafeed => ({ merchantCenterId, ...datafeed }))
    ))
    const merchantDatafeedSummary = merchantDatafeeds
      .map(feed => `${feed.merchantCenterId}:${feed.name || feed.fileName || feed.datafeedId}`)
      .filter(Boolean)
      .join(' | ')
    const merchantDatafeedErrors = errors.filter(error => (
      error.platform === 'google_ads'
      && error.account === conn.account_name
      && error.step === 'merchantDatafeeds'
    )).length
    const merchantFeedSourceStatus = !merchantCenterIds.length
      ? 'no_merchant_center_link_returned'
      : !canListMerchantDatafeeds
        ? 'merchant_center_link_resolved_content_scope_required'
        : merchantDatafeeds.length
          ? 'merchant_datafeeds_resolved'
          : merchantDatafeedErrors
            ? 'merchant_datafeeds_error'
            : 'merchant_center_link_resolved_no_datafeeds_returned'

    const ids = campaigns.map(c => cleanCustomerId(c.campaign_id)).filter(Boolean)
    const idList = ids.join(', ')
    let assetGroups: any[] = []
    let filters: any[] = []
    try {
      assetGroups = await googleGaql(
        conn.account_id,
        token,
        `SELECT campaign.id, asset_group.id, asset_group.name, asset_group.status
         FROM asset_group
         WHERE campaign.id IN (${idList})`,
        loginCustomerId,
      )
    } catch (err: any) {
      errors.push({ platform: 'google_ads', account: conn.account_name, step: 'assetGroups', error: googleErrorSummary(err) })
    }

    try {
      filters = await googleGaql(
        conn.account_id,
        token,
        `SELECT
           campaign.id,
           asset_group.id,
           asset_group.name,
           asset_group_listing_group_filter.id,
           asset_group_listing_group_filter.type,
           asset_group_listing_group_filter.listing_source,
           asset_group_listing_group_filter.parent_listing_group_filter,
           asset_group_listing_group_filter.case_value.product_brand.value,
           asset_group_listing_group_filter.case_value.product_category.category_id,
           asset_group_listing_group_filter.case_value.product_category.level,
           asset_group_listing_group_filter.case_value.product_channel.channel,
           asset_group_listing_group_filter.case_value.product_condition.condition,
           asset_group_listing_group_filter.case_value.product_custom_attribute.index,
           asset_group_listing_group_filter.case_value.product_custom_attribute.value,
           asset_group_listing_group_filter.case_value.product_item_id.value,
           asset_group_listing_group_filter.case_value.product_type.level,
           asset_group_listing_group_filter.case_value.product_type.value
         FROM asset_group_listing_group_filter
         WHERE campaign.id IN (${idList})`,
        loginCustomerId,
      )
    } catch (err: any) {
      errors.push({ platform: 'google_ads', account: conn.account_name, step: 'listingFilters', error: googleErrorSummary(err) })
    }

    const assetGroupsByCampaign = new Map<string, any[]>()
    for (const row of assetGroups) {
      const key = String(row.campaign?.id || '')
      assetGroupsByCampaign.set(key, [...(assetGroupsByCampaign.get(key) || []), row])
    }
    const filtersByCampaign = new Map<string, any[]>()
    for (const row of filters) {
      const key = String(row.campaign?.id || '')
      filtersByCampaign.set(key, [...(filtersByCampaign.get(key) || []), row])
    }

    for (const campaign of campaigns) {
      const campaignId = cleanCustomerId(campaign.campaign_id)
      const listingFilters = (filtersByCampaign.get(campaignId) || []).map(summariseGoogleListingFilter)
      const listingFilterSummary = listingFilters.map(f => f.dimension).filter(Boolean).join(' | ')
      rows.push({
        platform: 'google_ads',
        accountName: campaign.account_name,
        accountId: campaign.account_id,
        campaignId: campaign.campaign_id,
        campaignName: campaign.campaign_name,
        campaignType: campaign.campaign_type || '',
        campaignStatus: campaign.campaign_status || '',
        spend: campaign.spend,
        merchantCenterIds,
        merchantCenterSummary: merchantCenterIds.join(' | '),
        merchantDatafeeds,
        merchantDatafeedSummary,
        merchantFeedSourceStatus,
        recommendedAction: googleMerchantFeedRecommendedAction(merchantFeedSourceStatus),
        assetGroups: (assetGroupsByCampaign.get(campaignId) || []).map(row => ({
          id: String(row.assetGroup?.id || ''),
          name: row.assetGroup?.name || '',
          status: row.assetGroup?.status || '',
        })),
        assetGroupSummary: (assetGroupsByCampaign.get(campaignId) || [])
          .map(row => `${row.assetGroup?.name || row.assetGroup?.id || ''} [${row.assetGroup?.status || ''}]`)
          .filter(Boolean)
          .join(' | '),
        listingFilters,
        listingSourceSummary: [...new Set(listingFilters.map(f => f.listingSource).filter(Boolean))].join(' | '),
        listingFilterSummary: listingFilterSummary || 'all products/no partition dimension',
      })
    }
  }
  return rows
}

async function auditMeta(db: pg.Client, period: string, errors: AuditError[]) {
  const conns = await db.query<ConnectionRow>(
    `SELECT id, account_id, account_name, access_token, refresh_token, token_expires_at, scopes, metadata
     FROM social_connections
     WHERE platform = 'meta' AND status = 'active'
     ORDER BY account_name`,
  )

  const productSetCache = new Map<string, any>()
  const rows: any[] = []
  for (const conn of conns.rows) {
    console.error(`[meta] ${conn.account_name}`)
    let adsets: any[] = []
    try {
      adsets = await graphAll(`${actId(conn)}/adsets`, conn.access_token, {
        fields: 'id,name,status,effective_status,campaign_id,campaign{name,status,effective_status,objective},promoted_object',
        filtering: JSON.stringify([{ field: 'adset.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
        limit: 500,
      })
    } catch (err: any) {
      errors.push({ platform: 'meta', account: conn.account_name, step: 'adsets', error: metaErrorSummary(err) })
      continue
    }

    for (const adset of adsets) {
      const promoted = adset.promoted_object || {}
      const campaign = adset.campaign || {}
      if (!hasInventoryIntent(campaign.name, adset.name, campaign.objective, promoted.product_set_id)) continue

      const productSetId = promoted.product_set_id || promoted.productSetId || ''
      let productSet: any = null
      if (productSetId) {
        if (!productSetCache.has(productSetId)) productSetCache.set(productSetId, await getProductSet(productSetId, conn.access_token, errors))
        productSet = productSetCache.get(productSetId)
      }
      const catalog = productSet?.product_catalog || productSet?.productCatalog || {}
      const productSetSummary = summariseMetaProductSet({
        productSetId,
        productSetName: productSet?.name || '',
        productCatalogId: catalog.id || promoted.product_catalog_id || '',
        productCatalogName: catalog.name || '',
      })
      const missingCatalogScope = productSetSummary.resolutionStatus === 'product_set_only' && !hasMetaCatalogScope(conn.scopes)
      const catalogResolutionStatus = productSetSummary.resolutionStatus === 'product_set_only'
        ? missingCatalogScope
          ? 'product_set_resolved_catalog_permission_required'
          : 'product_set_resolved_catalog_app_capability_required'
        : productSetSummary.resolutionStatus

      rows.push({
        platform: 'meta',
        period,
        accountName: conn.account_name,
        accountId: conn.account_id,
        campaignId: adset.campaign_id || campaign.id || '',
        campaignName: campaign.name || '',
        campaignStatus: campaign.effective_status || campaign.status || '',
        campaignObjective: campaign.objective || '',
        adsetId: adset.id,
        adsetName: adset.name || '',
        adsetStatus: adset.effective_status || adset.status || '',
        productSetId: productSetSummary.productSetId,
        productSetName: productSetSummary.productSetName,
        productCatalogId: productSetSummary.productCatalogId,
        productCatalogName: productSetSummary.productCatalogName,
        catalogResolutionStatus,
        recommendedAction: metaCatalogRecommendedAction(catalogResolutionStatus),
      })
    }
  }
  return rows
}

async function main() {
  const period = arg('period', `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
  const outputDir = arg('output-dir', '/private/tmp')
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing')

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const errors: AuditError[] = []
  try {
    const googleRows = await auditGoogle(db, period, errors)
    const metaRows = await auditMeta(db, period, errors)

    const report = {
      period,
      generatedAt: new Date().toISOString(),
      summary: {
        googleRows: googleRows.length,
        googleAccounts: new Set(googleRows.map(r => r.accountId)).size,
        metaRows: metaRows.length,
        metaAccounts: new Set(metaRows.map(r => r.accountId)).size,
        errors: errors.length,
      },
      googleRows,
      metaRows,
      errors,
    }

    await mkdir(outputDir, { recursive: true })
    const base = `inventory-feed-campaign-audit-${period}`
    const jsonPath = join(outputDir, `${base}.json`)
    const googleCsvPath = join(outputDir, `${base}-google.csv`)
    const metaCsvPath = join(outputDir, `${base}-meta.csv`)
    await writeFile(jsonPath, JSON.stringify(report, null, 2))
    await writeFile(googleCsvPath, buildCsv(googleRows, [
      'platform',
      'accountName',
      'accountId',
      'campaignId',
      'campaignName',
      'campaignType',
      'campaignStatus',
      'spend',
      'merchantCenterSummary',
      'merchantDatafeedSummary',
      'merchantFeedSourceStatus',
      'recommendedAction',
      'assetGroupSummary',
      'listingSourceSummary',
      'listingFilterSummary',
    ]))
    await writeFile(metaCsvPath, buildCsv(metaRows, [
      'platform',
      'accountName',
      'accountId',
      'campaignId',
      'campaignName',
      'campaignStatus',
      'campaignObjective',
      'adsetId',
      'adsetName',
      'adsetStatus',
      'productSetId',
      'productSetName',
      'productCatalogId',
      'productCatalogName',
      'catalogResolutionStatus',
      'recommendedAction',
    ]))

    console.log(JSON.stringify({
      summary: report.summary,
      json: jsonPath,
      googleCsv: googleCsvPath,
      metaCsv: metaCsvPath,
      errorsPreview: errors.slice(0, 8),
    }, null, 2))
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error('[audit-inventory-feeds] ERROR:', error)
  process.exit(1)
})

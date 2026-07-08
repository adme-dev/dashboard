export interface GoogleListingFilterSummary {
  filterId: string
  filterType: string
  listingSource: string
  dimension: string
  parent: string
}

export interface GoogleMerchantDatafeedSummary {
  datafeedId: string
  name: string
  fileName: string
  contentType: string
  fetchSchedule: string
  targets: string
}

export interface MetaProductSetSummary {
  productSetId: string
  productSetName: string
  productCatalogId: string
  productCatalogName: string
  resolutionStatus: 'none' | 'product_set_only' | 'catalog_resolved'
}

export type GoogleMerchantFeedSourceStatus =
  | 'no_merchant_center_link_returned'
  | 'merchant_center_link_resolved_content_scope_required'
  | 'merchant_datafeeds_resolved'
  | 'merchant_datafeeds_error'
  | 'merchant_center_link_resolved_no_datafeeds_returned'

export type MetaCatalogResolutionStatus =
  | 'none'
  | 'product_set_resolved_catalog_permission_required'
  | 'product_set_resolved_catalog_app_capability_required'
  | 'catalog_resolved'

type RecordLike = Record<string, any>

export const GOOGLE_CONTENT_SCOPE = 'https://www.googleapis.com/auth/content'
export const META_CATALOG_SCOPE = 'catalog_management'

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function customIndex(value: unknown): string {
  return clean(value).replace(/^INDEX/i, '').toLowerCase()
}

function normaliseScopes(scopes: unknown): string[] {
  if (Array.isArray(scopes)) return scopes.map(clean).filter(Boolean)
  if (typeof scopes !== 'string') return []
  const trimmed = scopes.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean)
    } catch {
      return []
    }
  }
  return trimmed.split(/[\s,]+/).map(clean).filter(Boolean)
}

export function hasGoogleContentScope(scopes: unknown): boolean {
  return normaliseScopes(scopes).includes(GOOGLE_CONTENT_SCOPE)
}

export function hasMetaCatalogScope(scopes: unknown): boolean {
  return normaliseScopes(scopes).includes(META_CATALOG_SCOPE)
}

export function googleMerchantFeedRecommendedAction(status: GoogleMerchantFeedSourceStatus | string): string {
  switch (status) {
    case 'no_merchant_center_link_returned':
      return 'Link the Google Ads account to the correct Merchant Center account, then rerun the audit.'
    case 'merchant_center_link_resolved_content_scope_required':
      return 'Reconnect the Google Ads account in the platform to grant Merchant Center Content access, then rerun the audit.'
    case 'merchant_datafeeds_resolved':
      return 'Review the resolved Merchant Center datafeed summary for the feed attached to this account.'
    case 'merchant_datafeeds_error':
      return 'Inspect the merchantDatafeeds errors for this account and confirm Merchant Center access.'
    case 'merchant_center_link_resolved_no_datafeeds_returned':
      return 'Confirm this Merchant Center uses API-managed products or Merchant API data sources rather than legacy datafeeds.'
    default:
      return 'Review the audit status and source platform permissions.'
  }
}

export function metaCatalogRecommendedAction(status: MetaCatalogResolutionStatus | string): string {
  switch (status) {
    case 'product_set_resolved_catalog_permission_required':
      return 'Reconnect the Meta ad account in the platform to grant catalog_management, then rerun the audit.'
    case 'product_set_resolved_catalog_app_capability_required':
      return 'Confirm Meta app advanced access for catalog APIs and the ad account business permissions, then rerun the audit.'
    case 'catalog_resolved':
      return 'Review the resolved product catalog fields for the feed attached to this product set.'
    case 'none':
      return 'No product set was attached to this active ad set.'
    default:
      return 'Review the audit status and Meta permissions.'
  }
}

export function summariseGoogleListingFilter(row: RecordLike): GoogleListingFilterSummary {
  const filter = row.assetGroupListingGroupFilter || {}
  const caseValue = filter.caseValue || {}
  const parts: string[] = []

  const brand = clean(caseValue.productBrand?.value)
  if (brand) parts.push(`brand=${brand}`)

  const condition = clean(caseValue.productCondition?.condition)
  if (condition) parts.push(`condition=${condition}`)

  const customValue = clean(caseValue.productCustomAttribute?.value)
  if (customValue) {
    const index = customIndex(caseValue.productCustomAttribute?.index) || '?'
    parts.push(`custom_${index}=${customValue}`)
  }

  const itemId = clean(caseValue.productItemId?.value)
  if (itemId) parts.push(`item_id=${itemId}`)

  const typeValue = clean(caseValue.productType?.value)
  if (typeValue) {
    const level = clean(caseValue.productType?.level).replace(/^LEVEL/i, '').toLowerCase() || '?'
    parts.push(`type_${level}=${typeValue}`)
  }

  const categoryId = clean(caseValue.productCategory?.categoryId)
  if (categoryId) {
    const level = clean(caseValue.productCategory?.level).replace(/^LEVEL/i, '').toLowerCase() || '?'
    parts.push(`category_${level}=${categoryId}`)
  }

  const channel = clean(caseValue.productChannel?.channel)
  if (channel) parts.push(`channel=${channel}`)

  return {
    filterId: clean(filter.id),
    filterType: clean(filter.type),
    listingSource: clean(filter.listingSource),
    dimension: parts.join('; '),
    parent: clean(filter.parentListingGroupFilter),
  }
}

export function summariseMetaProductSet(input: {
  productSetId?: unknown
  productSetName?: unknown
  productCatalogId?: unknown
  productCatalogName?: unknown
}): MetaProductSetSummary {
  const productSetId = clean(input.productSetId)
  const productSetName = clean(input.productSetName)
  const productCatalogId = clean(input.productCatalogId)
  const productCatalogName = clean(input.productCatalogName)

  return {
    productSetId,
    productSetName,
    productCatalogId,
    productCatalogName,
    resolutionStatus: productCatalogId || productCatalogName
      ? 'catalog_resolved'
      : productSetId || productSetName
        ? 'product_set_only'
        : 'none',
  }
}

export function summariseGoogleMerchantDatafeed(input: RecordLike): GoogleMerchantDatafeedSummary {
  const fetchSchedule = input.fetchSchedule || {}
  const scheduleParts = [
    clean(fetchSchedule.fetchUrl),
    clean(fetchSchedule.hour) ? `hour=${clean(fetchSchedule.hour)}` : '',
    clean(fetchSchedule.timeZone),
  ].filter(Boolean)

  const targetRows = Array.isArray(input.targets) ? input.targets : []
  const targets = targetRows.map((target: RecordLike) => [
    clean(target.country),
    clean(target.language),
    clean(target.includedDestinations || target.destinations),
  ].filter(Boolean).join('/')).filter(Boolean)

  return {
    datafeedId: clean(input.id),
    name: clean(input.name),
    fileName: clean(input.fileName),
    contentType: clean(input.contentType),
    fetchSchedule: scheduleParts.join(' | '),
    targets: targets.join(' | '),
  }
}

export function hasInventoryIntent(...values: Array<unknown>): boolean {
  const text = values.map(clean).join(' ')
  return /(pmax[\s_-]*inventory|inventory|catalogue|catalog|vehicle|stock|new[\s_-]*(?:&|and)?[\s_-]*demo|used[\s_-]*cars?)/i.test(text)
}

function csvEscape(value: unknown): string {
  const normalised = Array.isArray(value)
    ? value.join(' | ')
    : typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : value == null
        ? ''
        : String(value)
  return /[",\n]/.test(normalised) ? `"${normalised.replace(/"/g, '""')}"` : normalised
}

export function buildCsv<T extends Record<string, unknown>>(rows: T[], headers: Array<keyof T | string>): string {
  return [
    headers.map(h => csvEscape(String(h))).join(','),
    ...rows.map(row => headers.map(header => csvEscape(row[header as keyof T])).join(',')),
  ].join('\n')
}

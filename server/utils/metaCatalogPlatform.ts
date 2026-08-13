export type MetaCatalogReadinessState
  = | 'USER_GRANT_REQUIRED'
    | 'APP_REVIEW_REQUIRED'
    | 'BUSINESS_ROLE_REQUIRED'
    | 'CATALOG_SETUP_REQUIRED'
    | 'FEED_SETUP_REQUIRED'
    | 'READY'

export interface MetaCatalogBusiness {
  id: string
  name: string
}

export interface MetaCatalogSummary {
  id: string
  name: string
  vertical?: string | null
  ownership: 'owned' | 'client'
}

export interface MetaProductFeedSummary {
  id: string
  name: string
  schedule?: Record<string, unknown> | null
  update_schedule?: Record<string, unknown> | null
  latest_upload?: Record<string, unknown> | null
}

export interface MetaCatalogProvider {
  listGrantedPermissions(): Promise<string[]>
  getAdAccountBusiness(actId: string): Promise<MetaCatalogBusiness | null>
  listBusinessCatalogs(businessId: string): Promise<MetaCatalogSummary[]>
  listProductFeeds(catalogId: string): Promise<MetaProductFeedSummary[]>
  createProductFeed(catalogId: string, input: {
    name: string
    schedule: { interval: 'DAILY', url: string, hour: number, timezone: string }
  }): Promise<{ id: string }>
  updateProductFeed(productFeedId: string, input: {
    name: string
    schedule: { interval: 'DAILY', url: string, hour: number, timezone: string }
  }): Promise<void>
  createProductFeedUpload(productFeedId: string, url: string): Promise<{ id: string }>
  getProductFeed(productFeedId: string): Promise<MetaProductFeedSummary>
}

export interface MetaCatalogConnectionAuthority {
  id: string
  accountId: string
  actId: string
  accountName: string
  accessToken: string
}

export interface MetaCatalogFeedBindingSummary {
  sourceFeedId: string
  sourceFeedUrl?: string
  catalogId: string
  productFeedId: string
  latestUploadId?: string
  lastVerifiedAt?: string
  state: string
}

export interface MetaCatalogSourceFeed {
  id: string
  name: string
  platform: 'facebook'
}

export interface MetaCatalogReadinessInput {
  connection: MetaCatalogConnectionAuthority
  bindings: MetaCatalogFeedBindingSummary[]
  sourceFeeds?: MetaCatalogSourceFeed[]
}

export interface MetaCatalogEvidenceInput {
  clientId: string
  connectionId: string
  sourceFeedId: string
  sourceFeedUrl: string
  businessId: string
  catalogId: string
  productFeedId: string
  uploadId: string
  feedDisposition: 'created' | 'reused'
  state: 'READY'
  readback: MetaProductFeedSummary
  actorId: string
}

type PersistEvidence = (input: MetaCatalogEvidenceInput) => Promise<void>

const REQUIRED_PERMISSIONS = ['business_management', 'catalog_management'] as const
const META_CATALOG_PERMISSION_PATH = '/api/agency/social/meta/connect?intent=catalog_management'

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function metaError(input: unknown): { code: number | null, message: string } {
  const value = record(input)
  const data = record(value.data)
  const responseData = record(record(value.response)._data)
  const error = record(data.error || responseData.error || value.error || value)
  const parsedCode = Number(error.code)
  return {
    code: Number.isFinite(parsedCode) ? parsedCode : null,
    message: clean(error.message || value.message)
  }
}

export function classifyMetaCatalogError(input: unknown): 'APP_REVIEW_REQUIRED' | 'BUSINESS_ROLE_REQUIRED' {
  const error = metaError(input)
  if (
    error.code === 100
    && /app(?:lication)?.*(?:not been approved|capabilit|access)|not been approved to use this api/i.test(error.message)
  ) {
    return 'APP_REVIEW_REQUIRED'
  }
  return 'BUSINESS_ROLE_REQUIRED'
}

export async function inspectMetaCatalogReadiness(
  input: MetaCatalogReadinessInput,
  provider: MetaCatalogProvider
) {
  const granted = new Set((await provider.listGrantedPermissions()).map(clean).filter(Boolean))
  const missingPermissions = REQUIRED_PERMISSIONS.filter(permission => !granted.has(permission))
  if (missingPermissions.length) {
    return {
      state: 'USER_GRANT_REQUIRED' as const,
      missingPermissions,
      action: {
        kind: 'GRANT_META_CATALOG_PERMISSION' as const,
        href: META_CATALOG_PERMISSION_PATH,
        label: 'Grant catalogue access'
      }
    }
  }

  const business = await provider.getAdAccountBusiness(input.connection.actId)
  if (!business) {
    return {
      state: 'BUSINESS_ROLE_REQUIRED' as const,
      action: {
        kind: 'VERIFY_META_BUSINESS_ROLE' as const,
        label: 'Verify business access'
      }
    }
  }

  let catalogs: MetaCatalogSummary[]
  try {
    catalogs = (await provider.listBusinessCatalogs(business.id)).filter(isVehicleCatalog)
  } catch (error) {
    const state = classifyMetaCatalogError(error)
    return {
      state,
      business,
      action: state === 'APP_REVIEW_REQUIRED'
        ? {
            kind: 'REQUEST_META_ADVANCED_ACCESS' as const,
            label: 'Request Meta advanced access'
          }
        : {
            kind: 'VERIFY_META_BUSINESS_ROLE' as const,
            label: 'Verify business access'
          }
    }
  }

  if (!catalogs.length) {
    return {
      state: 'CATALOG_SETUP_REQUIRED' as const,
      business,
      catalogs,
      action: {
        kind: 'CREATE_OR_SHARE_META_CATALOG' as const,
        label: 'Create or share a vehicle catalogue'
      }
    }
  }

  const sourceFeeds = input.sourceFeeds || []
  const boundSourceFeedIds = new Set(
    input.bindings.filter(binding => binding.state === 'READY').map(binding => binding.sourceFeedId)
  )
  const allFeedsReady = sourceFeeds.length > 0 && sourceFeeds.every(feed => boundSourceFeedIds.has(feed.id))

  return {
    state: allFeedsReady ? 'READY' as const : 'FEED_SETUP_REQUIRED' as const,
    business,
    catalogs,
    sourceFeeds,
    bindings: input.bindings,
    action: allFeedsReady
      ? { kind: 'REVIEW_META_CATALOG_FEEDS' as const, label: 'Review catalogue feeds' }
      : { kind: 'ATTACH_META_CATALOG_FEED' as const, label: 'Attach feed to catalogue' }
  }
}

export interface EnsureMetaCatalogFeedInput {
  connection: MetaCatalogConnectionAuthority
  clientId: string
  clientName: string
  catalogId: string
  sourceFeedId: string
  sourceFeedName: string
  allowedSourceFeedIds: string[]
  feedBaseUrl: string
  actorId: string
}

function buildFeedUrl(baseUrl: string, feedId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/feeds/${encodeURIComponent(feedId)}/serve`
}

function scheduleUrl(feed: MetaProductFeedSummary): string {
  return clean(feed.schedule?.url)
}

function safeFeedName(clientName: string, sourceFeedName: string): string {
  const name = `${clean(clientName)} — ${clean(sourceFeedName)}`.trim()
  return name.slice(0, 200)
}

function isVehicleCatalog(catalog: MetaCatalogSummary): boolean {
  return clean(catalog.vertical).toUpperCase() === 'VEHICLES'
}

export async function ensureMetaCatalogFeed(
  input: EnsureMetaCatalogFeedInput,
  deps: MetaCatalogProvider & { persistEvidence?: PersistEvidence }
) {
  if (!input.allowedSourceFeedIds.includes(input.sourceFeedId)) {
    throw new Error('source feed is not linked to this client')
  }

  const granted = new Set((await deps.listGrantedPermissions()).map(clean).filter(Boolean))
  if (REQUIRED_PERMISSIONS.some(permission => !granted.has(permission))) {
    throw new Error('Meta catalogue permission is not currently granted')
  }

  const business = await deps.getAdAccountBusiness(input.connection.actId)
  if (!business) throw new Error('Meta business is not accessible through this connection')
  const catalogs = await deps.listBusinessCatalogs(business.id)
  if (!catalogs.some(catalog => catalog.id === input.catalogId && isVehicleCatalog(catalog))) {
    throw new Error('vehicle catalogue is not accessible through this connection')
  }

  const url = buildFeedUrl(input.feedBaseUrl, input.sourceFeedId)
  const schedule = {
    interval: 'DAILY' as const,
    url,
    hour: 0,
    timezone: 'Australia/Melbourne'
  }
  const name = safeFeedName(input.clientName, input.sourceFeedName)
  const feeds = await deps.listProductFeeds(input.catalogId)
  const existing = feeds.find(feed => scheduleUrl(feed) === url)
  const feedDisposition = existing ? 'reused' as const : 'created' as const

  let productFeedId: string
  if (existing) {
    productFeedId = existing.id
    await deps.updateProductFeed(productFeedId, { name, schedule })
  } else {
    productFeedId = (await deps.createProductFeed(input.catalogId, { name, schedule })).id
  }

  const upload = await deps.createProductFeedUpload(productFeedId, url)
  const readback = await deps.getProductFeed(productFeedId)
  const uploadId = clean(upload.id || readback.latest_upload?.id)
  if (!uploadId) throw new Error('Meta did not return a feed upload identity')
  if (scheduleUrl(readback) !== url) throw new Error('Meta feed readback did not match the XeroFlow feed URL')

  await deps.persistEvidence?.({
    clientId: input.clientId,
    connectionId: input.connection.id,
    sourceFeedId: input.sourceFeedId,
    sourceFeedUrl: url,
    businessId: business.id,
    catalogId: input.catalogId,
    productFeedId,
    uploadId,
    feedDisposition,
    state: 'READY',
    readback,
    actorId: input.actorId
  })

  return {
    state: 'READY' as const,
    catalogId: input.catalogId,
    productFeedId,
    uploadId,
    feedDisposition,
    sourceFeedUrl: url,
    readback
  }
}

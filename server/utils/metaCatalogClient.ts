import { ofetch } from 'ofetch'
import { normalizeMetaGraphPageUrl } from '~~/server/utils/metaGraphUrl'

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'
const CATALOG_FIELDS = 'id,name,vertical,product_count,feed_count,business{id,name},owner_business{id,name}'

export type MetaCatalogVertical = 'vehicles' | 'commerce'

export interface MetaBusiness {
  id: string
  name: string
}

export interface MetaProductCatalog {
  id: string
  name: string
  vertical: string | null
  productCount: number | null
  feedCount: number | null
  businessId: string | null
  businessName: string | null
}

type MetaFetch = <T>(url: string, options?: Record<string, unknown>) => Promise<T>

type MetaPage<T> = {
  data?: T[]
  paging?: { next?: string }
}

type RawMetaCatalog = {
  id?: string
  name?: string
  vertical?: string
  product_count?: number | string
  feed_count?: number | string
  business?: { id?: string, name?: string }
  owner_business?: { id?: string, name?: string }
}

function safeCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeCatalog(catalog: RawMetaCatalog): MetaProductCatalog {
  const business = catalog.owner_business || catalog.business
  return {
    id: String(catalog.id || ''),
    name: String(catalog.name || catalog.id || 'Untitled catalog'),
    vertical: catalog.vertical ? String(catalog.vertical) : null,
    productCount: safeCount(catalog.product_count),
    feedCount: safeCount(catalog.feed_count),
    businessId: business?.id ? String(business.id) : null,
    businessName: business?.name ? String(business.name) : null,
  }
}

function stableNameSort<T extends { id: string, name: string }>(left: T, right: T): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

function sanitizeProviderMessage(value: unknown, token?: string): string {
  if (typeof value !== 'string') return 'Meta could not complete the catalog request.'
  const withoutCurrentToken = token ? value.split(token).join('[redacted-token]') : value
  const sanitized = withoutCurrentToken
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/access_token\s*[=:]\s*[^\s&,]+/gi, 'access_token=[redacted]')
    .replace(/bearer\s+[^\s,]+/gi, 'Bearer [redacted]')
    .slice(0, 500)
    .trim()
  return sanitized || 'Meta could not complete the catalog request.'
}

function extractCatalogProviderDiagnostic(error: unknown): {
  httpStatus?: number
  code?: number
  subcode?: number
  type?: string
  traceId?: string
} {
  const source = error as any
  const graphError = source?.data?.error
    || source?._data?.error
    || source?.response?._data?.error
    || source?.response?.data?.error
    || source?.cause?.data?.error
    || {}
  const httpStatus = Number(source?.statusCode ?? source?.status ?? source?.response?.status)
  const code = Number(graphError.code)
  const subcode = Number(graphError.error_subcode)

  return {
    ...(Number.isFinite(httpStatus) && httpStatus > 0 ? { httpStatus } : {}),
    ...(Number.isFinite(code) && code > 0 ? { code } : {}),
    ...(Number.isFinite(subcode) && subcode > 0 ? { subcode } : {}),
    ...(typeof graphError.type === 'string' && graphError.type ? { type: graphError.type } : {}),
    ...(typeof graphError.fbtrace_id === 'string' && graphError.fbtrace_id ? { traceId: graphError.fbtrace_id } : {}),
  }
}

export class MetaCatalogProviderError extends Error {
  httpStatus?: number
  code?: number
  subcode?: number
  type?: string
  traceId?: string

  constructor(error: unknown, token?: string) {
    const source = error as any
    super(sanitizeProviderMessage(
      source?.data?.error?.message
      || source?._data?.error?.message
      || source?.response?._data?.error?.message
      || source?.message,
      token,
    ))
    this.name = 'MetaCatalogProviderError'
    const diagnostic = extractCatalogProviderDiagnostic(error)
    this.httpStatus = diagnostic.httpStatus
    this.code = diagnostic.code
    this.subcode = diagnostic.subcode
    this.type = diagnostic.type
    this.traceId = diagnostic.traceId
  }
}

async function metaRequest<T>(
  url: string,
  token: string,
  fetchImpl: MetaFetch,
  options: Record<string, unknown> = {},
): Promise<T> {
  try {
    return await fetchImpl<T>(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
    })
  } catch (error) {
    if (error instanceof MetaCatalogProviderError) throw error
    throw new MetaCatalogProviderError(error, token)
  }
}

export async function listMetaBusinesses(
  token: string,
  fetchImpl: MetaFetch = ofetch as MetaFetch,
): Promise<MetaBusiness[]> {
  const businesses: MetaBusiness[] = []
  let url: string | undefined = `${META_GRAPH_BASE}/me/businesses`
  const visitedUrls = new Set<string>()
  let options: Record<string, unknown> | undefined = { query: { fields: 'id,name', limit: 100 } }

  while (url) {
    if (visitedUrls.has(url) || visitedUrls.size >= 100) {
      throw new MetaCatalogProviderError(new Error('Meta returned an invalid Business pagination sequence.'))
    }
    visitedUrls.add(url)
    const response: MetaPage<{ id?: string, name?: string }> = await metaRequest(url, token, fetchImpl, options)
    businesses.push(...(response.data || [])
      .filter(row => row.id)
      .map(row => ({ id: String(row.id), name: String(row.name || row.id) })))
    url = response.paging?.next ? normalizeMetaGraphPageUrl(response.paging.next) : undefined
    options = undefined
  }

  return businesses.sort(stableNameSort)
}

export async function listMetaProductCatalogs(
  businessId: string,
  token: string,
  fetchImpl: MetaFetch = ofetch as MetaFetch,
): Promise<MetaProductCatalog[]> {
  const catalogs: MetaProductCatalog[] = []
  let url: string | undefined = `${META_GRAPH_BASE}/${encodeURIComponent(businessId)}/owned_product_catalogs`
  const visitedUrls = new Set<string>()
  let options: Record<string, unknown> | undefined = { query: { fields: CATALOG_FIELDS, limit: 100 } }

  while (url) {
    if (visitedUrls.has(url) || visitedUrls.size >= 100) {
      throw new MetaCatalogProviderError(new Error('Meta returned an invalid catalog pagination sequence.'))
    }
    visitedUrls.add(url)
    const response: MetaPage<RawMetaCatalog> = await metaRequest(url, token, fetchImpl, options)
    catalogs.push(...(response.data || []).map(normalizeCatalog))
    url = response.paging?.next ? normalizeMetaGraphPageUrl(response.paging.next) : undefined
    options = undefined
  }

  return catalogs.sort(stableNameSort)
}

export async function getMetaProductCatalog(
  catalogId: string,
  token: string,
  fetchImpl: MetaFetch = ofetch as MetaFetch,
): Promise<MetaProductCatalog> {
  const response = await metaRequest<RawMetaCatalog>(
    `${META_GRAPH_BASE}/${encodeURIComponent(catalogId)}`,
    token,
    fetchImpl,
    { query: { fields: CATALOG_FIELDS } },
  )
  return normalizeCatalog(response)
}

export async function createMetaProductCatalog(
  businessId: string,
  token: string,
  input: { name: string, vertical: MetaCatalogVertical },
  fetchImpl: MetaFetch = ofetch as MetaFetch,
): Promise<MetaProductCatalog> {
  const created = await metaRequest<{ id: string }>(
    `${META_GRAPH_BASE}/${encodeURIComponent(businessId)}/owned_product_catalogs`,
    token,
    fetchImpl,
    { method: 'POST', body: { name: input.name, vertical: input.vertical } },
  )
  return getMetaProductCatalog(created.id, token, fetchImpl)
}

export async function updateMetaProductCatalog(
  catalogId: string,
  token: string,
  input: { name: string },
  fetchImpl: MetaFetch = ofetch as MetaFetch,
): Promise<MetaProductCatalog> {
  await metaRequest(
    `${META_GRAPH_BASE}/${encodeURIComponent(catalogId)}`,
    token,
    fetchImpl,
    { method: 'POST', body: { name: input.name } },
  )
  return getMetaProductCatalog(catalogId, token, fetchImpl)
}

export async function deleteMetaProductCatalog(
  catalogId: string,
  token: string,
  fetchImpl: MetaFetch = ofetch as MetaFetch,
): Promise<void> {
  await metaRequest(
    `${META_GRAPH_BASE}/${encodeURIComponent(catalogId)}`,
    token,
    fetchImpl,
    { method: 'DELETE' },
  )
}

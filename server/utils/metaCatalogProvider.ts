import { z } from 'zod'
import type {
  MetaCatalogProvider,
  MetaCatalogSummary,
  MetaProductFeedSummary,
  MetaProductSetSummary
} from '~~/server/utils/metaCatalogPlatform'

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'
const META_GRAPH_ORIGIN = 'https://graph.facebook.com'

const idSchema = z.object({ id: z.string().trim().min(1) })
const permissionPageSchema = z.object({
  data: z.array(z.object({
    permission: z.string().trim().min(1),
    status: z.string().trim().min(1)
  })),
  paging: z.object({ next: z.string().url().optional() }).optional()
})
const businessSchema = z.object({
  business: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1)
  }).nullable().optional()
})
const catalogPageSchema = z.object({
  data: z.array(z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    vertical: z.string().trim().nullable().optional()
  })),
  paging: z.object({ next: z.string().url().optional() }).optional()
})
const scheduleSchema = z.record(z.string(), z.unknown()).nullable().optional()
const productFeedSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().default(''),
  schedule: scheduleSchema,
  update_schedule: scheduleSchema,
  latest_upload: z.record(z.string(), z.unknown()).nullable().optional()
})
const productFeedPageSchema = z.object({
  data: z.array(productFeedSchema),
  paging: z.object({ next: z.string().url().optional() }).optional()
})
const productSetSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().default(''),
  filter: z.string().nullable().optional(),
  product_count: z.number().int().nullable().optional()
})
const productSetPageSchema = z.object({
  data: z.array(productSetSchema),
  paging: z.object({ next: z.string().url().optional() }).optional()
})

export class MetaCatalogGraphError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(status: number, data: unknown) {
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    const providerError = payload.error && typeof payload.error === 'object'
      ? payload.error as Record<string, unknown>
      : {}
    const providerMessage = providerError.message
    super(typeof providerMessage === 'string' && providerMessage.trim()
      ? `Meta catalogue request failed: ${providerMessage.trim()}`
      : `Meta catalogue request failed with status ${status}`)
    this.name = 'MetaCatalogGraphError'
    this.status = status
    this.data = data
  }
}

export interface MetaCatalogProviderConfig {
  accessToken: string
  fetchImpl?: typeof fetch
}

function safeNextUrl(value: string): URL {
  const url = new URL(value)
  if (url.origin !== META_GRAPH_ORIGIN) throw new Error('Meta returned an invalid pagination origin')
  return url
}

export function createMetaCatalogProvider(config: MetaCatalogProviderConfig): MetaCatalogProvider {
  const fetchImpl = config.fetchImpl ?? fetch
  const accessToken = config.accessToken.trim()
  if (!accessToken) throw new Error('Meta access token is required')

  async function request(pathOrUrl: string, options: {
    method?: 'GET' | 'POST'
    query?: Record<string, string>
    body?: Record<string, string>
  } = {}): Promise<unknown> {
    const url = pathOrUrl.startsWith('https://')
      ? safeNextUrl(pathOrUrl)
      : new URL(`${META_GRAPH_BASE}/${pathOrUrl.replace(/^\/+/, '')}`)
    for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, value)

    const method = options.method || 'GET'
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
      },
      body: method === 'POST' ? new URLSearchParams(options.body || {}) : undefined,
      // Workers rejects `redirect: 'error'` at fetch time. `manual` preserves
      // the fail-closed policy because every 3xx response is handled as a
      // provider error without forwarding the bearer token.
      redirect: 'manual'
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new MetaCatalogGraphError(response.status, data)
    return data
  }

  async function listPages<T>(
    path: string,
    query: Record<string, string>,
    parse: (input: unknown) => { data: T[], paging?: { next?: string } }
  ): Promise<T[]> {
    const rows: T[] = []
    let next: string | null = path
    let first = true
    for (let page = 0; next && page < 50; page++) {
      const parsed = parse(await request(next, { query: first ? query : undefined }))
      rows.push(...parsed.data)
      next = parsed.paging?.next || null
      first = false
    }
    if (next) throw new Error('Meta pagination exceeded the platform limit')
    return rows
  }

  async function listCatalogEdge(
    businessId: string,
    edge: 'owned_product_catalogs' | 'client_product_catalogs',
    ownership: MetaCatalogSummary['ownership']
  ): Promise<MetaCatalogSummary[]> {
    const rows = await listPages(
      `${encodeURIComponent(businessId)}/${edge}`,
      { fields: 'id,name,vertical', limit: '100' },
      input => catalogPageSchema.parse(input)
    )
    return rows.map(row => ({ ...row, ownership }))
  }

  return {
    async listGrantedPermissions() {
      const rows = await listPages(
        'me/permissions',
        { limit: '100' },
        input => permissionPageSchema.parse(input)
      )
      return rows.filter(row => row.status === 'granted').map(row => row.permission)
    },

    async getAdAccountBusiness(actId) {
      const parsed = businessSchema.parse(await request(encodeURIComponent(actId), {
        query: { fields: 'business{id,name}' }
      }))
      return parsed.business || null
    },

    async listBusinessCatalogs(businessId) {
      const [owned, client] = await Promise.all([
        listCatalogEdge(businessId, 'owned_product_catalogs', 'owned'),
        listCatalogEdge(businessId, 'client_product_catalogs', 'client')
      ])
      const byId = new Map<string, MetaCatalogSummary>()
      for (const catalog of [...owned, ...client]) {
        if (!byId.has(catalog.id)) byId.set(catalog.id, catalog)
      }
      return [...byId.values()]
    },

    async listProductFeeds(catalogId) {
      return listPages(
        `${encodeURIComponent(catalogId)}/product_feeds`,
        { fields: 'id,name,schedule,update_schedule,latest_upload', limit: '100' },
        input => productFeedPageSchema.parse(input)
      ) as Promise<MetaProductFeedSummary[]>
    },

    async listProductSets(catalogId) {
      return listPages(
        `${encodeURIComponent(catalogId)}/product_sets`,
        { fields: 'id,name,filter,product_count', limit: '100' },
        input => productSetPageSchema.parse(input)
      ) as Promise<MetaProductSetSummary[]>
    },

    async getProductSet(productSetId) {
      return productSetSchema.parse(await request(encodeURIComponent(productSetId), {
        query: { fields: 'id,name,filter,product_count' }
      }))
    },

    async updateProductSet(productSetId, input) {
      await request(encodeURIComponent(productSetId), {
        method: 'POST',
        body: { filter: JSON.stringify(input.filter) }
      })
    },

    async createProductFeed(catalogId, input) {
      return idSchema.parse(await request(`${encodeURIComponent(catalogId)}/product_feeds`, {
        method: 'POST',
        body: { name: input.name, schedule: JSON.stringify(input.schedule) }
      }))
    },

    async updateProductFeed(productFeedId, input) {
      await request(encodeURIComponent(productFeedId), {
        method: 'POST',
        body: { name: input.name, schedule: JSON.stringify(input.schedule) }
      })
    },

    async createProductFeedUpload(productFeedId, url) {
      return idSchema.parse(await request(`${encodeURIComponent(productFeedId)}/uploads`, {
        method: 'POST',
        body: { url }
      }))
    },

    async getProductFeed(productFeedId) {
      return productFeedSchema.parse(await request(encodeURIComponent(productFeedId), {
        query: { fields: 'id,name,schedule,update_schedule,latest_upload' }
      }))
    }
  }
}

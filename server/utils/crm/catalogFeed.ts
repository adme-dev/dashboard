import { queryOne, transaction } from '~~/server/utils/db'
import { decryptToken } from '~~/server/utils/tokenCrypto'
import {
  normalizeProductIdentifier,
  type ProductIdentifierType
} from '~~/server/utils/leads/leadProductInterest'

export type CatalogFeedFormat = 'json' | 'csv'
export type CatalogFieldMapping = Partial<Record<
  'source_product_id' | 'sku' | 'stock_id' | 'vin' | 'name' | 'product_type' |
  'availability' | 'price' | 'currency' | 'product_url' | 'primary_image_url' |
  'source_updated_at',
  string
>>

export interface CatalogSourceRow {
  id: string
  client_id: string
  source_type: string
  status: 'active' | 'paused' | 'error' | 'disconnected'
  feed_url: string | null
  feed_format: CatalogFeedFormat
  item_path: string | null
  field_mapping: CatalogFieldMapping | null
  connection_config: Record<string, unknown> | null
  secret_encrypted: Uint8Array | null
  secret_iv: Uint8Array | null
}

interface NormalizedCatalogItem {
  source_product_id: string
  sku: string | null
  stock_id: string | null
  vin: string | null
  name: string
  product_type: string
  availability: 'available' | 'reserved' | 'sold' | 'removed' | 'unknown'
  price: number | null
  currency: string | null
  product_url: string | null
  primary_image_url: string | null
  attributes: Record<string, string | number | boolean | null>
  source_updated_at: string | null
}

interface SqlClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: any[], rowCount?: number }>
}

interface CatalogSyncDeps {
  fetch: typeof globalThis.fetch
  queryOne: typeof queryOne
  transaction: <T>(callback: (db: SqlClient) => Promise<T>) => Promise<T>
  loadRows?: (source: CatalogSourceRow) => Promise<Array<Record<string, unknown>>>
}

const DEFAULT_DEPS: CatalogSyncDeps = {
  fetch: globalThis.fetch,
  queryOne,
  transaction: transaction as CatalogSyncDeps['transaction']
}

const MAX_FEED_BYTES = 8 * 1024 * 1024
const MAX_ITEMS = 10_000
const PRIVATE_HOST_RE = /^(?:localhost$|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|::ffff:|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i
const SECRET_QUERY_RE = /(?:token|secret|password|signature|api[_-]?key|authorization|auth)/i

const FIELD_ALIASES: Record<keyof CatalogFieldMapping, string[]> = {
  source_product_id: ['source_product_id', 'id', 'vehicle_id', 'product_id'],
  sku: ['sku', 'product_sku'],
  stock_id: ['stock_id', 'stock_number', 'stock_no', 'vehicle_stock_number'],
  vin: ['vin', 'vehicle_vin'],
  name: ['name', 'title', 'vehicle_name'],
  product_type: ['product_type', 'type', 'category'],
  availability: ['availability', 'status', 'stock_status'],
  price: ['price', 'drive_away_price', 'sale_price'],
  currency: ['currency', 'currency_code'],
  product_url: ['product_url', 'url', 'vehicle_url', 'detail_url'],
  primary_image_url: ['primary_image_url', 'image_url', 'image', 'thumbnail_url'],
  source_updated_at: ['source_updated_at', 'updated_at', 'modified_at']
}

export class CatalogFeedError extends Error {
  constructor(message: string, public readonly statusCode = 422) {
    super(message)
    this.name = 'CatalogFeedError'
  }
}

function privateHost(hostname: string): boolean {
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  return PRIVATE_HOST_RE.test(bare)
}

export function validateCatalogFeedUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CatalogFeedError('Feed URL is required')
  }
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new CatalogFeedError('Feed URL is invalid')
  }
  if (url.protocol !== 'https:') throw new CatalogFeedError('Feed URL must use HTTPS')
  if (url.username || url.password) {
    throw new CatalogFeedError('Feed URL credentials are not allowed')
  }
  if (privateHost(url.hostname)) {
    throw new CatalogFeedError('Private and loopback feed hosts are not allowed')
  }
  for (const key of url.searchParams.keys()) {
    if (SECRET_QUERY_RE.test(key)) {
      throw new CatalogFeedError('Feed credentials must use an encrypted credential profile')
    }
  }
  url.hash = ''
  return url.toString()
}

export function validateSupabaseProjectUrl(value: unknown): string {
  const validated = validateCatalogFeedUrl(value)
  const url = new URL(validated)
  if (url.search) throw new CatalogFeedError('Supabase project URL must not contain query parameters')
  return `${url.origin}/`
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(field)
      if (row.some(value => value.length)) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some(value => value.length)) rows.push(row)
  if (!rows.length) return []

  const headers = rows[0].map(value => value.trim())
  return rows.slice(1).map(values => Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ''])
  ))
}

function pathValue(value: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, value)
}

export function parseCatalogFeed(
  text: string,
  format: CatalogFeedFormat,
  itemPath?: string | null
): Array<Record<string, unknown>> {
  if (format === 'csv') return parseCsv(text)

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new CatalogFeedError('Feed returned invalid JSON')
  }
  const selected = itemPath
    ? pathValue(payload, itemPath)
    : Array.isArray(payload)
      ? payload
      : ['items', 'products', 'vehicles', 'data', 'results']
          .map(key => pathValue(payload, key))
          .find(Array.isArray)
  if (!Array.isArray(selected)) {
    throw new CatalogFeedError('JSON feed must contain an item array')
  }
  return selected.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, unknown>>
}

function mappedValue(
  item: Record<string, unknown>,
  field: keyof CatalogFieldMapping,
  mapping: CatalogFieldMapping
): unknown {
  const paths = mapping[field] ? [mapping[field]!] : FIELD_ALIASES[field]
  for (const path of paths) {
    const value = pathValue(item, path)
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function textValue(value: unknown, max = 2048): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const result = String(value).trim()
  return result ? result.slice(0, max) : null
}

function webUrl(value: unknown): string | null {
  const text = textValue(value)
  if (!text) return null
  try {
    const url = new URL(text)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    url.hash = ''
    return url.toString().slice(0, 2048)
  } catch {
    return null
  }
}

function availability(value: unknown): NormalizedCatalogItem['availability'] {
  const status = String(value ?? '').trim().toLowerCase()
  if (['available', 'in_stock', 'instock', 'active', 'for_sale', 'forsale'].includes(status)) return 'available'
  if (['reserved', 'pending', 'on_hold', 'onhold'].includes(status)) return 'reserved'
  if (['sold', 'unavailable'].includes(status)) return 'sold'
  if (['removed', 'deleted', 'inactive', 'archived'].includes(status)) return 'removed'
  return 'unknown'
}

function attributes(item: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(item).slice(0, 64)) {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      output[key.slice(0, 128)] = value
    } else if (typeof value === 'string') {
      output[key.slice(0, 128)] = value.slice(0, 1024)
    }
  }
  return output
}

export function normalizeCatalogItems(
  rows: Array<Record<string, unknown>>,
  mapping: CatalogFieldMapping = {}
): NormalizedCatalogItem[] {
  const deduped = new Map<string, NormalizedCatalogItem>()
  for (const item of rows.slice(0, MAX_ITEMS)) {
    const sourceId = textValue(mappedValue(item, 'source_product_id', mapping), 512)
    if (!sourceId) continue
    const vin = textValue(mappedValue(item, 'vin', mapping), 64)
    const make = textValue(item.make, 128)
    const model = textValue(item.model, 128)
    const year = textValue(item.year, 8)
    const name = textValue(mappedValue(item, 'name', mapping), 512)
      || [year, make, model].filter(Boolean).join(' ')
      || sourceId
    const rawPrice = textValue(mappedValue(item, 'price', mapping), 64)
    const parsedPrice = rawPrice ? Number(rawPrice.replace(/[^0-9.-]/g, '')) : NaN
    const currency = textValue(mappedValue(item, 'currency', mapping), 3)?.toUpperCase() ?? null
    const updated = textValue(mappedValue(item, 'source_updated_at', mapping), 64)
    const sourceUpdatedAt = updated && Number.isFinite(Date.parse(updated))
      ? new Date(updated).toISOString()
      : null

    deduped.set(sourceId, {
      source_product_id: sourceId,
      sku: textValue(mappedValue(item, 'sku', mapping), 256),
      stock_id: textValue(mappedValue(item, 'stock_id', mapping), 256),
      vin,
      name,
      product_type: textValue(mappedValue(item, 'product_type', mapping), 128)
        || (vin || make || model ? 'vehicle' : 'generic'),
      availability: availability(mappedValue(item, 'availability', mapping)),
      price: Number.isFinite(parsedPrice) ? parsedPrice : null,
      currency: currency?.length === 3 ? currency : null,
      product_url: webUrl(mappedValue(item, 'product_url', mapping)),
      primary_image_url: webUrl(mappedValue(item, 'primary_image_url', mapping)),
      attributes: attributes(item),
      source_updated_at: sourceUpdatedAt
    })
  }
  return [...deduped.values()]
}

async function readLimitedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_FEED_BYTES) throw new CatalogFeedError('Feed exceeds the 8 MiB limit', 413)
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_FEED_BYTES) {
      await reader.cancel()
      throw new CatalogFeedError('Feed exceeds the 8 MiB limit', 413)
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

async function fetchFeed(urlValue: string, fetcher: typeof globalThis.fetch): Promise<string> {
  let current = validateCatalogFeedUrl(urlValue)
  for (let redirect = 0; redirect <= 3; redirect++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetcher(current, {
        redirect: 'manual',
        headers: { accept: 'application/json,text/csv,text/plain;q=0.8' },
        signal: controller.signal
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location || redirect === 3) throw new CatalogFeedError('Feed redirect limit exceeded', 502)
        current = validateCatalogFeedUrl(new URL(location, current).toString())
        continue
      }
      if (!response.ok) throw new CatalogFeedError(`Feed request failed with HTTP ${response.status}`, 502)
      return await readLimitedBody(response)
    } catch (error) {
      if (error instanceof CatalogFeedError) throw error
      throw new CatalogFeedError('Feed request failed', 502)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new CatalogFeedError('Feed redirect limit exceeded', 502)
}

async function fetchSupabaseRows(
  source: CatalogSourceRow,
  fetcher: typeof globalThis.fetch
): Promise<Array<Record<string, unknown>>> {
  if (!source.feed_url || !source.secret_encrypted || !source.secret_iv) {
    throw new CatalogFeedError('Supabase connection credentials are incomplete', 409)
  }
  const table = textValue(source.connection_config?.table, 128)
  const schema = textValue(source.connection_config?.schema, 64) || 'public'
  if (!table || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new CatalogFeedError('Supabase schema or table is invalid')
  }
  const apiKey = await decryptToken(source.secret_encrypted, source.secret_iv)
  const rows: Array<Record<string, unknown>> = []
  const pageSize = 1000

  for (let offset = 0; offset < MAX_ITEMS; offset += pageSize) {
    const url = new URL(`/rest/v1/${encodeURIComponent(table)}`, validateSupabaseProjectUrl(source.feed_url))
    url.searchParams.set('select', '*')
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('offset', String(offset))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetcher(url, {
        headers: {
          accept: 'application/json',
          apikey: apiKey,
          authorization: `Bearer ${apiKey}`,
          'accept-profile': schema
        },
        signal: controller.signal
      })
      if (!response.ok) throw new CatalogFeedError(`Supabase request failed with HTTP ${response.status}`, 502)
      const page = parseCatalogFeed(await readLimitedBody(response), 'json')
      rows.push(...page)
      if (page.length < pageSize) break
    } finally {
      clearTimeout(timeout)
    }
  }
  return rows.slice(0, MAX_ITEMS)
}

async function loadSourceRows(
  source: CatalogSourceRow,
  deps: CatalogSyncDeps
): Promise<Array<Record<string, unknown>>> {
  if (source.source_type === 'dealer_feed') {
    if (!deps.loadRows) throw new CatalogFeedError('Dealer Feed loader is unavailable', 503)
    return deps.loadRows(source)
  }
  if (source.source_type === 'supabase') {
    return fetchSupabaseRows(source, deps.fetch)
  }
  if (!source.feed_url) throw new CatalogFeedError('Catalog source has no feed URL')
  return parseCatalogFeed(
    await fetchFeed(source.feed_url, deps.fetch),
    source.feed_format,
    source.item_path
  )
}

async function beginSync(deps: CatalogSyncDeps, source: CatalogSourceRow): Promise<string> {
  return deps.transaction(async db => {
    await db.query(
      `UPDATE crm_catalog_sync_runs
          SET status = 'failed',
              error_message = 'Sync lease expired',
              completed_at = NOW()
        WHERE catalog_source_id = $1
          AND status = 'running'
          AND started_at < NOW() - INTERVAL '15 minutes'`,
      [source.id]
    )
    try {
      const result = await db.query(
        `INSERT INTO crm_catalog_sync_runs (client_id, catalog_source_id)
         VALUES ($1, $2)
         RETURNING id`,
        [source.client_id, source.id]
      )
      await db.query(
        `UPDATE crm_catalog_sources
            SET last_sync_status = 'running',
                last_sync_error = NULL,
                updated_at = NOW()
          WHERE client_id = $1 AND id = $2`,
        [source.client_id, source.id]
      )
      return result.rows?.[0]?.id as string
    } catch (error: any) {
      if (error?.code === '23505') throw new CatalogFeedError('A catalog sync is already running', 409)
      throw error
    }
  })
}

async function failSync(
  deps: CatalogSyncDeps,
  source: CatalogSourceRow,
  runId: string,
  error: unknown
): Promise<void> {
  const message = (error instanceof Error ? error.message : 'Catalog sync failed').slice(0, 1000)
  await deps.transaction(async db => {
    await db.query(
      `UPDATE crm_catalog_sync_runs
          SET status = 'failed', error_message = $3, completed_at = NOW()
        WHERE client_id = $1 AND id = $2`,
      [source.client_id, runId, message]
    )
    await db.query(
      `UPDATE crm_catalog_sources
          SET status = 'error',
              last_sync_status = 'failed',
              last_sync_error = $3,
              updated_at = NOW()
        WHERE client_id = $1 AND id = $2`,
      [source.client_id, source.id, message]
    )
  })
}

export async function syncCatalogSource(
  clientId: string,
  sourceId: string,
  overrides: Partial<CatalogSyncDeps> = {}
): Promise<{ runId: string, fetched: number, upserted: number, removed: number }> {
  const deps = { ...DEFAULT_DEPS, ...overrides }
  const source = await deps.queryOne<CatalogSourceRow>(
    `SELECT source.id,
            source.client_id,
            source.source_type,
            source.status,
            source.feed_url,
            source.feed_format,
            source.item_path,
            source.field_mapping,
            source.connection_config,
            credential.secret_encrypted,
            credential.secret_iv
       FROM crm_catalog_sources source
       LEFT JOIN crm_catalog_source_credentials credential
         ON credential.client_id = source.client_id
        AND credential.catalog_source_id = source.id
      WHERE source.client_id = $1 AND source.id = $2`,
    [clientId, sourceId]
  )
  if (!source) throw new CatalogFeedError('Catalog source not found', 404)
  if (source.status === 'paused' || source.status === 'disconnected') {
    throw new CatalogFeedError('Catalog source is not active', 409)
  }

  const runId = await beginSync(deps, source)
  try {
    const rows = await loadSourceRows(source, deps)
    const items = normalizeCatalogItems(rows, source.field_mapping ?? {})
    if (!items.length) {
      throw new CatalogFeedError('Feed contained no valid products; existing inventory was preserved')
    }

    const result = await deps.transaction(async db => {
      const upserted = await db.query(
        `WITH incoming AS (
           SELECT *
             FROM jsonb_to_recordset($3::jsonb) AS item(
               source_product_id TEXT,
               sku TEXT,
               stock_id TEXT,
               name TEXT,
               product_type TEXT,
               availability TEXT,
               price NUMERIC,
               currency TEXT,
               product_url TEXT,
               primary_image_url TEXT,
               attributes JSONB,
               source_updated_at TIMESTAMPTZ
             )
         )
         INSERT INTO crm_products (
           client_id, catalog_source_id, source_product_id, sku, stock_id, name,
           product_type, availability, price, currency, product_url, primary_image_url,
           attributes, source_updated_at, deleted_at, updated_at
         )
         SELECT $1, $2, source_product_id, sku, stock_id, name, product_type,
                availability, price, currency, product_url, primary_image_url,
                attributes, source_updated_at, NULL, NOW()
           FROM incoming
         ON CONFLICT (client_id, catalog_source_id, source_product_id)
         DO UPDATE SET
           sku = EXCLUDED.sku,
           stock_id = EXCLUDED.stock_id,
           name = EXCLUDED.name,
           product_type = EXCLUDED.product_type,
           availability = EXCLUDED.availability,
           price = EXCLUDED.price,
           currency = EXCLUDED.currency,
           product_url = EXCLUDED.product_url,
           primary_image_url = EXCLUDED.primary_image_url,
           attributes = EXCLUDED.attributes,
           source_updated_at = EXCLUDED.source_updated_at,
           deleted_at = NULL,
           updated_at = NOW()
         RETURNING id, source_product_id`,
        [clientId, sourceId, JSON.stringify(items)]
      )
      const productBySourceId = new Map(
        (upserted.rows ?? []).map(row => [row.source_product_id as string, row.id as string])
      )
      const productIds = [...productBySourceId.values()]
      await db.query(
        `DELETE FROM crm_product_identifiers
          WHERE client_id = $1
            AND catalog_source_id = $2
            AND product_id = ANY($3::uuid[])`,
        [clientId, sourceId, productIds]
      )

      const identifiers: Array<{
        product_id: string
        identifier_type: ProductIdentifierType
        normalized_value: string
      }> = []
      for (const item of items) {
        const productId = productBySourceId.get(item.source_product_id)
        if (!productId) continue
        for (const [type, value] of [
          ['vin', item.vin],
          ['stock_id', item.stock_id],
          ['sku', item.sku],
          ['source_product_id', item.source_product_id],
          ['product_url', item.product_url]
        ] as Array<[ProductIdentifierType, string | null]>) {
          if (!value) continue
          identifiers.push({
            product_id: productId,
            identifier_type: type,
            normalized_value: normalizeProductIdentifier(type, value)
          })
        }
      }
      if (identifiers.length) {
        await db.query(
          `INSERT INTO crm_product_identifiers (
             client_id, catalog_source_id, product_id, identifier_type, normalized_value
           )
           SELECT $1, $2, identifier.product_id, identifier.identifier_type, identifier.normalized_value
             FROM jsonb_to_recordset($3::jsonb) AS identifier(
               product_id UUID,
               identifier_type TEXT,
               normalized_value TEXT
             )
           ON CONFLICT (client_id, catalog_source_id, identifier_type, normalized_value)
           DO UPDATE SET product_id = EXCLUDED.product_id`,
          [clientId, sourceId, JSON.stringify(identifiers)]
        )
      }

      const removed = await db.query(
        `UPDATE crm_products
            SET availability = 'removed',
                deleted_at = COALESCE(deleted_at, NOW()),
                updated_at = NOW()
          WHERE client_id = $1
            AND catalog_source_id = $2
            AND source_product_id <> ALL($3::text[])
            AND deleted_at IS NULL
          RETURNING id`,
        [clientId, sourceId, items.map(item => item.source_product_id)]
      )
      await db.query(
        `UPDATE crm_catalog_sync_runs
            SET status = 'succeeded',
                fetched_count = $3,
                upserted_count = $4,
                removed_count = $5,
                completed_at = NOW()
          WHERE client_id = $1 AND id = $2`,
        [clientId, runId, rows.length, productBySourceId.size, removed.rows?.length ?? 0]
      )
      await db.query(
        `UPDATE crm_catalog_sources
            SET status = 'active',
                last_synced_at = NOW(),
                last_sync_status = 'succeeded',
                last_sync_error = NULL,
                last_item_count = $3,
                updated_at = NOW()
          WHERE client_id = $1 AND id = $2`,
        [clientId, sourceId, productBySourceId.size]
      )
      return {
        upserted: productBySourceId.size,
        removed: removed.rows?.length ?? 0
      }
    })
    return { runId, fetched: rows.length, ...result }
  } catch (error) {
    await failSync(deps, source, runId, error)
    throw error
  }
}

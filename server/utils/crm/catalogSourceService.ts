import type { H3Event } from 'h3'
import { createError } from 'h3'
import { encryptToken } from '~~/server/utils/tokenCrypto'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { getDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { cloudflareRuntimeEnv, mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import {
  CatalogFeedError,
  normalizeSupabaseCatalogSelection,
  syncCatalogSource,
  validateCatalogFeedUrl,
  validateSupabaseProjectUrl,
  type CatalogFieldMapping
} from '~~/server/utils/crm/catalogFeed'

const MAPPING_FIELDS = new Set([
  'source_product_id', 'sku', 'stock_id', 'vin', 'name', 'product_type',
  'availability', 'price', 'currency', 'product_url', 'primary_image_url',
  'source_updated_at', 'seller_id', 'sale_status', 'listing_type', 'make', 'model', 'color',
  'merchant_offer_id'
])

export interface CatalogSourceDb {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[], rowCount?: number }>
}

function mappingOf(value: unknown): CatalogFieldMapping {
  const mapping: CatalogFieldMapping = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return mapping
  for (const [field, path] of Object.entries(value)) {
    if (MAPPING_FIELDS.has(field) && typeof path === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(path)) {
      ;(mapping as Record<string, string>)[field] = path
    }
  }
  return mapping
}

export async function listCatalogSources(clientId: string) {
  const [sources, dealerLink] = await Promise.all([
    queryRows(
      `SELECT source.id,
              source.source_key,
              source.source_type,
              source.display_name,
              source.status,
              source.last_synced_at,
              source.last_sync_status,
              source.last_sync_error,
              source.last_item_count,
              source.created_at,
              COUNT(product.id) FILTER (WHERE product.deleted_at IS NULL)::int AS active_product_count,
              latest.status AS latest_run_status,
              latest.upserted_count AS latest_run_upserted_count,
              latest.removed_count AS latest_run_removed_count,
              latest.started_at AS latest_run_started_at,
              latest.completed_at AS latest_run_completed_at
         FROM crm_catalog_sources source
         LEFT JOIN crm_products product
           ON product.client_id = source.client_id
          AND product.catalog_source_id = source.id
         LEFT JOIN LATERAL (
           SELECT run.*
             FROM crm_catalog_sync_runs run
            WHERE run.client_id = source.client_id
              AND run.catalog_source_id = source.id
            ORDER BY run.started_at DESC
            LIMIT 1
         ) latest ON TRUE
        WHERE source.client_id = $1
        GROUP BY source.id, latest.id, latest.status, latest.upserted_count,
                 latest.removed_count, latest.started_at, latest.completed_at
        ORDER BY source.display_name`,
      [clientId]
    ),
    queryOne(
      `SELECT provider_id, external_org_id, seller_refs, default_feed_ids, status
         FROM client_feed_links
        WHERE client_id = $1 AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1`,
      [clientId]
    )
  ])

  return {
    sources,
    dealerFeed: dealerLink
      ? {
          connected: true,
          providerId: dealerLink.provider_id,
          externalOrgId: dealerLink.external_org_id,
          sellerRefs: dealerLink.seller_refs,
          defaultFeedIds: dealerLink.default_feed_ids,
          catalogSourceId: sources.find(source => source.source_type === 'dealer_feed')?.id ?? null
        }
      : { connected: false, catalogSourceId: null }
  }
}

export async function createCatalogSourceForClientWithDb(
  db: CatalogSourceDb,
  clientId: string,
  actorId: string,
  body: Record<string, unknown>
) {
  const connectorType = typeof body.connector_type === 'string' ? body.connector_type : ''
  if (!['dealer_feed', 'supabase', 'feed'].includes(connectorType)) {
    throw createError({ statusCode: 422, statusMessage: 'Unsupported data source type' })
  }
  const clientResult = await db.query('SELECT id FROM agency_clients WHERE id = $1', [clientId])
  if (!clientResult.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  const displayName = typeof body.display_name === 'string' && body.display_name.trim()
    ? body.display_name.trim().slice(0, 160)
    : connectorType === 'dealer_feed' ? 'Dealer Feed' : connectorType === 'supabase' ? 'Supabase' : 'Product Feed'
  const sourceKey = typeof body.source_key === 'string' && body.source_key.trim()
    ? body.source_key.trim().toLowerCase()
    : `${connectorType}-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  if (!/^[a-z0-9][a-z0-9:_-]{1,119}$/.test(sourceKey)) {
    throw createError({ statusCode: 422, statusMessage: 'Source key is invalid' })
  }

  let feedUrl: string | null = null
  const feedFormat = body.feed_format === 'csv' ? 'csv' : 'json'
  let itemPath: string | null = null
  let connectionConfig: Record<string, unknown> = {}
  let encryptedCredential: { ciphertext: Uint8Array, iv: Uint8Array } | null = null

  try {
    if (connectorType === 'dealer_feed') {
      const link = await getDealerLink(clientId)
      if (!link) throw new CatalogFeedError('Connect this client in Dealer Feeds first', 409)
      connectionConfig = { provider_id: link.providerId }
    } else if (connectorType === 'supabase') {
      feedUrl = validateSupabaseProjectUrl(body.project_url)
      const schema = typeof body.schema === 'string' && body.schema.trim() ? body.schema.trim() : 'public'
      const table = typeof body.table === 'string' ? body.table.trim() : ''
      const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
        throw new CatalogFeedError('Supabase schema and table are required')
      }
      if (!apiKey) throw new CatalogFeedError('Supabase API key is required')
      connectionConfig = {
        schema,
        selection: normalizeSupabaseCatalogSelection(body.selection),
        table
      }
      encryptedCredential = await encryptToken(apiKey)
    } else {
      feedUrl = validateCatalogFeedUrl(body.feed_url)
      itemPath = typeof body.item_path === 'string' && body.item_path.trim() ? body.item_path.trim() : null
      if (itemPath && !/^[A-Za-z0-9_.-]{1,160}$/.test(itemPath)) {
        throw new CatalogFeedError('Item path is invalid')
      }
    }
  } catch (error) {
    if (error instanceof CatalogFeedError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    if (error instanceof Error && /REPO_TOKEN_ENCRYPTION_KEY/.test(error.message)) {
      throw createError({ statusCode: 503, statusMessage: 'Encrypted connector storage is not configured' })
    }
    throw error
  }

  try {
    const result = await db.query(
      `INSERT INTO crm_catalog_sources (
           client_id, source_key, source_type, display_name, feed_url, feed_format,
           item_path, field_mapping, connection_config
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
         ON CONFLICT (client_id, source_key)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           feed_url = EXCLUDED.feed_url,
           feed_format = EXCLUDED.feed_format,
           item_path = EXCLUDED.item_path,
           field_mapping = EXCLUDED.field_mapping,
           connection_config = EXCLUDED.connection_config,
           status = 'active',
           updated_at = NOW()
         RETURNING *`,
      [
        clientId, sourceKey, connectorType, displayName, feedUrl, feedFormat,
        itemPath, JSON.stringify(mappingOf(body.field_mapping)), JSON.stringify(connectionConfig)
      ]
    )
    const saved = result.rows[0] as { id: string } & Record<string, unknown>
    if (encryptedCredential) {
      await db.query(
        `INSERT INTO crm_catalog_source_credentials (
             catalog_source_id, client_id, credential_type, secret_encrypted,
             secret_iv, connected_by
           )
           VALUES ($1, $2, 'supabase_api_key', $3, $4, $5)
           ON CONFLICT (catalog_source_id)
           DO UPDATE SET
             secret_encrypted = EXCLUDED.secret_encrypted,
             secret_iv = EXCLUDED.secret_iv,
             connected_by = EXCLUDED.connected_by,
             updated_at = NOW()`,
        [saved.id, clientId, encryptedCredential.ciphertext, encryptedCredential.iv, actorId]
      )
    }
    return saved
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Data source already exists' })
    }
    throw error
  }
}

export async function createCatalogSourceForClient(
  clientId: string,
  actorId: string,
  body: Record<string, unknown>
) {
  return await transaction(async db => await createCatalogSourceForClientWithDb(
    db as CatalogSourceDb,
    clientId,
    actorId,
    body
  ))
}

export async function synchronizeCatalogSource(
  event: H3Event,
  clientId: string,
  sourceId: string,
  actorEmail: string
) {
  const source = await queryOne<{ source_type: string }>(
    'SELECT source_type FROM crm_catalog_sources WHERE client_id = $1 AND id = $2',
    [clientId, sourceId]
  )
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Data source not found' })

  let loadRows
  if (source.source_type === 'dealer_feed') {
    if (!isDealerFeedsEnabled(mergedRuntimeEnv(event))) {
      throw createError({ statusCode: 503, statusMessage: 'Dealer feeds are not enabled' })
    }
    const link = await getDealerLink(clientId)
    if (!link) throw createError({ statusCode: 409, statusMessage: 'Dealer Feed is not connected for this client' })
    const socialDashboardClient = await getSocialDashboardClient({ runtimeEnv: cloudflareRuntimeEnv(event) })
    if (!socialDashboardClient) {
      throw createError({ statusCode: 503, statusMessage: 'Dealer Feed provider is not configured' })
    }
    const provider = getFeedProvider(link.providerId, { socialDashboardClient })
    loadRows = async () => {
      const rows: Array<Record<string, unknown>> = []
      const pageSize = 100
      for (let offset = 0; offset < 10_000; offset += pageSize) {
        const page = await provider.previewInventory(
          linkToContext(link, actorEmail),
          link,
          { name: 'CRM Inventory', platform: 'google', filters: { onlyActive: true } },
          { limit: pageSize, offset }
        )
        rows.push(...page.items.map(item => ({
          id: item.id,
          vin: item.vin,
          make: item.make,
          model: item.model,
          year: item.year,
          price: item.price,
          condition: item.condition,
          stock_number: item.stockNumber,
          url: item.url,
          image_url: item.image,
          availability: 'available'
        })))
        if (page.items.length < pageSize || rows.length >= page.total) break
      }
      return rows
    }
  }

  try {
    return await syncCatalogSource(clientId, sourceId, { loadRows })
  } catch (error) {
    if (error instanceof CatalogFeedError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    console.error({
      event: 'crm_data_source_sync_failed',
      clientId,
      sourceId,
      sourceType: source.source_type,
      errorClass: error instanceof Error ? error.name : 'unknown'
    })
    throw createError({ statusCode: 500, statusMessage: 'Data source sync failed' })
  }
}

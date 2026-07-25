import { encryptToken } from '~~/server/utils/tokenCrypto'
import { queryOne, transaction } from '~~/server/utils/db'
import { getDealerLink } from '~~/server/utils/feeds/dealerLinks'
import { PERMISSIONS } from '~~/server/utils/permissions'
import {
  CatalogFeedError,
  validateCatalogFeedUrl,
  validateSupabaseProjectUrl,
  type CatalogFieldMapping
} from '~~/server/utils/crm/catalogFeed'

const MAPPING_FIELDS = new Set([
  'source_product_id', 'sku', 'stock_id', 'vin', 'name', 'product_type',
  'availability', 'price', 'currency', 'product_url', 'primary_image_url',
  'source_updated_at'
])

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

export default defineEventHandler(async event => {
  const user = await requireRole(event, PERMISSIONS.CLIENTS)
  const body = await readBody<Record<string, unknown>>(event)
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  const connectorType = typeof body.connector_type === 'string' ? body.connector_type : ''
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'client_id is required' })
  if (!['dealer_feed', 'supabase', 'feed'].includes(connectorType)) {
    throw createError({ statusCode: 422, statusMessage: 'Unsupported data source type' })
  }
  const client = await queryOne('SELECT id FROM agency_clients WHERE id = $1', [clientId])
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

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
  let feedFormat = body.feed_format === 'csv' ? 'csv' : 'json'
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
      connectionConfig = { schema, table }
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
    const source = await transaction(async db => {
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
      const saved = result.rows[0]
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
          [saved.id, clientId, encryptedCredential.ciphertext, encryptedCredential.iv, user.id]
        )
      }
      return saved
    })
    setResponseStatus(event, 201)
    return { source }
  } catch (error: any) {
    if (error?.code === '23505') throw createError({ statusCode: 409, statusMessage: 'Data source already exists' })
    throw error
  }
})

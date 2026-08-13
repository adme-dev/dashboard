import {
  queryOne as dbQueryOne,
  queryRows as dbQueryRows,
  transaction as dbTransaction
} from '~~/server/utils/db'
import type {
  MetaCatalogConnectionAuthority,
  MetaCatalogEvidenceInput,
  MetaCatalogFeedBindingSummary,
  MetaProductFeedSummary
} from '~~/server/utils/metaCatalogPlatform'

type QueryOne = typeof dbQueryOne
type QueryRows = typeof dbQueryRows
type Transaction = typeof dbTransaction

export interface MetaCatalogConnectionRecord extends MetaCatalogConnectionAuthority {
  clientId: string
  clientName: string
  tokenExpiresAt: string | null
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function sanitizeReadback(readback: MetaProductFeedSummary) {
  const latestUpload = readback.latest_upload || {}
  return {
    id: clean(readback.id),
    name: clean(readback.name),
    schedule: readback.schedule || null,
    updateSchedule: readback.update_schedule || null,
    latestUpload: {
      id: clean(latestUpload.id),
      status: clean(latestUpload.status)
    }
  }
}

export async function getMetaCatalogConnectionAuthority(
  clientId: string,
  connectionId: string,
  deps: { queryOne?: QueryOne } = {}
): Promise<MetaCatalogConnectionRecord | null> {
  const row = await (deps.queryOne ?? dbQueryOne)(`
    SELECT
      sc.id,
      sc.client_id,
      c.name AS client_name,
      sc.account_id,
      sc.account_name,
      sc.access_token,
      sc.token_expires_at,
      sc.metadata
    FROM social_connections sc
    JOIN agency_clients c ON c.id = sc.client_id
    WHERE sc.client_id = $1
      AND sc.id = $2
      AND sc.platform = 'meta'
      AND sc.status = 'active'
  `, [clientId, connectionId])
  if (!row) return null

  const accountId = clean(row.account_id)
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  return {
    id: clean(row.id),
    clientId: clean(row.client_id),
    clientName: clean(row.client_name),
    accountId,
    actId: clean(metadata.actId) || `act_${accountId}`,
    accountName: clean(row.account_name),
    accessToken: clean(row.access_token),
    tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null
  }
}

export async function listMetaCatalogFeedBindings(
  clientId: string,
  connectionId: string,
  deps: { queryRows?: QueryRows } = {}
): Promise<MetaCatalogFeedBindingSummary[]> {
  const rows = await (deps.queryRows ?? dbQueryRows)(`
    SELECT
      source_feed_id,
      source_feed_url,
      product_catalog_id,
      product_feed_id,
      latest_upload_id,
      last_verified_at,
      state
    FROM meta_catalog_feed_bindings
    WHERE client_id = $1 AND connection_id = $2
    ORDER BY created_at ASC
  `, [clientId, connectionId])
  return (rows as Array<Record<string, unknown>>).map(row => ({
    sourceFeedId: clean(row.source_feed_id),
    sourceFeedUrl: clean(row.source_feed_url),
    catalogId: clean(row.product_catalog_id),
    productFeedId: clean(row.product_feed_id),
    latestUploadId: clean(row.latest_upload_id),
    lastVerifiedAt: clean(row.last_verified_at),
    state: clean(row.state).toUpperCase()
  }))
}

export async function persistMetaCatalogFeedEvidence(
  input: MetaCatalogEvidenceInput,
  deps: { transaction?: Transaction } = {}
): Promise<void> {
  const transaction = deps.transaction ?? dbTransaction
  const safeReadback = sanitizeReadback(input.readback)
  const evidence = {
    sourceFeedId: input.sourceFeedId,
    sourceFeedUrl: input.sourceFeedUrl,
    metaBusinessId: input.businessId,
    productCatalogId: input.catalogId,
    productFeedId: input.productFeedId,
    latestUploadId: input.uploadId,
    feedDisposition: input.feedDisposition,
    state: input.state,
    readback: safeReadback,
    verifiedAt: new Date().toISOString()
  }

  await transaction(async (db) => {
    const result = await db.query<{ id: string }>(`
      INSERT INTO meta_catalog_feed_bindings (
        client_id,
        connection_id,
        source_feed_id,
        source_feed_url,
        meta_business_id,
        product_catalog_id,
        product_feed_id,
        latest_upload_id,
        state,
        schedule,
        readback,
        last_verified_at,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ready', $9::jsonb, $10::jsonb, NOW(), $11)
      ON CONFLICT (client_id, connection_id, source_feed_id) DO UPDATE SET
        source_feed_url = EXCLUDED.source_feed_url,
        meta_business_id = EXCLUDED.meta_business_id,
        product_catalog_id = EXCLUDED.product_catalog_id,
        product_feed_id = EXCLUDED.product_feed_id,
        latest_upload_id = EXCLUDED.latest_upload_id,
        state = 'ready',
        schedule = EXCLUDED.schedule,
        readback = EXCLUDED.readback,
        last_verified_at = NOW(),
        updated_at = NOW()
      RETURNING id
    `, [
      input.clientId,
      input.connectionId,
      input.sourceFeedId,
      input.sourceFeedUrl,
      input.businessId,
      input.catalogId,
      input.productFeedId,
      input.uploadId,
      JSON.stringify(safeReadback.schedule || {}),
      JSON.stringify(safeReadback),
      input.actorId
    ])
    const bindingId = result.rows[0]?.id
    if (!bindingId) throw new Error('Meta catalogue feed binding was not persisted')

    await db.query(`
      INSERT INTO meta_catalog_feed_audit_events (
        binding_id, client_id, connection_id, action, evidence, actor_id
      ) VALUES
        ($1, $2, $3, $4, $7::jsonb, $8),
        ($1, $2, $3, $5, $7::jsonb, $8),
        ($1, $2, $3, $6, $7::jsonb, $8)
    `, [
      bindingId,
      input.clientId,
      input.connectionId,
      input.feedDisposition,
      'upload_requested',
      'verified',
      JSON.stringify(evidence),
      input.actorId
    ])
  })
}

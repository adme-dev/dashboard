import { queryOne, queryRows } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'

export default defineEventHandler(async event => {
  await requireRole(event, PERMISSIONS.CLIENTS)
  const clientId = String(getQuery(event).client_id || '')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'client_id is required' })

  const [sources, dealerLink] = await Promise.all([
    queryRows(
      `SELECT source.id,
              source.source_key,
              source.source_type,
              source.display_name,
              source.status,
              source.feed_url,
              source.feed_format,
              source.item_path,
              source.field_mapping,
              source.connection_config,
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
})

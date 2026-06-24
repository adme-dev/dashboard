// Map a connected ad account to a client (or unmap with clientId: null).
// Writes the account-level row in ad_account_client_map (so future syncs resolve
// the client) AND backfills media_spend.client_id for the account's existing
// rows — so the mapping takes effect immediately without a full re-sync.
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { invalidateSpendPeriodCaches } from '~~/server/utils/socialSpendCache'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody<{ connectionId?: string; clientId?: string | null }>(event)
  const connectionId = body?.connectionId
  const clientId = body?.clientId ?? null

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  const conn = await queryOne<{ id: string }>(
    `SELECT id FROM social_connections WHERE id = $1`,
    [connectionId]
  )
  if (!conn) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  const tenantId = await getSelectedTenant(event)
  const affectedPeriods = await queryRows<{ period: string; platform: string }>(
    `SELECT DISTINCT period, platform FROM media_spend WHERE connection_id = $1`,
    [connectionId]
  )

  // Account-level mapping has no campaign scope.
  const findMapSql = `SELECT id FROM ad_account_client_map
     WHERE connection_id = $1
       AND COALESCE(campaign_id, '') = ''
       AND COALESCE(campaign_name_pattern, '') = ''`

  if (!clientId) {
    // Unmap: drop the account mapping and clear client_id on its spend rows.
    await execute(`DELETE FROM ad_account_client_map WHERE connection_id = $1
       AND COALESCE(campaign_id, '') = '' AND COALESCE(campaign_name_pattern, '') = ''`, [connectionId])
    await execute(`UPDATE social_connections SET client_id = NULL, updated_at = NOW() WHERE id = $1`, [connectionId])
    const cleared = await execute(`UPDATE media_spend SET client_id = NULL WHERE connection_id = $1`, [connectionId])
    await Promise.all(affectedPeriods.map(row => invalidateSpendPeriodCaches(event, { ...row, tenantId })))
    return { ok: true, clientId: null, cleared }
  }

  const client = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM agency_clients WHERE id = $1`,
    [clientId]
  )
  if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  const existing = await queryOne<{ id: string }>(findMapSql, [connectionId])
  if (existing) {
    await execute(
      `UPDATE ad_account_client_map SET xero_client_name = $1, xero_client_code = NULL WHERE id = $2`,
      [client.name, existing.id]
    )
  } else {
    await execute(
      `INSERT INTO ad_account_client_map (connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code)
       VALUES ($1, NULL, NULL, $2, NULL)`,
      [connectionId, client.name]
    )
  }

  // Backfill so the mapping is effective immediately (no re-sync needed).
  await execute(
    `UPDATE social_connections SET client_id = $1, updated_at = NOW() WHERE id = $2`,
    [client.id, connectionId]
  )
  const backfilled = await execute(
    `UPDATE media_spend SET client_id = $1 WHERE connection_id = $2`,
    [client.id, connectionId]
  )
  await Promise.all(affectedPeriods.map(row => invalidateSpendPeriodCaches(event, { ...row, tenantId })))

  return { ok: true, clientId: client.id, backfilled }
})

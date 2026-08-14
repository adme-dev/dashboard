// Map a connected ad account to a client (or unmap with clientId: null).
// Writes the account-level row in ad_account_client_map (so future syncs resolve
// the client) AND backfills media_spend.client_id for the account's existing
// rows — so the mapping takes effect immediately without a full re-sync.
import { requirePermission } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { executeGodModeSocialAccountMap } from '~~/server/utils/social/accountMapGodMode'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { invalidateSpendPeriodCaches } from '~~/server/utils/socialSpendCache'

interface AccountMapResult {
  id: string
  clientId: string | null
  backfilled?: number
  cleared?: number
}

export default eventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const body = await readBody<{ connectionId?: string, clientId?: string | null }>(event)
  const connectionId = body?.connectionId
  const clientId = body?.clientId ?? null

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  const authorizedConnection = await queryOne<{ client_id: string | null }>(
    `SELECT client_id FROM social_connections WHERE id = $1`,
    [connectionId]
  )
  if (!authorizedConnection) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }
  if (authorizedConnection.client_id) {
    await requireSocialClientAccess(event, authorizedConnection.client_id)
  }
  if (clientId && clientId !== authorizedConnection.client_id) {
    await requireSocialClientAccess(event, clientId)
  }

  const tenantId = await getSelectedTenant(event)
  const affectedPeriods = await queryRows<{ period: string, platform: string }>(
    `SELECT DISTINCT period, platform FROM media_spend WHERE connection_id = $1`,
    [connectionId]
  )

  // Account-level mapping has no campaign scope.
  const findMapSql = `SELECT id FROM ad_account_client_map
     WHERE connection_id = $1
       AND COALESCE(campaign_id, '') = ''
       AND COALESCE(campaign_name_pattern, '') = ''`

  const result = await executeGodModeSocialAccountMap<AccountMapResult>(event, async (db) => {
    const connection = await db.query(
      `SELECT id, client_id FROM social_connections WHERE id = $1 FOR UPDATE`,
      [connectionId]
    )
    const currentConnection = connection.rows[0] as { id: string, client_id: string | null } | undefined
    if (!currentConnection) throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
    if (currentConnection.client_id !== authorizedConnection.client_id) {
      throw createError({ statusCode: 409, statusMessage: 'Connection mapping changed; refresh and retry' })
    }

    if (!clientId) {
      await db.query(`DELETE FROM ad_account_client_map WHERE connection_id = $1
         AND COALESCE(campaign_id, '') = '' AND COALESCE(campaign_name_pattern, '') = ''`, [connectionId])
      await db.query(`UPDATE social_connections SET client_id = NULL, updated_at = NOW() WHERE id = $1`, [connectionId])
      const cleared = await db.query(`UPDATE media_spend SET client_id = NULL WHERE connection_id = $1`, [connectionId])
      return { id: connectionId, clientId: null, cleared: cleared.rowCount || 0 }
    }

    const clientResult = await db.query(
      `SELECT id, name FROM agency_clients WHERE id = $1 FOR KEY SHARE`,
      [clientId]
    )
    const client = clientResult.rows[0] as { id: string, name: string } | undefined
    if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

    const existing = await db.query(findMapSql, [connectionId])
    if (existing.rows[0]) {
      await db.query(
        `UPDATE ad_account_client_map SET xero_client_name = $1, xero_client_code = NULL WHERE id = $2`,
        [client.name, existing.rows[0].id]
      )
    } else {
      await db.query(
        `INSERT INTO ad_account_client_map (connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code)
         VALUES ($1, NULL, NULL, $2, NULL)`,
        [connectionId, client.name]
      )
    }

    await db.query(
      `UPDATE social_connections SET client_id = $1, updated_at = NOW() WHERE id = $2`,
      [client.id, connectionId]
    )
    const backfilled = await db.query(
      `UPDATE media_spend SET client_id = $1 WHERE connection_id = $2`,
      [client.id, connectionId]
    )
    return { id: connectionId, clientId: client.id, backfilled: backfilled.rowCount || 0 }
  }, async (db, resultReference) => {
    if (resultReference !== connectionId) {
      throw createError({ statusCode: 409, statusMessage: 'Account mapping replay belongs to another connection' })
    }
    const current = await db.query(
      `SELECT sc.client_id, ac.name AS client_name,
              EXISTS (
                SELECT 1 FROM ad_account_client_map map
                 WHERE map.connection_id = sc.id
                   AND COALESCE(map.campaign_id, '') = ''
                   AND COALESCE(map.campaign_name_pattern, '') = ''
                   AND map.xero_client_name = ac.name
              ) AS mapping_matches
         FROM social_connections sc
         LEFT JOIN agency_clients ac ON ac.id = sc.client_id
        WHERE sc.id = $1
        FOR KEY SHARE OF sc`,
      [connectionId]
    )
    const row = current.rows[0] as {
      client_id: string | null
      mapping_matches: boolean
    } | undefined
    if (!row || row.client_id !== clientId || (clientId !== null && row.mapping_matches !== true)) {
      throw createError({ statusCode: 409, statusMessage: 'Account mapping replay no longer matches current state' })
    }
    return { id: connectionId, clientId: row.client_id, backfilled: 0 }
  })

  await Promise.all(affectedPeriods.map(row => invalidateSpendPeriodCaches(event, { ...row, tenantId })))
  if (result.clientId === null) return { ok: true, clientId: null, cleared: result.cleared || 0 }
  return { ok: true, clientId: result.clientId, backfilled: result.backfilled || 0 }
})
